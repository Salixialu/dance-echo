/**
 * DanceEcho Server — 服务端媒体库（零依赖）
 *
 * 只监听 127.0.0.1，默认端口 8090。
 * 视频零复制：浏览器只通过 /stream/:id 按 Range 读取磁盘上的原文件。
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import { promises as fs, createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { scanLibrary, groupByDate, videoIdFor } from './lib/scanner.mjs';
import { createStore, atomicWriteJson, defaultMeta } from './lib/store.mjs';
import { probeFfmpeg, generateThumb, THUMB_FILE_VERSION } from './lib/thumbs.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const THUMBS_DIR = path.join(DATA_DIR, 'thumbs');
/** 当前版本缩略图路径（480x270 合成封面）。 */
const thumbPathFor = (id) => path.join(THUMBS_DIR, `${id}.${THUMB_FILE_VERSION}.jpg`);
/** 旧版缩略图（宽高随视频比例），只读兜底，命中后会在后台升级。 */
const legacyThumbPathFor = (id) => path.join(THUMBS_DIR, `${id}.jpg`);
// 浏览器不支持 HEVC 时，按需转成 H.264 缓存；原文件不动
const TRANSCODES_DIR = path.join(DATA_DIR, 'transcodes');
const INDEX_PATH = path.join(DATA_DIR, 'index.json');
const CONFIG_PATH = path.join(__dirname, 'config.json');

const DEFAULT_CONFIG = {
  mediaRoot: 'D:\\Dance Echo\\vidio',
  port: 8090,
  // 额外扫描的外部媒体目录：视频留在原盘，不复制；索引里带 root，播放时回原盘读取
  mounts: [],
};

const VIDEO_MIME = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/x-m4v',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.ogg': 'video/ogg',
  '.avi': 'video/x-msvideo',
};

const STATIC_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const MAX_JSON_BODY = 1024 * 1024;
const MAX_THUMB_BODY = 512 * 1024;
const API_VERSION = 'v1';
const SERVER_VERSION = '0.1.0';

// ---------------------------------------------------------------- 配置

async function loadConfig() {
  let config = { ...DEFAULT_CONFIG };
  try {
    const text = await fs.readFile(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') {
      if (typeof parsed.mediaRoot === 'string' && parsed.mediaRoot.trim()) {
        config.mediaRoot = parsed.mediaRoot;
      }
      if (Number.isInteger(parsed.port) && parsed.port > 0 && parsed.port < 65536) {
        config.port = parsed.port;
      }
      if (typeof parsed.thumbFfmpegPath === 'string' && parsed.thumbFfmpegPath.trim()) {
        config.thumbFfmpegPath = parsed.thumbFfmpegPath.trim();
      }
      if (Array.isArray(parsed.mounts)) {
        config.mounts = parsed.mounts.filter((item) => typeof item === 'string' && item.trim());
      }
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      await fs.writeFile(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n', 'utf8');
      console.log(`[DanceEcho] 已生成默认配置: ${CONFIG_PATH}`);
    } else {
      console.warn(`[DanceEcho] config.json 读取失败，使用默认配置: ${err.message}`);
    }
  }
  if (process.env.DE_MEDIA_ROOT && process.env.DE_MEDIA_ROOT.trim()) {
    config.mediaRoot = process.env.DE_MEDIA_ROOT.trim();
  }
  if (process.env.DE_PORT && Number.isInteger(Number(process.env.DE_PORT))) {
    config.port = Number(process.env.DE_PORT);
  }
  config.mediaRoot = path.resolve(config.mediaRoot);
  return config;
}

// ---------------------------------------------------------------- 状态

const state = {
  mediaRoot: DEFAULT_CONFIG.mediaRoot,
  // 额外媒体目录：{ path: 绝对目录, name: 在媒体库里的显示前缀 }
  mounts: [],
  index: { root: DEFAULT_CONFIG.mediaRoot, scannedAt: null, count: 0, totalBytes: 0, videos: [] },
  byId: new Map(),
};
let store = null;
let scanInflight = null;
let ffmpegBin = null;
const thumbJobs = new Map(); // id -> Promise<boolean>，避免并发重复生成
/** id -> { status: 'running' | 'ready' | 'error', reason?: string } */
const transcodeJobs = new Map();

/** 刚上传但尚未被后台重扫收进索引的视频 id：允许立刻写封面 */
const pendingThumbIds = new Set();

function rebuildIndexMap() {
  state.byId.clear();
  for (const video of state.index.videos) state.byId.set(video.id, video);
  // 扫描完成后这些上传视频已经进入索引，临时的封面白名单可以清空
  pendingThumbIds.clear();
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

async function doScan(force) {
  const baseRoot = path.resolve(state.mediaRoot);
  const previous =
    !force && path.resolve(state.index.root) === baseRoot
      ? state.index.videos.filter((video) => !video.root || video.root === baseRoot)
      : [];
  const base = await scanLibrary({ mediaRoot: baseRoot, previous, force });

  const videos = [...base.videos];
  let totalBytes = base.totalBytes;
  for (const mount of state.mounts) {
    const mountRoot = path.resolve(mount.path);
    const prefix = mount.name;
    const prev = !force
      ? state.index.videos
          .filter((video) => video.root === mountRoot)
          .map((video) => ({ ...video, relPath: video.relPath.slice(prefix.length + 1) }))
      : [];
    let scanned;
    try {
      scanned = await scanLibrary({ mediaRoot: mountRoot, previous: prev, force });
    } catch (err) {
      console.warn(`[DanceEcho] 跳过无法读取的挂载目录 ${mountRoot}: ${err.message}`);
      continue;
    }
    for (const video of scanned.videos) {
      const relPath = `${prefix}/${video.relPath}`;
      videos.push({ ...video, relPath, id: videoIdFor(relPath), root: mountRoot });
      totalBytes += video.size || 0;
    }
  }

  state.index = {
    root: baseRoot,
    scannedAt: new Date().toISOString(),
    count: videos.length,
    totalBytes,
    videos,
  };
  rebuildIndexMap();
  await atomicWriteJson(INDEX_PATH, state.index, false);
  const groups = groupByDate(videos);
  console.log(
    `[DanceEcho] 扫描完成: ${videos.length} 个视频, ${formatBytes(totalBytes)}, 日期分组 ${groups.length} 组`,
  );
  return state.index;
}

/** 视频的绝对路径：本地根目录直接用 relPath，挂载目录要剥掉前缀并回原盘取文件 */
function absoluteVideoPath(video) {
  let relPath = video.relPath;
  if (video.root && path.resolve(video.root) !== path.resolve(state.mediaRoot)) {
    const prefix = `${path.basename(video.root)}/`;
    if (relPath.startsWith(prefix)) relPath = relPath.slice(prefix.length);
  }
  const base = video.root || state.index.root || state.mediaRoot;
  return resolveIn(base, relPath);
}

async function ensureScan(force = false) {
  if (scanInflight) {
    try {
      await scanInflight;
    } catch {
      /* 上一次扫描失败，下面按需重试 */
    }
    if (!force) return state.index;
  }
  const promise = doScan(force);
  scanInflight = promise;
  try {
    return await promise;
  } finally {
    if (scanInflight === promise) scanInflight = null;
  }
}

/** 批量上传时把重扫合并成一次，避免每个文件都全量扫描一遍 */
let scanTimer = null;
function scheduleScan(delay = 1500) {
  if (scanTimer) clearTimeout(scanTimer);
  scanTimer = setTimeout(() => {
    scanTimer = null;
    ensureScan(true).catch((err) => console.warn(`[DanceEcho] 后台上传重扫失败: ${err.message}`));
  }, delay);
  if (typeof scanTimer.unref === 'function') scanTimer.unref();
}

/**
 * 外部媒体目录以 junction 挂进媒体库：视频留在原盘，不复制一份。
 * 目录名取原目录 basename，例如 E:\003_MY_Dance_Viedio → 媒体库/003_MY_Dance_Viedio
 */
async function ensureMounts(mounts) {
  for (const raw of mounts) {
    const abs = path.resolve(raw);
    if (!existsSync(abs)) {
      console.warn(`[DanceEcho] 挂载目录不存在，跳过: ${abs}`);
      continue;
    }
    const linkPath = path.join(state.mediaRoot, path.basename(abs));
    if (existsSync(linkPath)) continue;
    try {
      await fs.symlink(abs, linkPath, 'junction');
      console.log(`[DanceEcho] 已挂载: ${abs} → ${linkPath}`);
    } catch (err) {
      console.warn(`[DanceEcho] 挂载失败（${abs}）: ${err.message}`);
    }
  }
}

// ---------------------------------------------------------------- HTTP 工具

function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

function sendError(res, status, message, code) {
  sendJson(res, status, { error: message, ...(code ? { code } : {}) });
}

function sendApiError(res, status, message, code, details) {
  sendJson(res, status, {
    schemaVersion: API_VERSION,
    error: {
      code: code || 'INTERNAL_ERROR',
      message,
      ...(details ? { details } : {}),
    },
  });
}

function sendApiJson(res, status, payload) {
  sendJson(res, status, { schemaVersion: API_VERSION, ...payload });
}

function readRawBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        // 继续把剩余字节读完（丢弃），这样还能正常回一个 413，
        // 而不是直接 destroy 导致客户端只看到连接重置。
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) {
        reject(Object.assign(new Error(`请求体超过 ${Math.round(limit / 1024)}KB 限制`), { statusCode: 413 }));
        return;
      }
      resolve(Buffer.concat(chunks));
    });
    req.on('error', reject);
    req.on('aborted', () => reject(Object.assign(new Error('请求已中断'), { statusCode: 400 })));
  });
}

