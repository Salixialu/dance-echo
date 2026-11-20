/**
 * 存储健康度管理：配额估算、持久化申请、整库备份与恢复、孤儿记录清理。
 *
 * 背景：视频本体以 Blob 形式整体复制进 IndexedDB，属于浏览器的
 * "best-effort" 存储 —— 磁盘紧张或用户清理浏览数据时会被无提示清除。
 * 这个模块负责把风险变得可见、可操作。
 */
import { db } from '../db';
import { api, ApiError } from '../api/client';
import type { DBVideoRecord, DBFolderRecord } from '../db';

export interface StorageStatus {
  /** 浏览器是否支持 StorageManager API */
  supported: boolean;
  /** 已用字节 */
  usage: number;
  /** 配额字节（0 表示未知） */
  quota: number;
  /** 已申请到持久化（true 时浏览器不会主动清除） */
  persisted: boolean;
  /** 各表记录数 */
  counts: {
    videos: number;
    folders: number;
    observations: number;
    practiceLogs: number;
  };
  /** 视频字节总和（按元数据 size 字段累计，不是真实占用） */
  videoBytes: number;
  /** 缩略图 base64 占用估算 */
  thumbnailBytes: number;
  /** 缺少视频本体的记录数 */
  orphanCount: number;
}

export const BACKUP_SCHEMA = 'dance-echo-library-backup';
export const BACKUP_VERSION = 1;

export type BackupRecord = Pick<
  DBVideoRecord,
  | 'id'
  | 'name'
  | 'size'
  | 'lastModified'
  | 'duration'
  | 'width'
  | 'height'
  | 'tags'
  | 'category'
  | 'rating'
  | 'playCount'
  | 'lastPlayedAt'
  | 'playbackPosition'
  | 'bpm'
  | 'beatOffset'
  | 'songTitle'
  | 'songArtist'
  | 'path'
  | 'thumbnailBase64'
>;

export interface BackupFile {
  schema: typeof BACKUP_SCHEMA;
  version: number;
  exportedAt: string;
  origin: string;
  counts: { videos: number; folders: number };
  videos: BackupRecord[];
  folders: DBFolderRecord[];
}

