import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function defaultMeta() {
  return { tags: [], rating: 0, bookmarks: [], progress: 0, playCount: 0, lastPlayedAt: 0, note: '', folderId: null, trashedAt: 0, bpm: 0, beatOffset: 0, songTitle: '', songArtist: '', category: '', title: '' };
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const asFiniteNumber = (value, fallback = 0) => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const sanitizeString = (value, maxLength) => String(value ?? '').slice(0, maxLength);

export function sanitizePatch(input) {
  const patch = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return patch;
  if ('tags' in input) {
    const seen = new Set();
    patch.tags = [];
    for (const tag of (Array.isArray(input.tags) ? input.tags : []).slice(0, 30)) {
      const clean = sanitizeString(tag, 40).trim();
      if (clean && !seen.has(clean)) { seen.add(clean); patch.tags.push(clean); }
    }
  }
  if ('rating' in input) patch.rating = clamp(asFiniteNumber(input.rating), 0, 5);
  if ('bookmarks' in input) {
    patch.bookmarks = (Array.isArray(input.bookmarks) ? input.bookmarks : []).slice(0, 200).map((item) => {
      const b = item && typeof item === 'object' ? item : {};
      return { id: typeof b.id === 'string' && b.id ? b.id.slice(0, 64) : crypto.randomUUID(), time: Math.max(0, asFiniteNumber(b.time)), label: sanitizeString(b.label, 120) };
    });
  }
  if ('progress' in input) patch.progress = Math.max(0, asFiniteNumber(input.progress));
  if ('playCount' in input) patch.playCount = Math.max(0, Math.round(asFiniteNumber(input.playCount)));
  if ('lastPlayedAt' in input) patch.lastPlayedAt = Math.max(0, asFiniteNumber(input.lastPlayedAt));
  if ('note' in input) patch.note = sanitizeString(input.note, 5000);
  // 旧主应用（local vidio store）扩展字段：BPM / 音乐识别 / 分类
  if ('bpm' in input) {
    const bpm = asFiniteNumber(input.bpm, 0);
    patch.bpm = bpm > 0 ? Math.min(bpm, 300) : 0;
  }
  if ('beatOffset' in input) patch.beatOffset = asFiniteNumber(input.beatOffset, 0);
  if ('songTitle' in input) patch.songTitle = sanitizeString(input.songTitle, 200);
  if ('songArtist' in input) patch.songArtist = sanitizeString(input.songArtist, 200);
  if ('category' in input) patch.category = sanitizeString(input.category, 120);
  // 显示标题：只存元数据，不改磁盘文件名；空串即清除
  if ('title' in input) patch.title = sanitizeString(input.title, 120).trim();
  return patch;
}

function sanitizeObservation(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const text = sanitizeString(input.text, 2000).trim();
  if (!text) return null;
  return {
    id: typeof input.id === 'string' && input.id ? input.id.slice(0, 64) : crypto.randomUUID(),
    time: Math.max(0, asFiniteNumber(input.time)),
    text,
    kind: sanitizeString(input.kind, 40) || 'note',
    tags: (Array.isArray(input.tags) ? input.tags : []).slice(0, 20).map((tag) => sanitizeString(tag, 40).trim()).filter(Boolean),
    createdAt: Math.max(0, asFiniteNumber(input.createdAt, Date.now())),
    updatedAt: Math.max(0, asFiniteNumber(input.updatedAt, Date.now())),
  };
}

function sanitizePracticeLog(dateKey, input) {
  return {
    date: dateKey,
    durationMinutes: Math.max(0, Math.round(asFiniteNumber(input.durationMinutes))),
    songs: sanitizeString(input.songs, 500),
    notes: sanitizeString(input.notes, 2000),
    durationSeconds: Math.max(0, Math.round(asFiniteNumber(input.durationSeconds))),
    videoCount: Math.max(0, Math.round(asFiniteNumber(input.videoCount))),
    observationCount: Math.max(0, Math.round(asFiniteNumber(input.observationCount))),
    updatedAt: Math.max(0, asFiniteNumber(input.updatedAt, Date.now())),
  };
}

export async function atomicWriteJson(filePath, value, pretty = false) {
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value), 'utf8');
  await fs.rename(tmp, filePath);
}

