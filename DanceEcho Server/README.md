# Dance Echo · 服务端媒体库

一个**运行时零依赖**的本地媒体库服务：用 Node.js 内置模块直接读取磁盘上的视频，浏览器通过 HTTP Range 流式播放。
视频**不复制、不上传、不进浏览器存储**，因此没有 IndexedDB / OPFS 的配额限制，清理浏览器缓存也不会丢数据。

```text
DanceEcho Server/
├─ server.mjs            # HTTP 服务 + API + 静态文件
├─ lib/scanner.mjs       # 递归扫描 + 日期归组 + 增量索引
├─ lib/mp4meta.mjs       # 纯 JS 解析 MP4 moov/mvhd/tkhd
├─ lib/store.mjs         # 用户元数据（JSON 原子写 + 串行队列）
├─ public/               # 原生 HTML/CSS/JS 前端，无构建步骤
├─ data/                 # 运行时生成
│  ├─ index.json         # 扫描索引（可删除，下次重扫）
│  ├─ meta.json          # 用户元数据（评分/标签/进度…）
│  └─ thumbs/<id>.jpg    # 前端截帧后回传的缩略图
├─ config.json
├─ README.md
├─ selftest.mjs           # 黑盒自检脚本（对运行中的服务跑 29 项检查）
└─ 启动DanceEcho服务端.bat
```

## 启动

要求 Node.js **v24**（更早的 20+ 版本通常也能跑），无需 `npm install`。

双击 `启动DanceEcho服务端.bat`，或在 PowerShell 中：

```powershell
cd "D:\Dance Echo\DanceEcho Server"
node server.mjs
```

浏览器打开 <http://127.0.0.1:8090>。服务**只绑定 127.0.0.1**，局域网其他机器访问不到。

启动日志会打印媒体根目录、视频总数、总大小和按日期分组数量。按 `Ctrl+C` 停止。

## 自检

服务跑起来之后，另开一个终端做黑盒验证（只发 GET/HEAD，不改任何数据）：

```powershell
cd "D:\Dance Echo\DanceEcho Server"
node selftest.mjs
# 也可以指定别的地址：node selftest.mjs http://127.0.0.1:8090
```

会依次检查页面与静态资源、媒体库索引与日期分组、Range 流的 206/416/400/404、以及目录穿越等边界，
最后打印「通过 N 项，失败 M 项」，有失败时退出码为 1。

## 改媒体目录 / 端口

编辑 `DanceEcho Server\config.json`：

```json
{
  "mediaRoot": "D:\\Dance Echo\\vidio",
  "port": 8090
}
```

也支持环境变量覆盖（优先级高于 config.json）：

```powershell
$env:DE_MEDIA_ROOT = "E:\Videos"
$env:DE_PORT = "8091"
node server.mjs
```

修改后重启服务。改目录后第一次扫描会重新解析，旧 `data/index.json` 会被替换。

## 日期归组规则

每个视频的 `dateKey`（`YYYY-MM-DD`）按以下优先级确定：

1. **MP4 内嵌 `creation_time`**（`moov/mvhd`，苹果纪元 1904-01-01 起算的秒数，转 UTC 后再按本地时区取日期）；
   只有年份落在 **1990 .. 当前年份+1** 才认为可信。
2. 否则退回文件系统 **mtime**（修改时间）。

`dateSource` 会标记用了哪一种；前端卡片左上角显示「拍摄时间」或「文件时间」。
`mkv / webm / avi / ogg` 不解析内嵌元数据，直接用 mtime。
MP4 的 `moov` 若在文件 4MB 之后（未做 faststart），本次解析会放弃并退回 mtime，不影响视频出现在列表里。

**为什么不按 Windows 的「创建时间」分组**：资源管理器里的创建时间会在拷贝、下载、解压时被改写成"落到本机的那一刻"。
如果按它分组，今天拷进来的旧视频会全部堆在"今天"。所以默认不用它——但它已经记录在每条记录的
`birthtime` 字段里，日后想切成"按拷贝日期归组"或者加一个口径开关，直接改 `lib/scanner.mjs` 里的 `resolveDate` 即可。

## API