async function readJsonBody(req, limit = MAX_JSON_BODY) {
  const raw = await readRawBody(req, limit);
  if (raw.length === 0) return {};
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    throw Object.assign(new Error('请求体不是合法 JSON'), { statusCode: 400 });
  }
}

function parseRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!match) return null;
  const [, startRaw, endRaw] = match;
  if (startRaw === '' && endRaw === '') return 'invalid';

  let start;
  let end;
  if (startRaw === '') {
    const suffix = Number(endRaw);
    if (!Number.isFinite(suffix) || suffix <= 0) return 'invalid';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(startRaw);
    end = endRaw === '' ? size - 1 : Math.min(Number(endRaw), size - 1);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'invalid';
  if (start > end || start >= size) return 'invalid';
  return { start, end };
}

function resolveIn(baseDir, relPath) {
  const target = path.resolve(baseDir, relPath);
  const base = path.resolve(baseDir);
  if (target !== base && !target.startsWith(base + path.sep)) return null;
  return target;
}

// ---------------------------------------------------------------- 路由

async function serveFile(req, res, filePath, isImmutable = false) {
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;

  const ext = path.extname(filePath).toLowerCase();
  const isHtml = ext === '.html';
  const cacheControl = isHtml
    ? 'no-store'
    : isImmutable
      ? 'public, max-age=31536000, immutable'
      : 'no-cache';

  res.writeHead(200, {
    'Content-Type': STATIC_MIME[ext] ?? 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': cacheControl,
  });
  if (req.method === 'HEAD') {
    res.end();
    return true;
  }
  try {
    await pipeline(createReadStream(filePath), res);
    return true;
  } catch (err) {
    if (err.code !== 'ERR_STREAM_PREMATURE_CLOSE') console.warn('[DanceEcho] 静态文件发送失败:', err.message);
    return true;
  }
}

async function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';

  const filePath = resolveIn(PUBLIC_DIR, '.' + rel);
  if (!filePath) return sendError(res, 403, '禁止访问');

  const ok = await serveFile(req, res, filePath);
  if (ok) return;

  return sendError(res, 404, '页面不存在');
}

async function handleLibrary(req, res, url) {
  const force = url.searchParams.get('force') === '1';
  try {
    const index = await ensureScan(force);
    const visible = await visibleVideos(false);
    const videos = visible.map(({ meta: _meta, ...video }) => video);
    sendJson(res, 200, {
      root: index.root,
      scannedAt: index.scannedAt,
      count: videos.length,
      totalBytes: videos.reduce((sum, video) => sum + (video.size || 0), 0),
      videos,
    });
  } catch (err) {
    sendError(res, 500, err.message || '扫描失败', err.code);
  }
}

