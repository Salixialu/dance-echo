# PREFERENCES — 协作与工程偏好

> 本文件在 2026-11-06 工作区清理时误删后重建；原始历史偏好若需追溯，
> 见 `CLEANUP_MANIFEST.md` 与本次会话记录。以本文件为当前有效口径。

## 工程结构（2026-11-06 起）

- **唯一主前端**：`local vidio store/`；**本地后端**：`DanceEcho Server/`（8090）。
- 已清理并**不再引用**：`ACT move capture/`、`dance-echo-app/`、`dance-echo-mobile/`、
  `reference/`、`mobile-collect/` 等重复/原型工程。
- 架构/启动以 `README.md` 与 `PROJECT_STRUCTURE.md` 为唯一可信源；
  `AGENTS.md` 是 Agent 入口。`GLOSSARY.md` 统一领域词汇。
- E2E 固定测试视频：`local vidio store/fixtures/1.mp4`。

## 文档治理

- 只保留少量核心文档；多份互相矛盾的执行计划、审计报告、
  review-*.png 截图、论文 docx、一次性脚本一律清理。
- 删除前先确认跨工程引用；`node_modules/`、构建产物、运行时数据、
  截图与临时目录由 `.gitignore` 排除，不进版本控制。

## 清理偏好（本次明确）

- 清理无用前端时，优先把不可恢复的操作做成**可还原**（回收站/归档）；
  若环境不支持，务必先留删除清单（`CLEANUP_MANIFEST.md`）并如实告知。
- 先解决严重问题（架构文档失真、重复工程、工作区卫生），再谈功能扩展。
- 保留用户资产（`vidio/` 视频、`vrm/` 自定义模型、`docs/`、`.scratch/` 票），
  不擅自删除。
  - `vrm/` 说明：2026-11-07 实时 VRM 数字人驱动下线后，该目录的 4 个 `.vrm`
    模型已是**遗留资产**（当前代码不再读取），仍按「保留用户资产」原则留存，不要据此
    认为项目仍支持 3D 化身/数字人。

## 已知历史口径（来自旧 PREFERENCES 的引用，供参考）

- 旧文档曾记：`dance-echo-app/` 归档只读、`reference/app/` 仅作视觉与交互参考——
  **该口径已随目录清理作废**，见上文。

---

_维护：改偏好时直接编辑本文件；不要另起一份 PREFERENCES。_