所有 JSON 接口返回 UTF-8，带 `Cache-Control: no-store`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/v1/health` | 版本化健康状态：服务版本、扫描时间和媒体数量 |
| GET | `/api/v1/capabilities` | 版本化能力声明；姿态分析与局域网访问为 `false`，备份恢复为 `true` |
| GET | `/api/v1/library?force=1` | 带 `schemaVersion: "v1"` 的媒体库；`force=1` 全量重扫；默认隐去回收站条目 |
| GET | `/api/v1/library?includeTrashed=1` | 连同已移入回收的条目一起返回（回收站面板用） |
| POST | `/api/v1/backup` | 恢复备份：`{ meta, folders, trash, observations, practiceLogs }` → `{ ok, result }`，返回各类合并/跳过计数 |
| POST | `/api/v1/videos/trash` | 批量移入回收区：`{ ids: string[] }` → `{ ok, trashed, missing }`，一次落盘 |
| GET | `/api/v1/library?force=1` | 带 `schemaVersion: "v1"` 的媒体库；`force=1` 全量重扫 |
| GET | `/api/v1/groups` | 带 `schemaVersion: "v1"` 的日期分组 |
| GET | `/api/library?force=1` | `{ root, scannedAt, count, totalBytes, videos:[...] }`；`force=1` 全量重扫（兼容接口） |
| GET | `/api/groups` | `{ groups:[{ dateKey, count, bytes, videos }] }`，日期倒序，组内 mtime 倒序 |
| GET | `/api/video/:id` | 单条视频 + `meta` |
| PATCH | `/api/video/:id` | 合并 `{ tags, rating, bookmarks, progress, playCount, lastPlayedAt, note }`，返回最新 |
| POST | `/api/rescan` | 增量重扫，返回 `{ count, scannedAt }`（`?force=1` 全量） |
| GET | `/api/stats` | `{ total, totalBytes, byDate }` |
| GET/HEAD | `/stream/:id` | 视频字节流，支持 `Range` → `206` + `Content-Range` |
| GET/HEAD | `/thumb/:id` | 缩略图，未生成时 `404` |
| POST | `/thumb/:id` | 接收 `image/jpeg` 原始 body（≤512KB），写入缓存 |

视频 id 是 `sha1(相对路径)` 的前 16 位十六进制，路径不变则 id 稳定。
拖进度条依赖 `/stream` 的 Range 支持（含 `bytes=start-end`、`bytes=start-`、`bytes=-suffix`）。

## 数据存在哪

- **视频本体**：永远留在 `mediaRoot` 原位置，服务端只读，不复制。
- **扫描索引**：`data/index.json`。删除后下次启动会重建。
- **用户数据**：`data/meta.json`。写入使用 `meta.json.tmp` + `rename` 的原子替换，并通过 promise 队列串行化。
- **缩略图**：`data/thumbs/<id>.jpg`。前端首次遇到 404 时用隐藏 `<video>` 截第 2 秒画面，canvas 编码成 400×225 JPEG（质量 0.82）再 POST 回来。

扫描不到的视频（例如移动硬盘临时拔掉）**不会删除** `meta.json` 里的记录，重新接上后进度和评分仍在。

## 和浏览器版（IndexedDB）的区别

| | 浏览器版 | 本服务端版 |
| --- | --- | --- |
| 视频存放 | 导入后复制进 IndexedDB / OPFS | 原文件零复制，服务端按需流式读取 |
| 容量上限 | 受浏览器配额限制（通常几 GB～几十 GB） | 只受磁盘容量限制 |
| 清理浏览器数据 | 视频和元数据一起丢 | 不影响，数据在 `data/` 与磁盘原文件 |
| 播放 | Blob URL | HTTP Range 206，可拖动进度条 |
| 依赖 | 纯前端 | Node.js 本机进程，仅监听 127.0.0.1 |

## 已知限制

- 只解析 MP4/MOV/M4V 的 `moov`，且只读文件前 4MB；`moov` 在文件尾部的大文件会退回 mtime。
- `mkv` 等格式能播放（取决于浏览器编解码支持）但没有内嵌拍摄时间，`duration` 为空，卡片上不显示时长。
- 缩略图截帧依赖浏览器能解码该视频；不支持的编码会显示「无预览」。
- 没有用户系统、转码和远程访问，定位是本机单人媒体库。
