# Dance Echo 工作区清理留档

时间: 2026-11-06 19:38:01 +08:00
方式（原计划）: 移到 Windows 系统回收站（可还原）
⚠️ 实际情况: 复核 `D:\$RECYCLE.BIN` 后发现，本 DSH 沙箱下
   `[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory/DeleteFile`
   的 `SendToRecycleBin` **返回成功但并未真正写入回收站**（回收站里只有 2025~2026/3
   的旧条目，没有本次删除的任何元数据或实体）。因此下列内容实际为**永久删除，
   无法从回收站还原**。特此更正，避免误导。
注意: 本工作区无 .git；删除前已把 E2E 测试素材 1.mp4 复制到
   `local vidio store\fixtures\` 并改写 13 个脚本路径，核心资产零损失。
   清理范围外的目录（主前端、后端、vidio、vrm、docs、AGENT_GUIDES、.scratch）全部保留。
补充: `PREFERENCES.md` 曾被误列入删除批次，现已重建（见该文件顶部说明）。
   `.tmp/` 下 10 个 0 字节 pip 临时空目录在权限放开后已彻底清除。

## 一、旧前端工程（整目录）
- dance-echo-app: 5561 文件, 283.2 MB
- dance-echo-mobile: 8510 文件, 179.4 MB
- reference: 4293 文件, 97.2 MB
- ACT move capture: 16 文件, 10.3 MB
- mobile-collect: 17 文件, 0.1 MB
小计: 570.1 MB

## 二、过时文档 / 论文 / 脚本
- 快速启动新主应用.md (0.4 KB)
- 主应用诊断与建议.md (10.3 KB)
- DanceEcho演讲脚本.md (14.9 KB)
- DanceEcho优化清单.md (27.9 KB)
- DETAILED_DEVELOPMENT_PLAN.md (21.1 KB)
- EXECUTION_PLAN_V2.md (6.8 KB)
- EXECUTION_PLAN.md (5.5 KB)
- OPEN_SOURCE_RESEARCH.md (5.2 KB)
- PREFERENCES.md (9.3 KB)
- PROGRESS.md (1.6 KB)
- PROJECT_MAP.md (8.8 KB)
- REUSABLE_RESOURCES.md (3.8 KB)
- REVIEW_UI.md (7.3 KB)
- SERVER_APP_PLAN.md (10.7 KB)
- create_paper.py (26.2 KB)
- DanceEcho_paper_fixed.docx (2377.6 KB)
- DanceEcho_paper.docx (3599.3 KB)
- 我的思考.txt (0.1 KB)
- scaffold-mobile.ps1 (1.5 KB)
- 启动DanceEcho.bat - 快捷方式.lnk (1 KB)

## 三、根目录审计/验证截图
- review-continue.png (76 KB)
- review-desktop.png (137 KB)
- review-grid-dense.png (161.3 KB)
- review-home-final.png (245.8 KB)
- review-home-final2.png (239.8 KB)
- review-home.png (218.2 KB)
- review-home2.png (272.4 KB)
- review-home3.png (183.6 KB)
- review-home4.png (244.1 KB)
- review-home5.png (241.5 KB)
- review-home6.png (241.6 KB)
- review-mobile-after.png (67 KB)
- review-mobile.png (66.7 KB)
- review-player.png (216.2 KB)
- review-player2.png (218.2 KB)
- review-player3.png (245.9 KB)
- review-sidebar-final.png (165.7 KB)
- review-sidebar.png (164 KB)
- review-sidebar2.png (165.3 KB)
- review-trash.png (169.8 KB)
- review-trash2.png (103.9 KB)
- review-trash3.png (109.4 KB)
- server-home-after.png (110.3 KB)
- server-home-before.png (335 KB)
- server-home-reloaded.png (336.3 KB)
- server-home-search.png (113.2 KB)
- server-player-open.png (243.4 KB)
- verify-final.png (218.3 KB)
- verify-home.png (208.5 KB)
共 29 张

## 四、Agent / 构建临时目录
- .dsh-office-2dd6fe6f481847c3af8daf02e0cf45e4: 21 文件, 2 MB
- .dsh-office-3a323eb3ea9c4ed4a753bc3d51d18776: 22 文件, 2 MB
- .dsh-office-6838d74d212341439ba80b987383c4e0: 14 文件, 1.9 MB
- .dsh-office-aad2fe17f7b14f3591507aa2023fb69f: 1 文件, 0.7 MB
- .dsh-office-b272f36ddcb2481f8c4462f11ce40555: 21 文件, 2 MB
- .dsh-office-ca764e596d0d467e9f2020849c305977: 22 文件, 2 MB
- .dsh-office-d2a3f430007748d187583c38721818f8: 22 文件, 2 MB
- .dsh-office-d499978b8f404f47aa8860dbe42d42f4: 22 文件, 2 MB
- .esbuild-tmp: 783 文件, 4.9 MB
- .mineru: 12 文件, 2.5 MB
- .paper: 27 文件, 3.8 MB
- .playwright-mcp: 6 文件, 0 MB
- .pnpm-store: 10612 文件, 191.9 MB
- .py: 0 文件, 0 MB
- .shots: 13 文件, 2.2 MB
- .tmp: 151 文件, 138.8 MB
- .tmp-audit: 13 文件, 3.5 MB

## 五、补充清理（同日，针对失效引用）
- `docs/superpowers/plans/2026-10-25-mobile-collect.md`
- `docs/superpowers/specs/2026-10-25-mobile-collect-room-design.md`
- `docs/superpowers/specs/assets/collect-edit.png`、`collect-list.png`
  （以上均针对已删除的 mobile-collect 工程）
- 保留 `docs/superpowers/` 下 group-cards / course-batch-import 两份仍相关的设计稿。
- `AGENT_GUIDES/` 里 4 份提示词引用了已删 `reference/app` 原型：不删正文（算法/设计仍有价值），
  新增 `AGENT_GUIDES/README.md` 统一标注失效路径与替代实现。

## 六、代码与配置改动（非删除）
- `serve.js`：音乐代理加超时(8s)/单次重试/上游状态校验/上游不可用返回结构化空结果以平滑降级；
  移除 `/mocap/`、`/public/` 旧映射（命中返回 410）；
  新增解码失败 400、`..` 段 403、dist SPA 越界兜底；启动日志改指 8090。
- `package.json`：加 `"type": "module"`，消除 serve.js 的 MODULE_TYPELESS_PACKAGE_JSON 告警。
- `local vidio store/fixtures/1.mp4`：从 ACT move capture 复制保全的 E2E 测试素材。
- `local vidio store/scripts/*.mjs`：13 个脚本的 fixture 路径改为 `local vidio store/fixtures/1.mp4`。
- 重写：`README.md`、`PROJECT_STRUCTURE.md`、`AGENTS.md`、`PREFERENCES.md`（后者为误删后重建）。
- 新增：`.gitignore`、`CLEANUP_MANIFEST.md`、`AGENT_GUIDES/README.md`。
- 重启 8088 使新 serve.js 生效；验证 /mocap→410、dist 资产 200、音乐代理 200、
  8090 health 200、浏览器界面正常且控制台无报错。

## 保留（不删）
- local vidio store/（主前端源码、scripts、public、fixtures、dist）
- DanceEcho Server/（后端）
- vidio/（媒体本体，由后端索引）
- tools/ffmpeg/、vrm/（4 个自定义 VRM 模型，用户资产）、docs/、AGENT_GUIDES/、.scratch/（issue tracker）
- AGENTS.md、GLOSSARY.md、README.md、PROJECT_STRUCTURE.md、PREFERENCES.md、REFACTOR_AUDIT.md、package.json、serve.js、启动DanceEcho.bat、.gitignore
