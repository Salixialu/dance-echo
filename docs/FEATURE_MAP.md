# Dance Echo 功能思维框架（Feature Map）

> 一份「按心智模型分层」的项目功能清单，目的是让新接手的人先建立**全景**，再按需钻进
> 具体模块。每条尽量锚到一个真实存在的文件/函数，避免空泛。
> 权威架构见 `README.md` / `PROJECT_STRUCTURE.md` / `GLOSSARY.md`，本文件只做**功能切面**的整合。

---

## 0. 顶层心智模型（先建立这几句）

- **一句话定位**：本地优先的「舞蹈视频学习 + 3D 动作捕捉」工作台。
- **核心闭环**：看视频 → 放慢/镜像/对照 → 做留言/书签 → 跟节拍练 → 打卡复盘。
- **两条铁律**（贯穿所有功能）：
  1. **视频本体永远留在磁盘**：浏览器不存 Blob，播放走 `/stream/:id` Range 直读（`App.tsx` 合库逻辑、`serverUrl.ts`）。
  2. **服务端 `data/meta.json` 是元数据事实源**：浏览器 Dexie 仅缓存，写操作经 `metaSync` 同步回服务端。
- **双进程**：前端 `local vidio store/`（React19+Vite） + 后端 `DanceEcho Server/`（零依赖 Node，端口 8090）。
- **领域口径**（见 `GLOSSARY.md`）：视频 / 分组（≠文件夹）/ 收藏（=5星）/ 回收站（不删盘）/ 留言（含打点）/ 姿态（≠骨骼）/ 3D 骨架视图 / 练习记录。
  「数字人 / VRM 化身」为已下线术语（2026-11-07），仅用于理解历史文档，不代表在用功能。

---

## 1. 媒体库（Library）—— 浏览与组织

入口：`components/gallery/`（VideoGrid / VirtualVideoGrid / VideoList / GroupCardGrid）、`components/sidebar/Sidebar.tsx`、`store/useVideoStore.ts`

| 功能 | 说明 | 锚点 |
| :--- | :--- | :--- |
| 网格 / 列表双视图 | 首页可切网格或列表 | `VideoGrid.tsx`、`VirtualVideoList.tsx` |
| 虚拟滚动 | 大库不卡（网格/列表各自虚拟滚动） | `hooks/useVirtualGrid.ts`、`useVirtualTimeline.ts`、`galleryRows.ts` |
| 搜索 | 标题/标签/文件名过滤 | `FilterBar`、`App` 内搜索态 |
| 双层标签体系 | 视频标签（维度:值，如 `老师:Kane`）+ 分组 | `utils/tagLibrary.ts`、`tagDisplay.ts`、`tagConfig.ts` |
| 分组（虚拟文件夹） | 不映射磁盘目录，由服务端扁平 `folderId` 还原为路径 | `useVideoStore.ensureFolderPath`、`services/api/folderSync.ts` |
| 文件夹树 + 数量徽标 | 递归树、含子目录总数、拖拽落点计数 | `Sidebar.FolderNode`、`getFolderTree` |
| 拖拽归组 | 把卡片拖进某分组即移动 | `FolderNode` 的 `onDrop` → `moveVideosToFolder` |
| 回收站 | 隐藏不删盘，可恢复回原分组 | `sidebar/TrashModal.tsx`、`api` 可见性规则 |
| 收藏 | 实心/空心爱心，与评分共用字段（5=收藏） | `utils/favorites.ts` |
| 最近观看 | 按 `playbackPosition` 过滤 | `utils/continueWatching.ts` |
| 星级评分 | 0–5，收藏=5 | `DancePlayerRightDrawer` 的 `onUpdateRating` |
| 批量操作 | 多选后批量打标签/移动/删除到回收站 | `VideoGrid` 多选态 + store |
| 歌曲曲库分组 | 按识别到的歌名自动聚合，显示计数 | `Sidebar.songGroups` |
| 全局标签库管理 | 增删/重命名合并/归类/清理孤儿标签 | `Sidebar.renderTagLibraryModal`、`removeTags`、`cleanupOrphanTags` |