function handleGroups(res) {
  // 与 v1 同一条可见性规则：回收站里的视频不进日期分组。
  void visibleVideos(false)
    .then((videos) => sendJson(res, 200, { groups: groupByDate(videos.map(({ meta: _meta, ...video }) => video)) }))
    .catch((err) => sendError(res, 500, err.message || '读取分组失败', err.code));
}

/**
 * 媒体库默认不包含已进回收站的视频；回收区自己通过 includeTrashed 读取。
 * 元数据与视频列表合成在同一处，避免每个消费方各自判断 trashedAt。
 */
async function visibleVideos(includeTrashed = false) {
  const meta = await store.getAll();
  const videos = state.index.videos.map(({ root: _root, ...video }) => ({
    ...video,
    meta: { ...defaultMeta(), ...(meta[video.id] ?? {}) },
  }));
  return includeTrashed ? videos : videos.filter((video) => (video.meta.trashedAt ?? 0) <= 0);
}

async function handleVideo(req, res, id, v1 = false) {
  const video = state.byId.get(id);
  if (!video) return v1 ? sendApiError(res, 404, '视频不在库中', 'VIDEO_NOT_FOUND') : sendError(res, 404, '视频不在库中');
  if (req.method === 'GET') {
    const meta = await store.get(id);
    const { root: _root, ...publicVideo } = video;
    return v1 ? sendApiJson(res, 200, { ...publicVideo, meta }) : sendJson(res, 200, { ...publicVideo, meta });
  }
  // PATCH
  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return sendError(res, err.statusCode ?? 400, err.message);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return sendError(res, 400, '请求体必须是 JSON 对象');
  }
  try {
    const meta = await store.patch(id, body);
    return v1 ? sendApiJson(res, 200, { ...video, meta }) : sendJson(res, 200, { ...video, meta });
  } catch (err) {
    console.error('[DanceEcho] 保存元数据失败:', err);
    return sendError(res, 500, '保存元数据失败');
  }
}

async function handleStream(req, res, id) {
  const video = state.byId.get(id);
  if (!video) return sendError(res, 404, '视频不在库中');

  const abs = absoluteVideoPath(video);
  if (!abs) return sendError(res, 403, '非法路径');

  let stat;
  try {
    stat = await fs.stat(abs);
  } catch {
    return sendError(res, 404, '视频文件不存在或已移动');
  }
  if (!stat.isFile()) return sendError(res, 404, '视频文件不存在');

  const total = stat.size;
  const mime = VIDEO_MIME[video.ext] ?? 'application/octet-stream';
  const range = parseRange(req.headers.range, total);

  if (range === 'invalid') {
    res.writeHead(416, {
      'Content-Range': `bytes */${total}`,
      'Cache-Control': 'no-store',
      'Accept-Ranges': 'bytes',
    });
    return res.end();
  }

  if (range) {
    const { start, end } = range;
    res.writeHead(206, {
      'Content-Type': mime,
      'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
    });
    if (req.method === 'HEAD') return res.end();
    try {
      await pipeline(createReadStream(abs, { start, end }), res);
    } catch (err) {
      if (err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
        console.warn('[DanceEcho] 视频流发送失败:', err.message);
      }
    }
    return;
  }

  res.writeHead(200, {
    'Content-Type': mime,
    'Content-Length': total,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
  });
  if (req.method === 'HEAD') return res.end();
  try {
    await pipeline(createReadStream(abs), res);
  } catch (err) {
    if (err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
      console.warn('[DanceEcho] 视频流发送失败:', err.message);
    }
  }
}

function transcodePathFor(id) {
  return path.join(TRANSCODES_DIR, `${id}.mp4`);
}

