/**
 * DanceEcho Server API 客户端
 *
 * 约定：所有调用都走 /api/v1；失败抛 ApiError，调用方决定降级策略。
 * 服务端地址由 serverUrl.ts 统一解析（默认 http://127.0.0.1:8090）。
 */
import { DANCE_ECHO_SERVER_ORIGIN } from './serverUrl';

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export interface ServerVideo {
  id: string;
  relPath: string;
  name: string;
  ext: string;
  size: number;
  mtime: string;
  mtimeMs: number;
  duration: number | null;
  width: number | null;
  height: number | null;
  dateKey: string;
  dateSource: 'creation' | 'mtime';
  url: string;
  thumbUrl: string;
  meta?: ServerMeta;
}

export interface ServerMeta {
  tags: string[];
  rating: number;
  bookmarks: { id: string; time: number; label: string }[];
  progress: number;
  playCount: number;
  lastPlayedAt: number;
  note: string;
  folderId: string | null;
  trashedAt: number;
  bpm: number;
  beatOffset: number;
  songTitle: string;
  songArtist: string;
  category: string;
  /** 显示标题；空串表示回退到文件名 */
  title: string;
}

export interface ServerFolder {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface ServerObservation {
  id: string;
  videoId: string;
  time: number;
  text: string;
  kind: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface ServerPracticeLog {
  date: string;
  durationMinutes: number;
  songs: string;
  notes: string;
  /** 旧主应用口径：秒级时长 */
  durationSeconds?: number;
  videoCount?: number;
  observationCount?: number;
  updatedAt: number;
}

export interface ServerCapabilities {
  schemaVersion: string;
  serverVersion: string;
  apiVersion: string;
  capabilities: Record<string, boolean>;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${DANCE_ECHO_SERVER_ORIGIN}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      cache: 'no-store',
    });
  } catch (cause) {
    throw new ApiError('无法连接 DanceEcho Server，请确认服务已启动', 0, 'NETWORK_ERROR');
  }
  const text = await res.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    const error = (data as { error?: { message?: string; code?: string } | string }).error;
    const message = typeof error === 'string' ? error : error?.message ?? `服务端返回 ${res.status}`;
    const code = typeof error === 'string' ? undefined : error?.code;
    throw new ApiError(message, res.status, code);
  }
  return data as T;
}