---

## 2. 导入与采集（Import）—— 把视频请进来

入口：`App.tsx` 的 `handleImportFiles` / `openImportConfig` / `handleOpenDirectory`、`services/thumbnail.ts`、`services/music/songService.ts`

| 功能 | 说明 | 锚点 |
| :--- | :--- | :--- |
| 文件导入 | 多选视频文件，组名/标签/识别一次配置 | `App.openImportConfig` → `confirmImport` |
| 目录挂载 | File System Access API 选整目录上传服务端 | `handleOpenDirectory`、`storage/webAdapter.ts` |
| 导入即分组 | 一次导入 = 一支舞 = 一个分组（组名唯一化 `#2`） | `suggestGroupName` / `uniqueGroupName` |
| 自动元数据/封面 | 解时长/分辨率，抽首帧封面 | `thumbnail.extractVideoMetaAndThumbnail` |
| 听歌识曲（导入期） | 整批只识别一次（最大文件），结果写标题/标签/组名 | `recognizeSongFromFile`、导入面板 `import-recognize-*` |
| 标签预设点选 | 导入面板直接点「老师/舞种/来源」维度标签 | `importPresetTags`、`appPreferences.tagPresets` |
| 内置演示视频 | 一键生成 3 个示例舞曲视频 | `demoVideoGenerator.ts`、`handleLoadDemoVideos` |
| 视频本体零复制 | 上传到服务端 `uploads/`，浏览器不存 Blob | `api.upload` + Dexie 仅存元数据 |
| 格式白名单提示 | 不支持格式给出明确提示而非静默 | `openImportConfig` 的格式校验分支 |
| 失败归因 | 区分「服务端没起」vs「其它错误」，对症 toast | `failed` 列表 + `ApiError.NETWORK_ERROR` |

---

## 3. 播放器（Player）—— 可控制地观察

入口：`components/player/DancePlayer.tsx`（约 2400 行，主组件）、`serverUrl.ts`（流/转码 URL）

| 功能 | 说明 | 锚点 |
| :--- | :--- | :--- |
| A-B 循环 | 设 A/B 点区间循环 | `abLoop` / `setABPointA/B` |
| 倍速 | 0.5–1.5x | `playbackRate` |
| 镜像 | 水平翻转（练镜面动作） | `isMirrored` / `toggleMirror` |
| 音量 / 静音 | 含滑块 | `Volume2` 控制 |
| 进度 / 音量滑块 | 可拖动定位 | 控制栏 |
| 全屏 | — | `Maximize` |
| 视频流 / 按需转码 | `<video src=/stream/:id>`；HEVC→H.264 转码 | `resolveVideoStreamUrl`、`videoTranscodeUrl` |
| 右抽屉（信息/留言/歌曲） | 三页签：备注、元数据、曲库绑定 | `DancePlayerRightDrawer`（Notes/Info/Song） |
| 播放位置记忆 | 关掉再开续播 | `playbackPosition` 经 `metaSync` |
| 截图/下载 | 帧导出、BVH 等 | `Download` 入口、`bvhExport` |

---

## 4. 动作学习 / 姿态分析（Pose / MoCap）—— 产品的核心差异点

入口：`hooks/usePoseTracker.ts`、`services/pose/*`、`scene/*`、`utils/poseAngles.ts`

> **现状（2026-11-07 起）**：实时 VRM 数字人驱动已下线，`@pixiv/three-vrm` / `kalidokit`
> 依赖与「3D 化身 / 上传 VRM」入口均已移除。3D 视图为纯发光骨架，动作数据的对外出口
> 统一为 BVH 导出（`services/pose/bvhExport.ts`），可在 Blender / MotionBuilder 等 DCC 中
> 离线套用到任意角色。`src/scene/vrm-controller.ts` 仅遗留文件名，导出 `Skeleton3DController`。

