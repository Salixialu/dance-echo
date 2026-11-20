/**
 * Sidebar.tsx — 侧边导航栏（Agent B + Agent P2 强化版）
 * 功能支持：
 * 1. 可拖拽调节宽度（Resizable Sidebar，220px ~ 520px），支持记忆与双击恢复默认
 * 2. 快捷收起折叠（Collapse Rail，68px 紧凑图标栏）
 * 3. 相对路径虚拟文件夹树 + 视频数量 Badge
 * 4. 练舞成长热力微组件 + GrowthStatsModal 弹窗入口
 * 5. 全局弹窗 Portal 隔离，防止 backdrop-blur 容器陷阱
 */
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  FolderOpen,
  Folder,
  Film,
  Sparkles,
  MessageSquare,
  PlayCircle,
  Star,
  Layers,
  Smartphone,
  Upload,
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Pencil,
  ChevronsDownUp,
  ChevronsUpDown,
  FolderCog,
  Tags,
  Trash2,
  X,
  Flame,
  PanelLeftClose,
  PanelLeftOpen,
  Music2,
  Plus,
  Settings,
} from 'lucide-react';
import { useFolderFavorites } from '../../hooks/useFolderFavorites';
import { useI18n } from '../../i18n';
import { LanguageToggle } from '../common/LanguageToggle';
import { TrashModal } from './TrashModal';
import { useVideoStore } from '../../store/useVideoStore';
import { isFavorite } from '../../utils/favorites';
import { loadCustomTags, TAGS_CHANGED_EVENT } from '../../utils/tagLibrary';
import type { TreeNode } from '../../services/storage/tagConfig';
import { countContinueWatching } from '../../utils/continueWatching';
import { GrowthStatsModal } from '../growth/GrowthStatsModal';
import {
  getMonthlySummary,
  subscribePracticeLogs,
} from '../../services/storage/practiceLogService';
import { clearTagCategoryAssignment, loadCategoryLabels, loadTagCategoryAssignments, saveTagCategoryAssignment, type TagCategoryLabel } from '../../services/storage/tagConfig';
import { tagCategory, tagDisplayName, tagPrefix } from '../../utils/tagDisplay';
import {
  ConfirmDialog,
  FolderContextMenu,
  FolderManagerModal,
  FolderNameDialog,
} from '../common/FolderDialogs';

const DEFAULT_SIDEBAR_WIDTH = 260;
const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 520;
const COLLAPSED_SIDEBAR_WIDTH = 68;

interface SidebarProps {
  onOpenDirectory: () => void;
  onLoadDemoVideos: () => void;
  onImportFiles: (files: FileList | null) => void;
  onOpenSettings: () => void;
}

// ─── 递归文件夹树节点组件 ────────────────────────────────────────────────────

interface FolderNodeProps {
  node: TreeNode;
  depth: number;
  selectedFolderPath: string;
  onSelect: (path: string) => void;
  onContextMenu: (node: TreeNode, x: number, y: number) => void;
  onRenameRequest: (node: TreeNode) => void;
  onDeleteRequest: (node: TreeNode) => void;
  treeCmd: { type: 'expand' | 'collapse' | 'none'; seq: number };
}