async function transcodeCacheFresh(id) {
  // id 已包含“文件名+大小+修改时间”，同一个 id 必然对应同一版源文件，缓存无需再比 mtime
  const out = transcodePathFor(id);
  if (!existsSync(out)) return false;
  try {
    const stat = await fs.stat(out);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

async function handleTranscode(req, res, id, retryRequested = false) {
  const video = state.byId.get(id);
  if (!video) return sendError(res, 404, '视频不在库中');
  const abs = absoluteVideoPath(video);
  if (!abs) return sendError(res, 403, '非法路径');
  let srcStat;
  try {
    srcStat = await fs.stat(abs);
  } catch {
    return sendError(res, 404, '视频文件不存在或已移动');
  }
  if (!srcStat.isFile()) return sendError(res, 404, '视频文件不存在');
  if (await transcodeCacheFresh(id)) {
    transcodeJobs.set(id, { status: 'ready' });
    return sendJson(res, 200, { status: 'ready', url: `/transcode/${id}` });
  }
  const job = transcodeJobs.get(id);
  if (job) {
    // 失败必须显式回传，前端才能立刻提示而不是盲等轮询超时。
    // status=error 时不拦截：调用方再次 POST 即视为重试（见下方 startTranscode）。
    if (job.status === 'running') {
      return sendJson(res, 202, { status: 'running', url: `/transcode/${id}` });
    }
    if (job.status === 'error' && !retryRequested) {
      return sendJson(res, 200, { status: 'error', reason: job.reason || '转码失败', url: `/transcode/${id}` });
    }
  }
  if (!ffmpegBin) {
    return sendJson(res, 503, { status: 'unavailable', reason: '未检测到 ffmpeg，请安装后重启服务端' });
  }

  await fs.mkdir(TRANSCODES_DIR, { recursive: true });
  const out = transcodePathFor(id);
  // 临时文件必须保留 .mp4 扩展名：ffmpeg 靠扩展名推断 muxer，
  // `<id>.mp4.tmp` 会让它以 AVERROR(EINVAL) / -22 退出（Windows 下表现为 4294967274）。
  // 与 thumbs.mjs 的 `${thumbPath}.tmp.jpg` 同理，扩展名必须放在最后。
  const tmp = `${out}.pending.mp4`;
  await fs.rm(tmp, { force: true });
  transcodeJobs.set(id, { status: 'running' });
  const child = spawn(
    ffmpegBin,
    ['-y', '-v', 'error', '-i', abs, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', tmp],
    { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] }
  );

  // 保留 ffmpeg 的真实错误文本，供失败回传与日志排查（之前 -v error 的输出被丢弃）
  let stderr = '';
  child.stderr?.on('data', (chunk) => {
    if (stderr.length < 4000) stderr += String(chunk);
  });

  const fail = (reason) => {
    console.warn(`[DanceEcho] 转码失败（${id}）: ${reason}`);
    transcodeJobs.set(id, { status: 'error', reason });
    void fs.rm(tmp, { force: true }).catch(() => {});
  };

  child.on('error', (err) => fail(`ffmpeg 进程启动失败: ${err.message}`));
  child.on('close', async (code) => {
    if (code === 0) {
      try {
        await fs.rename(tmp, out);
        transcodeJobs.set(id, { status: 'ready' });
      } catch (err) {
        fail(`转码结果落盘失败: ${err.message}`);
      }
    } else {
      fail(`ffmpeg exit=${code}${stderr.trim() ? ` — ${stderr.trim().slice(0, 500)}` : ''}`);
    }
  });
  return sendJson(res, 202, { status: 'running', url: `/transcode/${id}` });
}

async function handleTranscodeStream(req, res, id) {
  const filePath = transcodePathFor(id);
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    return sendError(res, 404, '转码文件尚未就绪');
  }
  if (!stat.isFile() || stat.size === 0) return sendError(res, 404, '转码文件尚未就绪');
  const total = stat.size;
  const range = parseRange(req.headers.range, total);
  if (range === 'invalid') {
    res.writeHead(416, { 'Content-Range': `bytes */${total}`, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' });
    return res.end();
  }
  if (range) {
    const { start, end } = range;
    res.writeHead(206, {
      'Content-Type': 'video/mp4',
      'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
    });
    if (req.method === 'HEAD') return res.end();
    try {
      await pipeline(createReadStream(filePath, { start, end }), res);
    } catch (err) {
      if (err.code !== 'ERR_STREAM_PREMATURE_CLOSE') console.warn('[DanceEcho] 转码流发送失败:', err.message);
    }
    return;
  }
  res.writeHead(200, {
    'Content-Type': 'video/mp4',
    'Content-Length': total,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
  });
  if (req.method === 'HEAD') return res.end();
  try {
    await pipeline(createReadStream(filePath), res);
  } catch (err) {
    if (err.code !== 'ERR_STREAM_PREMATURE_CLOSE') console.warn('[DanceEcho] 转码流发送失败:', err.message);
  }
}

async function handleThumb(req, res, id) {
  if (!state.byId.has(id) && !pendingThumbIds.has(id)) return sendError(res, 404, '视频不在库中');
  const filePath = thumbPathFor(id);
  const legacyPath = legacyThumbPathFor(id);

  if (req.method === 'GET' || req.method === 'HEAD') {
    let stat;
    let servePath = filePath;
    try {
      stat = await fs.stat(filePath);
    } catch {
      const video = state.byId.get(id);
      // 旧版本的缩略图先拿来顶上，后台再补一张新滤镜的：拆掉宽高不一的竖条，避免卡片空一块。
      let legacyStat = null;
      try { legacyStat = await fs.stat(legacyPath); } catch { /* ignore */ }
      if (legacyStat) {
        servePath = legacyPath;
        stat = legacyStat;
        if (ffmpegBin && video && !thumbJobs.has(id)) {
          const abs = absoluteVideoPath(video);
          if (abs) {
            const job = generateThumb(ffmpegBin, abs, filePath, video.duration)
              .catch(() => false)
              .finally(() => thumbJobs.delete(id));
            thumbJobs.set(id, job);
          }
        }
      } else if (ffmpegBin && video && !thumbJobs.has(id)) {
        // 缩略图尚未生成：如果 ffmpeg 可用且原视频在库中，则服务端生成一次
        const abs = absoluteVideoPath(video);
        if (abs) {
          const job = generateThumb(ffmpegBin, abs, filePath, video.duration).finally(() => thumbJobs.delete(id));
          thumbJobs.set(id, job);
          await job;
        }
      }
      try { stat = await fs.stat(servePath); } catch {
        return sendError(res, 404, '缩略图尚未生成');
      }
    }
    res.writeHead(200, {
      'Content-Type': 'image/jpeg',
      'Content-Length': stat.size,
      // 旧版缩略图只是临时兜底：不缓存，下一次请求就能拿到新滤镜生成的那张。
      'Cache-Control': servePath === legacyPath ? 'no-cache' : 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') return res.end();
    try {
      await pipeline(createReadStream(servePath), res);
    } catch (err) {
      if (err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
        console.warn('[DanceEcho] 缩略图发送失败:', err.message);
      }
    }
    return;
  }

  // POST /thumb/:id
  const contentType = String(req.headers['content-type'] ?? '');
  if (!contentType.toLowerCase().includes('image/jpeg')) {
    return sendError(res, 415, '只接受 image/jpeg');
  }
  let body;
  try {
    body = await readRawBody(req, MAX_THUMB_BODY);
  } catch (err) {
    return sendError(res, err.statusCode ?? 400, err.message);
  }
  if (body.length < 4 || body[0] !== 0xff || body[1] !== 0xd8) {
    return sendError(res, 400, '不是合法的 JPEG 数据');
  }
  await fs.mkdir(THUMBS_DIR, { recursive: true });
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, body);
  await fs.rename(tmp, filePath);
  // 客户端上传的是同尺寸（480x270）的合成封面，旧文件已经没用，顺手清掉免得占地方
  try { await fs.rm(legacyPath, { force: true }); } catch { /* ignore */ }
  sendJson(res, 200, { ok: true, id, bytes: body.length, thumbUrl: `/thumb/${id}` });
}

async function handleFolders(req, res) {
  if (req.method === 'GET') return sendApiJson(res, 200, { folders: await store.getFolders(), trash: await store.getTrash() });
  let body;
  try { body = await readJsonBody(req); } catch (err) { return sendApiError(res, err.statusCode ?? 400, err.message, 'INVALID_JSON'); }
  try {
    if (req.method === 'POST') return sendApiJson(res, 201, { folder: await store.createFolder(body.name) });
    return sendApiError(res, 405, '方法不允许', 'METHOD_NOT_ALLOWED');
  } catch (err) { return sendApiError(res, 400, err.message, err.code || 'FOLDER_OPERATION_FAILED'); }
}

async function handleFolder(req, res, id) {
  let body;
  try { body = await readJsonBody(req); } catch (err) { return sendApiError(res, err.statusCode ?? 400, err.message, 'INVALID_JSON'); }
  try {
    if (req.method === 'PATCH') return sendApiJson(res, 200, { folder: await store.renameFolder(id, body.name) });
    if (req.method === 'DELETE') { await store.deleteFolder(id); return sendApiJson(res, 200, { ok: true }); }
    return sendApiError(res, 405, '方法不允许', 'METHOD_NOT_ALLOWED');
  } catch (err) { return sendApiError(res, 400, err.message, err.code || 'FOLDER_OPERATION_FAILED'); }
}

async function handleFolderAssignment(req, res, videoId) {
  let body;
  try { body = await readJsonBody(req); } catch (err) { return sendApiError(res, err.statusCode ?? 400, err.message, 'INVALID_JSON'); }
  try { return sendApiJson(res, 200, { meta: await store.assignFolder(videoId, body.folderId ?? null) }); }
  catch (err) { return sendApiError(res, 400, err.message, err.code || 'FOLDER_OPERATION_FAILED'); }
}

async function handleTrash(req, res, id) {
  try {
    if (req.method === 'POST') return sendApiJson(res, 200, { meta: await store.trashVideo(id) });
    return sendApiError(res, 405, '方法不允许', 'METHOD_NOT_ALLOWED');
  } catch (err) { return sendApiError(res, 400, err.message, err.code || 'TRASH_OPERATION_FAILED'); }
}

/** 批量移入回收区：前端全选 1400 个时只发一次请求、服务端一次写入。 */
async function handleBatchTrash(req, res) {
  try {
    const body = await readJsonBody(req);
    const rawIds = Array.isArray(body?.ids) ? body.ids : null;
    if (!rawIds) return sendApiError(res, 400, 'ids 必须是数组', 'INVALID_IDS');
    const ids = rawIds.filter((id) => typeof id === 'string' && ID_RE.test(id) && state.byId.has(id));
    if (ids.length === 0) return sendApiError(res, 400, '没有可移除的视频 id', 'INVALID_IDS');
    const result = await store.trashVideos(ids);
    return sendApiJson(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendApiError(res, err.statusCode ?? 400, err.message, 'TRASH_OPERATION_FAILED');
  }
}

async function handleRestore(req, res, id) {
  try { return sendApiJson(res, 200, { meta: await store.restoreVideo(id) }); }
  catch (err) { return sendApiError(res, 400, err.message, err.code || 'TRASH_OPERATION_FAILED'); }
}

/** 清空回收区：一次写入；磁盘文件保持不动。 */
async function handleTrashClear(req, res) {
  try { return sendApiJson(res, 200, await store.clearTrash()); }
  catch (err) { return sendApiError(res, 400, err.message, err.code || 'TRASH_OPERATION_FAILED'); }
}

async function handleBookmarks(req, res, videoId, bookmarkId = null) {
  try {
    if (req.method === 'GET') return sendApiJson(res, 200, { bookmarks: await store.getBookmarks(videoId) });
    let body;
    try { body = await readJsonBody(req); } catch (err) { return sendApiError(res, err.statusCode ?? 400, err.message, 'INVALID_JSON'); }
    if (req.method === 'POST') return sendApiJson(res, 201, { bookmark: await store.createBookmark(videoId, body) });
    if (req.method === 'PATCH' && bookmarkId) return sendApiJson(res, 200, { bookmark: await store.updateBookmark(videoId, bookmarkId, body) });
    if (req.method === 'DELETE' && bookmarkId) { await store.deleteBookmark(videoId, bookmarkId); return sendApiJson(res, 200, { ok: true }); }
    return sendApiError(res, 405, '方法不允许', 'METHOD_NOT_ALLOWED');
  } catch (err) { return sendApiError(res, 400, err.message, err.code || 'BOOKMARK_OPERATION_FAILED'); }
}

async function handleObservations(req, res, videoId, obsId = null) {
  try {
    if (req.method === 'GET') return sendApiJson(res, 200, { observations: await store.listObservations(videoId) });
    let body;
    try { body = await readJsonBody(req); } catch (err) { return sendApiError(res, err.statusCode ?? 400, err.message, 'INVALID_JSON'); }
    if (req.method === 'POST') { const obs = await store.addObservation(videoId, body); return sendApiJson(res, 201, { observation: { ...obs, videoId } }); }
    if (req.method === 'PATCH' && obsId) return sendApiJson(res, 200, { observation: await store.updateObservation(videoId, obsId, body) });
    if (req.method === 'DELETE' && obsId) { await store.deleteObservation(videoId, obsId); return sendApiJson(res, 200, { ok: true }); }
    return sendApiError(res, 405, '方法不允许', 'METHOD_NOT_ALLOWED');
  } catch (err) { return sendApiError(res, err.code === 'OBSERVATION_NOT_FOUND' ? 404 : 400, err.message, err.code || 'OBSERVATION_OPERATION_FAILED'); }
}

async function handlePracticeLogs(req, res, dateKey = null) {
  try {
    if (req.method === 'GET' && !dateKey) return sendApiJson(res, 200, { logs: await store.listPracticeLogs() });
    if (req.method === 'GET' && dateKey) {
      const log = await store.getPracticeLog(dateKey);
      return log ? sendApiJson(res, 200, { log }) : sendApiError(res, 404, '该日期没有练习记录', 'PRACTICE_LOG_NOT_FOUND');
    }
    let body;
    try { body = await readJsonBody(req); } catch (err) { return sendApiError(res, err.statusCode ?? 400, err.message, 'INVALID_JSON'); }
    if ((req.method === 'PUT' || req.method === 'POST') && dateKey) return sendApiJson(res, 200, { log: await store.upsertPracticeLog(dateKey, body) });
    if (req.method === 'PUT' || req.method === 'POST') {
      if (typeof body.date !== 'string' || !body.date) return sendApiError(res, 400, '缺少 date（YYYY-MM-DD）', 'INVALID_DATE_KEY');
      return sendApiJson(res, 200, { log: await store.upsertPracticeLog(body.date, body) });
    }
    return sendApiError(res, 405, '方法不允许', 'METHOD_NOT_ALLOWED');
  } catch (err) { return sendApiError(res, 400, err.message, err.code || 'PRACTICE_LOG_OPERATION_FAILED'); }
}

async function handleBackup(res) {
  try {
    const data = await store.exportAll();
    return sendApiJson(res, 200, data);
  } catch (err) {
    return sendApiError(res, 500, err.message || '备份导出失败', 'BACKUP_FAILED');
  }
}

async function handleBackupRestore(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return sendApiError(res, err.statusCode ?? 400, err.message, 'INVALID_JSON');
  }
  try {
    const knownIds = state.index.videos.map((video) => video.id);
    const result = await store.importAll(body, knownIds);
    return sendApiJson(res, 200, { ok: true, result });
  } catch (err) {
    return sendApiError(res, 400, err.message || '备份恢复失败', err.code || 'BACKUP_IMPORT_FAILED');
  }
}

function handleHealth(res) {
  sendApiJson(res, 200, {
    status: 'ok',
    serverVersion: SERVER_VERSION,
    apiVersion: API_VERSION,
    mediaRootConfigured: Boolean(state.mediaRoot),
    scannedAt: state.index.scannedAt,
    videoCount: state.index.count,
  });
}

function handleCapabilities(res) {
  sendApiJson(res, 200, {
    serverVersion: SERVER_VERSION,
    apiVersion: API_VERSION,
    capabilities: {
      rangeStreaming: true,
      thumbnails: true,
      metadata: true,
      rescan: true,
      upload: true,
      observations: true,
      practiceLogs: true,
      backupExport: true,
      backupImport: true,
      thumbnailsAuto: true,
      poseAnalysis: false,
      lanAccess: false,
    },
  });
}

function handleStats(res) {
  void visibleVideos(false)
    .then((videos) => {
      const byDate = {};
      let totalBytes = 0;
      for (const video of videos) {
        byDate[video.dateKey] = (byDate[video.dateKey] ?? 0) + 1;
        totalBytes += video.size;
      }
      sendJson(res, 200, {
        total: videos.length,
        totalBytes,
        byDate,
        scannedAt: state.index.scannedAt,
      });
    })
    .catch((err) => sendError(res, 500, err.message || '读取统计失败', err.code));
}

const ID_RE = /^[0-9a-f]{16}$/;

// ---------------------------------------------------------------- 上传登记

/**
 * 最小 multipart/form-data 解析：只提取第一个 file part。
 * 假设请求按标准 multipart 布局（boundary 行 → headers → 空行 → 数据 → CRLF+boundary）。
 * 返回 { filename, contentType, data:Buffer } 或 null。
 */
function parseSingleFileMultipart(body, contentTypeHeader) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentTypeHeader || '');
  if (!m) return null;
  const boundary = Buffer.from(`--${m[1] || m[2]}`);
  const start = body.indexOf(boundary);
  if (start === -1) return null;
  const headerEnd = body.indexOf('\r\n\r\n', start + boundary.length);
  if (headerEnd === -1) return null;
  const headerText = body.slice(start + boundary.length, headerEnd).toString('utf8');
  const nameMatch = /filename="([^"]*)"/i.exec(headerText);
  if (!nameMatch) return null; // 不是 file part（例如普通字段），拒绝
  const next = body.indexOf(boundary, headerEnd + 4);
  if (next === -1) return null;
  // part 数据结尾有 \r\n 属于 boundary 前缀
  const data = body.slice(headerEnd + 4, next - 2);
  const ctMatch = /content-type:\s*([^\r\n]+)/i.exec(headerText);
  return {
    filename: nameMatch[1],
    contentType: ctMatch ? ctMatch[1].trim() : '',
    data,
  };
}