| 功能 | 说明 | 锚点 |
| :--- | :--- | :--- |
| 2D 发光骨骼覆盖 | 叠加在原始画面上，生物力学配色（左青/右粉/躯干） | `PoseOverlay`、`CLASSIFIED_CONNECTIONS` |
| 3D 可旋转骨架 | 关键点转 3D 世界坐标，自由旋转查看 | `scene/scene-manager.ts`、`Skeleton3DController` |
| 分屏 / 画中画对比 | 左原视频 + 右 2D 纯骨架 / 3D 骨架 | `DisplayMode`：`2d-split` / `3d-split` |
| 纯骨架全屏 | 隐藏原视频只留骨架（投影演示） | `DisplayMode='skeleton'` |
| ~~VRM 数字人驱动~~（已下线） | 2026-11-07 移除，依赖与入口均已删除；动作数据改走 BVH 在外部 DCC 离线驱动 | — |
| 双人姿态 | 多人/ROI 追踪 | `usePoseTracker` 多人逻辑 |
| 实时解算 | 播放时从 `<video>` 帧逐帧解算，不预生成、不落盘 | `PoseDetectorService`（MediaPipe） |
| 平滑滤波 | One-Euro 滤波抑制抖动 | `one-euro-filter.ts` |
| 头部画法切换 | cross（轻量朝向）/ sphere（俯仰/偏转可读） | `setHeadModelMode` |
| 关节角度读数 | 实时关节角度 + 格式化 | `utils/poseAngles.ts`、`computeJointAngles` |
| 姿态轨迹缓存 | 视窗切换 0 延迟续连 | `lastLandmarksRef` |
| 姿态轨道存取 | 采样/持久化/扫描姿态轨道 | `poseTrackService.ts` |
| BVH 导出 | 把姿态导出为 BVH（动捕软件互通） | `bvhExport.buildBvh` |

---

## 5. 音乐节奏（Music / Beat）—— 跟得上拍子

入口：`services/audio/beatDetector.ts`、`beatAnalysis.ts`、`beatGridStore.ts`、`mediaClock.ts`、`components/player/BeatMetronome.tsx`、`services/music/songService.ts`

| 功能 | 说明 | 锚点 |
| :--- | :--- | :--- |
| 离线 BPM 检测 | 纯 Web Audio 能量通量 + 自相关，秒级 | `BeatDetectorService.detectBpmFromBlob`（整轨分析） |
| 逐拍时间戳 | 不只是 BPM，还有每拍时间 | `BeatInfo.beats` |
| 节拍器 | 可调 BPM、首拍微调（offset） | `BeatMetronome`、`mediaClock` |
| 节拍网格持久化 | 每视频存 BPM+offset，复看不用重算 | `beatGridStore`（load/saveBeatGrid） |
| 听歌识曲（播放期） | 播放时识别/绑定当前曲 | `SongRecognizeModal`、`songService` |
| 内置曲库 | 热门舞曲词库离线秒级匹配 | `POPULAR_DANCE_CATALOG` |
| 文件名猜测 | 没配密钥时按文件名猜歌 | `guessFromVideoName` |
| ACRCloud 指纹 | 专业音频指纹，可填密钥 | `getACRCloudConfig`、`recognizeWithACRCloud` |
| 网易云/Apple 预览 | 试听 30s 官方 preview | `SongPreviewPlayer`、`serve.js` 代理 |
| 歌名绑组 | 绑定歌曲可同步给同组其它机位；可归并重名分组 | `onBindSongToGroup` / `siblingGroup` |

---

## 6. 沉淀 / 学习闭环（Notes · Bookmarks · Practice · Growth）

入口：`components/player/ObservationPanel.tsx`、`services/storage/observationService.ts`、`practiceLogService.ts`、`components/growth/*`

