import { create } from 'zustand';
import type { VideoItem, ABLoopState } from '../types';
import { db } from '../services/db';
import { pushMeta } from '../services/api/metaSync';
import { observationService } from '../services/storage/observationService';
import { createMetaCommitter, type LocalMetaPatch } from '../services/library/videoMeta';
import { api } from '../services/api/client';
import {
  hydrateFolderMap,
  ensureServerFolder,
  assignServerFolder,
  renameServerFolder,
  deleteServerFolder,
} from '../services/api/folderSync';
import type { DBFolderRecord } from '../services/db';
import { pruneCustomTags } from '../utils/tagLibrary';
import {
  type TagFilterState,
  makeEmptyTagFilter,
  cycleTagState,
  buildFolderTree,
  countSubfolders,
  findFolderNode,
  type TreeNode,
} from '../services/storage/tagConfig';

interface VideoStoreState {
  videos: VideoItem[];
  currentVideo: VideoItem | null;
  searchQuery: string;
  selectedTag: string | null;
  selectedCategory: string | null;
  /** 工作流弹层：标签库 / 回收区（与 URL 同步，刷新与后退可恢复） */
  activePanel: 'tags' | 'trash' | null;
  sortBy: 'name' | 'date' | 'duration' | 'rating';
  isScanning: boolean;
  scanProgress: { total: number; currentName: string };

  // ── 文件夹树与双层三态标签过滤（Agent B 阶段 1 新增）────────────────────
  /** 当前选中的虚拟文件夹路径前缀（空字符串 = 全部） */
  selectedFolderPath: string;
  /** 双层三态标签过滤状态 */
  tagFilter: TagFilterState;
  folders: DBFolderRecord[];
  selectedVideoIds: string[];
  /** 批量模式下勾选的分组路径（与视频选择并行，二者互不干扰） */
  selectedFolderPaths: string[];
  isBatchMode: boolean;
  loopQueue: string[];
  isAIBuddyOpen: boolean;
  toastMessage: string | null;

  // 播放器专用设置
  playbackRate: number;
  isMirrored: boolean;
  abLoop: ABLoopState;

  // ── 派生 Selector（由 Store 暴露，避免组件重复计算）─────────────────────
  /** 从所有视频 paths 推导出的虚拟文件夹树 */
  getFolderTree: () => TreeNode;

  // 操作方法
  setVideos: (videos: VideoItem[]) => void;
  setCurrentVideo: (video: VideoItem | null) => void;
  setSearchQuery: (query: string) => void;
  setSelectedTag: (tag: string | null) => void;
  setSelectedCategory: (cat: string | null) => void;
  setActivePanel: (panel: 'tags' | 'trash' | null) => void;
  setSortBy: (sort: 'name' | 'date' | 'duration' | 'rating') => void;
  setIsScanning: (isScanning: boolean) => void;
  setScanProgress: (progress: { total: number; currentName: string }) => void;
  loadFolders: () => Promise<void>;
  /** 新建文件夹；重名/空名会 toast 提示并返回 false */
  createFolder: (name: string, parentPath?: string) => Promise<boolean>;
  /** 重命名文件夹；重名冲突会 toast 提示并返回 false */
  renameFolder: (path: string, name: string) => Promise<boolean>;
  /** 确保某个完整路径（含所有祖先）在 folders 表中存在 */
  ensureFolderPath: (path: string) => Promise<void>;
  /** 删除确认所需的统计：子孙视频数 + 子文件夹数 */
  getFolderStats: (path: string) => { videos: number; subfolders: number };
  setSelectedVideo: (videoId: string, selected: boolean) => void;
  toggleSelectedVideo: (videoId: string) => void;
  selectVideos: (videoIds: string[]) => void;
  /** 勾选/取消勾选一个分组（批量模式下用） */
  toggleSelectedFolder: (path: string) => void;
  selectFolders: (paths: string[]) => void;
  clearSelection: () => void;
  setIsBatchMode: (enabled: boolean) => void;
  toggleBatchMode: () => void;
  addToLoopQueue: (videoId: string) => void;
  removeFromLoopQueue: (videoId: string) => void;
  toggleLoopQueue: (videoId: string) => void;
  moveVideoToFolder: (videoId: string, folderPath: string) => Promise<void>;
  moveSelectedToFolder: (folderPath: string) => Promise<void>;
  moveVideosToFolder: (videoIds: string[], folderPath: string) => Promise<void>;
  addTagToSelected: (tag: string) => Promise<void>;
  clearTagsFromSelected: () => Promise<void>;
  renameTag: (oldTag: string, newTag: string) => Promise<void>;
  deleteTag: (tag: string) => Promise<void>;
  removeTags: (tags: string[]) => Promise<void>;
  cleanupOrphanTags: () => Promise<number>;
  deleteFolder: (path: string, options?: { videos?: 'keep' | 'trash' }) => Promise<void>;