function normalizeState(parsed) {
  const legacy = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  if (legacy.schemaVersion && legacy.meta && typeof legacy.meta === 'object') {
    return { schemaVersion: 2, meta: legacy.meta, folders: Array.isArray(legacy.folders) ? legacy.folders : [], trash: legacy.trash && typeof legacy.trash === 'object' ? legacy.trash : {} };
  }
  return { schemaVersion: 2, meta: legacy, folders: [], trash: {} };
}

export function createStore(dataDir) {
  const metaPath = path.join(dataDir, 'meta.json');
  const obsPath = path.join(dataDir, 'observations.json');
  const logPath = path.join(dataDir, 'practice-logs.json');
  let state = { schemaVersion: 2, meta: {}, folders: [], trash: {}, observations: {}, practiceLogs: {} };
  let loadPromise = null;
  let obsLoaded = null;
  let logLoaded = null;
  let chain = Promise.resolve();
  async function doLoad() {
    await fs.mkdir(dataDir, { recursive: true });
    try { state = { ...state, ...normalizeState(JSON.parse(await fs.readFile(metaPath, 'utf8'))) }; }
    catch (err) { if (err.code !== 'ENOENT') console.warn(`[store] meta.json 读取失败，按空库处理: ${err.message}`); }
  }
  function ensureLoaded() { if (!loadPromise) loadPromise = doLoad(); return loadPromise; }
  async function doLoadObs() {
    try { const parsed = JSON.parse(await fs.readFile(obsPath, 'utf8')); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) state.observations = parsed; }
    catch (err) { if (err.code !== 'ENOENT') console.warn(`[store] observations.json 读取失败，按空库处理: ${err.message}`); }
  }
  function ensureObsLoaded() { if (!obsLoaded) obsLoaded = doLoadObs(); return obsLoaded; }
  async function doLoadLog() {
    try { const parsed = JSON.parse(await fs.readFile(logPath, 'utf8')); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) state.practiceLogs = parsed; }
    catch (err) { if (err.code !== 'ENOENT') console.warn(`[store] practice-logs.json 读取失败，按空库处理: ${err.message}`); }
  }
  function ensureLogLoaded() { if (!logLoaded) logLoaded = doLoadLog(); return logLoaded; }
  function enqueue(task) { const run = chain.then(task, task); chain = run.then(() => undefined, () => undefined); return run; }
  function persist() { return enqueue(() => atomicWriteJson(metaPath, { schemaVersion: state.schemaVersion, meta: state.meta, folders: state.folders, trash: state.trash }, true)); }
  const persistObs = () => enqueue(() => atomicWriteJson(obsPath, state.observations));
  const persistLog = () => enqueue(() => atomicWriteJson(logPath, state.practiceLogs));
  function getMeta(id) { return { ...defaultMeta(), ...(state.meta[id] ?? {}) }; }
  function folderFor(id) { return state.folders.find((folder) => folder.id === id) ?? null; }
  return {
    async get(id) { await ensureLoaded(); return getMeta(id); },
    async getAll() { await ensureLoaded(); return state.meta; },
    async patch(id, input) { await ensureLoaded(); const next = { ...getMeta(id), ...sanitizePatch(input) }; state.meta[id] = next; await persist(); return next; },
    async getFolders() { await ensureLoaded(); return state.folders.map((folder) => ({ ...folder })); },
    async createFolder(name) { await ensureLoaded(); const clean = sanitizeString(name, 120).trim(); if (!clean) throw Object.assign(new Error('文件夹名称不能为空'), { code: 'INVALID_FOLDER_NAME' }); const folder = { id: crypto.randomUUID(), name: clean, createdAt: Date.now(), updatedAt: Date.now() }; state.folders.push(folder); await persist(); return folder; },
    async renameFolder(id, name) { await ensureLoaded(); const folder = folderFor(id); if (!folder) throw Object.assign(new Error('文件夹不存在'), { code: 'FOLDER_NOT_FOUND' }); const clean = sanitizeString(name, 120).trim(); if (!clean) throw Object.assign(new Error('文件夹名称不能为空'), { code: 'INVALID_FOLDER_NAME' }); folder.name = clean; folder.updatedAt = Date.now(); await persist(); return folder; },
    async deleteFolder(id) { await ensureLoaded(); const folder = folderFor(id); if (!folder) throw Object.assign(new Error('文件夹不存在'), { code: 'FOLDER_NOT_FOUND' }); for (const meta of Object.values(state.meta)) if (meta.folderId === id) meta.folderId = null; state.folders = state.folders.filter((item) => item.id !== id); await persist(); },
    async assignFolder(videoId, folderId) { await ensureLoaded(); if (folderId !== null && !folderFor(folderId)) throw Object.assign(new Error('文件夹不存在'), { code: 'FOLDER_NOT_FOUND' }); state.meta[videoId] = { ...getMeta(videoId), folderId }; await persist(); return state.meta[videoId]; },
    async trashVideo(videoId) { await ensureLoaded(); const meta = getMeta(videoId); state.trash[videoId] = { ...meta, trashedAt: Date.now() }; state.meta[videoId] = { ...meta, trashedAt: Date.now() }; await persist(); return state.trash[videoId]; },
    /**
     * 批量移入回收区：一次遍历、一次落盘。
     * 1400 个视频逐个 PATCH 既慢又会触发 1400 次写盘，这里合并成一次。
     */
    async trashVideos(videoIds) {
      await ensureLoaded();
      const now = Date.now();
      const trashed = [];
      for (const videoId of videoIds) {
        const meta = { ...getMeta(videoId), trashedAt: now };
        state.meta[videoId] = meta;
        state.trash[videoId] = meta;
        trashed.push(videoId);
      }
      if (trashed.length) await persist();
      return { trashed, missing: [] };
    },
    async restoreVideo(videoId) { await ensureLoaded(); if (!state.trash[videoId]) throw Object.assign(new Error('回收区没有该视频'), { code: 'TRASH_NOT_FOUND' }); state.meta[videoId] = { ...state.trash[videoId], trashedAt: 0 }; delete state.trash[videoId]; await persist(); return state.meta[videoId]; },
    /** 清空回收区：只解除应用内隐藏并丢弃回收区记录，保留标签/收藏等元数据；磁盘文件不动。 */
    async clearTrash() {
      await ensureLoaded();
      const ids = Object.keys(state.trash);
      for (const videoId of ids) {
        const previous = state.trash[videoId] || {};
        state.meta[videoId] = { ...defaultMeta(), ...previous, trashedAt: 0 };
      }
      state.trash = {};
      if (ids.length) await persist();
      return { cleared: ids.length };
    },
    async getTrash() { await ensureLoaded(); return Object.entries(state.trash).map(([videoId, meta]) => ({ videoId, meta: { ...defaultMeta(), ...meta } })); },
    async getBookmarks(videoId) { await ensureLoaded(); return [...getMeta(videoId).bookmarks].sort((a, b) => a.time - b.time); },
    async createBookmark(videoId, input) {
      await ensureLoaded();
      const bookmark = { id: crypto.randomUUID(), time: Math.max(0, asFiniteNumber(input?.time)), label: sanitizeString(input?.label, 120).trim() };
      if (!bookmark.label) throw Object.assign(new Error('打点文字不能为空'), { code: 'INVALID_BOOKMARK' });
      const meta = getMeta(videoId);
      meta.bookmarks = [...meta.bookmarks, bookmark].sort((a, b) => a.time - b.time);
      state.meta[videoId] = meta;
      await persist();
      return bookmark;
    },
    async updateBookmark(videoId, bookmarkId, input) {
      await ensureLoaded();
      const meta = getMeta(videoId);
      const index = meta.bookmarks.findIndex((item) => item.id === bookmarkId);
      if (index < 0) throw Object.assign(new Error('打点不存在'), { code: 'BOOKMARK_NOT_FOUND' });
      const next = { ...meta.bookmarks[index], ...(input && 'time' in input ? { time: Math.max(0, asFiniteNumber(input.time)) } : {}), ...(input && 'label' in input ? { label: sanitizeString(input.label, 120).trim() } : {}) };
      if (!next.label) throw Object.assign(new Error('打点文字不能为空'), { code: 'INVALID_BOOKMARK' });
      meta.bookmarks = meta.bookmarks.toSpliced(index, 1, next).sort((a, b) => a.time - b.time);
      state.meta[videoId] = meta;
      await persist();
      return next;
    },
    async deleteBookmark(videoId, bookmarkId) {
      await ensureLoaded();
      const meta = getMeta(videoId);
      const next = meta.bookmarks.filter((item) => item.id !== bookmarkId);
      if (next.length === meta.bookmarks.length) throw Object.assign(new Error('打点不存在'), { code: 'BOOKMARK_NOT_FOUND' });
      meta.bookmarks = next;
      state.meta[videoId] = meta;
      await persist();
    },
    async prune() { return 0; },
    async exportAll() { await ensureLoaded(); await ensureObsLoaded(); await ensureLogLoaded(); return { schemaVersion: 2, exportedAt: new Date().toISOString(), meta: state.meta, folders: state.folders, trash: state.trash, observations: state.observations, practiceLogs: state.practiceLogs }; },
    /**
     * 合并一份备份（结构同 exportAll）。只合并、不删除：备份里没有的条目保持原样。
     * 返回各类别的合并计数，供接口与界面如实展示。
     */
    async importAll(payload, knownVideoIds = null) {
      await ensureLoaded();
      await ensureObsLoaded();
      await ensureLogLoaded();
      const body = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null;
      if (!body) throw Object.assign(new Error('备份内容必须是对象'), { code: 'INVALID_BACKUP' });
      if (body.schemaVersion !== undefined && body.schemaVersion !== 2) {
        throw Object.assign(new Error('备份版本不支持'), { code: 'BACKUP_VERSION_UNSUPPORTED' });
      }
      const known = knownVideoIds ? new Set(knownVideoIds) : null;
      const isKnown = (videoId) => !known || known.has(videoId);
      const result = { meta: 0, folders: 0, trash: 0, observations: 0, practiceLogs: 0, skipped: 0 };

      for (const [videoId, raw] of Object.entries(body.meta && typeof body.meta === 'object' ? body.meta : {})) {
        if (typeof videoId !== 'string' || !videoId || !raw || typeof raw !== 'object' || Array.isArray(raw) || !isKnown(videoId)) {
          result.skipped += 1;
          continue;
        }
        const next = { ...getMeta(videoId), ...sanitizePatch(raw) };
        if ('trashedAt' in raw) next.trashedAt = Math.max(0, asFiniteNumber(raw.trashedAt));
        state.meta[videoId] = next;
        result.meta += 1;
      }

      for (const [videoId, raw] of Object.entries(body.trash && typeof body.trash === 'object' ? body.trash : {})) {
        if (typeof videoId !== 'string' || !videoId || !raw || typeof raw !== 'object' || Array.isArray(raw) || !isKnown(videoId)) {
          result.skipped += 1;
          continue;
        }
        const trashedAt = Math.max(1, asFiniteNumber(raw.trashedAt, Date.now()));
        const next = { ...defaultMeta(), ...sanitizePatch(raw), trashedAt };
        state.trash[videoId] = next;
        state.meta[videoId] = next;
        result.trash += 1;
      }

      for (const folder of Array.isArray(body.folders) ? body.folders : []) {
        const name = sanitizeString(folder?.name, 120).trim();
        if (!folder?.id || typeof folder.id !== 'string' || !name) {
          result.skipped += 1;
          continue;
        }
        const existing = folderFor(folder.id);
        if (existing) {
          existing.name = name;
          existing.updatedAt = Date.now();
        } else {
          state.folders.push({
            id: folder.id.slice(0, 64),
            name,
            createdAt: Math.max(0, asFiniteNumber(folder.createdAt, Date.now())),
            updatedAt: Date.now(),
          });
        }
        result.folders += 1;
      }

      for (const [videoId, list] of Object.entries(body.observations && typeof body.observations === 'object' ? body.observations : {})) {
        if (!Array.isArray(list)) { result.skipped += 1; continue; }
        const incoming = list.map(sanitizeObservation).filter(Boolean);
        if (incoming.length === 0) { result.skipped += 1; continue; }
        const byId = new Map((state.observations[videoId] ?? []).map((item) => [item.id, item]));
        for (const item of incoming) byId.set(item.id, item);
        state.observations[videoId] = [...byId.values()];
        result.observations += incoming.length;
      }

      for (const [dateKey, raw] of Object.entries(body.practiceLogs && typeof body.practiceLogs === 'object' ? body.practiceLogs : {})) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !raw || typeof raw !== 'object') {
          result.skipped += 1;
          continue;
        }
        state.practiceLogs[dateKey] = sanitizePracticeLog(dateKey, raw);
        result.practiceLogs += 1;
      }

      await persist();
      await persistObs();
      await persistLog();
      return result;
    },
    // ------------------------------------------------ 观察记录 observations
    async listObservations(videoId = null) {
      await ensureObsLoaded();
      const all = [];
      for (const [vid, list] of Object.entries(state.observations)) {
        if (videoId && vid !== videoId) continue;
        for (const item of list) all.push({ ...item, videoId: vid });
      }
      all.sort((a, b) => b.createdAt - a.createdAt);
      return all;
    },
    async addObservation(videoId, input) {
      await ensureObsLoaded();
      const obs = {
        id: crypto.randomUUID(),
        time: Math.max(0, asFiniteNumber(input?.time)),
        text: sanitizeString(input?.text, 2000).trim(),
        kind: sanitizeString(input?.kind, 40) || 'note',
        tags: (Array.isArray(input?.tags) ? input.tags : []).slice(0, 20).map((t) => sanitizeString(t, 40).trim()).filter(Boolean),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      if (!obs.text) throw Object.assign(new Error('记录内容不能为空'), { code: 'INVALID_OBSERVATION' });
      (state.observations[videoId] ??= []).push(obs);
      await persistObs();
      return obs;
    },
    async updateObservation(videoId, obsId, input) {
      await ensureObsLoaded();
      const list = state.observations[videoId] ?? [];
      const obs = list.find((item) => item.id === obsId);
      if (!obs) throw Object.assign(new Error('记录不存在'), { code: 'OBSERVATION_NOT_FOUND' });
      if ('time' in input) obs.time = Math.max(0, asFiniteNumber(input.time));
      if ('text' in input) {
        const text = sanitizeString(input.text, 2000).trim();
        if (!text) throw Object.assign(new Error('记录内容不能为空'), { code: 'INVALID_OBSERVATION' });
        obs.text = text;
      }
      if ('kind' in input) obs.kind = sanitizeString(input.kind, 40) || 'note';
      if ('tags' in input) obs.tags = (Array.isArray(input.tags) ? input.tags : []).slice(0, 20).map((t) => sanitizeString(t, 40).trim()).filter(Boolean);
      obs.updatedAt = Date.now();
      await persistObs();
      return obs;
    },
    async deleteObservation(videoId, obsId) {
      await ensureObsLoaded();
      const list = state.observations[videoId] ?? [];
      const next = list.filter((item) => item.id !== obsId);
      if (next.length === list.length) throw Object.assign(new Error('记录不存在'), { code: 'OBSERVATION_NOT_FOUND' });
      if (next.length === 0) delete state.observations[videoId];
      else state.observations[videoId] = next;
      await persistObs();
    },
    // ------------------------------------------------ 练习打卡 practice logs
    async listPracticeLogs() { await ensureLogLoaded(); return { ...state.practiceLogs }; },
    async getPracticeLog(dateKey) { await ensureLogLoaded(); return state.practiceLogs[dateKey] ?? null; },
    async upsertPracticeLog(dateKey, input) {
      await ensureLogLoaded();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey))) throw Object.assign(new Error('日期格式必须是 YYYY-MM-DD'), { code: 'INVALID_DATE_KEY' });
      const prev = state.practiceLogs[dateKey] ?? {};
      const patch = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
      const next = {
        date: dateKey,
        durationMinutes: Math.max(0, Math.round(asFiniteNumber(patch.durationMinutes, asFiniteNumber(prev.durationMinutes)))),
        songs: sanitizeString(patch.songs ?? prev.songs ?? '', 500),
        notes: sanitizeString(patch.notes ?? prev.notes ?? '', 2000),
        // 旧主应用（local vidio store）口径：秒级时长 / 练过的视频数 / 心得数
        durationSeconds: Math.max(0, Math.round(asFiniteNumber(patch.durationSeconds, asFiniteNumber(prev.durationSeconds)))),
        videoCount: Math.max(0, Math.round(asFiniteNumber(patch.videoCount, asFiniteNumber(prev.videoCount)))),
        observationCount: Math.max(0, Math.round(asFiniteNumber(patch.observationCount, asFiniteNumber(prev.observationCount)))),
        updatedAt: Date.now(),
      };
      state.practiceLogs[dateKey] = next;
      await persistLog();
      return next;
    },
  };
}