| 功能 | 说明 | 锚点 |
| :--- | :--- | :--- |
| 留言（可挂靠秒数） | 在某时刻/某段打文字心得，可多条并存 | `observationService`、`ObservationPanel` |
| 留言跳转 | 点时间戳跳到该秒并暂停 | `onSeekAndPause` |
| 书签 | 关键位置标记（与留言同体系） | 观察服务 |
| 练习打卡 | 累加每日练舞时长 | `practiceLogService.recordPracticeDuration` |
| 练习计数 | 视频数 / 留言数纳入日志 | `recordObservationCount` |
| 双写练习日志 | 本地 Dexie + 服务端 `upsertPracticeLog`（失败仅告警） | `practiceLogService.pushLog` |
| 月度统计 | 总分钟 / 活跃天数 / 连续周数 / 总心得 | `getMonthlySummary` |
| 热力图 | 练舞日历热力 | `growth/PracticeHeatmap.tsx` |
| 成长看板 | 弹窗汇总 + 火焰连续激励 | `growth/GrowthStatsModal.tsx`、`Sidebar` 火种按钮 |
| 回顾练习路径 | 复用留言/路径继续练 | `GLOSSARY`「练习路径 / 回顾」 |

---

## 7. AI 助手（Dance Buddy）

入口：`components/ai/DanceBuddyDrawer.tsx`、`services/ai/llmClient.ts`

| 功能 | 说明 | 锚点 |
| :--- | :--- | :--- |
| 对话助手 | 悬浮按钮唤起，关于舞蹈学习的问答 | `ai-chat-launcher` |
| 多 Provider | 可配置 LLM 提供商与密钥（本机浏览器） | `AI_PROVIDERS`、`loadAISettings` |
| 连接自测 | 填完密钥可测连通 | `testAIConnection` |
| 本地代理 | LLM 请求经 `/api/llm/*` 本地代理，密钥不入库 | `llmClient` + 后端代理 |

---

## 8. 存储与运行模式（Storage / Modes）

入口：`services/db.ts`、`services/storage/*`、`services/api/metaSync.ts`、`storageManager.ts`、`DanceEcho Server/store.mjs`

| 功能 | 说明 | 锚点 |
| :--- | :--- | :--- |
| 浏览器本地缓存 | Dexie 存元数据/封面/练习日志 | `db.ts` |
| 服务端媒体库模式 | 扫磁盘目录，零复制，Range 流 | `scanner.mjs`、`server.mjs /stream` |
| 本地文件挂载模式 | File System Access 直接读 | `webAdapter` |
| 元数据同步 | 浏览器写 → `PATCH /api/v1/*` → 服务端事实源 | `metaSync.pushMeta` |
| 合库（Hydration） | 服务端 + Dexie 缓存合并，回收站由服务端过滤 | `App.loadLibrary` |
| 备份导出/恢复 | 导出元数据+分组+回收站+观察+练习日志（不含视频） | `storageManager.exportLibrary/importLibrary` |
| 孤儿记录清理 | 找/清失效记录 | `findOrphanRecords` / `removeOrphanRecords` |
| 持久化申请 | 请求 Persistent Storage，避免被清 | `requestPersistentStorage` |
| 配置覆盖 | `DE_MEDIA_ROOT` / `DE_PORT` / `VITE_DANCE_ECHO_SERVER_URL` | `config.json`、`serverUrl.ts` |

---

## 9. 工程 / 设置（Settings · i18n · 质量）

入口：`components/settings/SettingsModal.tsx`、`i18n/*`、`services/settings/appPreferences.ts`