export const api = {
  health: () => request<{ status: string; videoCount: number; serverVersion: string }>('/api/v1/health'),
  capabilities: () => request<ServerCapabilities>('/api/v1/capabilities'),

  library: (options: { includeTrashed?: boolean } = {}) =>
    request<{ root: string; scannedAt?: string; count: number; totalBytes: number; videos: ServerVideo[] }>(
      `/api/v1/library${options.includeTrashed ? '?includeTrashed=1' : ''}`
    ),
  restoreBackup: (payload: unknown) =>
    request<{
      ok: true;
      result: { meta: number; folders: number; trash: number; observations: number; practiceLogs: number; skipped: number };
    }>('/api/v1/backup', { method: 'POST', body: JSON.stringify(payload) }),
  rescan: (force = false) =>
    request<{ count: number; scannedAt: string }>(`/api/v1/rescan${force ? '?force=1' : ''}`, { method: 'POST' }),

  /**
   * 请求服务端把该视频转成 H.264（浏览器不支持 HEVC 时用）。
   * POST 幂等：已在跑返回 running，产物就绪返回 ready，失败返回 error + reason。
   * retry=1 表示使用者明确要求重试一次上一次失败的任务。
   */
  transcode: (videoId: string, retry = false) =>
    request<{ status: 'running' | 'ready' | 'error' | 'unavailable'; url?: string; reason?: string }>(
      `/api/v1/videos/${encodeURIComponent(videoId)}/transcode${retry ? '?retry=1' : ''}`,
      { method: 'POST' }
    ),

  video: (id: string) => request<ServerVideo>(`/api/v1/videos/${encodeURIComponent(id)}`),
  clearTrash: () => request<{ cleared: number }>('/api/v1/trash/clear', { method: 'POST' }),
  patchVideo: (id: string, patch: Partial<ServerMeta>) =>
    request<ServerVideo>(`/api/v1/videos/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  bookmarks: (id: string) => request<{ bookmarks: ServerMeta['bookmarks'] }>(`/api/v1/videos/${encodeURIComponent(id)}/bookmarks`),
  addBookmark: (id: string, body: { time: number; label: string }) =>
    request<{ bookmark: ServerMeta['bookmarks'][number] }>(`/api/v1/videos/${encodeURIComponent(id)}/bookmarks`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteBookmark: (id: string, bookmarkId: string) =>
    request<{ ok: true }>(`/api/v1/videos/${encodeURIComponent(id)}/bookmarks/${encodeURIComponent(bookmarkId)}`, {
      method: 'DELETE',
    }),

  folders: () => request<{ folders: ServerFolder[]; trash: Record<string, number> }>('/api/v1/folders'),
  createFolder: (name: string) =>
    request<{ folder: ServerFolder }>('/api/v1/folders', { method: 'POST', body: JSON.stringify({ name }) }),
  renameFolder: (id: string, name: string) =>
    request<{ folder: ServerFolder }>(`/api/v1/folders/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
  deleteFolder: (id: string) =>
    request<{ ok: true }>(`/api/v1/folders/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  assignFolder: (videoId: string, folderId: string | null) =>
    request<{ meta: ServerMeta }>(`/api/v1/videos/${encodeURIComponent(videoId)}/folder`, {
      method: 'PATCH',
      body: JSON.stringify({ folderId }),
    }),
  trashVideo: (id: string) =>
    request<{ meta: ServerMeta }>(`/api/v1/videos/${encodeURIComponent(id)}/trash`, { method: 'POST' }),
  trashVideos: (ids: string[]) =>
    request<{ ok: true; trashed: string[]; missing: string[] }>('/api/v1/videos/trash', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),
  restoreVideo: (id: string) =>
    request<{ meta: ServerMeta }>(`/api/v1/trash/${encodeURIComponent(id)}/restore`, { method: 'POST' }),

  observations: (videoId: string) =>
    request<{ observations: ServerObservation[] }>(`/api/v1/videos/${encodeURIComponent(videoId)}/observations`),
  allObservations: () =>
    request<{ observations: ServerObservation[] }>('/api/v1/observations'),
  addObservation: (videoId: string, body: { time: number; text: string; kind?: string; tags?: string[] }) =>
    request<{ observation: ServerObservation }>(`/api/v1/videos/${encodeURIComponent(videoId)}/observations`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateObservation: (videoId: string, obsId: string, body: Partial<{ time: number; text: string; kind: string; tags: string[] }>) =>
    request<{ observation: ServerObservation }>(
      `/api/v1/videos/${encodeURIComponent(videoId)}/observations/${encodeURIComponent(obsId)}`,
      { method: 'PATCH', body: JSON.stringify(body) },
    ),
  deleteObservation: (videoId: string, obsId: string) =>
    request<{ ok: true }>(
      `/api/v1/videos/${encodeURIComponent(videoId)}/observations/${encodeURIComponent(obsId)}`,
      { method: 'DELETE' },
    ),

  practiceLogs: () => request<{ logs: Record<string, ServerPracticeLog> }>('/api/v1/practice-logs'),
  upsertPracticeLog: (date: string, body: Partial<Omit<ServerPracticeLog, 'date'>>) =>
    request<{ log: ServerPracticeLog }>(`/api/v1/practice-logs/${encodeURIComponent(date)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  backup: () => request<Record<string, unknown>>('/api/v1/backup'),

  /** multipart 上传：文件落媒体根目录 uploads/ 并返回服务端视频记录 */
  async upload(file: File): Promise<{ uploaded: { relPath: string; filename: string; size: number; id: string; video: ServerVideo | null } }> {
    const form = new FormData();
    form.append('file', file, file.name);
    let res: Response;
    try {
      res = await fetch(`${DANCE_ECHO_SERVER_ORIGIN}/api/v1/upload?mtime=${Math.round(file.lastModified)}`, {
        method: 'POST',
        body: form,
      });
    } catch {
      throw new ApiError('无法连接 DanceEcho Server，请确认服务已启动', 0, 'NETWORK_ERROR');
    }
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const error = data.error as { message?: string; code?: string } | undefined;
      throw new ApiError(error?.message ?? `上传失败（${res.status}）`, res.status, error?.code);
    }
    return data as { uploaded: { relPath: string; filename: string; size: number; id: string; video: ServerVideo | null } };
  },

  /** 上传浏览器抓到的封面帧（jpeg） */
  async uploadThumb(id: string, dataUrl: string): Promise<void> {
    const res = await fetch(`${DANCE_ECHO_SERVER_ORIGIN}/thumb/${encodeURIComponent(id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg' },
      body: await (await fetch(dataUrl)).blob(),
    });
    if (!res.ok) throw new ApiError(`封面上传失败（${res.status}）`, res.status, 'THUMB_UPLOAD_FAILED');
  },
};
