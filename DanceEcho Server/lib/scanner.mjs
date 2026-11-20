/**
 * scanner.mjs — 递归扫描媒体目录 + 按日期归组
 *
 * 日期优先级：MP4 内嵌 creation_time（合理年份内）→ 文件 mtime。
 * 对已有索引做增量复用：relPath + size + mtime 都没变时跳过 MP4 头解析。
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readMp4Meta } from './mp4meta.mjs';

export const VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.mov',
  '.m4v',
  '.mkv',
  '.webm',
  '.ogg',
  '.avi',
]);

/** 能用 mp4meta 解析的容器（其余格式直接退回 mtime） */
const MP4_LIKE = new Set(['.mp4', '.mov', '.m4v']);

const pad2 = (n) => String(n).padStart(2, '0');

/** 本地日期键 YYYY-MM-DD */
export function localDateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** 稳定 id：sha1(相对路径) 前 16 位 */
export function videoIdFor(relPath) {
  return crypto.createHash('sha1').update(relPath, 'utf8').digest('hex').slice(0, 16);
}

/** 日期是否可信：1990..当前年份+1 之间，且不是 1970 这类占位值 */
function isTrustworthy(ms) {
  if (!Number.isFinite(ms)) return false;
  const year = new Date(ms).getUTCFullYear();
  return year >= 1990 && year <= new Date().getFullYear() + 1;
}

/**
 * 选定分组日期，优先级：
 *   1. 文件系统修改时间（拍摄/导出后通常保留原始时间；用户明确要求以它为准）
 *   2. 视频内嵌的拍摄时间（mtime 不可信时兜底）
 * 刻意不使用 Windows 的"文件创建时间"：它会被拷贝/下载重写成"落到本机的那一刻"。
 */
function resolveDate(creationTime, birthtimeMs, mtimeMs) {
  if (isTrustworthy(mtimeMs)) {
    return { date: new Date(mtimeMs), dateSource: 'mtime' };
  }
  if (creationTime && isTrustworthy(new Date(creationTime).getTime())) {
    return { date: new Date(creationTime), dateSource: 'creation' };
  }
  return { date: new Date(mtimeMs), dateSource: 'mtime' };
}

/** 递归收集视频文件；跟随目录链接（E: 等外部媒体盘以 junction 挂载），用 realpath 防止目录环 */
async function walk(root, dir, out, visited) {
  let real;
  try {
    real = await fs.realpath(dir);
  } catch {
    return;
  }
  if (visited.has(real)) return;
  visited.add(real);
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      let target;
      try {
        target = await fs.stat(abs);
      } catch {
        continue;
      }
      if (target.isDirectory()) await walk(root, abs, out, visited);
      else if (target.isFile() && VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) out.push(abs);
      continue;
    }
    if (entry.isDirectory()) {
      await walk(root, abs, out, visited);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (VIDEO_EXTENSIONS.has(ext)) out.push(abs);
    }
  }
}

/**
 * @param {object} opts
 * @param {string} opts.mediaRoot
 * @param {Array} [opts.previous] 上一次 index.videos，用于增量复用
 * @param {boolean} [opts.force] 忽略缓存，全部重新解析
 * @param {(done:number,total:number)=>void} [opts.onProgress]
 */
export async function scanLibrary({ mediaRoot, previous = [], force = false, onProgress }) {
  const root = path.resolve(mediaRoot);

  const prevByPath = new Map();
  if (!force) {
    for (const item of previous) {
      if (item && typeof item.relPath === 'string') prevByPath.set(item.relPath, item);
    }
  }

  const files = [];
  try {
    const stat = await fs.stat(root);
    if (!stat.isDirectory()) throw new Error(`不是目录: ${root}`);
    await walk(root, root, files, new Set());
  } catch (err) {
    const error = new Error(`无法读取媒体根目录 ${root}: ${err.message}`);
    error.code = 'MEDIA_ROOT_UNREADABLE';
    throw error;
  }

  const videos = [];
  let done = 0;

  for (const abs of files) {
    done += 1;
    try {
      const stat = await fs.stat(abs);
      const relPath = path.relative(root, abs).split(path.sep).join('/');
      const ext = path.extname(abs).toLowerCase();
      const cached = prevByPath.get(relPath);

      let creationTime = null;
      let duration = null;
      let width = null;
      let height = null;
      let parsed = false;

      // 增量复用：文件路径、大小、修改时间都没变，直接沿用上次的解析结果
      if (
        cached &&
        cached.size === stat.size &&
        cached.mtimeMs === stat.mtimeMs &&
        typeof cached.creationTime !== 'undefined'
      ) {
        creationTime = cached.creationTime ?? null;
        duration = cached.duration ?? null;
        width = cached.width ?? null;
        height = cached.height ?? null;
        parsed = true;
      }

      if (!parsed && MP4_LIKE.has(ext)) {
        const meta = await readMp4Meta(abs);
        if (meta) {
          creationTime = meta.creationTime;
          duration = meta.duration;
          width = meta.width;
          height = meta.height;
        }
      }

      const { date, dateSource } = resolveDate(creationTime, stat.birthtimeMs, stat.mtimeMs);
      const id = videoIdFor(relPath);
      const dateKey = localDateKey(date);

      videos.push({
        id,
        relPath,
        name: path.basename(abs),
        ext,
        size: stat.size,
        mtime: stat.mtime.toISOString(),
        mtimeMs: stat.mtimeMs,
        birthtime: stat.birthtime.toISOString(),
        birthtimeMs: stat.birthtimeMs,
        creationTime: creationTime ?? null,
        duration: duration ?? null,
        width: width ?? null,
        height: height ?? null,
        dateKey,
        dateSource,
        dateIso: date.toISOString(),
        url: `/stream/${id}`,
        thumbUrl: `/thumb/${id}`,
      });
    } catch {
      // 单个文件读失败不能中断扫描
    }

    if (onProgress) onProgress(done, files.length);
  }

  // 日期倒序；同一天按 mtime 倒序
  videos.sort((a, b) => {
    if (a.dateKey !== b.dateKey) return a.dateKey < b.dateKey ? 1 : -1;
    return b.mtimeMs - a.mtimeMs;
  });

  const totalBytes = videos.reduce((sum, v) => sum + v.size, 0);

  return {
    root,
    scannedAt: new Date().toISOString(),
    count: videos.length,
    totalBytes,
    videos,
  };
}

/** 按 dateKey 归组，日期倒序、组内 mtime 倒序 */
export function groupByDate(videos) {
  const map = new Map();
  for (const video of videos) {
    if (!map.has(video.dateKey)) map.set(video.dateKey, []);
    map.get(video.dateKey).push(video);
  }
  const groups = [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([dateKey, items]) => ({
      dateKey,
      count: items.length,
      bytes: items.reduce((sum, v) => sum + v.size, 0),
      videos: items.slice().sort((a, b) => b.mtimeMs - a.mtimeMs),
    }));
  return groups;
}
