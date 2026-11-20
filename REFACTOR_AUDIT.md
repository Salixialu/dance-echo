# local vidio store 存储层改造审计报告

> 只读审计，基于实际源码；所有证据为 `文件:行号`。目标：抽换 IndexedDB Blob 持久化为 DanceEcho Server API（`/api/v1/library`、meta、bookmarks、folders、`/stream/:id`、`/thumb/:id`）。

## 1. 数据模型（IndexedDB / Dexie v3）

`src/services/db.ts:4-26` `DBVideoRecord`：
`id, name, path?, size, lastModified, duration, width, height, thumbnailBase64?, blob?:Blob, tags:string[], category?, rating?, playCount, lastPlayedAt?, playbackPosition?, bpm?, beatOffset?, songTitle?, songArtist?, bookmarks:VideoBookmark[]`

- `src/services/db.ts:28-35` `DBFolderRecord`: id/name/path/parentPath/createdAt/updatedAt
- 表：`videos`、`folders`、`observations`、`practiceLogs`（db.ts:37-57）
- `src/types/index.ts:2-9` `VideoBookmark {id, timestamp, title, notes?, color?, createdAt}`
- `src/types/index.ts:12-19` `VideoObservation {id, videoId, timestamp?, content, tag?, createdAt}`
- `src/types/index.ts:22-28` `DailyPracticeLog {date:YYYY-MM-DD, durationSeconds, videoCount, observationCount, lastUpdatedAt}`
- **ID 是 `文件名-size-lastModified` 确定性生成**（App.tsx:157-161、webAdapter.ts:57-59）——改名/重编码即换 ID，迁移时要注意映射稳定性。

## 2. 视频本体读取路径（Blob 依赖点）

| # | 位置 | 说明 |
|---|---|---|
| 1 | `src/App.tsx:65-95` | 启动 hydration：`db.videos.toArray()`，`r.blob → new File([r.blob])` 全量读 Blob |
| 2 | `src/services/storage/webAdapter.ts:60-88` | 缓存命中读 `db.videos.get(id)`；**缺 blob 时把 FS file 复制进 IDB**（:86-88） |
| 3 | `src/components/player/DancePlayer.tsx:626-655` | 主播放器：`video.file / handle.getFile() → URL.createObjectURL`，`<video src>` :1703-1708 |
| 4 | `src/components/player/DualVideoCompareModal.tsx:61-101` | 对比模式同样 ObjectURL 两个 `<video>` |
| 5 | `src/components/gallery/VideoCard.tsx:180-194` | 悬停逐帧预览：隐藏 video + canvas；**handle-only 分支有 bug（不调用 getFile）** |
| 6 | `src/services/thumbnail.ts:11-70` | 缩略图提取：Blob→ObjectURL→canvas |

## 3. 分析类功能对视频源的依赖

- **Pose：无 Blob 依赖，A 档直接兼容**。`src/services/pose/pose-detector.ts:111-145`（`detectVideoFrame(source: HTMLVideoElement|HTMLCanvasElement)`，MediaPipe `detectForVideo`）；`src/hooks/usePoseTracker.ts:582-680` 只吃活的 `<video>` 元素。换 `/stream/:id` 播放后无需改逻辑（需 CORS + Range 正常）。
- **BPM：已有 URL 路径**。`src/services/audio/beatDetector.ts:44-59` `detectBpmFromUrl(url)` 已存在（内部 `fetch → arrayBuffer`，**不是增量/Range 分析，大文件会整体缓冲**）；DancePlayer :657-708 调用点换成 `/stream/:id` URL 即可。
- **音乐识别**：`src/services/music/songService.ts:741-771` 用 `videoElement.currentSrc` fetch + WebAudio 解码 + `encodeWavSnippet(buffer,startSec,durationSec)`(:470-474)；远程流可用（同样整体缓冲），captureStream fallback :778+。
- **AI**：`src/services/ai/llmClient.ts:138-144` 纯文本请求，无媒体依赖。但 `DanceBuddyDrawer.tsx:226-268` 读 `db.observations.toArray()` —— **服务端目前没有 observations 端点，需扩展 API**。

## 4. 写入路径清单（需替换为 API 的 Dexie 调用）

- 导入：`src/App.tsx:146-284`（blob 写入 :240-259）、demo 导入 :306-399（:379-399）；FS 目录扫描 `webAdapter.ts:23-46`（**每个文件 `getFile()` 全量读内存后存 blob :158-178 —— 所谓 FS 模式当前并非"不复制"**）
- 元数据/打点/进度/评分：`src/store/useVideoStore.ts` 文件夹事务 :270-327/:337-394/:412-465、tags :466-482/:642-697、`addBookmark:516-551`/`removeBookmark:553-580`、rating :582-589、delete :591-599、播放进度 :721-733、beat :735-746、song :748-778、改名 :780-790
- 观察记录：`src/services/storage/observationService.ts:16-64`（add + practiceLog 计数）、:92-104（删/改）
- 练习日志：`src/services/storage/practiceLogService.ts:33-87`、自动统计 :229-320（**注意 observationService:41-58 与 hook :300-307 可能双重计数 observationCount**）
- 已知矛盾：`storageManager.ts:165` 注释称备份"不含视频本体——本体在磁盘"，但普通导入仍复制 blob（App.tsx:240-259）——设计/实现不一致，改造正好修正。

## 5. 改造分档

**A 档（只换视频源 URL 即可工作）**
- Pose 全链路（pose-detector.ts、usePoseTracker.ts）
- DancePlayer / DualVideoCompareModal 的 `<video>` 播放
- BPM `detectBpmFromUrl`、songService 音频识别（改 URL，接受整体缓冲代价）
- llmClient（本来就纯文本）

**B 档（小改，每处 <50 行但涉及面广）**
- DancePlayer 加载 effect（:626-655 → `src=/stream/${id}`，删 ObjectURL 生命周期）
- 对比弹窗、VideoCard 悬停预览（顺手修 handle-only bug）、缩略图改 `/thumb/:id`
- useVideoStore / observationService / practiceLogService / DanceBuddy 的 db 调用逐方法换成 fetch（需服务端补 observations、practice-logs 端点）
- storageManager 备份需扩展覆盖 observations/practiceLogs

**C 档（逻辑重写）**
- App.tsx 导入/hydration（:65-95, :146-284, :306-399）与 webAdapter 扫描（:23-203）：Blob 不再是 canonical 存储，改为服务端扫描 + 本地文件"上传导入"（需服务端新增上传/multipart 端点）或"登记已有文件"
- IndexedDB/Dexie 持久层整体退役；备份/恢复语义重设计
- 练习日志自动统计如走 API 需批量/离线队列策略

## 6. 数据迁移

- `exportLibrary`（storageManager.ts:165-205）已导出元数据/书签/文件夹（不含 blob、**不含 observations/practiceLogs**）——迁移前先扩展它
- 迁移内容：视频元数据 + bookmarks + folders + observations + practiceLogs（KB~MB 级，JSON 走 API 即可）；视频本体不迁移（服务端直接指向媒体根目录）
- 难点：ID 确定性规则与服务端 ID 的映射、幂等、时区（date 字段）；建议迁移脚本走 `POST /api/v1/...` 并按 `name+size+lastModified` 对齐服务端库