/** 人类可读的字节格式化 */
export function formatBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(index === 0 ? 0 : digits)} ${units[index]}`;
}

/** base64 字符串解码后的近似字节数 */
function base64Bytes(value?: string): number {
  if (!value) return 0;
  const comma = value.indexOf(',');
  const payload = comma >= 0 ? value.slice(comma + 1) : value;
  return Math.round((payload.length * 3) / 4);
}

function storageManager(): StorageManager | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { storage?: StorageManager }).storage;
}

/** 是否有记录但缺少可播放的视频本体（服务端媒体库记录的视频本体在磁盘上，不算孤儿） */
export function isOrphan(record: DBVideoRecord): boolean {
  if (record.serverId) return false;
  return !record.blob || (record.blob instanceof Blob && record.blob.size === 0);
}

/** 读取当前存储状况（不会触发任何申请） */
export async function getStorageStatus(): Promise<StorageStatus> {
  const manager = storageManager();
  let usage = 0;
  let quota = 0;
  let persisted = false;

  if (manager) {
    try {
      const estimate = await manager.estimate();
      usage = estimate.usage ?? 0;
      quota = estimate.quota ?? 0;
    } catch {
      // 某些浏览器在隐私模式下会直接抛错，忽略即可
    }
    try {
      persisted = await manager.persisted();
    } catch {
      persisted = false;
    }
  }

  const [videos, folders, observations, practiceLogs] = await Promise.all([
    db.videos.count(),
    db.folders.count(),
    db.observations.count(),
    db.practiceLogs.count(),
  ]);

  const records = await db.videos.toArray();
  let videoBytes = 0;
  let thumbnailBytes = 0;
  let orphanCount = 0;
  for (const record of records) {
    // 服务端媒体库记录的本体在磁盘上，浏览器缓存里只有索引与缩略图引用，不计入“本地视频副本”。
    if (record.serverId) continue;
    videoBytes += record.size || 0;
    thumbnailBytes += base64Bytes(record.thumbnailBase64);
    if (isOrphan(record)) orphanCount += 1;
  }

  return {
    supported: Boolean(manager && typeof manager.persist === 'function'),
    usage,
    quota,
    persisted,
    counts: { videos, folders, observations, practiceLogs },
    videoBytes,
    thumbnailBytes,
    orphanCount,
  };
}

/**
 * 申请持久化存储。必须在用户手势（点击）回调里调用才最可能成功；
 * 应用启动时也可以静默尝试一次，Chrome 会根据站点使用度决定是否授予。
 */
export async function requestPersistentStorage(): Promise<boolean> {
  const manager = storageManager();
  if (!manager || typeof manager.persist !== 'function') return false;
  try {
    if (await manager.persisted()) return true;
    return await manager.persist();
  } catch {
    return false;
  }
}

/** 导出整库（服务端为权威：元数据 / 文件夹 / 回收区 / 观察记录 / 练习日志，不含视频本体） */
export async function exportLibrary(): Promise<{
  blob: Blob;
  filename: string;
  counts: { videos: number; folders: number };
}> {
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19);

  // 首选服务端导出：一次拿到完整快照（含服务端侧文件夹/回收区/观察/练习日志）
  try {
    const snapshot = await api.backup();
    const videos = Array.isArray((snapshot as { videos?: unknown[] }).videos)
      ? (snapshot as { videos: unknown[] }).videos
      : [];
    const meta = (snapshot as { meta?: Record<string, unknown> }).meta ?? {};
    const folders = ((snapshot as { folders?: unknown[] }).folders ?? []) as unknown[];
    const counts = { videos: Object.keys(meta).length || videos.length, folders: folders.length };
    const payload = {
      schema: BACKUP_SCHEMA,
      version: BACKUP_VERSION + 1,
      exportedAt: new Date().toISOString(),
      origin: typeof location !== 'undefined' ? location.origin : '',
      source: 'dance-echo-server',
      counts,
      ...(snapshot as Record<string, unknown>),
    };
    return {
      blob: new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
      filename: `dance-echo-backup_${stamp}.json`,
      counts,
    };
  } catch (error) {
    console.warn('[DanceEcho] 服务端备份导出失败，退回本地缓存导出:', error);
  }

  const [videos, folders] = await Promise.all([
    db.videos.toArray(),
    db.folders.toArray(),
  ]);

  const payload: BackupFile = {
    schema: BACKUP_SCHEMA,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    origin: typeof location !== 'undefined' ? location.origin : '',
    counts: { videos: videos.length, folders: folders.length },
    videos: videos.map((record) => ({
      id: record.id,
      name: record.name,
      size: record.size,
      lastModified: record.lastModified,
      duration: record.duration,
      width: record.width,
      height: record.height,
      tags: record.tags || [],
      category: record.category,
      rating: record.rating,
      playCount: record.playCount,
      lastPlayedAt: record.lastPlayedAt,
      playbackPosition: record.playbackPosition,
      bpm: record.bpm,
      beatOffset: record.beatOffset,
      songTitle: record.songTitle,
      songArtist: record.songArtist,
      path: record.path,
      thumbnailBase64: record.thumbnailBase64,
    })),
    folders,
  };

  return {
    blob: new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    filename: `dance-echo-backup_${stamp}.json`,
    counts: payload.counts,
  };
}

export interface ImportResult {
  /** 命中已有记录并成功合并的条数 */
  merged: number;
  /** 库里没有对应视频、被跳过的条数（先导入视频再恢复，就能对上） */
  skipped: number;
  /** 备份文件里的总条数 */
  total: number;
  /** 这次恢复写到了哪里：服务端权威库，还是仅本地缓存 */
  source?: 'server' | 'local';
  /** 备份文件格式错误时的原因 */
  error?: string;
}

/** 服务端备份里的单条元数据（字段与服务端 store 对齐） */
interface ServerBackupMeta {
  tags?: string[];
  category?: string;
  rating?: number;
  playCount?: number;
  lastPlayedAt?: number;
  progress?: number;
  bpm?: number;
  beatOffset?: number;
  songTitle?: string;
  songArtist?: string;
}

interface ServerBackupFile {
  schema?: string;
  schemaVersion?: number;
  meta: Record<string, ServerBackupMeta>;
  placements?: unknown;
  trash?: Record<string, ServerBackupMeta>;
  folders?: { id?: string; name?: string }[];
  observations?: Record<string, unknown[]>;
  practiceLogs?: Record<string, unknown>;
}

/**
 * 服务端备份不能直接写进 IndexedDB（视频元数据的权威副本在服务端）。
 * 服务端不可用时，退回到本地缓存里已经存在的记录上合并，并如实返回 source=local。
 */
async function mergeServerBackupIntoCache(parsed: ServerBackupFile): Promise<ImportResult> {
  let merged = 0;
  let skipped = 0;
  await db.transaction('rw', db.videos, db.folders, async () => {
    for (const [id, incoming] of Object.entries(parsed.meta)) {
      const existing = await db.videos.get(id);
      if (!existing) {
        skipped += 1;
        continue;
      }
      const patch: Partial<DBVideoRecord> = {
        tags: Array.isArray(incoming.tags) ? incoming.tags : existing.tags,
        category: typeof incoming.category === 'string' ? incoming.category : existing.category,
        rating: typeof incoming.rating === 'number' ? incoming.rating : existing.rating,
        playCount: typeof incoming.playCount === 'number' ? incoming.playCount : existing.playCount,
        lastPlayedAt: typeof incoming.lastPlayedAt === 'number' ? incoming.lastPlayedAt : existing.lastPlayedAt,
        playbackPosition: typeof incoming.progress === 'number' ? incoming.progress : existing.playbackPosition,
        bpm: typeof incoming.bpm === 'number' ? incoming.bpm : existing.bpm,
        beatOffset: typeof incoming.beatOffset === 'number' ? incoming.beatOffset : existing.beatOffset,
        songTitle: typeof incoming.songTitle === 'string' ? incoming.songTitle : existing.songTitle,
        songArtist: typeof incoming.songArtist === 'string' ? incoming.songArtist : existing.songArtist,
      };
      await db.videos.update(id, patch);
      merged += 1;
    }
    for (const folder of parsed.folders ?? []) {
      if (!folder?.id || !folder.name) continue;
      if (await db.folders.get(folder.id)) continue;
      await db.folders.put({
        id: folder.id,
        name: folder.name,
        path: folder.name,
        parentPath: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  });
  return { merged, skipped, total: Object.keys(parsed.meta).length, source: 'local' };
}

/**
 * 从备份恢复标签 / 书签 / 进度 / 分组。
 * 服务端备份（当前版本导出的）优先写回服务端；服务端不可用时退回本地缓存并标注 source。
 * 旧版客户端备份（带 videos 数组）继续走原来的 IndexedDB 合并路径。
 */
export async function importLibrary(
  file: File,
  options: { restoreThumbnail?: boolean } = {},
): Promise<ImportResult> {
  let parsed: (BackupFile & Partial<ServerBackupFile>) | null = null;
  try {
    parsed = JSON.parse(await file.text()) as BackupFile & Partial<ServerBackupFile>;
  } catch {
    return { merged: 0, skipped: 0, total: 0, error: '不是合法的 JSON 文件' };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { merged: 0, skipped: 0, total: 0, error: '不是 Dance Echo 的备份文件' };
  }

  const isServerBackup =
    parsed.schema === BACKUP_SCHEMA &&
    Boolean(parsed.meta) &&
    typeof parsed.meta === 'object' &&
    !Array.isArray(parsed.meta);

  if (isServerBackup) {
    const backup = parsed as ServerBackupFile;
    const total = Object.keys(backup.meta).length;
    try {
      const caps = await api.capabilities().catch(() => null);
      if (caps && caps.capabilities.backupImport !== true) {
        throw new ApiError(
          '当前 DanceEcho Server 版本不支持备份恢复，请重启或更新服务端后再试',
          409,
          'BACKUP_UNSUPPORTED',
        );
      }
      const response = await api.restoreBackup(backup);
      const counts = response.result;
      return {
        merged: counts.meta + counts.folders + counts.trash + counts.observations + counts.practiceLogs,
        skipped: counts.skipped,
        total,
        source: 'server',
      };
    } catch (error) {
      // 只有「服务端不可达」才退回本地缓存；版本不支持 / 备份非法 / 服务端 5xx
      // 都必须把错误交给用户，不能谎报「已合并」。
      const unreachable = error instanceof ApiError ? error.status === 0 : error instanceof TypeError;
      if (!unreachable) throw error;
      console.warn('[DanceEcho] 服务端不可达，退回本地缓存合并:', error);
      return mergeServerBackupIntoCache(backup);
    }
  }

  if (!Array.isArray(parsed.videos)) {
    return { merged: 0, skipped: 0, total: 0, error: '不是 Dance Echo 的备份文件' };
  }

  const restoreThumbnail = options.restoreThumbnail !== false;
  let merged = 0;
  let skipped = 0;

  await db.transaction('rw', db.videos, db.folders, async () => {
    for (const incoming of parsed.videos) {
      const existing = await db.videos.get(incoming.id);
      if (!existing) {
        skipped += 1;
        continue;
      }

      const patch: Partial<DBVideoRecord> = {
        tags: incoming.tags ?? existing.tags,
        category: incoming.category ?? existing.category,
        rating: incoming.rating ?? existing.rating,
        playCount: incoming.playCount ?? existing.playCount,
        lastPlayedAt: incoming.lastPlayedAt ?? existing.lastPlayedAt,
        playbackPosition: incoming.playbackPosition ?? existing.playbackPosition,
        bpm: incoming.bpm ?? existing.bpm,
        beatOffset: incoming.beatOffset ?? existing.beatOffset,
        songTitle: incoming.songTitle ?? existing.songTitle,
        songArtist: incoming.songArtist ?? existing.songArtist,
        path: incoming.path ?? existing.path,
      };
      if (restoreThumbnail && incoming.thumbnailBase64) {
        patch.thumbnailBase64 = incoming.thumbnailBase64;
      }
      await db.videos.update(incoming.id, patch);
      merged += 1;
    }

    for (const folder of parsed.folders || []) {
      if (!folder?.path) continue;
      const current = await db.folders.get(folder.id);
      if (!current) await db.folders.put(folder);
    }
  });

  return { merged, skipped, total: parsed.videos.length, source: 'local' };
}

/** 找出缺少视频本体的记录（通常是清理过一次浏览数据，或原文件被改名） */
export async function findOrphanRecords(): Promise<DBVideoRecord[]> {
  const records = await db.videos.toArray();
  return records.filter(isOrphan);
}

/** 删除孤儿记录，返回删除条数 */
export async function removeOrphanRecords(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  await db.videos.bulkDelete(ids);
  return ids.length;
}

/** 触发浏览器下载 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