| 功能 | 说明 | 锚点 |
| :--- | :--- | :--- |
| 设置中心 | AI / 歌曲识别 / 识别性能 / 标签预设 / 存储备份 / 关于 | `TABS`（6 个 tab） |
| 中/EN 双语 | 运行时切换，DOM 短语同步翻译 | `i18n/`、`LanguageToggle`、`domTranslate` |
| 识别性能档 | 姿态质量/速度（pose quality）调节 | `appPreferences.PoseQuality` |
| 标签预设 | 老师/舞种/来源维度，导入与播放页可点选 | `tagPresets`、`DEFAULT_TAG_PRESETS` |
| 内存安全 | `URL.createObjectURL` 卸载/切换必 `revokeObjectURL` | 维护约定第 3 条 |
| 选择器契约 | 保留 `.video-card` / `data-testid` 供 Playwright | 维护约定第 2 条 |
| 启动脚本 | 一键拉起 8090+5173 | `启动DanceEcho.bat`、`vite.config.ts` |

---

## 10. 后端能力（DanceEcho Server，端口 8090）

入口：`DanceEcho Server/server.mjs`、`lib/{scanner,store,thumbs,mp4meta}.mjs`

| 能力 | 说明 | 锚点 |
| :--- | :--- | :--- |
| 媒体扫描 | 扫 `vidio/` + `mounts`，建索引 | `scanner.mjs`、`ensureScan` |
| 元数据持久化 | `data/meta.json` / `index.json` 事实源 | `store.mjs` |
| 视频流 | `/stream/:id` 按 Range 直读磁盘原文件 | `server.mjs`（stream 分支） |
| 封面生成 | ffmpeg 抽帧缩略图（任务去重） | `thumbs.mjs`、`generateThumb` |
| 按需转码 | HEVC→H.264 等（任务状态机） | `server.mjs transcodeJobs` |
| 元信息 | 读 mp4 时长/分辨率 | `mp4meta.mjs` |
| 元数据 PATCH | 接收前端写回标题/标签/进度/评分等 | `store.patch` |
| 音乐搜索代理 | 网易云搜索（serve.js 在 8088 代理） | `serve.js` |
| LLM 代理 | `/api/llm/*` 转发（密钥在浏览器） | `server.mjs` / 代理层 |

---

## 11. 测试与契约（Quality Gates）

入口：`scripts/`（根）、`local vidio store/scripts/run-e2e-all.mjs`、`fixtures/1.mp4`

| 功能 | 说明 | 锚点 |
| :--- | :--- | :--- |
| 一键 E2E | 自动拉起 8090/5173，跑全套 | `npm test` → `run-e2e-all.mjs` |
| 类型检查 | `npm run typecheck` (tsc -b) | — |
| 节拍校验 | `npm run check:beat` | — |
| 契约脚本 | 播放器/姿态/分屏/文件夹/存储/回收站/备份/术语/上传 | `scripts/` + `data-testid` |
| 固定 fixture | `fixtures/1.mp4` 统一测试视频 | README 第四节 |

---

## 12. 用一句话串起来（给汇报/文档用）

> Dance Echo 把「看舞蹈视频」升级成一套**本地优先的练习闭环**：在媒体库里按分组/标签/收藏组织视频，
> 导入时顺手听歌识曲并自动打标；播放时用 A-B 循环、倍速、镜像放慢观察，叠加 2D 发光骨骼、
> 3D 可旋转发光骨架并导出 BVH 动捕数据做姿态对照；配合离线节拍器跟拍练习，过程中用留言/书签/打卡沉淀，最后在成长看板复盘——
> 全程视频留在磁盘、元数据以后端为事实源，可选接本地 LLM 当舞蹈朋友。

---

### 维护提示
- **2026-11-07 校准**：删除/降级全文 VRM 数字人相关表述，与代码下线保持一致；「数字人」仅作为历史术语保留在 `GLOSSARY.md`。
- 新增业务只在 `local vidio store/` 与 `DanceEcho Server/`；勿引用已清理目录（`ACT move capture/` 等）。
- 任何功能改动后跑 `npm test`；保留 `data-testid` 选择器契约。
- 本文件是**功能切面整合**，具体实现以所锚文件为准；若发现功能与代码不符，优先修正代码与本文档。