  /** 设置当前选中的文件夹路径前缀 */
  setSelectedFolderPath: (path: string) => void;
  /** 切换某标签的三态（正常单击） */
  toggleTagInclude: (tag: string) => void;
  /** 切换某标签到排除态（Alt+单击 / 双击） */
  toggleTagExclude: (tag: string) => void;
  /** 展开或收起父标签分组 */
  toggleParentExpanded: (parentLabel: string) => void;
  /** 清除所有标签过滤状态 */
  clearTagFilter: () => void;

  // AI 舞伴抽屉控制
  setIsAIBuddyOpen: (open: boolean) => void;
  toggleAIBuddy: () => void;

  // 播放控制
  setPlaybackRate: (rate: number) => void;
  toggleMirror: () => void;
  setABPointA: (time: number | null) => void;
  setABPointB: (time: number | null) => void;
  toggleABLoop: () => void;
  clearABLoop: () => void;

  // 留言计数 & 元数据修改
  /** 每个视频的留言条数（键为本地 videoId） */
  noteCounts: Record<string, number>;
  /** 重新统计所有视频的留言条数 */
  refreshNoteCounts: () => Promise<void>;
  /** 就地更新单个视频的留言条数（写完一条留言后立刻刷新界面） */
  setNoteCount: (videoId: string, count: number) => void;
  deleteVideo: (videoId: string) => Promise<void>;
  deleteVideos: (videoIds: string[], options?: { pruneTags?: boolean }) => Promise<void>;
  updateRating: (videoId: string, rating: number) => Promise<void>;
  addTag: (videoId: string, tag: string) => Promise<void>;
  removeTag: (videoId: string, tag: string) => Promise<void>;
  updatePlaybackPosition: (videoId: string, position: number) => Promise<void>;
  updateVideoBeat: (videoId: string, bpm: number, beatOffset: number, beats?: number[]) => Promise<void>;
  updateVideoSong: (videoId: string, songTitle: string, songArtist?: string, bpm?: number) => Promise<void>;
  /** 设置显示标题（不改磁盘文件名）；空串清除标题、回退到 filename */
  renameVideo: (videoId: string, title: string) => Promise<void>;
  showToast: (msg: string) => void;
}

function extractVideoFileName(video: VideoItem): string {
  if (video.name && /\.[a-z0-9]+$/i.test(video.name)) {
    return video.name;
  }
  const parts = (video.path || '').split('/').filter(Boolean);
  const last = parts[parts.length - 1];
  if (last && /\.(mp4|mov|mkv|webm|ogg|avi|flv|m4v)$/i.test(last)) {
    return last;
  }
  return video.name || 'video.mp4';
}

/** 从视频 path 推导其所在目录（根目录返回空字符串） */
function extractVideoDir(path?: string): string {
  if (!path) return '';
  const parts = path.split('/').filter(Boolean);
  const last = parts[parts.length - 1] || '';
  if (/\.(mp4|mov|mkv|webm|ogg|avi|flv|m4v)$/i.test(last)) {
    return parts.slice(0, -1).join('/');
  }
  return parts.join('/');
}

/** 为重复文件名追加 (2)(3) 后缀，避免同目录 path 冲突 */
function dedupePath(candidate: string, used: Set<string>): string {
  if (!used.has(candidate)) return candidate;
  const slash = candidate.lastIndexOf('/');
  const dir = slash >= 0 ? candidate.slice(0, slash + 1) : '';
  const fileName = slash >= 0 ? candidate.slice(slash + 1) : candidate;
  const dot = fileName.lastIndexOf('.');
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot > 0 ? fileName.slice(dot) : '';
  let n = 2;
  let next = `${dir}${base} (${n})${ext}`;
  while (used.has(next)) {
    n += 1;
    next = `${dir}${base} (${n})${ext}`;
  }
  return next;
}