const FolderNode: React.FC<FolderNodeProps> = ({
  node,
  depth,
  selectedFolderPath,
  onSelect,
  onContextMenu,
  onRenameRequest,
  onDeleteRequest,
  treeCmd,
}) => {
  const { tr } = useI18n();
  const [isOpen, setIsOpen] = useState(depth === 0);
  const [isDragOver, setIsDragOver] = useState(false);
  const { moveVideosToFolder, showToast } = useVideoStore();
  const hasChildren = node.children.size > 0;
  const isSelected = selectedFolderPath === node.fullPath;

  const indent = depth * 12;
  const countHint = `本目录 ${node.directCount} 个视频 · 含子文件夹共 ${node.videoCount} 个`;

  useEffect(() => {
    if (treeCmd.seq > 0) setIsOpen(treeCmd.type === 'expand');
  }, [treeCmd.seq, treeCmd.type]);

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        data-testid="folder-node"
        data-folder-path={node.fullPath}
        data-count={node.videoCount}
        data-direct={node.directCount}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'move';
          if (!isDragOver) setIsDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragOver(false);
        }}
        onDrop={async (e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragOver(false);
          const raw =
            e.dataTransfer.getData('application/dance-echo-video-ids') ||
            e.dataTransfer.getData('application/dance-echo-video-id') ||
            e.dataTransfer.getData('application/x-dance-video-id') ||
            e.dataTransfer.getData('text/plain');
          const ids = raw
            ? raw
                .split(',')
                .map((id) => id.trim())
                .filter(Boolean)
            : [];
          if (ids.length) {
            await moveVideosToFolder(ids, node.fullPath);
            showToast(`🎉 已将 ${ids.length} 个视频移入「${node.name}」文件夹`);
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onContextMenu(node, e.clientX, e.clientY);
        }}
        onClick={() => {
          onSelect(node.fullPath);
          if (hasChildren) setIsOpen((prev) => !prev);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(node.fullPath);
            if (hasChildren) setIsOpen((prev) => !prev);
          }
        }}
        className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs transition group cursor-pointer ${
          isDragOver
            ? 'bg-cyan-950/70 text-cyan-300 ring-1 ring-cyan-400/60'
            : isSelected
            ? 'bg-white/[0.07] text-zinc-100 font-medium'
            : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
        }`}
        style={{ paddingLeft: `${8 + indent}px` }}
      >
        {/* 折叠 / 展开箭头 */}
        {hasChildren ? (
          <span className="w-3.5 h-3.5 flex-shrink-0 text-zinc-500 group-hover:text-zinc-300 transition">
            {isOpen ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </span>
        ) : (
          <span className="w-3.5 h-3.5 flex-shrink-0" />
        )}

        {/* 文件夹图标 */}
        {isOpen && hasChildren ? (
          <FolderOpen className="w-3.5 h-3.5 flex-shrink-0 text-amber-400/80" />
        ) : (
          <Folder className="w-3.5 h-3.5 flex-shrink-0 text-zinc-500 group-hover:text-zinc-300" />
        )}

        {/* 目录名 */}
        <span className="truncate flex-1 text-left" title={node.fullPath}>{node.name}</span>

        {/* 悬停可见的管理按钮：重命名 / 删除 */}
        <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
          <button
            type="button"
            data-testid="folder-node-rename"
            tabIndex={-1}
            onClick={(event) => {
              event.stopPropagation();
              onRenameRequest(node);
            }}
            className="rounded p-0.5 text-zinc-500 hover:bg-zinc-700 hover:text-white"
            title={tr('重命名分组')}
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            type="button"
            data-testid="folder-node-delete"
            tabIndex={-1}
            onClick={(event) => {
              event.stopPropagation();
              onDeleteRequest(node);
            }}
            className="rounded p-0.5 text-zinc-500 hover:bg-rose-900/70 hover:text-rose-300"
            title={tr('删除分组')}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </span>

        {/* 视频数量 Badge（含子文件夹总数） */}
        <span
          title={countHint}
          className={`flex-shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
            isSelected
              ? 'bg-cyan-900/50 text-cyan-400 border border-cyan-500/30'
              : 'bg-zinc-800 text-zinc-500'
          }`}
        >
          {node.videoCount}
        </span>
      </div>

      {/* 子节点（折叠展开） */}
      {hasChildren && isOpen && (
        <div>
          {[...node.children.values()].map((child) => (
            <FolderNode
              key={child.fullPath}
              node={child}
              depth={depth + 1}
              selectedFolderPath={selectedFolderPath}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
              onRenameRequest={onRenameRequest}
              onDeleteRequest={onDeleteRequest}
              treeCmd={treeCmd}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Sidebar 主组件 ──────────────────────────────────────────────────────────

export const Sidebar: React.FC<SidebarProps> = ({
  onOpenDirectory,
  onLoadDemoVideos,
  onImportFiles,
  onOpenSettings,
}) => {
  const collapsedFileInputRef = useRef<HTMLInputElement>(null);
  const expandedFileInputRef = useRef<HTMLInputElement>(null);

  const {
    videos,
    folders,
    noteCounts,
    selectedCategory,
    setSelectedCategory,
    activePanel,
    setActivePanel,
    selectedTag,
    setSelectedTag,
    selectedFolderPath,
    setSelectedFolderPath,
    getFolderTree,
    getFolderStats,
    loadFolders,
    createFolder,
    renameFolder,
    deleteFolder,
    renameTag,
    deleteTag,
    removeTags,
    cleanupOrphanTags,
    showToast,
  } = useVideoStore();

  // ── 分组管理闭环状态（统一自绘弹层，替代 window.prompt/confirm）────────
  const [treeCmd, setTreeCmd] = useState<{ type: 'expand' | 'collapse' | 'none'; seq: number }>({ type: 'none', seq: 0 });
  const [treeExpanded, setTreeExpanded] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; path: string; name: string } | null>(null);
  const [nameDialog, setNameDialog] = useState<{
    mode: 'create' | 'rename';
    parentPath: string;
    path?: string;
    initialValue: string;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    path: string;
    name: string;
    videos: number;
    subfolders: number;
  } | null>(null);
  const [isFolderManagerOpen, setIsFolderManagerOpen] = useState(false);

  // 标签库 / 回收区面板统一走 store 的 activePanel：写 URL（刷新/后退可恢复）与面包屑提示都以它为准
  const showTagLibrary = activePanel === 'tags';
  const showTrash = activePanel === 'trash';
  const setShowTagLibrary = (open: boolean) => setActivePanel(open ? 'tags' : null);
  const setShowTrash = (open: boolean) => setActivePanel(open ? 'trash' : null);
  const [tagDraft, setTagDraft] = useState('');
  const [tagDraftCategory, setTagDraftCategory] = useState('');
  const [tagSelection, setTagSelection] = useState<Set<string>>(new Set());
  const [collapsedTagGroups, setCollapsedTagGroups] = useState<Set<string>>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('dance_echo_tag_library_collapsed') || '[]');
      return new Set(Array.isArray(stored) ? stored.filter((item): item is string => typeof item === 'string') : []);
    } catch (_) {
      return new Set();
    }
  });
  const [customTags, setCustomTags] = useState<string[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('dance_echo_custom_tags') || '[]');
      return Array.isArray(stored) ? stored.filter((tag): tag is string => typeof tag === 'string') : [];
    } catch (_) {
      return [];
    }
  });

  // 批量移除视频后，标签库里的孤儿标签会被清掉；这里同步刷新，避免弹窗还显示旧标签
  useEffect(() => {
    const reload = () => setCustomTags(loadCustomTags());
    window.addEventListener(TAGS_CHANGED_EVENT, reload);
    return () => window.removeEventListener(TAGS_CHANGED_EVENT, reload);
  }, []);
  const [tagRename, setTagRename] = useState<Record<string, string>>({});
  /** 行内重命名：只有正在编辑的标签才展开输入框，保持列表紧凑 */
  const [editingTag, setEditingTag] = useState<string | null>(null);

  useEffect(() => {
    if (!showTagLibrary) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowTagLibrary(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showTagLibrary]);
  const [tagCategories, setTagCategories] = useState<Record<string, TagCategoryLabel>>(() => loadTagCategoryAssignments());
  const [showGrowthModal, setShowGrowthModal] = useState(false);
  const [monthlyGrowth, setMonthlyGrowth] = useState({
    totalMinutes: 0,
    activeDays: 0,
    streakWeeks: 0,
  });

  // 侧边栏宽度可拖拽及记忆控制
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('dance_echo_sidebar_width');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= MIN_SIDEBAR_WIDTH && parsed <= MAX_SIDEBAR_WIDTH) {
          return parsed;
        }
      }
    } catch (_) {}
    return DEFAULT_SIDEBAR_WIDTH;
  });

  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (window.innerWidth < 768) return true;
    try {
      return localStorage.getItem('dance_echo_sidebar_collapsed') === 'true';
    } catch (_) {
      return false;
    }
  });

  const [isResizing, setIsResizing] = useState(false);
  const { t, tr } = useI18n();
  const [isCtaMenuOpen, setIsCtaMenuOpen] = useState(false);

  useEffect(() => {
    if (!isCtaMenuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsCtaMenuOpen(false);
    };
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-cta-container]')) {
        setIsCtaMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isCtaMenuOpen]);

  const toggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('dance_echo_sidebar_collapsed', String(next));
      } catch (_) {}
      return next;
    });
  }, []);

  const handleMouseDownResizer = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleDoubleClickResizer = useCallback(() => {
    setSidebarWidth(DEFAULT_SIDEBAR_WIDTH);
    try {
      localStorage.setItem('dance_echo_sidebar_width', String(DEFAULT_SIDEBAR_WIDTH));
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(Math.max(e.clientX, MIN_SIDEBAR_WIDTH), MAX_SIDEBAR_WIDTH);
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      setSidebarWidth((w) => {
        try {
          localStorage.setItem('dance_echo_sidebar_width', String(w));
        } catch (_) {}
        return w;
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  useEffect(() => {
    void loadFolders();
  }, [loadFolders]);

  useEffect(() => {
    let active = true;
    const updateSummary = async () => {
      const summary = await getMonthlySummary();
      if (active) {
        setMonthlyGrowth({
          totalMinutes: summary.totalMinutes,
          activeDays: summary.activeDays,
          streakWeeks: summary.streakWeeks,
        });
      }
    };
    void updateSummary();
    const unsub = subscribePracticeLogs(() => {
      void updateSummary();
    });
    return () => {
      active = false;
      unsub();
    };
  }, []);

  const toggleTagGroup = useCallback((category: string) => {
    setCollapsedTagGroups((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      try {
        localStorage.setItem('dance_echo_tag_library_collapsed', JSON.stringify([...next]));
      } catch (_) {
        /* 忽略存储失败 */
      }
      return next;
    });
  }, []);

  const tagDraftValue = tagDraft.trim();
  const addTag = () => {
    const value = tagDraftValue;
    if (value && !allTags.includes(value)) {
      const next = [...customTags, value];
      setCustomTags(next);
      localStorage.setItem('dance_echo_custom_tags', JSON.stringify(next));
      if (tagDraftCategory) saveTagCategoryAssignment(value, tagDraftCategory);
    }
    setTagDraft('');
  };

  const allTags = Array.from(new Set([...customTags, ...videos.flatMap((v) => v.tags || [])])).filter(Boolean);

  // 标签库按分类分组：优先显式归类，其次标签自带前缀，兜底「其他」
  const groupedTags = useMemo(() => {
    const order = loadCategoryLabels();
    const buckets = new Map<string, string[]>();
    for (const tag of allTags) {
      const category = tagCategory(tag, tagCategories[tag]);
      const bucket = buckets.get(category) ?? [];
      bucket.push(tag);
      buckets.set(category, bucket);
    }
    const known = order.filter((label) => buckets.has(label));
    const extra = [...buckets.keys()]
      .filter((label) => !order.includes(label))
      .sort((a, b) => a.localeCompare(b, 'zh'));
    return [...known, ...extra].map((category) => ({
      category,
      tags: (buckets.get(category) ?? []).slice().sort((a, b) => tagDisplayName(a).localeCompare(tagDisplayName(b), 'zh')),
    }));
  }, [allTags, tagCategories]);

  const toggleTagGroupSelection = (category: string, checked: boolean) => {
    const group = groupedTags.find((item) => item.category === category);
    if (!group) return;
    setTagSelection((current) => {
      const next = new Set(current);
      for (const tag of group.tags) {
        if (checked) next.add(tag);
        else next.delete(tag);
      }
      return next;
    });
  };

  // 歌曲曲库分组统计 (Milestone M2)
  const songGroups = useMemo(() => {
    const map = new Map<string, { title: string; artist?: string; count: number }>();
    for (const v of videos) {
      let songName = v.songTitle;
      if (!songName && v.tags) {
        const songTag = v.tags.find((t) => t.startsWith('🎵 '));
        if (songTag) songName = songTag.replace('🎵 ', '').trim();
      }
      if (songName) {
        const entry = map.get(songName) || { title: songName, artist: v.songArtist, count: 0 };
        entry.count += 1;
        if (!entry.artist && v.songArtist) entry.artist = v.songArtist;
        map.set(songName, entry);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [videos]);

  // 构建文件夹树（videos 或空文件夹记录变化时都要重算）
  const folderTree = useMemo(() => getFolderTree(), [videos, folders]);

  // 「收藏」页现在同时收两种收藏：星标视频 + 星标分组，侧栏计数要合并，否则显示 0 却点进去有内容
  const favoriteVideoCount = useMemo(
    () => videos.filter((video) => isFavorite(video.rating)).length,
    [videos],
  );
  const folderFavoriteCount = useFolderFavorites().favorites.length;

  // ── 分组管理闭环操作（统一走自绘弹层）──────────────────────────────────
  const openCreateFolder = useCallback((parentPath: string) => {
    setNameDialog({ mode: 'create', parentPath, initialValue: '' });
  }, []);

  const openRenameFolder = useCallback((node: TreeNode) => {
    setNameDialog({ mode: 'rename', parentPath: '', path: node.fullPath, initialValue: node.name });
  }, []);

  const openDeleteFolder = useCallback((node: TreeNode) => {
    const stats = getFolderStats(node.fullPath);
    setDeleteTarget({ path: node.fullPath, name: node.name, ...stats });
  }, [getFolderStats]);

  const submitFolderName = useCallback(
    async (name: string) => {
      if (!nameDialog) return;
      const ok =
        nameDialog.mode === 'create'
          ? await createFolder(name, nameDialog.parentPath)
          : await renameFolder(nameDialog.path || '', name);
      if (ok) setNameDialog(null);
    },
    [nameDialog, createFolder, renameFolder],
  );

  // 标签重命名/合并：只有点铅笔进入编辑态才展开输入框
  const applyTagRename = (tag: string) => {
    const next = tagRename[tag]?.trim();
    if (!next || next === tag) {
      setEditingTag(null);
      return;
    }
    void renameTag(tag, next);
    const updatedCustom = customTags.map((item) => (item === tag ? next : item));
    if (updatedCustom.some((item, index) => item !== customTags[index])) {
      setCustomTags(updatedCustom);
      localStorage.setItem('dance_echo_custom_tags', JSON.stringify(updatedCustom));
    }
    setTagRename((current) => ({ ...current, [tag]: '' }));
    setEditingTag(null);
  };

  // 渲染全局标签库弹窗 (Portal 保证不受侧边栏任何限制)
  const renderTagLibraryModal = () => (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setShowTagLibrary(false);
      }}
    >
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-zinc-900 p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">{tr('全局标签库')}</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="tag-select-all"
              onClick={() => setTagSelection((current) => (current.size === allTags.length ? new Set() : new Set(allTags)))}
              className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-zinc-300 hover:bg-white/5"
            >
              {tagSelection.size === allTags.length && allTags.length > 0 ? tr('取消全选') : tr('全选')}
            </button>
            <button
              type="button"
              data-testid="tag-delete-selected"
              disabled={tagSelection.size === 0}
              onClick={() => {
                if (!tagSelection.size) return;
                if (!window.confirm(`删除选中的 ${tagSelection.size} 个标签？会同时从所有视频上移除。`)) return;
                void removeTags([...tagSelection]);
                setTagSelection(new Set());
              }}
              className="rounded-lg bg-rose-600/90 px-2 py-1 text-[11px] font-medium text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {tr('删除选中')} {tagSelection.size > 0 ? `(${tagSelection.size})` : ''}
            </button>
            <button
              onClick={() => setShowTagLibrary(false)}
              className="rounded p-1 text-zinc-500 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex gap-2">
          <input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addTag();
            }}
            placeholder={tr('输入标签名')}
            className="flex-1 rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-xs text-white outline-none"
          />
          <select
            value={tagDraftCategory}
            onChange={(event) => setTagDraftCategory(event.target.value)}
            className="w-24 rounded-lg border border-white/10 bg-zinc-950 px-2 py-2 text-[11px] text-zinc-300 outline-none"
            title={tr('先选分类，再加标签')}
            data-testid="tag-draft-category"
          >
            <option value="">{tr('自动分类')}</option>
            {loadCategoryLabels().map((label) => (
              <option key={label} value={label}>{label}</option>
            ))}
          </select>
          <button
            onClick={addTag}
            className="rounded-lg bg-cyan-600 px-3 text-xs text-white"
            data-testid="tag-add"
          >
            新增
          </button>
        </div>
        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {groupedTags.length === 0 ? (
            <p className="px-2 py-6 text-center text-[11px] text-zinc-500">{tr('还没有标签。')}</p>
          ) : (
            groupedTags.map((group) => {
              const groupCollapsed = collapsedTagGroups.has(group.category);
              const groupSelected = group.tags.filter((tag) => tagSelection.has(tag)).length;
              return (
                <div key={group.category} className="rounded-lg border border-white/5 bg-zinc-950/40">
                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => toggleTagGroup(group.category)}
                      className="flex flex-1 items-center gap-1.5 text-left text-[11px] font-medium text-zinc-300"
                      data-testid={`tag-group-toggle-${group.category}`}
                      aria-expanded={!groupCollapsed}
                    >
                      {groupCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      <span>{group.category}</span>
                      <span className="text-[10px] font-normal text-zinc-500">{group.tags.length}</span>
                    </button>
                    <input
                      type="checkbox"
                      checked={group.tags.length > 0 && groupSelected === group.tags.length}
                      onChange={(event) => toggleTagGroupSelection(group.category, event.target.checked)}
                      className="h-3.5 w-3.5 accent-cyan-400"
                      aria-label={`${tr('选择分类')} ${group.category}`}
                      data-testid={`tag-group-select-${group.category}`}
                    />
                  </div>
                  {!groupCollapsed && (
                    <div className="space-y-1 px-2 pb-2">
                      {group.tags.map((tag) => (
                        <div
                          key={tag}
                          className="flex items-center gap-2 rounded-lg border border-white/5 bg-zinc-900/60 px-2 py-1.5"
                        >
                          <input
                            type="checkbox"
                            checked={tagSelection.has(tag)}
                            onChange={(event) => {
                              setTagSelection((current) => {
                                const next = new Set(current);
                                if (event.target.checked) next.add(tag);
                                else next.delete(tag);
                                return next;
                              });
                            }}
                            className="h-3.5 w-3.5 shrink-0 accent-cyan-400"
                            aria-label={`${tr('选择标签')} ${tag}`}
                          />
                          {editingTag === tag ? (
                            <>
                              <input
                                autoFocus
                                value={tagRename[tag] ?? ''}
                                onChange={(event) =>
                                  setTagRename((current) => ({ ...current, [tag]: event.target.value }))
                                }
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') applyTagRename(tag);
                                  if (event.key === 'Escape') setEditingTag(null);
                                }}
                                placeholder={tr('新名字，回车保存')}
                                className="min-w-0 flex-1 rounded border border-cyan-500/40 bg-zinc-950 px-2 py-1 text-[11px] text-white outline-none"
                                aria-label={`${tr('重命名')} ${tag}`}
                              />
                              <button
                                type="button"
                                onClick={() => applyTagRename(tag)}
                                className="rounded bg-cyan-600/90 px-2 py-1 text-[11px] text-white hover:bg-cyan-500"
                              >
                                {tr('保存')}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingTag(null)}
                                className="rounded px-1.5 py-1 text-[11px] text-zinc-400 hover:text-white"
                              >
                                {tr('取消')}
                              </button>
                            </>
                          ) : (
                            <>
                              <span className="min-w-0 flex-1 truncate text-xs text-zinc-300" title={tag}>{tagDisplayName(tag)}</span>
                              <select
                                value={tagCategories[tag] ?? tagPrefix(tag) ?? ''}
                                onChange={(event) => {
                                  const category = event.target.value as TagCategoryLabel;
                                  setTagCategories((current) => {
                                    const next = { ...current };
                                    if (category) {
                                      saveTagCategoryAssignment(tag, category);
                                      next[tag] = category;
                                    } else {
                                      clearTagCategoryAssignment(tag);
                                      delete next[tag];
                                    }
                                    return next;
                                  });
                                }}
                                className="w-[76px] rounded border border-white/10 bg-zinc-900 px-1.5 py-1 text-[11px] text-zinc-300 outline-none"
                                title={tr('归类标签')}
                              >
                                <option value="">{tr('自动')}</option>
                                {loadCategoryLabels().map((label) => <option key={label} value={label}>{label}</option>)}
                              </select>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingTag(tag);
                                  setTagRename((current) => ({ ...current, [tag]: tagDisplayName(tag) }));
                                }}
                                className="rounded p-1 text-zinc-400 hover:bg-white/5 hover:text-white"
                                aria-label={`${tr('重命名')} ${tag}`}
                                title={tr('重命名/合并')}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (window.confirm(`删除标签“${tag}”？`)) {
                                    void deleteTag(tag);
                                    const updatedCustom = customTags.filter((item) => item !== tag);
                                    setCustomTags(updatedCustom);
                                    localStorage.setItem('dance_echo_custom_tags', JSON.stringify(updatedCustom));
                                  }
                                }}
                                className="rounded p-1 text-red-300 hover:bg-red-950"
                                aria-label={`${tr('删除')} ${tag}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={() => void cleanupOrphanTags()}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            清理孤立标签
          </button>
          <button
            type="button"
            data-testid="tag-open-presets"
            onClick={() => {
              setShowTagLibrary(false);
              window.dispatchEvent(new CustomEvent('danceecho:open-settings', { detail: { tab: 'tags' } }));
            }}
            className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-[11px] text-cyan-200 hover:bg-cyan-500/20"
            title={tr('标签预设：导入和播放页可点选的分类标签')}
          >
            {tr('标签预设')} →
          </button>
        </div>
      </div>
    </div>
  );

  // ── 折叠模式下的精简图标栏 ──────────────────────────────────────────
  if (isCollapsed) {
    return (
      <aside
        style={{ width: `${COLLAPSED_SIDEBAR_WIDTH}px` }}
        className="relative flex-shrink-0 w-12 sm:w-[68px] bg-space-void border-r border-hairline flex flex-col justify-between backdrop-blur-sm select-none py-3 px-1 sm:px-2 items-center z-10 transition-all duration-200"
      >
        <div className="flex flex-col items-center gap-3 w-full">
          {/* Logo & 展开按钮 */}
          <button
            onClick={toggleCollapse}
            title={tr('展开侧边栏')}
            aria-label={tr('展开侧边栏')}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-zinc-900 text-zinc-300 transition hover:border-white/20 hover:text-zinc-100"
          >
            <Film className="w-5 h-5" />
          </button>

          <button
            onClick={toggleCollapse}
            title={tr('展开侧边栏')}
            aria-label={tr('展开侧边栏')}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>

          <div className="w-8 h-[1px] bg-white/[0.08] my-1" />

          {/* 纯白药丸圆按钮 + 弹出菜单 */}
          <div data-cta-container className="relative">
            <button
              onClick={() => setIsCtaMenuOpen((prev) => !prev)}
              title={t('sidebar.importCta')}
              aria-label={t('sidebar.importCta')}
              className="p-2.5 rounded-full bg-white hover:bg-zinc-200 text-zinc-950 shadow-sm transition active:scale-95"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
            </button>

            <input
              ref={collapsedFileInputRef}
              id="fileImportInputCollapsed"
              aria-label={tr('导入视频文件')}
              type="file"
              accept="video/*,.mkv,.mov,.ogg"
              multiple
              className="sr-only"
              onChange={(event) => {
                onImportFiles(event.currentTarget.files);
                event.currentTarget.value = '';
              }}
            />

            {isCtaMenuOpen && (
              <div className="absolute left-full top-0 ml-2 w-48 p-1.5 rounded-2xl bg-space-solid/95 border border-hairline shadow-2xl backdrop-blur-xl z-50 space-y-0.5 animate-in fade-in zoom-in-95 duration-150">
                <button
                  type="button"
                  onClick={() => {
                    setIsCtaMenuOpen(false);
                    onOpenDirectory();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs text-zinc-300 hover:text-white hover:bg-white/[0.06] text-left transition"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-accent-cyan" />
                  <span>{t('sidebar.mountDir')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    collapsedFileInputRef.current?.click();
                    setIsCtaMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs text-zinc-300 hover:text-white hover:bg-white/[0.06] text-left cursor-pointer transition"
                >
                  <Upload className="w-3.5 h-3.5 text-accent-purple" />
                  <span>{t('sidebar.importFiles')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsCtaMenuOpen(false);
                    onLoadDemoVideos();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs text-zinc-300 hover:text-white hover:bg-white/[0.06] text-left transition"
                >
                  <Sparkles className="w-3.5 h-3.5 text-accent-amber" />
                  <span>{t('sidebar.loadDemos')}</span>
                </button>
              </div>
            )}
          </div>

          <div className="w-8 h-[1px] bg-white/[0.08] my-1" />

          {/* 分类快捷 */}
          <button
            onClick={() => {
              setSelectedCategory(null);
              setSelectedTag(null);
              setSelectedFolderPath('');
            }}
            title={`全部视频 (${videos.length})`}
            className={`p-2.5 rounded-xl relative transition ${
              selectedCategory === null && selectedTag === null && selectedFolderPath === ''
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            {videos.length > 0 && (
              <span className="absolute -top-1 -right-1 px-1 py-0.2 rounded-full bg-zinc-800 text-zinc-300 font-mono text-[9px] border border-white/10">
                {videos.length}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setSelectedCategory('starred');
              setSelectedTag(null);
            }}
            title={tr('收藏')}
            className={`p-2.5 rounded-xl relative transition ${
              selectedCategory === 'starred'
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
            }`}
          >
            <Star className="w-4 h-4 text-amber-300" />
          </button>

          <button
            onClick={() => setShowTagLibrary(true)}
            title={tr('全局标签库管理')}
            className="p-2.5 rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition"
          >
            <Tags className="w-4 h-4 text-cyan-300" />
          </button>
        </div>

        {/* 底部折叠状态下的成长火种小按钮 */}
        <div className="flex flex-col items-center gap-2.5 w-full pt-3 border-t border-white/[0.06]">
          <button
            onClick={onOpenSettings}
            title={tr('设置：AI / 歌曲识别 / 识别性能')}
            aria-label={tr('打开设置')}
            data-testid="sidebar-open-settings-collapsed"
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowGrowthModal(true)}
            title={`练舞成长看板：本月 ${monthlyGrowth.totalMinutes} 分钟 · 连续 ${monthlyGrowth.streakWeeks} 周`}
            aria-label={tr('打开练舞成长看板')}
            className="p-2 rounded-xl bg-amber-950/40 hover:bg-amber-900/50 border border-amber-500/30 text-amber-400 transition relative group shadow-sm"
          >
            <Flame className="w-4 h-4 fill-amber-400/30 text-amber-400 group-hover:scale-110 transition animate-pulse" />
            {monthlyGrowth.streakWeeks > 0 && (
              <span className="absolute -top-1.5 -right-1.5 px-1 py-0.2 rounded-full bg-amber-600 text-white font-mono text-[9px] font-bold">
                {monthlyGrowth.streakWeeks}w
              </span>
            )}
          </button>

          <span
            className="w-2 h-2 rounded-full bg-emerald-500 inline-block"
            title={tr('本地 IndexedDB 已就绪')}
          />
        </div>

        {/* 弹窗渲染在 body */}
        {showTagLibrary && typeof document !== 'undefined' && createPortal(renderTagLibraryModal(), document.body)}
        <GrowthStatsModal
          isOpen={showGrowthModal}
          onClose={() => setShowGrowthModal(false)}
        />
      </aside>
    );
  }

  // ── 展开完整模式下的侧边栏 ──────────────────────────────────────────
  return (
    <aside
      style={{ width: `${sidebarWidth}px` }}
      className={`relative flex-shrink-0 bg-space-void border-r border-hairline flex flex-col justify-between backdrop-blur-sm select-none overflow-hidden transition-[width] ${
        isResizing ? 'transition-none select-none' : 'duration-150'
      }`}
    >
      {/* 拖拽调节把手 Resizer Handle */}
      <div
        onMouseDown={handleMouseDownResizer}
        onDoubleClick={handleDoubleClickResizer}
        className={`absolute top-0 right-0 w-2 h-full cursor-col-resize hover:bg-cyan-500/40 active:bg-cyan-400 transition-colors z-20 group ${
          isResizing ? 'bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.8)]' : ''
        }`}
        title={tr('按住拖拽调节宽度 (220px~520px)，双击重置为 260px')}
      >
        <div className="absolute top-1/2 -translate-y-1/2 right-[1px] w-1 h-8 rounded-full bg-white/20 group-hover:bg-cyan-300 transition-colors" />
      </div>

      {/* 可滚动内容区 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 顶部标题与收起按钮（图标去掉，只留产品名） */}
        <div className="flex items-center justify-between px-1 py-1">
          <h1 className="text-base font-bold tracking-tight text-white">Dance Echo</h1>
          <button
            onClick={toggleCollapse}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06] transition"
            title={tr('收起折叠侧边栏')}
            aria-label={tr('收起侧边栏')}
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        {/* 核心导入入口：主按钮带文字（白底黑字），设置降级为图标按钮靠右 ——
            一主一次，视线先落在「导入」上，不再让两个同尺寸控件抢注意力 */}
        <div data-cta-container className="relative flex items-center gap-2">
          <button
            type="button"
            data-testid="sidebar-import-cta"
            aria-label={t('sidebar.importCta')}
            title={t('sidebar.importCta')}
            onClick={() => setIsCtaMenuOpen((prev) => !prev)}
            className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-white text-[11px] font-semibold text-zinc-950 shadow-sm transition hover:bg-zinc-200 active:scale-[0.98] ${
              isCtaMenuOpen ? 'ring-2 ring-white/50' : ''
            }`}
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            {tr('导入')}
          </button>

          {/* 隐藏但持久在 DOM 中的文件导入 input，保证 Playwright 测试选择器绝对可用 */}
          <input
            ref={expandedFileInputRef}
            id="fileImportInput"
            aria-label={tr('导入视频文件')}
            type="file"
            accept="video/*,.mkv,.mov,.ogg"
            multiple
            className="sr-only"
            onChange={(event) => {
              onImportFiles(event.currentTarget.files);
              event.currentTarget.value = '';
            }}
          />

          {/* 导入操作下拉菜单 */}
          {isCtaMenuOpen && (
            <div className="absolute top-full left-0 right-0 mt-2 p-1.5 rounded-2xl bg-space-solid/95 border border-hairline shadow-2xl backdrop-blur-xl z-50 space-y-0.5 animate-in fade-in slide-in-from-top-1 duration-150">
              <button
                type="button"
                onClick={() => {
                  setIsCtaMenuOpen(false);
                  onOpenDirectory();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/[0.06] transition text-left"
              >
                <FolderOpen className="w-3.5 h-3.5 text-accent-cyan" />
                <span>{t('sidebar.mountDir')}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  expandedFileInputRef.current?.click();
                  setIsCtaMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/[0.06] transition text-left cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-accent-purple" />
                <span>{t('sidebar.importFiles')}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsCtaMenuOpen(false);
                  onLoadDemoVideos();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/[0.06] transition text-left"
              >
                <Sparkles className="w-3.5 h-3.5 text-accent-amber" />
                <span>{t('sidebar.loadDemos')}</span>
              </button>
            </div>
          )}
        </div>

        {/* ── 工作流：最近观看 / 收藏 / 留言 ── */}
        <div className="space-y-1">
          <div className="text-[11px] font-semibold text-zinc-500 uppercase px-2 tracking-wider">
            工作流
          </div>

          <button
            data-category="continue"
            aria-pressed={selectedCategory === 'continue'}
            onClick={() => {
              setSelectedCategory(selectedCategory === 'continue' ? null : 'continue');
              setSelectedTag(null);
            }}
            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-sm transition ${
              selectedCategory === 'continue'
                ? 'bg-zinc-800 text-zinc-100 font-medium'
                : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <PlayCircle className="w-4 h-4 text-cyan-400" />
              <span>{tr('最近观看')}</span>
            </div>
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-mono">
              {countContinueWatching(videos)}
            </span>
          </button>

          <button
            onClick={() => {
              setSelectedCategory('starred');
              setSelectedTag(null);
            }}
            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-sm transition ${
              selectedCategory === 'starred'
                ? 'bg-zinc-800 text-zinc-100 font-medium'
                : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Star className="w-4 h-4 text-amber-300" />
              <span>{tr('收藏')}</span>
            </div>
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-mono">
              {favoriteVideoCount + folderFavoriteCount}
            </span>
          </button>

          <button
            onClick={() => {
              setSelectedCategory(selectedCategory === 'hasNotes' ? null : 'hasNotes');
              setSelectedTag(null);
            }}
            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-sm transition ${
              selectedCategory === 'hasNotes'
                ? 'bg-zinc-800 text-zinc-100 font-medium'
                : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <MessageSquare className="w-4 h-4 text-rose-400" />
              <span>{tr('留言')}</span>
            </div>
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-mono">
              {videos.filter((v) => (noteCounts[v.id] ?? 0) > 0).length}
            </span>
          </button>
        </div>


      </div>

      {/* 工具区：低频操作沉到底部，避免占掉分组/收藏的视线 */}
      <div className="space-y-1.5 border-t border-white/[0.06] px-4 pb-3 pt-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 px-2 pb-0.5">
          {tr('工具')}
        </div>
        <button
          type="button"
          data-testid="tool-group-manager"
          onClick={() => setIsFolderManagerOpen(true)}
          className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-zinc-900/70 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
          title={tr('分组管理：重命名 / 删除 / 批量整理')}
        >
          <FolderCog className="h-3.5 w-3.5 text-cyan-300" />
          {tr('分组管理')}
          <span className="ml-auto font-mono text-[10px] text-zinc-500">{folderTree.children.size}</span>
        </button>
        <button
          onClick={() => setShowTagLibrary(true)}
          className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-zinc-900/70 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          <Tags className="h-3.5 w-3.5 text-cyan-300" /> {tr('标签库管理')}
        </button>
        <button
          onClick={() => setShowTrash(true)}
          className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-zinc-900/70 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          <Trash2 className="h-3.5 w-3.5 text-zinc-400" /> {tr('回收区')}
        </button>
      </div>

      {/* 底部信息 */}
      <div className="p-4 pt-2 border-t border-white/[0.06] space-y-2">
        <div className="flex items-center justify-between gap-2 px-1">
          <LanguageToggle />
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-zinc-400 transition hover:bg-zinc-800/60 hover:text-zinc-100"
            title={tr('设置：AI / 歌曲识别 / 识别性能')}
          >
            <Settings className="h-3.5 w-3.5" />
            {tr('设置')}
          </button>
        </div>
        <div className="flex items-center justify-between text-[11px] text-zinc-500 px-1 pt-1 border-t border-hairline">
          <span className="font-mono text-[10px] text-zinc-500">Dance Echo v0.1.0</span>
          <span className="flex items-center gap-1.5 text-zinc-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] inline-block" />
            {t('sidebar.localReady')}
          </span>
        </div>
      </div>

      {/* 弹窗通过 Portal 挂载在 body 上 */}
      {showTagLibrary && typeof document !== 'undefined' && createPortal(renderTagLibraryModal(), document.body)}
      {showTrash && typeof document !== 'undefined' && createPortal(
        <TrashModal
          open={showTrash}
          onClose={() => setShowTrash(false)}
          onChanged={() => {
            setShowTrash(false);
            // 恢复后让媒体库重新从服务端取一次，而不是整页重载
            window.dispatchEvent(new Event('danceecho:library-changed'));
          }}
        />,
        document.body,
      )}
      <GrowthStatsModal
        isOpen={showGrowthModal}
        onClose={() => setShowGrowthModal(false)}
      />

      {/* ── 分组管理闭环：右键菜单 / 新建·重命名 / 删除确认 / 集中管理 ── */}
      {ctxMenu && (
        <FolderContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          folderName={ctxMenu.name}
          onClose={() => setCtxMenu(null)}
          onNewSub={() => openCreateFolder(ctxMenu.path)}
          onRename={() => {
            const node = { fullPath: ctxMenu.path, name: ctxMenu.name } as TreeNode;
            openRenameFolder(node);
          }}
          onDelete={() => {
            const node = { fullPath: ctxMenu.path, name: ctxMenu.name } as TreeNode;
            openDeleteFolder(node);
          }}
        />
      )}

      {nameDialog && (
        <FolderNameDialog
          open
          title={nameDialog.mode === 'rename' ? '重命名分组' : '新建分组'}
          initialValue={nameDialog.initialValue}
          confirmLabel={nameDialog.mode === 'rename' ? '重命名' : '创建'}
          hint={
            nameDialog.mode === 'create'
              ? nameDialog.parentPath
                ? `将创建在「${nameDialog.parentPath}」下`
                : '将创建在媒体库根目录下'
              : '同层已存在同名文件夹时会取消本次重命名'
          }
          onSubmit={submitFolderName}
          onCancel={() => setNameDialog(null)}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        danger
        title={`删除「${deleteTarget?.name ?? ''}」？`}
        confirmLabel="删除分组"
        message={
          deleteTarget
            ? `其中 ${deleteTarget.videos} 个视频将移到媒体库根目录${
                deleteTarget.subfolders > 0 ? `，${deleteTarget.subfolders} 个子文件夹一并删除` : ''
              }。本地原始文件不会被删除。`
            : ''
        }
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          void deleteFolder(deleteTarget.path);
          showToast(`已删除分组「${deleteTarget.name}」，视频已移到媒体库根目录`);
          setDeleteTarget(null);
        }}
      />

      <FolderManagerModal open={isFolderManagerOpen} onClose={() => setIsFolderManagerOpen(false)} />
    </aside>
  );
};
