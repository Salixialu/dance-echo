# Dance Echo — Agent guide

Dance Echo（舞韵回响）是一个**本地优先**的舞蹈视频学习与 3D 动作捕捉工作台。

## 先读这些（唯一可信源）

| 文件 | 用途 |
| :--- | :--- |
| `README.md` | 架构、端口、启动方式、功能与测试总览 |
| `PROJECT_STRUCTURE.md` | 主前端 `local vidio store/src/` 目录与数据流 |
| `GLOSSARY.md` | 领域词汇（分组/收藏/回收站/播放器等统一口径） |

## 工程现实（重要）

- **双进程**：前端 `local vidio store/`（Vite dev 5173 / 静态托管 8088）+
  后端 `DanceEcho Server/`（零依赖 Node http，**端口 8090**，默认 `http://127.0.0.1:8090`）。
- 视频本体留在磁盘（`vidio/` 及 `config.json` 的 `mounts`），由后端 `/stream/:id` 按 Range 直读；
  **服务端 `data/meta.json` 是元数据事实源**，浏览器 Dexie 只是缓存。
- 改功能前确认 8090 后端在跑（导入/播放/扫描/练习日志都依赖它）；
  `启动DanceEcho.bat` 或 `vite.config.ts` 会自动拉起。
- 已清理（2026-11-06，见 `CLEANUP_MANIFEST.md`）：`ACT move capture/`、`dance-echo-app/`、
  `dance-echo-mobile/`、`reference/`、`mobile-collect/`。**不要再引用这些目录**；
  `AGENT_GUIDES/` 里若有指向 `reference/app` 或旧原型的路径，都是历史遗留，以本文件为准。
- E2E 固定测试视频：`local vidio store/fixtures/1.mp4`（13 个脚本已改到此路径）。

## Agent skills

### Issue tracker

Local Markdown：票与 spec 都是 `.scratch/<feature-slug>/` 下的 markdown 文件
（根地图 `.scratch/map.md`，一票一文件 `issues/NN-<slug>.md`）。见 `docs/agents/issue-tracker.md`。

### Triage labels

沿用默认五角色标签：`needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix`。
见 `docs/agents/triage-labels.md`。

### Domain docs

single-context：仓库根目录一份 `GLOSSARY.md`，架构决定放 `docs/adr/`（若新增）。
见 `docs/agents/domain.md`。

## 改动守则

1. 业务改动只在 `local vidio store/` 与 `DanceEcho Server/` 内进行。
2. 保留 `.video-card` 等语义类名 / `data-testid`，不要破坏 `scripts/` 的 Playwright 契约。
3. 任何 `URL.createObjectURL` 都要在卸载/切换时 `revokeObjectURL`。
4. 改完播放器 / 姿态 / 存储，跑 `cd "local vidio store" && npm test`。
5. 不要把 `node_modules/`、`dist/`、运行时数据、截图、临时目录写进版本控制（见 `.gitignore`）。