function sanitizeFilename(name) {
  const base = path.basename(String(name || '')).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim();
  return base || 'video.mp4';
}

async function handleUpload(req, res, url) {
  if (scanInflight) {
    try { await scanInflight; } catch { /* 忽略 */ }
  }
  let body;
  try {
    body = await readRawBody(req, 4 * 1024 * 1024 * 1024); // 4GB 上限
  } catch (err) {
    return sendApiError(res, err.statusCode ?? 400, err.message, 'UPLOAD_BODY_ERROR');
  }
  const part = parseSingleFileMultipart(body, req.headers['content-type']);
  if (!part || !part.data.length) {
    return sendApiError(res, 400, '请求体必须是包含单个文件 part 的 multipart/form-data', 'UPLOAD_NO_FILE');
  }
  const ext = path.extname(part.filename).toLowerCase();
  if (!VIDEO_EXTENSIONS_UPLOAD.has(ext)) {
    return sendApiError(res, 415, `不支持的文件扩展名: ${ext || '(无)'}`, 'UPLOAD_UNSUPPORTED_EXT');
  }
  const filename = sanitizeFilename(part.filename);
  const uploadDir = path.join(state.mediaRoot, 'uploads');
  const absDir = path.resolve(uploadDir);
  if (absDir !== path.resolve(state.mediaRoot) && !absDir.startsWith(path.resolve(state.mediaRoot) + path.sep)) {
    return sendApiError(res, 500, '上传目录越界', 'UPLOAD_DIR_ERROR');
  }
  await fs.mkdir(uploadDir, { recursive: true });
  let absPath = path.join(uploadDir, filename);
  if (existsSync(absPath)) {
    const stem = path.basename(filename, ext);
    absPath = path.join(uploadDir, `${stem}-${Date.now()}${ext}`);
  }
  await fs.writeFile(absPath, part.data);
  // 浏览器传来原始修改时间：保留它，分组日期才不会被“拷贝时刻”覆盖
  const mtimeMs = Number(url.searchParams.get('mtime'));
  if (Number.isFinite(mtimeMs) && mtimeMs > 0) {
    try {
      const when = new Date(mtimeMs);
      await fs.utimes(absPath, when, when);
    } catch {
      /* 时间设置失败不影响文件本身 */
    }
  }
  const relPath = path.relative(state.mediaRoot, absPath).split(path.sep).join('/');
  const id = videoIdFor(relPath);
  pendingThumbIds.add(id);
  const indexed = state.byId.get(id) ?? null;
  // 不在每个文件上跑全量扫描：合并成一次后台重扫，上传接口立即返回 id 供封面/播放使用
  scheduleScan();
  console.log(`[DanceEcho] 上传登记: ${relPath} (${formatBytes(part.data.length)})`);
  return sendApiJson(res, 201, {
    uploaded: { relPath, filename, size: part.data.length, id, video: indexed },
  });
}