export const useVideoStore = create<VideoStoreState>((set, get) => {
  const commitMeta = createMetaCommitter({
    writeLocal: (videoId, patch) => db.videos.update(videoId, patch),
    serverIdOf: (videoId) => get().videos.find((video) => video.id === videoId)?.serverId,
    pushServer: (serverId, patch) => pushMeta(serverId, patch),
  });

  return {
  videos: [],
  currentVideo: null,
  searchQuery: '',
  selectedTag: null,
  selectedCategory: null,
  activePanel: null,
  sortBy: 'date',
  isScanning: false,
  scanProgress: { total: 0, currentName: '' },

  // Agent B 阶段 1 新增：文件夹树 + 双层三态标签过滤初始状态
  selectedFolderPath: '',
  tagFilter: makeEmptyTagFilter(),
  folders: [],
  selectedVideoIds: [],
  selectedFolderPaths: [],
  isBatchMode: false,
  loopQueue: [],
  isAIBuddyOpen: false,
  toastMessage: null,
  playbackRate: 1.0,
  isMirrored: false,
  abLoop: { enabled: false, pointA: null, pointB: null },

  // Toast 消息提示
  showToast: (msg: string) => {
    set({ toastMessage: msg });
    setTimeout(() => {
      if (get().toastMessage === msg) {
        set({ toastMessage: null });
      }
    }, 3200);
  },

  // AI 舞伴抽屉
  setIsAIBuddyOpen: (isAIBuddyOpen) => set({ isAIBuddyOpen }),
  toggleAIBuddy: () => set((state) => ({ isAIBuddyOpen: !state.isAIBuddyOpen })),

  // 从当前所有视频 paths 派生文件夹树（Selector，不影响渲染）
  getFolderTree: () => buildFolderTree(
    get().videos.map((v) => v.path || ''),
    get().folders.map((folder) => folder.path),
  ),

  // 文件夹选择
  setSelectedFolderPath: (path) => set({ selectedFolderPath: path }),

  // 三态标签过滤
  toggleTagInclude: (tag) =>
    set((state) => ({ tagFilter: cycleTagState(tag, state.tagFilter, false) })),
  toggleTagExclude: (tag) =>
    set((state) => ({ tagFilter: cycleTagState(tag, state.tagFilter, true) })),
  toggleParentExpanded: (parentLabel) =>
    set((state) => {
      const next = new Set(state.tagFilter.expandedParents);
      if (next.has(parentLabel)) {
        next.delete(parentLabel);
      } else {
        next.add(parentLabel);
      }
      return { tagFilter: { ...state.tagFilter, expandedParents: next } };
    }),
  clearTagFilter: () =>
    set((state) => ({
      tagFilter: { ...makeEmptyTagFilter(), expandedParents: state.tagFilter.expandedParents },
    })),

  setVideos: (videos) => set({ videos }),
  setCurrentVideo: (video) => {
    // 切换视频时重置 AB 循环状态
    set({
      currentVideo: video,
      abLoop: { enabled: false, pointA: null, pointB: null }
    });
  },
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSelectedTag: (selectedTag) => set({ selectedTag }),
  setSelectedCategory: (selectedCategory) => set({ selectedCategory }),
  setActivePanel: (activePanel) => set({ activePanel }),
  setSortBy: (sortBy) => set({ sortBy }),
  setIsScanning: (isScanning) => set({ isScanning }),
  setScanProgress: (scanProgress) => set({ scanProgress }),
  loadFolders: async () => {
    const folders = await db.folders.orderBy('path').toArray();
    set({ folders });
    // 建立本地路径 → 服务端文件夹 id 的映射（失败不阻塞启动）
    await hydrateFolderMap();
  },
  createFolder: async (name, parentPath = '') => {
    const cleanName = name.trim().replace(/[\\/]+/g, '').trim();
    if (!cleanName) {
      get().showToast('文件夹名称不能为空');
      return false;
    }
    const path = parentPath ? `${parentPath}/${cleanName}` : cleanName;
    if (get().folders.some((folder) => folder.path === path)) {
      get().showToast(`文件夹「${cleanName}」已存在`);
      return false;
    }
    const now = Date.now();
    const record: DBFolderRecord = {
      id: `folder-${now}-${Math.random().toString(36).slice(2, 8)}`,
      name: cleanName,
      path,
      parentPath,
      createdAt: now,
      updatedAt: now,
    };
    await db.folders.put(record);
    set((state) => ({ folders: [...state.folders, record].sort((a, b) => a.path.localeCompare(b.path)) }));
    void ensureServerFolder(path);
    return true;
  },
  ensureFolderPath: async (path) => {
    const clean = (path || '')
      .split('/')
      .map((part) => part.trim())
      .filter(Boolean)
      .join('/');
    if (!clean) return;
    const existing = new Set(get().folders.map((folder) => folder.path));
    const additions: DBFolderRecord[] = [];
    let curr = '';
    for (const part of clean.split('/')) {
      curr = curr ? `${curr}/${part}` : part;
      if (existing.has(curr)) continue;
      const now = Date.now();
      additions.push({
        id: `folder-${now}-${Math.random().toString(36).slice(2, 8)}`,
        name: part,
        path: curr,
        parentPath: curr.includes('/') ? curr.slice(0, curr.lastIndexOf('/')) : '',
        createdAt: now,
        updatedAt: now,
      });
      existing.add(curr);
    }
    if (!additions.length) return;
    await db.folders.bulkPut(additions);
    set((state) => ({
      folders: [...state.folders, ...additions].sort((a, b) => a.path.localeCompare(b.path)),
    }));
    for (const addition of additions) void ensureServerFolder(addition.path);
  },
  getFolderStats: (path) => {
    const prefix = `${path}/`;
    const videos = get().videos.filter((video) => {
      const dir = extractVideoDir(video.path);
      return dir === path || dir.startsWith(prefix);
    }).length;
    const node = findFolderNode(get().getFolderTree(), path);
    return { videos, subfolders: countSubfolders(node) };
  },
  renameFolder: async (path, name) => {
    const cleanName = name.trim().replace(/[\\/]+/g, '').trim();
    if (!cleanName) {
      get().showToast('文件夹名称不能为空');
      return false;
    }
    const persistedTarget = get().folders.find((folder) => folder.path === path);
    let target = persistedTarget;
    if (!target) {
      const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
      target = { id: `folder-derived-${path}`, name: path.split('/').pop() || path, path, parentPath, createdAt: Date.now(), updatedAt: Date.now() };
    }
    if (cleanName === target.name) return true;
    const nextPath = target.parentPath ? `${target.parentPath}/${cleanName}` : cleanName;
    const collides =
      get().folders.some((folder) => folder.path === nextPath) ||
      get().videos.some((video) => video.path === nextPath || video.path?.startsWith(`${nextPath}/`));
    if (collides) {
      get().showToast(`同层已存在「${cleanName}」，重命名已取消`);
      return false;
    }
    const affected = [target, ...get().folders.filter((folder) => folder.path !== path && folder.path.startsWith(`${path}/`))];
    const now = Date.now();
    await db.transaction('rw', db.folders, db.videos, async () => {
      for (const folder of affected) {
        const suffix = folder.path === path ? '' : folder.path.slice(path.length);
        const updatedPath = `${nextPath}${suffix}`;
        await db.folders.put({ ...folder, name: folder.path === path ? cleanName : folder.name, path: updatedPath, parentPath: updatedPath.includes('/') ? updatedPath.slice(0, updatedPath.lastIndexOf('/')) : '', updatedAt: now });
      }
      const videos = await db.videos.toArray();
      for (const video of videos) {
        if (video.path?.startsWith(`${path}/`) || video.path === path) {
          const suffix = video.path === path ? '' : video.path!.slice(path.length);
          await db.videos.update(video.id, { path: `${nextPath}${suffix}` });
        }
      }
    });
    set((state) => ({
      folders: (persistedTarget ? state.folders : [...state.folders, target!]).map((folder) => {
        const suffix = folder.path === path ? '' : folder.path.slice(path.length);
        const updatedPath = `${nextPath}${suffix}`;
        return folder.path === path || folder.path.startsWith(`${path}/`)
          ? { ...folder, name: folder.path === path ? cleanName : folder.name, path: updatedPath, parentPath: updatedPath.includes('/') ? updatedPath.slice(0, updatedPath.lastIndexOf('/')) : '', updatedAt: now }
          : folder;
      }),
      videos: state.videos.map((video) => {
        if (!video.path || (!video.path.startsWith(`${path}/`) && video.path !== path)) return video;
        const suffix = video.path === path ? '' : video.path.slice(path.length);
        return { ...video, path: `${nextPath}${suffix}` };
      }),
      selectedFolderPath: state.selectedFolderPath === path
        ? nextPath
        : state.selectedFolderPath.startsWith(`${path}/`)
          ? `${nextPath}${state.selectedFolderPath.slice(path.length)}`
          : state.selectedFolderPath,
    }));
    // 服务端是扁平模型：重命名 = 新建新路径 + 删除旧路径
    void renameServerFolder(path, nextPath);
    return true;
  },
  setSelectedVideo: (videoId, selected) => set((state) => ({ selectedVideoIds: selected ? [...new Set([...state.selectedVideoIds, videoId])] : state.selectedVideoIds.filter((id) => id !== videoId) })),
  toggleSelectedVideo: (videoId) => set((state) => ({ selectedVideoIds: state.selectedVideoIds.includes(videoId) ? state.selectedVideoIds.filter((id) => id !== videoId) : [...state.selectedVideoIds, videoId] })),
  selectVideos: (videoIds) => set({ selectedVideoIds: [...new Set(videoIds)] }),
  toggleSelectedFolder: (path) => set((state) => ({
    selectedFolderPaths: state.selectedFolderPaths.includes(path)
      ? state.selectedFolderPaths.filter((item) => item !== path)
      : [...state.selectedFolderPaths, path],
  })),
  selectFolders: (paths) => set({ selectedFolderPaths: [...new Set(paths)] }),
  clearSelection: () => set({ selectedVideoIds: [], selectedFolderPaths: [] }),
  setIsBatchMode: (isBatchMode) => set({ isBatchMode, ...(isBatchMode ? {} : { selectedVideoIds: [], selectedFolderPaths: [] }) }),
  toggleBatchMode: () => set((state) => ({ isBatchMode: !state.isBatchMode, ...(state.isBatchMode ? { selectedVideoIds: [], selectedFolderPaths: [] } : {}) })),
  addToLoopQueue: (videoId) => set((state) => ({
    loopQueue: state.loopQueue.includes(videoId) ? state.loopQueue : [...state.loopQueue, videoId],
  })),
  removeFromLoopQueue: (videoId) => set((state) => ({
    loopQueue: state.loopQueue.filter((id) => id !== videoId),
  })),
  toggleLoopQueue: (videoId) => set((state) => ({
    loopQueue: state.loopQueue.includes(videoId)
      ? state.loopQueue.filter((id) => id !== videoId)
      : [...state.loopQueue, videoId],
  })),
  moveVideoToFolder: async (videoId, folderPath) => {
    const target = get().videos.find((video) => video.id === videoId);
    if (!target) return;
    const name = extractVideoFileName(target);
    const newPath = folderPath ? `${folderPath}/${name}` : name;
    await db.videos.update(videoId, { path: newPath });
    set((state) => ({
      videos: state.videos.map((video) =>
        video.id === videoId ? { ...video, path: newPath } : video
      ),
      currentVideo:
        state.currentVideo?.id === videoId
          ? { ...state.currentVideo, path: newPath }
          : state.currentVideo,
    }));
    void assignServerFolder(target.serverId, folderPath);
  },
  moveSelectedToFolder: async (folderPath) => {
    const ids = get().selectedVideoIds;
    await get().moveVideosToFolder(ids, folderPath);
    set({ selectedVideoIds: [] });
  },
  moveVideosToFolder: async (videoIds, folderPath) => {
    const uniqueIds = [...new Set(videoIds)];
    if (!uniqueIds.length) return;
    const targetFolder = (folderPath || '').split('/').map((part) => part.trim()).filter(Boolean).join('/');
    // 目标文件夹必须是真实存在的记录，否则"移入空文件夹"后目录会凭空消失
    if (targetFolder) await get().ensureFolderPath(targetFolder);
    const targets = get().videos.filter((video) => uniqueIds.includes(video.id));
    const used = new Set<string>();
    for (const video of get().videos) {
      if (uniqueIds.includes(video.id)) continue;
      if (extractVideoDir(video.path) === targetFolder) used.add(video.path || '');
    }
    const movedPaths = new Map<string, string>();
    for (const video of targets) {
      const name = extractVideoFileName(video);
      const candidate = targetFolder ? `${targetFolder}/${name}` : name;
      const finalPath = dedupePath(candidate, used);
      used.add(finalPath);
      movedPaths.set(video.id, finalPath);
    }
    await db.transaction('rw', db.videos, async () => {
      for (const [id, path] of movedPaths) await db.videos.update(id, { path });
    });
    set((state) => ({
      videos: state.videos.map((video) =>
        movedPaths.has(video.id) ? { ...video, path: movedPaths.get(video.id)! } : video
      ),
      currentVideo:
        state.currentVideo && movedPaths.has(state.currentVideo.id)
          ? { ...state.currentVideo, path: movedPaths.get(state.currentVideo.id)! }
          : state.currentVideo,
    }));
    for (const video of targets) void assignServerFolder(video.serverId, targetFolder);
  },
  addTagToSelected: async (tag) => {
    const cleanTag = tag.trim();
    if (!cleanTag) return;
    const ids = get().selectedVideoIds;
    const currentVideos = get().videos;
    const nextVideos = currentVideos.map((video) => ids.includes(video.id) && !video.tags.includes(cleanTag) ? { ...video, tags: [...video.tags, cleanTag] } : video);
    const changed = nextVideos.filter((video, index) => ids.includes(video.id) && !currentVideos[index].tags.includes(cleanTag));
    const tagsById = new Map(changed.map((video) => [video.id, video.tags] as const));
    await commitMeta.commitMany([...tagsById.keys()], (videoId) => ({ tags: tagsById.get(videoId) ?? [] }));
    set({ videos: nextVideos, selectedVideoIds: [] });
  },
  clearTagsFromSelected: async () => {
    const ids = get().selectedVideoIds;
    await commitMeta.commitMany(ids, { tags: [] });
    set((state) => ({ videos: state.videos.map((video) => ids.includes(video.id) ? { ...video, tags: [] } : video), selectedVideoIds: [] }));
  },

  // 播放器配置
  setPlaybackRate: (playbackRate) => set({ playbackRate }),
  toggleMirror: () => set((state) => ({ isMirrored: !state.isMirrored })),
  setABPointA: (time) =>
    set((state) => ({
      abLoop: {
        ...state.abLoop,
        pointA: time,
        enabled: time !== null && state.abLoop.pointB !== null && time < state.abLoop.pointB,
      },
    })),
  setABPointB: (time) =>
    set((state) => ({
      abLoop: {
        ...state.abLoop,
        pointB: time,
        enabled: state.abLoop.pointA !== null && time !== null && state.abLoop.pointA < time,
      },
    })),
  toggleABLoop: () =>
    set((state) => ({
      abLoop: {
        ...state.abLoop,
        enabled: !state.abLoop.enabled,
      },
    })),
  clearABLoop: () =>
    set({
      abLoop: { enabled: false, pointA: null, pointB: null },
    }),

  noteCounts: {},
  refreshNoteCounts: async () => {
    const counts = await observationService.getNoteCounts();
    set({ noteCounts: counts });
  },
  setNoteCount: (videoId, count) =>
    set((state) => ({ noteCounts: { ...state.noteCounts, [videoId]: count } })),

  // 评级更新
  updateRating: async (videoId, rating) => {
    set((state) => ({
      videos: state.videos.map((v) => (v.id === videoId ? { ...v, rating } : v)),
      currentVideo: state.currentVideo?.id === videoId ? { ...state.currentVideo, rating } : state.currentVideo,
    }));
    await commitMeta.commit(videoId, { rating });
  },

  deleteVideo: async (videoId) => {
    await get().deleteVideos([videoId]);
  },

  /**
   * 批量移除：一次服务端请求 + 一次 IndexedDB 批量删除 + 一次 store 更新，
   * 避免 1400 个视频逐个 PATCH/逐次 set 造成 O(n²) 卡顿。
   */
  deleteVideos: async (videoIds, options) => {
    const pruneTags = options?.pruneTags !== false;
    if (!videoIds.length) return;
    const removing = new Set(videoIds);
    const targets = get().videos.filter((video) => removing.has(video.id));
    const serverIds = targets.map((video) => video.serverId).filter((id): id is string => Boolean(id));
    // 服务端回收区：只隐藏应用记录，磁盘文件与元数据都保留，可恢复
    if (serverIds.length) {
      try {
        await api.trashVideos(serverIds);
      } catch (error) {
        console.warn('[DanceEcho] 批量移入回收区失败:', error);
        get().showToast('移入回收区失败，请确认服务端在线');
        return;
      }
    }
    await db.videos.bulkDelete(videoIds);
    set((state) => ({
      videos: state.videos.filter((video) => !removing.has(video.id)),
      currentVideo: state.currentVideo && removing.has(state.currentVideo.id) ? null : state.currentVideo,
      selectedVideoIds: state.selectedVideoIds.filter((id) => !removing.has(id)),
      loopQueue: state.loopQueue.filter((id) => !removing.has(id)),
    }));
    // 删除后把“只剩标签库里有、视频里已经没人用”的孤儿标签一起清掉（可关闭）
    if (pruneTags) {
      const remaining = new Set<string>();
      for (const video of get().videos) for (const tag of video.tags || []) remaining.add(tag);
      pruneCustomTags(remaining);
    }
  },

  // 标签管理
  addTag: async (videoId, tag) => {
    const cleanTag = tag.trim();
    if (!cleanTag) return;
    set((state) => {
      const updated = state.videos.map((v) => {
        if (v.id === videoId && !v.tags.includes(cleanTag)) {
          return { ...v, tags: [...v.tags, cleanTag] };
        }
        return v;
      });
      const currentVideo = state.currentVideo?.id === videoId
        ? updated.find((item) => item.id === videoId) || state.currentVideo
        : state.currentVideo;
      return { videos: updated, currentVideo };
    });
    const target = get().videos.find((v) => v.id === videoId);
    if (target) {
      await commitMeta.commit(videoId, { tags: target.tags });
    }
  },

  removeTag: async (videoId, tag) => {
    set((state) => {
      const updated = state.videos.map((v) => {
        if (v.id === videoId) {
          return { ...v, tags: v.tags.filter((t) => t !== tag) };
        }
        return v;
      });
      const currentVideo = state.currentVideo?.id === videoId
        ? updated.find((item) => item.id === videoId) || state.currentVideo
        : state.currentVideo;
      return { videos: updated, currentVideo };
    });
    const target = get().videos.find((v) => v.id === videoId);
    if (target) {
      await commitMeta.commit(videoId, { tags: target.tags });
    }
  },

  renameTag: async (oldTag, newTag) => {
    const from = oldTag.trim();
    const to = newTag.trim();
    if (!from || !to || from === to) return;
    const nextVideos = get().videos.map((video) => video.tags.includes(from)
      ? { ...video, tags: [...new Set(video.tags.map((tag) => tag === from ? to : tag))] }
      : video);
    const changedTags = nextVideos.filter((video, index) => video.tags.join('\u0000') !== get().videos[index].tags.join('\u0000'));
    const tagsById = new Map(changedTags.map((video) => [video.id, video.tags] as const));
    await commitMeta.commitMany([...tagsById.keys()], (videoId) => ({ tags: tagsById.get(videoId) ?? [] }));
    set((state) => ({
      videos: nextVideos,
      selectedTag: state.selectedTag === from ? to : state.selectedTag,
      tagFilter: {
        ...state.tagFilter,
        includeSet: new Set([...state.tagFilter.includeSet].map((tag) => tag === from ? to : tag)),
        excludeSet: new Set([...state.tagFilter.excludeSet].map((tag) => tag === from ? to : tag)),
      },
    }));
  },

  deleteTag: async (tag) => {
    const cleanTag = tag.trim();
    if (!cleanTag) return;
    const nextVideos = get().videos.map((video) => video.tags.includes(cleanTag)
      ? { ...video, tags: video.tags.filter((item) => item !== cleanTag) }
      : video);
    const changedTags = nextVideos.filter((video, index) => video.tags.length !== get().videos[index].tags.length);
    const tagsById = new Map(changedTags.map((video) => [video.id, video.tags] as const));
    await commitMeta.commitMany([...tagsById.keys()], (videoId) => ({ tags: tagsById.get(videoId) ?? [] }));
    set((state) => ({
      videos: nextVideos,
      selectedTag: state.selectedTag === cleanTag ? null : state.selectedTag,
      tagFilter: {
        ...state.tagFilter,
        includeSet: new Set([...state.tagFilter.includeSet].filter((item) => item !== cleanTag)),
        excludeSet: new Set([...state.tagFilter.excludeSet].filter((item) => item !== cleanTag)),
      },
    }));
  },

  /** 批量移除标签（标签库多选删除用）：从所有视频上摘掉，再清理孤儿标签。 */
  removeTags: async (tags) => {
    const removing = new Set(tags.map((tag) => tag.trim()).filter(Boolean));
    if (!removing.size) return;
    const current = get().videos;
    const next = current.map((video) => video.tags.some((tag) => removing.has(tag))
      ? { ...video, tags: video.tags.filter((tag) => !removing.has(tag)) }
      : video);
    const changed = next.filter((video, index) => video.tags.length !== current[index].tags.length);
    const tagsById = new Map(changed.map((video) => [video.id, video.tags] as const));
    await commitMeta.commitMany([...tagsById.keys()], (videoId) => ({ tags: tagsById.get(videoId) ?? [] }));
    set((state) => ({
      videos: next,
      selectedTag: state.selectedTag && removing.has(state.selectedTag) ? null : state.selectedTag,
      tagFilter: {
        ...state.tagFilter,
        includeSet: new Set([...state.tagFilter.includeSet].filter((tag) => !removing.has(tag))),
        excludeSet: new Set([...state.tagFilter.excludeSet].filter((tag) => !removing.has(tag))),
      },
    }));
    const remaining = new Set<string>();
    for (const video of next) for (const tag of video.tags) remaining.add(tag);
    pruneCustomTags(remaining);
  },

  cleanupOrphanTags: async () => {
    const currentVideos = get().videos;
    const nextVideos = currentVideos.map((video) => ({ ...video, tags: [...new Set(video.tags.filter(Boolean))] }));
    const changedCount = nextVideos.reduce((count, video, index) => count + (video.tags.join('\u0000') !== currentVideos[index].tags.join('\u0000') ? 1 : 0), 0);
    const changed = nextVideos.filter((video, index) => video.tags.join('\u0000') !== currentVideos[index].tags.join('\u0000'));
    const tagsById = new Map(changed.map((video) => [video.id, video.tags] as const));
    await commitMeta.commitMany([...tagsById.keys()], (videoId) => ({ tags: tagsById.get(videoId) ?? [] }));
    set({ videos: nextVideos });
    return changedCount;
  },

  deleteFolder: async (path, options) => {
    if (!path) return;
    const moveVideosOut = options?.videos !== 'trash';
    // 「连同视频一起移除」先走回收区（可恢复），再从库里摘掉，最后删分组记录
    if (!moveVideosOut) {
      const ids = get().videos
        .filter((video) => video.path === path || video.path?.startsWith(`${path}/`))
        .map((video) => video.id);
      if (ids.length) await get().deleteVideos(ids);
    }
    await db.transaction('rw', db.folders, db.videos, async () => {
      for (const folder of await db.folders.toArray()) {
        if (folder.path === path || folder.path.startsWith(`${path}/`)) await db.folders.delete(folder.id);
      }
      if (moveVideosOut) {
        for (const video of await db.videos.toArray()) {
          if (video.path === path || video.path?.startsWith(`${path}/`)) {
            await db.videos.update(video.id, { path: video.path?.split('/').pop() || video.name });
          }
        }
      }
    });
    set((state) => ({
      folders: state.folders.filter((folder) => folder.path !== path && !folder.path.startsWith(`${path}/`)),
      videos: moveVideosOut
        ? state.videos.map((video) => video.path === path || video.path?.startsWith(`${path}/`)
          ? { ...video, path: video.path?.split('/').pop() || video.name }
          : video)
        : state.videos,
      selectedFolderPaths: state.selectedFolderPaths.filter((item) => item !== path && !item.startsWith(`${path}/`)),
      selectedFolderPath: state.selectedFolderPath === path || state.selectedFolderPath.startsWith(`${path}/`) ? '' : state.selectedFolderPath,
    }));
    void deleteServerFolder(path);
  },

  updatePlaybackPosition: async (videoId, position) => {
    const safePos = Math.max(0, position);
    set((state) => ({
      videos: state.videos.map((v) =>
        v.id === videoId ? { ...v, playbackPosition: safePos } : v
      ),
      currentVideo:
        state.currentVideo?.id === videoId
          ? { ...state.currentVideo, playbackPosition: safePos }
          : state.currentVideo,
    }));
    await commitMeta.commit(videoId, { playbackPosition: safePos, lastPlayedAt: Date.now() });
  },

  updateVideoBeat: async (videoId, bpm, beatOffset, beats) => {
    set((state) => ({
      videos: state.videos.map((v) =>
        v.id === videoId ? { ...v, bpm, beatOffset, ...(beats ? { beats } : {}) } : v
      ),
      currentVideo:
        state.currentVideo?.id === videoId
          ? { ...state.currentVideo, bpm, beatOffset, ...(beats ? { beats } : {}) }
          : state.currentVideo,
    }));
    // beats 属于本地网格（beatGridStore/localStorage），服务端没有对应字段。
    await commitMeta.commit(videoId, { bpm, beatOffset });
  },

  updateVideoSong: async (videoId, songTitle, songArtist, bpm) => {
    const targetVideo = get().videos.find((v) => v.id === videoId);
    const existingTags = targetVideo?.tags || [];
    const nextSongTag = songTitle.trim() ? `🎵 ${songTitle.trim()}` : null;
    const tagsWithoutSong = existingTags.filter((tag) => !tag.startsWith('🎵 '));
    const newTags = nextSongTag ? [...tagsWithoutSong, nextSongTag] : tagsWithoutSong;

    const updates: LocalMetaPatch = {
      songTitle,
      songArtist,
      tags: newTags,
    };
    if (bpm) updates.bpm = bpm;

    set((state) => ({
      videos: state.videos.map((v) =>
        v.id === videoId
          ? { ...v, songTitle, songArtist, tags: newTags, ...(bpm ? { bpm } : {}) }
          : v
      ),
      currentVideo:
        state.currentVideo?.id === videoId
          ? {
              ...state.currentVideo,
              songTitle,
              songArtist,
              tags: newTags,
              ...(bpm ? { bpm } : {}),
            }
          : state.currentVideo,
    }));
    await commitMeta.commit(videoId, updates);
  },
  /**
   * 设置显示标题：只写库内标题，磁盘文件名不动；空串 = 清除标题、回退到 name。
   * 走 commitMeta 接缝，保证本地 Dexie 与服务端 meta.title 一致。
   */
  renameVideo: async (videoId, title) => {
    const cleanTitle = title.trim().slice(0, 120);
    const nextTitle = cleanTitle || undefined;
    set((state) => ({
      videos: state.videos.map((v) => (v.id === videoId ? { ...v, title: nextTitle } : v)),
      currentVideo: state.currentVideo?.id === videoId
        ? { ...state.currentVideo, title: nextTitle }
        : state.currentVideo,
    }));
    await commitMeta.commit(videoId, { title: cleanTitle });
  },
  };
});
