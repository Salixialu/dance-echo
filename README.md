# Dance Echo（舞韵回响）

> 本地优先的**舞蹈视频学习 + 3D 动作捕捉工作台**。视频与练习数据都留在本机，
> 通过 MediaPipe 姿态识别、Three.js 3D 骨架与 BVH 动捕导出，把「看视频」变成
> 「可放慢、可镜像、可对照、可做笔记、可跟节拍」的练习闭环。

---

## 一、架构（唯一可信源）

项目是**双进程**结构，没有云端服务：

```
浏览器  ──HTTP──►  前端（React 19 + Vite 6）
   │                  │  端口 5173（dev） / 8088（静态托管 dist）
   │                  └── /api/v1 → 后端
   └──────────────────────►  DanceEcho Server（零依赖 Node http，端口 8090）
                              ├─ 扫描本机媒体目录（vidio/ 及 config.json 里的 mounts）
                              ├─ /stream/:id 按 Range 流式播放磁盘原文件（视频不复制、不上传浏览器）
                              ├─ ffmpeg 生成缩略图 / HEVC→H.264 按需转码
                              └─ data/index.json + data/meta.json 持久化元数据（服务端为事实源）
```

| 目录 | 角色 | 状态 |
| :--- | :--- | :--- |
| `local vidio store/` | **主前端**：React 19 + TypeScript + Vite 6 + Tailwind + zustand + Dexie + three（3D 骨架）+ MediaPipe | 🟢 唯一活跃前端 |
| `DanceEcho Server/` | **本地后端**：`server.mjs`（零依赖）+ `lib/`（scanner/store/thumbs/mp4meta） | 🟢 活跃，端口 8090 |
| `vidio/` | 媒体本体（.mp4 等），由后端按路径引用，不入版本控制 | 🎬 数据 |
| `vrm/` | 遗留用户资产（4 个 `.vrm` 模型）；2026-11-07 VRM 驱动下线后当前代码不再读取 | 🗄️ 保留资产 |
| `tools/ffmpeg/` | 后端生成缩略图/转码用的 ffmpeg 二进制 | 🔧 工具 |
| `local vidio store/fixtures/` | E2E 测试用视频 `1.mp4` | 🧪 测试素材 |
| `docs/` `AGENT_GUIDES/` `.scratch/` | 领域文档 / Agent 协作规约 / 本地 issue 跟踪 | 📖 文档 |
| `serve.js` | 生产构建 `dist/` 的静态托管 + 音乐搜索代理 + `/vidio/` 视频流 | 🌐 端口 8088 |

> **事实源规则**：视频本体永远在磁盘，元数据以后端 `data/` 为准，浏览器只做缓存
> （见 `local vidio store/src/services/api/metaSync.ts`、`storageManager.ts`）。
> 早期 `ACT move capture/`、`dance-echo-app/`、`dance-echo-mobile/`、`reference/`、
> `mobile-collect/` 等重复/原型工程已于 2026-11-06 清理（见 `CLEANUP_MANIFEST.md`）。
> 实时 VRM 数字人驱动已于 2026-11-07 下线（移除 `@pixiv/three-vrm` / `kalidokit`
> 依赖与「3D 化身 / 上传 VRM」入口）；3D 视图改为纯发光骨架，动作数据出口统一为
> BVH 导出。文件名 `src/scene/vrm-controller.ts` 为历史遗留，仅导出 `Skeleton3DController`。

---

## 二、启动

### 推荐：一键启动
双击根目录 **`启动DanceEcho.bat`**。脚本会：
1. 检查 Node.js；缺前端依赖时自动 `npm install`；
2. 拉起 `DanceEcho Server`（8090）并等待 `/api/v1/health`；
3. 拉起 Vite dev server（5173）；
4. 打开 `http://127.0.0.1:5173/`。

> 后端必须常驻：导入、播放、扫描、练习日志都依赖 8090。dev 模式下
> `vite.config.ts` 也会在检测到 8090 未运行时自动拉起后端。

### 命令行
```bash
# 后端（终端 1）
cd "DanceEcho Server"
node server.mjs                      # 或按 start-wmi.ps1 后台启动

# 前端（终端 2）
cd "local vidio store"
npm install                            # 首次
npm run dev                            # http://127.0.0.1:5173/
```