const VIDEO_EXTENSIONS_UPLOAD = new Set(['.mp4', '.mov', '.m4v', '.mkv', '.webm', '.ogg', '.avi']);

async function handler(req, res) {
  const url = new URL(req.url, 'http://127.0.0.1');
  const pathname = url.pathname;
  const origin = req.headers.origin || '';
  const isLoopbackOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const corsOrigin = origin === 'http://127.0.0.1:5173' || origin === 'http://localhost:5173' || isLoopbackOrigin ? origin : '';
  if (corsOrigin && (pathname.startsWith('/stream/') || pathname.startsWith('/thumb/') || pathname.startsWith('/transcode/') || pathname.startsWith('/api/v1/'))) {
    res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PATCH, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
    res.setHeader('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Range, Content-Length');
  }
  if (req.method === 'OPTIONS' && corsOrigin) {
    res.writeHead(204);
    return res.end();
  }

  try {
    if (pathname === '/api/v1/health' && (req.method === 'GET' || req.method === 'HEAD')) {
      return handleHealth(res);
    }
    if (pathname === '/api/v1/capabilities' && (req.method === 'GET' || req.method === 'HEAD')) {
      return handleCapabilities(res);
    }
    if (pathname === '/api/v1/library' && (req.method === 'GET' || req.method === 'HEAD')) {
      try {
        const index = await ensureScan(url.searchParams.get('force') === '1');
        const includeTrashed = url.searchParams.get('includeTrashed') === '1';
        const videos = await visibleVideos(includeTrashed);
        const totalBytes = videos.reduce((sum, video) => sum + (video.size || 0), 0);
        return sendApiJson(res, 200, {
          root: index.root,
          scannedAt: index.scannedAt,
          count: videos.length,
          totalBytes,
          videos,
        });
      } catch (err) {
        return sendApiError(res, 500, err.message || '扫描失败', err.code || 'SCAN_FAILED');
      }
    }
    if (pathname === '/api/v1/groups' && (req.method === 'GET' || req.method === 'HEAD')) {
      try {
        const videos = await visibleVideos(false);
        return sendApiJson(res, 200, { groups: groupByDate(videos) });
      } catch (err) {
        return sendApiError(res, 500, err.message || '读取分组失败', err.code || 'GROUPS_READ_FAILED');
      }
    }
    if (pathname === '/api/v1/folders') return await handleFolders(req, res);
    const folderMatch = /^\/api\/v1\/folders\/([^/]+)$/.exec(pathname);
    if (folderMatch) return await handleFolder(req, res, decodeURIComponent(folderMatch[1]));
    const assignMatch = /^\/api\/v1\/videos\/([^/]+)\/folder$/.exec(pathname);
    if (assignMatch && req.method === 'PATCH') return await handleFolderAssignment(req, res, decodeURIComponent(assignMatch[1]));
    if (pathname === '/api/v1/videos/trash' && req.method === 'POST') return await handleBatchTrash(req, res);
    const v1VideoMatch = /^\/api\/v1\/videos\/([^/]+)$/.exec(pathname);
    if (v1VideoMatch) {
      const id = decodeURIComponent(v1VideoMatch[1]);
      if (!ID_RE.test(id)) return sendApiError(res, 400, '非法视频 id', 'INVALID_VIDEO_ID');
      if (req.method === 'GET' || req.method === 'PATCH') return await handleVideo(req, res, id, true);
      return sendApiError(res, 405, '方法不允许', 'METHOD_NOT_ALLOWED');
    }
    const trashMatch = /^\/api\/v1\/videos\/([^/]+)\/trash$/.exec(pathname);
    if (trashMatch && req.method === 'POST') return await handleTrash(req, res, decodeURIComponent(trashMatch[1]));
    const restoreMatch = /^\/api\/v1\/trash\/([^/]+)\/restore$/.exec(pathname);
    if (restoreMatch && req.method === 'POST') return await handleRestore(req, res, decodeURIComponent(restoreMatch[1]));
    if (pathname === '/api/v1/trash/clear' && req.method === 'POST') return await handleTrashClear(req, res);
    const bookmarksMatch = /^\/api\/v1\/videos\/([^/]+)\/bookmarks(?:\/([^/]+))?$/.exec(pathname);
    if (bookmarksMatch) return await handleBookmarks(req, res, decodeURIComponent(bookmarksMatch[1]), bookmarksMatch[2] ? decodeURIComponent(bookmarksMatch[2]) : null);
    const obsMatch = /^\/api\/v1\/videos\/([^/]+)\/observations(?:\/([^/]+))?$/.exec(pathname);
    if (obsMatch) return await handleObservations(req, res, decodeURIComponent(obsMatch[1]), obsMatch[2] ? decodeURIComponent(obsMatch[2]) : null);
    if (pathname === '/api/v1/observations' && (req.method === 'GET' || req.method === 'HEAD')) {
      try {
        return sendApiJson(res, 200, { observations: await store.listObservations(null) });
      } catch (err) {
        return sendApiError(res, 500, err.message || '读取观察记录失败', 'OBSERVATIONS_READ_FAILED');
      }
    }
    if (pathname === '/api/v1/practice-logs') return await handlePracticeLogs(req, res);
    const logMatch = /^\/api\/v1\/practice-logs\/([^/]+)$/.exec(pathname);
    if (logMatch) return await handlePracticeLogs(req, res, decodeURIComponent(logMatch[1]));
    if (pathname === '/api/v1/backup' && (req.method === 'GET' || req.method === 'HEAD')) return await handleBackup(res);
    if (pathname === '/api/v1/backup' && req.method === 'POST') return await handleBackupRestore(req, res);
    if (pathname === '/api/v1/upload' && req.method === 'POST') return await handleUpload(req, res, url);
    if (pathname === '/api/v1/health' || pathname === '/api/v1/capabilities') {
      return sendApiError(res, 405, '方法不允许', 'METHOD_NOT_ALLOWED');
    }
    if (pathname === '/api/library' && (req.method === 'GET' || req.method === 'HEAD')) {
      return await handleLibrary(req, res, url);
    }
    if (pathname === '/api/groups' && (req.method === 'GET' || req.method === 'HEAD')) {
      return handleGroups(res);
    }
    if (pathname === '/api/stats' && (req.method === 'GET' || req.method === 'HEAD')) {
      return handleStats(res);
    }
    if ((pathname === '/api/rescan' || pathname === '/api/v1/rescan') && req.method === 'POST') {
      const force = url.searchParams.get('force') === '1';
      try {
        const index = await ensureScan(force);
        return sendJson(res, 200, { count: index.count, scannedAt: index.scannedAt });
      } catch (err) {
        return sendError(res, 500, err.message || '扫描失败', err.code);
      }
    }

    const videoMatch = /^\/api\/video\/([^/]+)$/.exec(pathname);
    if (videoMatch) {
      const id = decodeURIComponent(videoMatch[1]);
      if (!ID_RE.test(id)) return sendError(res, 400, '非法视频 id');
      if (req.method === 'GET' || req.method === 'PATCH') {
        return await handleVideo(req, res, id);
      }
      return sendError(res, 405, '方法不允许');
    }

    const streamMatch = /^\/stream\/([^/]+)$/.exec(pathname);
    if (streamMatch) {
      const id = decodeURIComponent(streamMatch[1]);
      if (!ID_RE.test(id)) return sendError(res, 400, '非法视频 id');
      if (req.method !== 'GET' && req.method !== 'HEAD') return sendError(res, 405, '方法不允许');
      return await handleStream(req, res, id);
    }

    const thumbMatch = /^\/thumb\/([^/]+)$/.exec(pathname);
    if (thumbMatch) {
      const id = decodeURIComponent(thumbMatch[1]);
      if (!ID_RE.test(id)) return sendError(res, 400, '非法视频 id');
      if (!['GET', 'HEAD', 'POST'].includes(req.method)) return sendError(res, 405, '方法不允许');
      return await handleThumb(req, res, id);
    }

    const transcodeMatch = /^\/api\/v1\/videos\/([^/]+)\/transcode$/.exec(pathname);
    if (transcodeMatch) {
      const id = decodeURIComponent(transcodeMatch[1]);
      if (!ID_RE.test(id)) return sendError(res, 400, '非法视频 id');
      if (req.method !== 'POST') return sendError(res, 405, '方法不允许');
      return await handleTranscode(req, res, id, url.searchParams.get('retry') === '1');
    }

    const transcodedMatch = /^\/transcode\/([^/]+)$/.exec(pathname);
    if (transcodedMatch) {
      const id = decodeURIComponent(transcodedMatch[1]);
      if (!ID_RE.test(id)) return sendError(res, 400, '非法视频 id');
      if (req.method !== 'GET' && req.method !== 'HEAD') return sendError(res, 405, '方法不允许');
      return await handleTranscodeStream(req, res, id);
    }

    if (pathname.startsWith('/api/')) return sendError(res, 404, '接口不存在');
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendError(res, 405, '方法不允许');
    return await serveStatic(req, res, pathname);
  } catch (err) {
    console.error('[DanceEcho] 未捕获的请求错误:', err);
    if (!res.headersSent) {
      sendError(res, err.statusCode ?? 500, err.message || '服务器内部错误');
    } else {
      res.destroy();
    }
  }
}

