/**
 * 节拍网格本地存储
 *
 * 为什么不用 Dexie：服务端库里的视频并没有对应的 Dexie 记录（Dexie 只存"本地导入"的缓存），
 * `db.videos.update(id, ...)` 对不存在的行是静默 no-op，BPM/逐拍时间戳会丢。
 * 这里用 localStorage 按视频 id 存一份轻量网格，体积很小（一首歌 400 拍 ≈ 5KB）。
 */

export interface BeatGridRecord {
  bpm: number;
  /** 人工微调量（秒），默认 0；网格模式下表示整体平移 */
  offset: number;
  /** 逐拍时间戳（秒），来自音轨分析 */
  beats?: number[];
  confidence?: number;
  updatedAt: number;
}

const STORAGE_KEY = 'dance_echo_beat_grids_v1';

function readAll(): Record<string, BeatGridRecord> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, BeatGridRecord>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, BeatGridRecord>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch (err) {
    console.warn('[BeatGrid] 写入失败（可能超出配额）:', err);
  }
}

export function loadBeatGrid(videoId: string): BeatGridRecord | null {
  if (!videoId) return null;
  return readAll()[videoId] ?? null;
}

export function saveBeatGrid(
  videoId: string,
  record: Omit<BeatGridRecord, 'updatedAt'>,
): BeatGridRecord | null {
  if (!videoId) return null;
  const map = readAll();
  const next: BeatGridRecord = { ...record, updatedAt: Date.now() };
  map[videoId] = next;
  writeAll(map);
  return next;
}

export function clearBeatGrid(videoId: string): void {
  if (!videoId) return;
  const map = readAll();
  if (map[videoId]) {
    delete map[videoId];
    writeAll(map);
  }
}