### 生产构建与静态托管
```bash
cd "local vidio store"
npm run build                          # 生成 dist/
cd ..
node serve.js                          # http://127.0.0.1:8088/
```
`serve.js` 只托管 `dist/`（含 SPA fallback），并代理 `/api/music/search` 到网易云搜索；
上游不可用时会返回结构化空结果，让前端平滑降级到内置曲库。

**端口一览**：`5173` Vite dev ｜ `8088` 静态托管 ｜ `8090` 后端 API ｜ `5180` 已废弃的 mobile-collect。

---

## 三、主要功能

- **媒体库**：网格/列表、虚拟滚动、搜索、双层标签、分组（虚拟文件夹）、回收站、收藏、最近观看、星级、批量操作、拖拽归组
- **播放器**：A-B 循环、0.5–1.5x 倍速、镜像、音量、进度/音量滑块、全屏
- **动作学习**：2D 发光骨骼叠加、3D 可旋转骨架、3D 分屏/画中画对比、双人姿态、BVH 动捕导出（数字人/VRM 驱动已于 2026-11-07 下线）
- **音乐节奏**：节拍检测、节拍器（BPM/首拍微调）、听歌识曲（内置曲库 + 网易云代理 + 可选 ACRCloud）
- **沉淀**：留言（可挂在秒数上）、书签、练习打卡/热力图/统计、AI 对话助手（LLM 经本地代理）
- **工程**：中/EN 双语、设置面板、备份导出/恢复、Playwright E2E 契约测试

---

## 四、测试

```bash
cd "local vidio store"
npm test                # = node scripts/run-e2e-all.mjs，自动准备 8090/5173 并跑全套
npm run typecheck        # tsc -b
npm run check:beat        # 节拍分析校验
```

`run-e2e-all.mjs` 会自动检测/拉起后端与 dev server；E2E 脚本使用
`fixtures/1.mp4` 作为固定测试视频。测试覆盖播放器、姿态、分屏、文件夹、存储、
回收站、备份恢复、术语、上传契约等（结果写入 `.e2e-logs/summary.json`）。

> 注意：`127.0.0.1` 与 `localhost` 是不同存储源，请固定用同一地址打开，避免「数据不见了」。

---

## 五、配置

- `DanceEcho Server/config.json`：`mediaRoot`（默认 `D:\Dance Echo\vidio`）、`port`（8090）、
  `mounts`（额外媒体目录，视频留在原盘）、`thumbFfmpegPath`。也可用环境变量
  `DE_MEDIA_ROOT` / `DE_PORT` 覆盖，便于换机器部署。
- 前端后端地址：`VITE_DANCE_ECHO_SERVER_URL`（默认 `http://127.0.0.1:8090`，见 `serverUrl.ts`）。
- AI / 听歌识曲密钥只保存在本机浏览器设置里，不写入代码库。

---

## 六、文档索引

| 文件 | 内容 |
| :--- | :--- |
| `AGENTS.md` | Agent 入口：issue 跟踪、triage 标签、领域文档约定 |
| `GLOSSARY.md` | 领域词汇（视频/分组/收藏/回收站/播放器…统一口径；含已下线术语标注） |
| `PROJECT_STRUCTURE.md` | 主前端源码目录与数据流全景 |
| `docs/FEATURE_MAP.md` | 按心智模型分层的功能思维框架（功能切面总览） |
| `REFACTOR_AUDIT.md` | 存储层改造（Dexie Blob → 服务端 API）历史审计 |
| `CLEANUP_MANIFEST.md` | 2026-11-06 工作区清理留档（被删清单，可从回收站还原） |
| `.gitignore` | 依赖/构建/运行时数据/截图/临时目录的忽略规则 |

> **文档口径**：本表所列为**当前有效**权威文档。`AGENT_GUIDES/`、`local vidio store/PROGRESS.md`、
> `local vidio store/tasks/todo.md`、`docs/reports/`、`docs/superpowers/`、`.scratch/` 均为历史留档，
> 与代码冲突时以本表与代码为准；已失效文档已加「已过时」横幅或删除。