// ---------------------------------------------------------------- 启动

async function main() {
  const config = await loadConfig();
  state.mediaRoot = config.mediaRoot;
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(THUMBS_DIR, { recursive: true });
  await fs.mkdir(TRANSCODES_DIR, { recursive: true });
  state.mounts = (config.mounts ?? []).map((raw) => {
    const abs = path.resolve(raw);
    return { path: abs, name: path.basename(abs) };
  });
  store = createStore(DATA_DIR);

  // 尝试复用上次索引，加快启动
  try {
    const cached = JSON.parse(await fs.readFile(INDEX_PATH, 'utf8'));
    if (
      cached &&
      Array.isArray(cached.videos) &&
      path.resolve(cached.root) === state.mediaRoot
    ) {
      state.index = cached;
      rebuildIndexMap();
    }
  } catch {
    /* 没有缓存或缓存损坏，忽略 */
  }

  console.log(`[DanceEcho] 媒体根目录: ${state.mediaRoot}`);
  ffmpegBin = await probeFfmpeg(config.thumbFfmpegPath ?? '');
  console.log(`[DanceEcho] 缩略图自动生成: ${ffmpegBin ? `可用 (${ffmpegBin})` : '未检测到 ffmpeg，仅支持客户端上传抓帧'}`);
  try {
    await ensureScan(false);
  } catch (err) {
    console.error(`[DanceEcho] 启动扫描失败: ${err.message}`);
  }

  const groups = groupByDate(state.index.videos);
  console.log(`[DanceEcho] 视频总数: ${state.index.count}，总大小: ${formatBytes(state.index.totalBytes)}`);
  console.log(
    `[DanceEcho] 日期分组: ${groups.length} 组` +
      (groups.length
        ? `（${groups.map((g) => `${g.dateKey}: ${g.count}`).join(', ')}）`
        : ''),
  );

  const server = http.createServer(handler);
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[DanceEcho] 端口 ${config.port} 已被占用，请修改 config.json 的 port。`);
    } else {
      console.error('[DanceEcho] 服务启动失败:', err.message);
    }
    process.exitCode = 1;
  });
  server.on('clientError', (err, socket) => {
    if (socket && !socket.destroyed) {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    }
  });

  process.on('uncaughtException', (err) => {
    console.error('[DanceEcho] 未捕获异常 (uncaughtException):', err);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[DanceEcho] 未处理 Promise 拒绝 (unhandledRejection):', reason);
  });

  server.listen(config.port, '127.0.0.1', () => {
    console.log(`[DanceEcho] 服务已启动: http://127.0.0.1:${config.port}`);
    console.log(`[DanceEcho] 数据目录: ${DATA_DIR}`);
  });

  const shutdown = (signal) => {
    console.log(`\n[DanceEcho] 收到 ${signal}，正在关闭…`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[DanceEcho] 致命错误:', err);
  process.exit(1);
});
