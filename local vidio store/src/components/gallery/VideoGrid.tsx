import React, { useMemo, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  ArrowUpDown,
  Film,
  FolderOpen,
  Folder,
  Tag,
  Sparkles,
  Move,
  Tags,
  Trash2,
  CheckSquare,
  X,
  ChevronRight,
  Activity,
  Repeat,
  MessageSquare,
  Upload,
  RotateCcw,
  ChevronLeft,
  Home,
  FolderInput,
  Music2,
  Sliders,
  SlidersHorizontal,
  CalendarDays,
  ChevronDown,
  LayoutGrid,
  List,
  Star,
  ChevronsUpDown,
} from 'lucide-react';
import { useI18n } from '../../i18n';
import { useVideoStore } from '../../store/useVideoStore';
import { VideoCard } from './VideoCard';
import { VirtualVideoGrid } from './VirtualVideoGrid';
import { VirtualVideoList, VideoListHeader } from './VirtualVideoList';
import { GroupCardGrid, type HomeGroup } from './GroupCardGrid';
import { PracticeHeatmap } from '../growth/PracticeHeatmap';
import { useFolderFavorites } from '../../hooks/useFolderFavorites';
import { VideoListRow } from './VideoListRow';
import { TagFilterBar } from './TagFilterBar';
import { isVideoMatchingTags } from '../../services/storage/tagConfig';
import { tagDisplayName } from '../../utils/tagDisplay';
import { collectPresetTags } from '../../utils/tagLibrary';
import { DualVideoCompareModal } from '../player/DualVideoCompareModal';
import { ConfirmDialog, DeleteFolderDialog, FolderNameDialog } from '../common/FolderDialogs';
import type { VideoItem, DailyPracticeLog } from '../../types';
import { isContinueWatching } from '../../utils/continueWatching';
import { isFavorite } from '../../utils/favorites';
import { useTimelineCollapse, useViewportColumns, useVirtualTimeline } from '../../hooks/useVirtualTimeline';
import { useGalleryRoute } from '../../hooks/useGalleryRoute';
import { GALLERY_GAP } from '../../utils/galleryRows';
import { videoThumbUrl } from '../../services/api/serverUrl';
import { formatLocalDate, getRecentDaysLogs, subscribePracticeLogs } from '../../services/storage/practiceLogService';
import { PracticeStatsRail } from '../growth/PracticeStatsRail';

interface VideoGridProps {
  onOpenDirectory: () => void;
  onLoadDemoVideos: () => void;
  onImportFiles?: (files: FileList | null) => void;
}

/** 一天 0 点的毫秒时间戳（本地时区）：日期抽屉与按天筛选都按这个口径 */
function dayStartOf(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

const WEEKDAYS_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** 日期抽屉 + 日期 chip 的文案口径，与时间轴 section 标题保持一致 */
function dayLabelOf(dayMs: number): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  const day = new Date(dayMs);
  if (dayMs === todayMs) return '今天';
  if (dayMs === todayMs - 86400000) return '昨天';
  if (day.getFullYear() === today.getFullYear()) {
    return `${day.getMonth() + 1} 月 ${day.getDate()} 日 · ${WEEKDAYS_ZH[day.getDay()]}`;
  }
  return `${day.getFullYear()} 年 ${day.getMonth() + 1} 月 ${day.getDate()} 日`;
}

export const VideoGrid: React.FC<VideoGridProps> = ({
  onOpenDirectory,
  onLoadDemoVideos,
  onImportFiles,
}) => {
  // 只订阅「数据字段」：toast / AI 抽屉开关 / 播放器等高频抖动不再连累整个网格重渲染
  const videos = useVideoStore((s) => s.videos);
  const searchQuery = useVideoStore((s) => s.searchQuery);
  const selectedCategory = useVideoStore((s) => s.selectedCategory);
  const selectedTag = useVideoStore((s) => s.selectedTag);
  const tagFilter = useVideoStore((s) => s.tagFilter);
  const selectedFolderPath = useVideoStore((s) => s.selectedFolderPath);
  const sortBy = useVideoStore((s) => s.sortBy);
  const isScanning = useVideoStore((s) => s.isScanning);
  const scanProgress = useVideoStore((s) => s.scanProgress);
  const selectedVideoIds = useVideoStore((s) => s.selectedVideoIds);
  const selectedFolderPaths = useVideoStore((s) => s.selectedFolderPaths);
  const isBatchMode = useVideoStore((s) => s.isBatchMode);
  const activePanel = useVideoStore((s) => s.activePanel);
  const noteCounts = useVideoStore((s) => s.noteCounts);

  // 动作方法在 store 创建时就固定引用、永不改变，取一次即可，不参与响应式订阅
  const {
    setSearchQuery,
    setSelectedCategory,
    setActivePanel,
    setSelectedTag,
    clearTagFilter,
    toggleTagInclude,
    toggleTagExclude,
    toggleParentExpanded,
    setSelectedFolderPath,
    setSortBy,
    selectVideos,
    toggleSelectedFolder,
    selectFolders,
    clearSelection,
    setIsBatchMode,
    moveSelectedToFolder,
    addTagToSelected,
    clearTagsFromSelected,
    deleteVideos,
    getFolderTree,
    moveVideosToFolder,
    createFolder,
    renameFolder,
    deleteFolder,
    showToast,
  } = useVideoStore.getState();

  const { t, tr } = useI18n();

  // 面包屑「当前筛选名」：分类筛选或工具面板任一非空时提示当前看的是子集
  const filterLabel =
    selectedCategory === 'continue' ? tr('最近观看')
    : selectedCategory === 'starred' ? tr('收藏')
    : selectedCategory === 'hasNotes' ? tr('留言')
    : activePanel === 'tags' ? tr('标签库')
    : activePanel === 'trash' ? tr('回收区')
    : null;

  const searchInputRef = useRef<HTMLInputElement>(null);
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const columns = useViewportColumns();
  const { favorites: folderFavorites, toggleFavorite: toggleFolderFavorite } = useFolderFavorites();
  const {
    collapsed: collapsedGroups,
    toggle: toggleGroupCollapse,
    seedDefaults: seedCollapseDefaults,
  } = useTimelineCollapse('dance_echo_collapsed_groups_v3');

  // ⌘K 全局搜索快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        // 「切换分组」面板也带一个搜索框：⌘K 先收起它再聚焦主搜索，免得两个焦点打架
        if (document.querySelector('[data-testid="group-switcher-panel"]')) {
          setGroupSwitcherOpen(false);
          setGroupSwitcherQuery('');
        }
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ─── 批量操作弹窗状态 (对标 4.0.html pickModal) ───────────────────────────
  const [activeBatchModal, setActiveBatchModal] = useState<'tag' | 'move' | null>(null);
  const [batchTagInput, setBatchTagInput] = useState('');
  const [batchMoveInput, setBatchMoveInput] = useState('');
  const batchTagInputRef = useRef<HTMLInputElement>(null);
  const batchMoveInputRef = useRef<HTMLInputElement>(null);

  const [showQuickGroup, setShowQuickGroup] = useState(false);
  const [quickGroupInput, setQuickGroupInput] = useState('');
  const quickGroupRef = useRef<HTMLDivElement>(null);
  // 侧栏不再列分组：面包屑旁边给一个「切换分组」，免得每次都要先回首页
  const [groupSwitcherOpen, setGroupSwitcherOpen] = useState(false);
  const [groupSwitcherQuery, setGroupSwitcherQuery] = useState('');
  const groupSwitcherRef = useRef<HTMLDivElement>(null);
  const [groupSwitcherRect, setGroupSwitcherRect] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!showQuickGroup) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!quickGroupRef.current?.contains(e.target as Node)) setShowQuickGroup(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowQuickGroup(false);
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [showQuickGroup]);

  // ─── 双屏同曲目 VS 对比状态 (Milestone M2) ─────────────────────────────────
  const [comparePair, setComparePair] = useState<[VideoItem, VideoItem] | null>(null);

  // 首页视图：分组 / 按日期 二选一（同一屏只留一条分类轴，避免全库视频被两套结构重复铺开）
  const [homeView, setHomeView] = useState<'groups' | 'timeline'>(() => {
    try {
      return localStorage.getItem('dance_echo_home_view') === 'timeline' ? 'timeline' : 'groups';
    } catch {
      return 'groups';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('dance_echo_home_view', homeView);
    } catch {
      /* 隐私模式下忽略 */
    }
  }, [homeView]);
  /** 首页日期抽屉里选中的那一天（当天 0 点的毫秒）；null = 不按日期过滤 */
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [isDateDrawerOpen, setIsDateDrawerOpen] = useState(false);
  // 展示形态：网格 / 列表。上千条 mmexport 只看缩略图认不出片，列表把名称·日期·分组摊开。
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    try {
      return localStorage.getItem('dance_echo_view_mode') === 'list' ? 'list' : 'grid';
    } catch {
      return 'grid';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('dance_echo_view_mode', viewMode);
    } catch {
      /* 隐私模式下忽略 */
    }
  }, [viewMode]);

  // URL 路由：分组/搜索/排序/视图全部进 hash，刷新与后退不再丢位置
  useGalleryRoute({
    viewMode,
    homeView,
    setViewMode,
    setHomeView,
    ready: videos.length > 0,
  });
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showTagFilter, setShowTagFilter] = useState(false);
  const [filterPanelPos, setFilterPanelPos] = useState<{ left: number; top: number } | null>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showTagFilter) return;
    const close = () => setShowTagFilter(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [showTagFilter]);
  const [pendingRemoveSelected, setPendingRemoveSelected] = useState(false);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<{ paths: string[]; label: string; videoCount: number } | null>(null);
  const [pruneTagsOnDelete, setPruneTagsOnDelete] = useState(true);

  // 只被“当前选中视频”使用、且不在标签预设里的标签数量（给确认框显示影响面）
  const selectionTagStats = useMemo(() => {
    if (!selectedVideoIds.length) return { orphan: [] as string[], total: 0 };
    const selected = new Set(selectedVideoIds);
    const fromSelected = new Set<string>();
    const fromOthers = new Set<string>();
    for (const video of videos) {
      const bucket = selected.has(video.id) ? fromSelected : fromOthers;
      for (const tag of video.tags || []) bucket.add(tag);
    }
    const presets = collectPresetTags();
    return {
      orphan: [...fromSelected].filter((tag) => !fromOthers.has(tag) && !presets.has(tag)),
      total: fromSelected.size,
    };
  }, [videos, selectedVideoIds]);

  // 汇聚媒体库已有标签与常用预设，按使用频率排序
  const allAvailableTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of videos) {
      if (v.tags) {
        for (const t of v.tags) {
          counts.set(t, (counts.get(t) || 0) + 1);
        }
      }
    }
    const libraryTagsSorted = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([t]) => t);
    const presets = [
      'Kpop',
      'HipHop',
      '编舞',
      'Jazz',
      '律动',
      '分解',
      'Urban',
      'Popping',
      'Locking',
      'House',
      '齐舞',
      '基本功',
    ];
    return Array.from(new Set([...libraryTagsSorted, ...presets]));
  }, [videos]);

  // 打开弹窗自动聚焦输入框
  useEffect(() => {
    if (activeBatchModal === 'tag') {
      const timer = window.setTimeout(() => batchTagInputRef.current?.focus(), 60);
      return () => clearTimeout(timer);
    } else if (activeBatchModal === 'move') {
      const timer = window.setTimeout(() => batchMoveInputRef.current?.focus(), 60);
      return () => clearTimeout(timer);
    }
  }, [activeBatchModal]);

  const handleDoBatchTag = async (tag: string) => {
    const clean = tag.trim();
    if (!clean) return;
    await addTagToSelected(clean);
    setActiveBatchModal(null);
    setBatchTagInput('');
  };

  const handleDoBatchMove = async (targetPath: string) => {
    const clean = targetPath.trim().replace(/^\/+|\/+$/g, '');
    const movedCount = selectedVideoIds.length;
    await moveSelectedToFolder(clean);
    setActiveBatchModal(null);
    setBatchMoveInput('');
    if (movedCount > 0) {
      showToast(
        clean
          ? `🎉 已将 ${movedCount} 个视频移至「${clean}」`
          : `🎉 已将 ${movedCount} 个视频移至媒体库根目录`,
      );
    }
  };

  // 快速分组：不开弹窗，直接从控制条把选中的视频归入某个分组（或现场新建）
  const doQuickMove = async (targetPath: string) => {
    setShowQuickGroup(false);
    setQuickGroupInput('');
    await handleDoBatchMove(targetPath);
  };

  // ─── 拖拽解析与文件导入交互状态 ──────────────────────────────────────────
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounterRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const headerFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!groupSwitcherOpen) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (groupSwitcherRef.current?.contains(target)) return;
      if ((target as HTMLElement).closest?.('[data-testid="group-switcher-panel"]')) return;
      setGroupSwitcherOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setGroupSwitcherOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [groupSwitcherOpen]);

  // ─── 拖拽视频至文件夹/面包屑交互状态 ──────────────────────────────────────
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [dragOverBreadcrumb, setDragOverBreadcrumb] = useState<string | null>(null);

  const extractDraggedVideoIds = (dataTransfer: DataTransfer): string[] => {
    const raw =
      dataTransfer.getData('application/dance-echo-video-ids') ||
      dataTransfer.getData('application/dance-echo-video-id') ||
      dataTransfer.getData('application/x-dance-video-id') ||
      dataTransfer.getData('text/plain');
    if (!raw) return [];
    return raw
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const types = Array.from(e.dataTransfer.types || []);
    const isInternal = types.some(
      (t) => t.includes('dance-echo-video') || t.includes('x-dance-video')
    );
    const isFile = types.includes('Files');
    if (isFile && !isInternal) {
      dragCounterRef.current += 1;
      setIsDraggingOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isDraggingOver) {
      dragCounterRef.current -= 1;
      if (dragCounterRef.current <= 0) {
        setIsDraggingOver(false);
        dragCounterRef.current = 0;
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    dragCounterRef.current = 0;
    const types = Array.from(e.dataTransfer.types || []);
    const isInternal = types.some(
      (t) => t.includes('dance-echo-video') || t.includes('x-dance-video')
    );
    if (!isInternal && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onImportFiles?.(e.dataTransfer.files);
    }
  };

  const handleDropOnFolder = async (
    folderFullPath: string,
    folderName: string,
    e: React.DragEvent
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolderId(null);
    const ids = extractDraggedVideoIds(e.dataTransfer);
    if (!ids.length) return;
    await moveIdsToFolder(folderFullPath, folderName, ids);
  };

  /** 拖拽落点与「快速分组」共用同一条移动链路：只改虚拟路径，不动磁盘文件 */
  const moveIdsToFolder = async (folderFullPath: string, folderName: string, ids: string[]) => {
    const targetVideos = videos.filter((v) => ids.includes(v.id));
    const toMove = targetVideos.filter((v) => getVideoDirectory(v) !== folderFullPath);
    if (toMove.length === 0) {
      showToast(`所选视频已在「${folderName}」分组中`);
      return;
    }
    await moveVideosToFolder(toMove.map((v) => v.id), folderFullPath);
    showToast(`🎉 已将 ${toMove.length} 个视频移入「${folderName}」分组`);
  };

  const handleDropOnRoot = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverBreadcrumb(null);
    const ids = extractDraggedVideoIds(e.dataTransfer);
    if (!ids.length) return;
    const targetVideos = videos.filter((v) => ids.includes(v.id));
    const toMove = targetVideos.filter((v) => getVideoDirectory(v) !== '');
    if (toMove.length === 0) {
      showToast(`所选视频已在「媒体库全部」根目录中`);
      return;
    }
    await moveVideosToFolder(toMove.map((v) => v.id), '');
    showToast(`🎉 已将 ${toMove.length} 个视频移至「媒体库全部」根目录`);
  };

  const handleDropOnParent = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverBreadcrumb(null);
    if (!selectedFolderPath) return;
    const parts = selectedFolderPath.split('/').filter(Boolean);
    parts.pop();
    const parentPath = parts.join('/');
    const parentName = parts[parts.length - 1] || '媒体库全部';
    const ids = extractDraggedVideoIds(e.dataTransfer);
    if (!ids.length) return;
    const targetVideos = videos.filter((v) => ids.includes(v.id));
    const toMove = targetVideos.filter((v) => getVideoDirectory(v) !== parentPath);
    if (toMove.length === 0) {
      showToast(`所选视频已在「${parentName}」中`);
      return;
    }
    await moveVideosToFolder(toMove.map((v) => v.id), parentPath);
    showToast(`🎉 已将 ${toMove.length} 个视频移至「${parentName}」`);
  };

  const handleDropOnSegment = async (
    targetPath: string,
    segmentName: string,
    e: React.DragEvent
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverBreadcrumb(null);
    const ids = extractDraggedVideoIds(e.dataTransfer);
    if (!ids.length) return;
    const targetVideos = videos.filter((v) => ids.includes(v.id));
    const toMove = targetVideos.filter((v) => getVideoDirectory(v) !== targetPath);
    if (toMove.length === 0) {
      showToast(`所选视频已在「${segmentName}」目录中`);
      return;
    }
    await moveVideosToFolder(toMove.map((v) => v.id), targetPath);
    showToast(`🎉 已将 ${toMove.length} 个视频移至「${segmentName}」`);
  };

  // 排序比较器：全库列表与时间轴分桶内共用同一套顺序，
  // 避免"选了按名称/时长/评级，时间轴又按修改时间重排回去"的矛盾。
  const compareVideos = (a: VideoItem, b: VideoItem) => {
    if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
    if (sortBy === 'duration') return (b.duration || 0) - (a.duration || 0);
    if (sortBy === 'rating') return (b.rating || 0) - (a.rating || 0);
    return (b.lastModified || 0) - (a.lastModified || 0);
  };

  // 综合过滤（含文件夹前缀过滤 + 双层三态标签过滤）
  const filteredVideos = videos
    .filter((v) => {
      // 1. 文件夹路径前缀过滤
      if (selectedFolderPath) {
        const p = v.path || '';
        if (p !== selectedFolderPath && !p.startsWith(`${selectedFolderPath}/`)) return false;
      }

      // 2. 搜索：显示标题与文件名都参与匹配
      if (searchQuery) {
        const needle = searchQuery.toLowerCase();
        const haystack = `${v.title || ''}\n${v.name}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }

      // 3. 分类过滤（侧边栏快捷分类）
      if (selectedCategory === 'hasNotes' && (noteCounts[v.id] ?? 0) === 0) {
        return false;
      }
      if (selectedCategory === 'starred' && !isFavorite(v.rating)) {
        return false;
      }
      // 最近观看：与侧边栏计数共用同一份谓词，避免「角标有数字、点进去是空的」。
      if (selectedCategory === 'continue' && !isContinueWatching(v)) return false;

      // 4. 旧版单选标签过滤（兼容侧边栏标签快捷键）
      if (selectedTag && !v.tags?.includes(selectedTag)) {
        return false;
      }

      // 5. 双层三态标签过滤（新版 Agent B 实现）
      if (tagFilter.includeSet.size > 0 || tagFilter.excludeSet.size > 0) {
        if (!isVideoMatchingTags(v.tags || [], tagFilter)) return false;
      }

      return true;
    })
    .sort(compareVideos);

  const folderTree = getFolderTree();
  const folderOptions = useMemo(() => {
    const result: string[] = [];
    const visit = (node: ReturnType<typeof getFolderTree>) => {
      node.children.forEach((child) => {
        result.push(child.fullPath);
        visit(child);
      });
    };
    visit(folderTree);
    return result;
  }, [folderTree]);

  // 快速分组面板的目标：已有分组按视频数降序（常用的排前面，少滚动）
  const quickGroupTargets = useMemo(() => {
    const out: { path: string; name: string; count: number; depth: number }[] = [];
    const visit = (node: ReturnType<typeof getFolderTree>, depth: number) => {
      node.children.forEach((child) => {
        out.push({
          path: child.fullPath,
          name: child.name,
          count: child.videoCount ?? 0,
          depth,
        });
        visit(child, depth + 1);
      });
    };
    visit(folderTree, 0);
    return out.sort((a, b) => b.count - a.count || a.path.localeCompare(b.path));
  }, [folderTree]);


  // ─── 文件夹卡片优先算法：获取当前节点、直接子文件夹与直接视频 ───
  const currentNode = useMemo(() => {
    if (!selectedFolderPath) return folderTree;
    const parts = selectedFolderPath.split('/').filter(Boolean);
    let curr = folderTree;
    for (const part of parts) {
      if (curr.children.has(part)) {
        curr = curr.children.get(part)!;
      } else {
        break;
      }
    }
    return curr;
  }, [folderTree, selectedFolderPath]);

  // 切换分组下拉的数据：同样按视频数降序，另给搜索（组多了靠打字）
  const groupSwitcherItems = useMemo(() => {
    const q = groupSwitcherQuery.trim().toLowerCase();
    const list = quickGroupTargets.filter((g) => g.path !== selectedFolderPath);
    if (!q) return list.slice(0, 40);
    return list
      .filter((g) => g.name.toLowerCase().includes(q) || g.path.toLowerCase().includes(q))
      .slice(0, 40);
  }, [quickGroupTargets, selectedFolderPath, groupSwitcherQuery]);


  // 当前目录下的直接子文件夹
  const subfolders = useMemo(() => {
    return Array.from(currentNode.children.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [currentNode]);

  const folderCoverVideos = useMemo(() => {
    const covers = new Map<string, (typeof videos)[number]>();
    for (const folder of subfolders) {
      const cover = filteredVideos.find((video) => {
        const parts = (video.path || '').split('/').filter(Boolean);
        const last = parts[parts.length - 1] || '';
        const directory = /\.(mp4|mov|mkv|webm|ogg|avi|flv|m4v)$/i.test(last)
          ? parts.slice(0, -1).join('/')
          : parts.join('/');
        return (directory === folder.fullPath || directory.startsWith(`${folder.fullPath}/`)) && video.thumbnailUrl;
      });
      if (cover) covers.set(folder.fullPath, cover);
    }
    return covers;
  }, [filteredVideos, subfolders]);

  // 判断视频所属目录
  const getVideoDirectory = (v: (typeof videos)[0]): string => {
    if (!v.path) return '';
    const lastPart = v.path.split('/').filter(Boolean).pop() || '';
    const isFileName = /\.(mp4|mov|mkv|webm|ogg|avi|flv|m4v)$/i.test(lastPart);
    if (isFileName) {
      if (v.path.includes('/')) {
        return v.path.slice(0, v.path.lastIndexOf('/'));
      }
      return '';
    }
    return v.path;
  };

  // 当前目录直接视频与展示视频
  const directVideos = useMemo(() => {
    return filteredVideos.filter((v) => getVideoDirectory(v) === selectedFolderPath);
  }, [filteredVideos, selectedFolderPath]);

  // 根目录展示全库视频；文件夹内只展示该目录直接包含的视频。
  const displayVideos = useMemo(() => {
    if (!selectedFolderPath) return filteredVideos;
    return directVideos;
  }, [directVideos, filteredVideos, selectedFolderPath]);

  // 只有「文字搜索 / 侧栏分类」才把首页切成结果列表；
  // 单独用标签 chip 过滤时保留日期轴，否则一选标签整个首页结构就没了。
  // 工作流分类（收藏 / 留言 / 最近观看）不是「搜索」：
  // 它们要保留分组视图与「收藏的分组」这一排，而不是切成一张结果列表
  const hasTextQuery =
    Boolean(searchQuery) ||
    Boolean(selectedTag) ||
    (Boolean(selectedCategory) && selectedCategory !== 'starred');

  // 根目录（首页）不再平铺全库视频，只展示"没进任何分组"的视频；搜索/过滤时才回退成结果列表。
  const hasActiveQuery =
    Boolean(searchQuery) ||
    Boolean(selectedTag) ||
    Boolean(selectedCategory) ||
    tagFilter.includeSet.size > 0 ||
    tagFilter.excludeSet.size > 0;

  const rootFolderVideos = useMemo(() => {
    const map = new Map<string, (typeof videos)[number][]>();
    for (const folder of subfolders) {
      const items = filteredVideos.filter((video) => {
        const directory = getVideoDirectory(video);
        return directory === folder.fullPath || directory.startsWith(`${folder.fullPath}/`);
      });
      map.set(folder.fullPath, items.filter((video) => video.thumbnailUrl).slice(0, 4));
    }
    return map;
  }, [filteredVideos, subfolders]);

  // 首页「分组」视图里的散片区：不属于任何分组目录的视频
  const ungroupedVideos = useMemo(() => {
    const folderPaths = subfolders.map((folder) => folder.fullPath);
    return filteredVideos.filter((video) => {
      if (selectedDay && dayStartOf(video.lastModified || 0) !== selectedDay) return false;
      const directory = getVideoDirectory(video);
      return !folderPaths.some(
        (path) => directory === path || directory.startsWith(`${path}/`),
      );
    });
  }, [filteredVideos, subfolders, selectedDay]);

  // 日期抽屉：全库按天聚合，只列有视频的天，从新到旧
  const dayBuckets = useMemo(() => {
    const counts = new Map<number, number>();
    for (const video of videos) {
      const key = dayStartOf(video.lastModified || Date.now());
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => b.day - a.day);
  }, [videos]);

  // 首页：一首歌一张卡。组来自顶层文件夹，封面取组内最新一张有缩略图的视频。
  const homeGroups = useMemo<HomeGroup[]>(() => {
    const pool = selectedDay
      ? filteredVideos.filter((video) => dayStartOf(video.lastModified || 0) === selectedDay)
      : filteredVideos;
    return subfolders
      .map((folder) => {
        const items = pool.filter((video) => {
          const directory = getVideoDirectory(video);
          return directory === folder.fullPath || directory.startsWith(`${folder.fullPath}/`);
        });
        const cover = items.find((video) => video.thumbnailUrl || video.serverId);
        const lastModified = items.reduce((max, video) => Math.max(max, video.lastModified || 0), 0);
        return {
          path: folder.fullPath,
          name: folder.name,
          count: items.length,
          cover,
          lastModified,
        };
      })
      .filter((group) => group.count > 0)
      .sort((a, b) => b.lastModified - a.lastModified);
  }, [filteredVideos, subfolders, selectedDay]);

  /**
   * 星标收藏的组：只在「收藏」页展示。
   * 注意不能从 homeGroups 里筛——那个列表跟着当前筛选走，收藏页自己会把视频过滤光，
   * 于是收藏的组反而永远算不出来。这里直接按全量 videos 统计。
   */
  const favoriteGroups = useMemo<HomeGroup[]>(() => {
    if (folderFavorites.length === 0) return [];
    return folderFavorites
      .map((path) => {
        const items = videos.filter((video) => {
          const directory = getVideoDirectory(video);
          return directory === path || directory.startsWith(`${path}/`);
        });
        const cover = items.find((video) => video.thumbnailUrl || video.serverId);
        return {
          path,
          name: path.split('/').filter(Boolean).pop() || path,
          count: items.length,
          cover,
          lastModified: items.reduce((max, video) => Math.max(max, video.lastModified || 0), 0),
        };
      })
      .filter((group) => group.count > 0)
      .sort((a, b) => b.lastModified - a.lastModified);
  }, [folderFavorites, videos]);

  // 首页时间轴：一天一个 section；同一天里跨了多个分组时，再按分组分一层小标题。
  // 不落盘、不建文件夹——时间本来就写在每条视频的元数据里。
  // 首页顶部标签 chip：全库出现次数最多的标签（可用一条 chip 筛掉绝大多数无关视频）
  const topTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const video of videos) {
      for (const tag of video.tags || []) {
        if (tag.startsWith('🎵 ')) continue; // 舞曲标签走另一条档案路径，不混进筛选行
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 14)
      .map(([tag, count]) => ({ tag, count }));
  }, [videos]);

  const timelineSections = useMemo(() => {
    const DAY = 86400000;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayMs = startOfToday.getTime();
    const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const thisYear = new Date(todayMs).getFullYear();
    const now = Date.now();

    type Section = {
      key: string;
      label: string;
      order: number;
      videos: typeof filteredVideos;
      groups?: { key: string; label: string; videos: typeof filteredVideos }[];
    };
    const buckets = new Map<string, Section>();

    for (const video of filteredVideos) {
      const ts = video.lastModified || video.lastPlayedAt || now;
      const day = new Date(ts);
      day.setHours(0, 0, 0, 0);
      const dayMs = day.getTime();
      const key = `d-${dayMs}`;

      let label: string;
      if (dayMs === todayMs) label = '今天';
      else if (dayMs === todayMs - DAY) label = '昨天';
      else if (day.getFullYear() === thisYear) {
        label = `${day.getMonth() + 1} 月 ${day.getDate()} 日 · ${WEEKDAYS[day.getDay()]}`;
      } else {
        label = `${day.getFullYear()} 年 ${day.getMonth() + 1} 月 ${day.getDate()} 日`;
      }

      const bucket = buckets.get(key);
      if (bucket) bucket.videos.push(video);
      else buckets.set(key, { key, label, order: -dayMs, videos: [video] });
    }

    const sections = [...buckets.values()].sort((a, b) => a.order - b.order);
    for (const section of sections) {
      // 组内顺序交给当前排序（日期只决定 section 的先后）
      section.videos.sort(compareVideos);

      const byGroup = new Map<string, typeof filteredVideos>();
      for (const video of section.videos) {
        const dir = getVideoDirectory(video);
        const top = dir.split('/').filter(Boolean)[0] || '';
        const arr = byGroup.get(top);
        if (arr) arr.push(video);
        else byGroup.set(top, [video]);
      }
      // 只有一天里跨了两个以上分组时才画二级标题，否则纯属噪音
      if (byGroup.size > 1) {
        section.groups = [...byGroup.entries()]
          .sort((a, b) => {
            if (!a[0]) return 1;
            if (!b[0]) return -1;
            return a[0].localeCompare(b[0]);
          })
          .map(([name, list]) => ({
            key: name || '__root__',
            label: name || tr('未分组'),
            videos: list,
          }));
      }
    }
    return sections;
  }, [filteredVideos, sortBy]);

  /** 练习轨迹：抽屉里的统计与热力图共用同一份日志（只订阅一次） */
  const [practiceLogs, setPracticeLogs] = useState<DailyPracticeLog[]>([]);
  useEffect(() => {
    let active = true;
    const load = async () => {
      const data = await getRecentDaysLogs(400);
      if (active) setPracticeLogs(data);
    };
    void load();
    const unsubscribe = subscribePracticeLogs(() => {
      void load();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  /** 留言总条数：noteCounts 是按视频聚合的，这里求总和 */
  const noteTotal = useMemo(
    () => Object.values(noteCounts).reduce((sum, n) => sum + (n || 0), 0),
    [noteCounts],
  );

  /** 近 12 个月入库条数（按 lastModified 分月，旧 → 新） */
  const monthFilmCounts = useMemo(() => {
    const map = new Map<string, number>();
    const now = new Date();
    const buckets: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    for (const key of buckets) map.set(key, 0);
    for (const video of videos) {
      const ms = video.lastModified || 0;
      if (!ms) continue;
      const d = new Date(ms);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (map.has(key)) map.set(key, (map.get(key) || 0) + 1);
    }
    return [...map.entries()].map(([key, count]) => ({ key, count }));
  }, [videos]);

  /** 库里视频总时长（秒） */
  const filmSeconds = useMemo(
    () => videos.reduce((sum, v) => sum + (v.duration || 0), 0),
    [videos],
  );
  /** 练习轨迹：按天聚合的「整理了多少个视频」，喂给热力图的兜底口径 */
  const videoCountsByDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const { day, count } of dayBuckets) {
      map[formatLocalDate(new Date(day))] = count;
    }
    return map;
  }, [dayBuckets]);

  const selectedDateStr = useMemo(
    () => (selectedDay ? formatLocalDate(new Date(selectedDay)) : undefined),
    [selectedDay],
  );

  /** 选中那天的视频（抽屉内就地列出，不跳出抽屉） */
  const selectedDayVideos = useMemo(() => {
    if (!selectedDay) return [];
    return videos
      .filter((video) => dayStartOf(video.lastModified || 0) === selectedDay)
      .sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
  }, [videos, selectedDay]);


  // 首次进入（还没有折叠记录）时：最近 7 天展开，更早的日期默认折叠
  useEffect(() => {
    const sectionKeys: string[] = [];
    const older: string[] = [];
    const cutoff = Date.now() - 7 * 86400000;
    timelineSections.forEach((section, index) => {
      sectionKeys.push(section.key);
      const dayMs = Number(section.key.slice(2));
      // 最近 7 天展开；若这周完全没看（例如新库/断更），至少保证最近 3 天是展开的，
      // 否则首屏只剩一排折叠标题，看起来像「这里什么都没有」。
      const tooOld = Number.isFinite(dayMs) && dayMs < cutoff;
      if (tooOld && index >= 3) older.push(section.key);
    });
    seedCollapseDefaults(sectionKeys, older);
  }, [timelineSections, seedCollapseDefaults]);

  // 首页时间轴虚拟化：只渲染视口内的日期头与卡片行。
  // 标签筛选激活时强制展开：否则命中的那条视频可能落在默认折叠的旧日期里，
  // 用户点完 chip 看到的是「一排折叠标题 + 零结果」。
  const tagFilterActive = tagFilter.includeSet.size > 0 || tagFilter.excludeSet.size > 0;
  const effectiveCollapsed = tagFilterActive ? [] : collapsedGroups;

  const virtual = useVirtualTimeline(mainScrollRef, timelineSections, effectiveCollapsed, columns, {
    mode: viewMode,
  });
  // 搜索/筛选时每个分组命中的视频数（含子分组），用来隐藏"零命中"的分组
  const folderMatchCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const folder of subfolders) {
      const count = filteredVideos.filter((video) => {
        const directory = getVideoDirectory(video);
        return directory === folder.fullPath || directory.startsWith(`${folder.fullPath}/`);
      }).length;
      map.set(folder.fullPath, count);
    }
    return map;
  }, [filteredVideos, subfolders]);

  // 有筛选条件时只展示命中的分组；未筛选时展示全部分组（含空分组）
  const visibleSubfolders = useMemo(() => {
    if (!hasActiveQuery) return subfolders;
    return subfolders.filter((folder) => (folderMatchCounts.get(folder.fullPath) ?? 0) > 0);
  }, [subfolders, hasActiveQuery, folderMatchCounts]);

  // 空分组不占封面位：收成一行小胶囊，避免首屏被虚线大框撑满
  const filledSubfolders = useMemo(
    () => visibleSubfolders.filter((folder) => (rootFolderVideos.get(folder.fullPath)?.length ?? 0) > 0),
    [visibleSubfolders, rootFolderVideos]
  );
  const emptySubfolders = useMemo(
    () => visibleSubfolders.filter((folder) => (rootFolderVideos.get(folder.fullPath)?.length ?? 0) === 0),
    [visibleSubfolders, rootFolderVideos]
  );

  // 每个分组最近一次有视频更新的时间（首页卡片显示"最近练习/更新"）
  const folderLastActive = useMemo(() => {
    const map = new Map<string, number>();
    for (const folder of subfolders) {
      let latest = 0;
      for (const video of filteredVideos) {
        const directory = getVideoDirectory(video);
        if (directory === folder.fullPath || directory.startsWith(`${folder.fullPath}/`)) {
          latest = Math.max(latest, video.lastModified || 0);
        }
      }
      map.set(folder.fullPath, latest);
    }
    return map;
  }, [filteredVideos, subfolders]);

  const formatAbsoluteDate = (timestamp: number): string => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  };

  // 面包屑路径分段
  const breadcrumbSegments = useMemo(() => {
    if (!selectedFolderPath) return [];
    const parts = selectedFolderPath.split('/').filter(Boolean);
    let accumulated = '';
    return parts.map((part) => {
      accumulated = accumulated ? `${accumulated}/${part}` : part;
      return {
        name: part,
        path: accumulated,
      };
    });
  }, [selectedFolderPath]);

  // 面包屑最多展示 2 段（深层级折叠成「…」），避免整行出现横向滚动条
  const breadcrumbVisible: {
    name: string;
    path: string;
    hidden?: { name: string; path: string }[];
  }[] = useMemo(() => {
    if (breadcrumbSegments.length <= 2) return breadcrumbSegments;
    const first = breadcrumbSegments[0];
    const last = breadcrumbSegments[breadcrumbSegments.length - 1];
    return [first, { name: '…', path: first.path, hidden: breadcrumbSegments.slice(1, -1) }, last];
  }, [breadcrumbSegments]);

  // 返回上一级目录
  const handleGoBack = () => {
    if (!selectedFolderPath) return;
    const parts = selectedFolderPath.split('/').filter(Boolean);
    parts.pop();
    setSelectedFolderPath(parts.join('/'));
  };

  const allVisibleSelected =
    filteredVideos.length > 0 &&
    filteredVideos.every((video) => selectedVideoIds.includes(video.id));
  const selectedCount = selectedVideoIds.length;

  // 进分组时顺手清掉工作流筛选（收藏 / 最近观看 / 留言）。
  // 否则从「收藏」页点组卡片进组，视频集合只剩被收藏的那几条，目录看着是空的。
  const openFolder = (path: string) => {
    setSelectedFolderPath(path);
    setSelectedCategory(null);
    setSelectedTag(null);
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    clearTagFilter();
    setSelectedFolderPath('');
    setSelectedTag(null);
    setSelectedCategory(null);
  };

  return (
    <div
      className="flex-1 flex flex-col h-full overflow-hidden bg-zinc-950 relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 全屏拖拽上传悬浮遮罩 (Dark Studio 发光质感) */}
      {isDraggingOver && (
        <div className="fixed inset-0 z-50 bg-zinc-950/85 backdrop-blur-xl flex flex-col items-center justify-center p-8 pointer-events-none animate-in fade-in duration-200">
          <div className="w-full max-w-xl p-12 rounded-3xl border-2 border-dashed border-cyan-400 bg-cyan-950/30 flex flex-col items-center justify-center text-center shadow-[0_0_60px_rgba(34,211,238,0.35)] animate-pulse">
            <div className="w-20 h-20 rounded-2xl bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center text-cyan-300 mb-6 shadow-[0_0_30px_rgba(34,211,238,0.5)]">
              <Upload className="w-10 h-10 animate-bounce" />
            </div>
            <h3 className="text-2xl font-bold text-white tracking-tight mb-2">
              释放视频文件以立即解析
            </h3>
            <p className="text-sm text-cyan-300/80 font-mono">
              支持 MP4 · MOV · MKV · WebM (浏览器端本地抽帧零上传)
            </p>
          </div>
        </div>
      )}

      {/* ─── 统一单行控制中枢 (56px Single-Line Control Center) ─── */}
      <header className="h-14 min-h-14 px-2 sm:px-5 border-b border-hairline bg-space-void/90 backdrop-blur-md flex items-center gap-1.5 sm:gap-3 shrink-0 z-10 select-none overflow-hidden">
        {/* 左侧：智能面包屑导航（移动端保留"上一级"，桌面端显示完整路径） */}
        <div className="flex items-center gap-1 flex-none sm:flex-1 min-w-0 overflow-hidden py-0">
          {selectedFolderPath && (
            <button
              onClick={handleGoBack}
              aria-label={tr('返回上一级目录')}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'move';
                if (dragOverBreadcrumb !== 'parent') setDragOverBreadcrumb('parent');
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (dragOverBreadcrumb === 'parent') setDragOverBreadcrumb(null);
              }}
              onDrop={handleDropOnParent}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg border transition text-xs cursor-pointer shrink-0 ${
                dragOverBreadcrumb === 'parent'
                  ? 'bg-cyan-950 text-cyan-300 border-cyan-400 ring-2 ring-cyan-400/80 shadow-[0_0_15px_rgba(34,211,238,0.4)] scale-105'
                  : 'bg-space-surface hover:bg-white/[0.06] text-zinc-300 hover:text-white border-hairline'
              }`}
              title={dragOverBreadcrumb === 'parent' ? '松开移至上一级目录' : '返回上一级目录（支持拖动视频至此）'}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{dragOverBreadcrumb === 'parent' ? '移至上一级' : '上一级'}</span>
            </button>
          )}

          {/* 媒体库全部根节点（保证 Playwright 选择器 text=媒体库全部 100% 匹配） */}
          <button
            data-testid="breadcrumb-root"
            onClick={() => {
              setSelectedFolderPath('');
              // 面包屑回到全库时同时清掉工作流筛选，否则标题说「全部」、内容却还是「有留言」的子集
              setSelectedCategory(null);
              setSelectedTag(null);
              setActivePanel(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = 'move';
              if (dragOverBreadcrumb !== 'root') setDragOverBreadcrumb('root');
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (dragOverBreadcrumb === 'root') setDragOverBreadcrumb(null);
            }}
            onDrop={handleDropOnRoot}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition text-xs cursor-pointer shrink-0 ${
              dragOverBreadcrumb === 'root'
                ? 'bg-cyan-950 text-cyan-300 border border-cyan-400 ring-2 ring-cyan-400/80 shadow-[0_0_15px_rgba(34,211,238,0.4)] scale-105 font-semibold'
                : !selectedFolderPath
                ? 'text-white font-semibold bg-white/[0.06] border border-hairline'
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
            }`}
            title={dragOverBreadcrumb === 'root' ? '松开移回媒体库全部根目录' : '媒体库全部（支持拖动视频至此）'}
          >
            <Home className="w-3.5 h-3.5 text-zinc-400" />
            <span className="hidden sm:inline">{dragOverBreadcrumb === 'root' ? '移至全部' : '媒体库全部'}</span>
          </button>

          {/* 当前工作流筛选名：URL 带 category/panel 时明确提示正在看子集 */}
          {filterLabel && (
            <>
              <ChevronRight className="w-3 h-3 text-zinc-600 shrink-0" />
              <span
                data-testid="breadcrumb-filter"
                className="px-2 py-0.5 rounded text-xs text-cyan-300 font-semibold bg-cyan-950/40 border border-cyan-500/20 shrink-0"
                title={tr('当前筛选视图（点击「媒体库全部」可清除）')}
              >
                {filterLabel}
              </span>
            </>
          )}

          {/* 层级分段 */}
          {breadcrumbVisible.map((seg, idx) => {
            const isLast = idx === breadcrumbVisible.length - 1;
            if (seg.hidden) {
              return (
                <React.Fragment key="breadcrumb-ellipsis">
                  <ChevronRight className="w-3 h-3 text-zinc-600 shrink-0" />
                  <span
                    className="hidden sm:inline-flex px-1.5 py-0.5 rounded text-xs text-zinc-500 shrink-0 cursor-default"
                    title={`中间层级：${seg.hidden.map((s) => s.name).join(" / ")}`}
                  >
                    …
                  </span>
                </React.Fragment>
              );
            }
            const isTarget = dragOverBreadcrumb === seg.path;
            return (
              <React.Fragment key={seg.path}>
                <ChevronRight className={`w-3 h-3 text-zinc-600 shrink-0 ${isLast ? '' : 'hidden sm:block'}`} />
                <button
                  onClick={() => openFolder(seg.path)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragOverBreadcrumb !== seg.path) setDragOverBreadcrumb(seg.path);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (dragOverBreadcrumb === seg.path) setDragOverBreadcrumb(null);
                  }}
                  onDrop={(e) => handleDropOnSegment(seg.path, seg.name, e)}
                  className={`px-2 py-0.5 rounded transition cursor-pointer truncate max-w-[120px] text-xs shrink-0 ${
                    isTarget
                      ? 'bg-cyan-950 text-cyan-300 border border-cyan-400 ring-2 ring-cyan-400/80 shadow-[0_0_15px_rgba(34,211,238,0.4)] scale-105 font-semibold'
                      : isLast
                      ? 'text-cyan-300 font-semibold bg-cyan-950/40 border border-cyan-500/20'
                      : 'text-zinc-400 hover:text-zinc-200'
                  } ${isLast ? '' : 'hidden sm:inline-block'}`}
                  title={isTarget ? `松开移至「${seg.name}」` : `进入「${seg.name}」`}
                >
                  {isTarget ? `移至 ${seg.name}` : seg.name}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        {selectedFolderPath && (
          <div className="relative shrink-0" ref={groupSwitcherRef}>
            <button
              type="button"
              data-testid="group-switcher"
              aria-expanded={groupSwitcherOpen}
              onClick={() => {
                const rect = groupSwitcherRef.current?.getBoundingClientRect();
                if (rect) setGroupSwitcherRect({ left: rect.left, top: rect.bottom + 6 });
                setGroupSwitcherOpen((open) => !open);
              }}
              className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] transition ${
                groupSwitcherOpen
                  ? 'border-cyan-500/40 bg-cyan-950/40 text-cyan-200'
                  : 'border-white/10 bg-white/[0.04] text-zinc-400 hover:text-zinc-100'
              }`}
              title={tr('切换到其它分组')}
            >
              <ChevronsUpDown className="h-3 w-3" />
              <span className="hidden md:inline">{tr('切换分组')}</span>
            </button>
            {groupSwitcherOpen &&
              createPortal(
                <div
                  data-testid="group-switcher-panel"
                  style={{
                    position: 'fixed',
                    left: groupSwitcherRect?.left ?? 0,
                    top: groupSwitcherRect?.top ?? 0,
                    width: 262,
                  }}
                  className="z-[120] rounded-xl border border-white/10 bg-zinc-950/95 p-2 shadow-2xl backdrop-blur"
                >
                  <input
                    autoFocus
                    data-testid="group-switcher-search"
                    value={groupSwitcherQuery}
                    onChange={(event) => setGroupSwitcherQuery(event.target.value)}
                    placeholder={tr('搜索分组…')}
                    className="w-full rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-cyan-500/50 focus:outline-none"
                  />
                  <div className="mt-1.5 max-h-[300px] overflow-y-auto">
                    {groupSwitcherItems.length === 0 ? (
                      <div className="px-2 py-3 text-center text-[11px] text-zinc-500">
                        {tr('没有匹配的分组')}
                      </div>
                    ) : (
                      groupSwitcherItems.map((group) => (
                        <button
                          key={group.path}
                          type="button"
                          data-testid="group-switcher-item"
                          onClick={() => {
                            openFolder(group.path);
                            setGroupSwitcherOpen(false);
                            setGroupSwitcherQuery('');
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-zinc-300 transition hover:bg-white/[0.07] hover:text-zinc-100"
                        >
                          <Folder className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                          <span className="truncate">{group.name}</span>
                          <span className="ml-auto shrink-0 font-mono text-[10px] text-zinc-500">
                            {group.count}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>,
                document.body,
              )}
          </div>
        )}

        {/* 中间：搜索胶囊（快捷键提示收进 title，不再占用输入框内部空间） */}
        <div className="relative flex items-center min-w-0 max-w-sm flex-1 group">
          <Search className="w-3.5 h-3.5 absolute left-3 text-zinc-500 pointer-events-none group-focus-within:text-accent-cyan transition-colors" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('gallery.searchPlaceholder')}
            aria-label={t('gallery.searchPlaceholder')}
            title={tr('搜索视频名称 / 标签 / 文件夹（快捷键 Ctrl/⌘ + K）')}
            className="w-full bg-space-surface hover:bg-white/[0.04] border border-hairline focus:border-accent-cyan-border focus:ring-1 focus:ring-accent-cyan/30 rounded-full pl-8 pr-8 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none transition shadow-inner"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                searchInputRef.current?.focus();
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-zinc-400 hover:text-white transition rounded-full hover:bg-white/10 cursor-pointer"
              title={t('gallery.clearSearch')}
              aria-label={t('gallery.clearSearch')}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* 右侧：排序选单 + 批量管理 + 语言切换 + 洞察抽屉开关 */}
        <div className="flex items-center gap-2 shrink-0 text-xs text-zinc-400 whitespace-nowrap">
          {/* 紧凑排序 */}
          <div className="hidden md:flex items-center gap-1 bg-space-surface border border-hairline rounded-full px-2 py-1 text-xs">
            <ArrowUpDown className="w-3 h-3 text-zinc-500" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent border-0 text-xs text-zinc-300 focus:outline-none cursor-pointer pr-1"
            >
              <option value="date" className="bg-space-solid text-zinc-200">{t('gallery.sortDate')}</option>
              <option value="name" className="bg-space-solid text-zinc-200">{t('gallery.sortName')}</option>
              <option value="duration" className="bg-space-solid text-zinc-200">{t('gallery.sortDuration')}</option>
              <option value="rating" className="bg-space-solid text-zinc-200">{t('gallery.sortRating')}</option>
            </select>
          </div>

          {/* 展示形态：网格 / 列表（时间轴视图固定网格，那里按日期成组阅读） */}
          {(
            <div
              role="group"
              aria-label={tr('展示形态')}
              className="flex items-center gap-0.5 rounded-full border border-hairline bg-space-surface p-0.5"
            >
              {([
                { key: 'grid' as const, label: tr('网格'), Icon: LayoutGrid },
                { key: 'list' as const, label: tr('列表'), Icon: List },
              ]).map(({ key, label, Icon }) => (
                <button
                  key={key}
                  type="button"
                  data-testid={`view-mode-${key}`}
                  aria-pressed={viewMode === key}
                  onClick={() => setViewMode(key)}
                  title={key === 'grid' ? tr('网格展示（缩略图）') : tr('列表展示（名称 / 日期 / 分组 / 标签）')}
                  className={`flex items-center gap-1 rounded-full px-2 py-1 text-[11px] transition ${
                    viewMode === key
                      ? 'bg-zinc-100 text-zinc-900 font-medium'
                      : 'text-zinc-400 hover:text-zinc-100'
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>
          )}

          {/* 多选入口：以前只能 hover 卡片左上角的小方块进批量，几乎没人找得到 */}
          {!isBatchMode && (
            <button
              type="button"
              data-testid="enter-batch-mode"
              onClick={() => setIsBatchMode(true)}
              className="flex items-center gap-1.5 rounded-full border border-hairline bg-space-surface px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-cyan-500/40 hover:bg-cyan-950/40 hover:text-cyan-300 cursor-pointer"
              title={tr('多选：批量分组 / 打标签 / 移动')}
              aria-label={tr('进入多选模式')}
            >
              <CheckSquare className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{tr('多选')}</span>
            </button>
          )}

          {/* 标签筛选：从整条横栏改为弹出面板，省掉一整个横向 chrome 带 */}
          <button
            type="button"
            ref={filterButtonRef}
            data-testid="tag-filter-toggle"
            onClick={() => {
              const rect = filterButtonRef.current?.getBoundingClientRect();
              setFilterPanelPos(
                rect
                  ? {
                      left: Math.max(12, Math.min(rect.left - 300, window.innerWidth - 452)),
                      top: rect.bottom + 8,
                    }
                  : null,
              );
              setShowTagFilter((prev) => !prev);
            }}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
              tagFilter.includeSet.size + tagFilter.excludeSet.size > 0
                ? 'border-cyan-400/50 bg-cyan-950/60 text-cyan-300'
                : 'border-hairline bg-space-surface text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]'
            }`}
            title={tr('标签筛选（可多选包含 / 排除）')}
            aria-label={tr('标签筛选')}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{tr('筛选')}</span>
            {tagFilter.includeSet.size + tagFilter.excludeSet.size > 0 && (
              <span className="rounded-full bg-cyan-500 px-1.5 font-mono text-[10px] font-semibold text-zinc-950">
                {tagFilter.includeSet.size + tagFilter.excludeSet.size}
              </span>
            )}
          </button>

          {/* 日期维度：时间轴抽屉（组卡片不带日期，偶尔要「只看某一天拍的」） */}
          <button
            type="button"
            data-testid="date-drawer-toggle"
            onClick={() => setIsDateDrawerOpen((open) => !open)}
            aria-expanded={isDateDrawerOpen}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
              selectedDay
                ? 'border-cyan-400/50 bg-cyan-950/60 text-cyan-300'
                : 'border-hairline bg-space-surface text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]'
            }`}
            title={tr('按修改日期筛选')}
            aria-label={tr('按修改日期筛选')}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            <span className="hidden sm:inline" data-testid="date-filter-label">
              {selectedDay ? tr(dayLabelOf(selectedDay)) : tr('日期')}
            </span>
            {selectedDay && (
              <span
                data-testid="date-filter-clear"
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedDay(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.stopPropagation();
                    event.preventDefault();
                    setSelectedDay(null);
                  }
                }}
                className="rounded-full p-0.5 text-cyan-300/70 transition hover:bg-white/10 hover:text-cyan-200"
                title={tr('清除日期筛选')}
              >
                <X className="h-3 w-3" />
              </span>
            )}
          </button>

          {/* 留言筛选与批量管理已收进筛选面板 / 卡片勾选框，顶栏只留排序与筛选 */}
        </div>
      </header>

      {/* 激活中的筛选条件：只用一行小胶囊，替代整条标签栏 */}
      {tagFilter.includeSet.size + tagFilter.excludeSet.size > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto border-b border-white/[0.06] bg-zinc-950/60 px-6 py-2 no-scrollbar">
          <span className="shrink-0 text-[10px] font-mono uppercase tracking-wider text-zinc-500">{tr('已筛选')}</span>
          {[...tagFilter.includeSet].map((tag) => (
            <button
              key={`inc-${tag}`}
              type="button"
              onClick={() => toggleTagInclude(tag)}
              title={`${tr('点击取消该包含条件')} · ${tag}`}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-cyan-500/40 bg-cyan-950/50 px-2 py-0.5 text-[11px] text-cyan-300 transition hover:bg-cyan-900/60"
            >
              <span>{tagDisplayName(tag)}</span>
              <X className="h-3 w-3" />
            </button>
          ))}
          {[...tagFilter.excludeSet].map((tag) => (
            <button
              key={`exc-${tag}`}
              type="button"
              onClick={() => toggleTagExclude(tag)}
              title={`${tr('点击取消该排除条件')} · ${tag}`}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-rose-500/40 bg-rose-950/40 px-2 py-0.5 text-[11px] text-rose-300 line-through transition hover:bg-rose-900/50"
            >
              <span>{tagDisplayName(tag)}</span>
              <X className="h-3 w-3" />
            </button>
          ))}
          <button
            type="button"
            onClick={clearTagFilter}
            className="ml-1 shrink-0 rounded-full px-2 py-0.5 text-[11px] text-zinc-500 transition hover:bg-white/[0.06] hover:text-white"
          >
            清除全部
          </button>
        </div>
      )}

      {/* 扫描状态提示条 */}
      {isScanning && (
        <div className="bg-cyan-950/50 border-b border-cyan-500/20 px-6 py-2.5 flex items-center justify-between text-xs text-cyan-300">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            <span>
              正在分析与生成视频缩略图... [{scanProgress.total}] {scanProgress.currentName}
            </span>
          </div>
        </div>
      )}

      {/* 视频网格主内容区 */}
      <main ref={mainScrollRef} className="flex-1 overflow-y-auto p-6 pb-28">
        {videos.length === 0 ? (
          /* ─── 首页空状态：极简引导（只保留一句话 + 三个入口） ─── */
          <div className="flex min-h-full flex-col items-center justify-center gap-5 px-4 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-zinc-900 text-cyan-300">
              <Upload className="h-5 w-5" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-lg font-semibold text-white">{tr('还没有视频')}</h2>
              <p className="mx-auto max-w-sm text-sm leading-relaxed text-zinc-500">
                {tr('一次选中多个视频（或整堂课录像），自动归入同一个分组；视频留在本机磁盘，标签与留言保存在本机服务端。')}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => onImportFiles && fileInputRef.current?.click()}
                className="flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3.5 py-2 text-xs font-medium text-white transition hover:bg-cyan-500"
              >
                <Upload className="h-3.5 w-3.5" />
                {tr('选择视频文件')}
              </button>
              <button
                type="button"
                onClick={onOpenDirectory}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-900 px-3.5 py-2 text-xs font-medium text-zinc-300 transition hover:border-cyan-400/40 hover:text-white"
              >
                <FolderOpen className="h-3.5 w-3.5 text-amber-400/80" />
                {tr('挂载本地视频目录')}
              </button>
              <button
                type="button"
                onClick={onLoadDemoVideos}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-900 px-3.5 py-2 text-xs font-medium text-zinc-300 transition hover:border-cyan-400/40 hover:text-white"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                {tr('载入演示')}
              </button>
            </div>

            <p className="text-[11px] text-zinc-600">{tr('支持 MP4 · MOV · MKV · WebM')}</p>

            <input
              ref={fileInputRef}
              type="file"
              accept="video/*,.mkv,.mov,.ogg"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) {
                  onImportFiles?.(e.target.files);
                  e.target.value = '';
                }
              }}
            />
          </div>
        ) : filteredVideos.length === 0 &&
          (Boolean(searchQuery) || Boolean(selectedTag) || Boolean(selectedCategory) || tagFilter.includeSet.size > 0 || tagFilter.excludeSet.size > 0) &&
          // 「收藏」页可能一条视频都没收藏、但收藏了组：这时不能掉进空态
          !(selectedCategory === 'starred' && favoriteGroups.length > 0) ? (
          /* ─── 搜索 / 过滤无结果状态 ─── */
          <div className="h-full flex flex-col items-center justify-center text-center p-8">
            <div className="p-4 rounded-2xl bg-zinc-900/80 border border-white/[0.06] mb-4 text-zinc-500 shadow-xl">
              <Film className="w-12 h-12 stroke-[1.5]" />
            </div>
            <h3 className="text-base font-semibold text-zinc-300 mb-1">
              {selectedCategory === 'continue' && !searchQuery && !selectedTag
                ? '没有未看完的视频'
                : '没有找到符合条件的视频'}
            </h3>
            <p className="text-xs text-zinc-500 max-w-md mb-6 leading-relaxed">
              {selectedCategory === 'continue' && !searchQuery && !selectedTag
                ? '看过的视频看到 5 秒以上、还没看完，就会出现在这里，方便你下次接着练。'
                : '当前搜索关键词或标签/文件夹过滤条件未匹配到任何视频文件。'}
            </p>
            <button
              type="button"
              onClick={handleResetFilters}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium text-xs border border-white/10 transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
              <span>{selectedCategory === 'continue' ? '查看全部视频' : tr('重置所有过滤条件')}</span>
            </button>
          </div>
        ) : (
          /* ─── 媒体工作区：根目录概览 / 文件夹 / 视频；子目录显示局部内容 ─── */
          <div className="space-y-6">
            {/* 当前目录计数口径说明：本层直接 vs 含子文件夹（避免数量对不上） */}
            {selectedFolderPath && (
              <div
                data-testid="folder-count-summary"
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] text-zinc-500"
              >
                <span className="flex items-center gap-1.5 font-medium text-zinc-200">
                  <FolderOpen className="h-3.5 w-3.5 text-amber-400/80" />
                  {currentNode.name || selectedFolderPath}
                </span>
                <span>
                  本层直接 <b className="font-mono text-zinc-300">{currentNode.directCount}</b> 个视频
                </span>
                <span>·</span>
                <span>
                  含子文件夹共 <b className="font-mono text-zinc-300">{currentNode.videoCount}</b> 个
                </span>
              </div>
            )}

            {!selectedFolderPath && (
              <section className="space-y-3 border-b border-white/[0.06] pb-4">
                {/* 首页只留一条分类轴（按日期）；其余筛选需求交给标签，排成一行可点的 chip */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 flex items-center gap-1.5 text-[11px] font-medium text-zinc-500">
                    <Tag className="h-3.5 w-3.5" />
                    {tr('标签筛选')}
                  </span>
                  {topTags.length === 0 && (
                    <span className="text-[11px] text-zinc-600">{tr('还没有标签。导入时或标签库里可以加。')}</span>
                  )}
                  {topTags.map(({ tag, count }) => {
                    const active = tagFilter.includeSet.has(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        data-testid="home-tag-chip"
                        data-tag={tag}
                        aria-pressed={active}
                        onClick={() => toggleTagInclude(tag)}
                        title={`#${tagDisplayName(tag)} · ${count}`}
                        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition ${
                          active
                            ? 'border-cyan-400/60 bg-cyan-500/15 font-medium text-cyan-200'
                            : 'border-white/10 bg-zinc-900/70 text-zinc-300 hover:border-white/25 hover:bg-zinc-800/80 hover:text-white'
                        }`}
                      >
                        <span className="max-w-[12rem] truncate">#{tagDisplayName(tag)}</span>
                        <span className="font-mono text-[10px] text-zinc-500">{count}</span>
                      </button>
                    );
                  })}
                  {tagFilter.includeSet.size + tagFilter.excludeSet.size > 0 && (
                    <button
                      type="button"
                      data-testid="home-tag-clear"
                      onClick={() => clearTagFilter()}
                      className="flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-zinc-400 transition hover:border-white/25 hover:text-white"
                    >
                      <X className="h-3 w-3" />
                      <span>{tr('清除')}</span>
                    </button>
                  )}
                  <label
                    data-testid="home-import-group"
                    className="flex cursor-pointer items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-zinc-400 transition hover:border-white/25 hover:text-white"
                    title={tr('导入一组视频，自动成为一个分组')}
                  >
                    <Upload className="h-3 w-3" />
                    <span>{tr('导入一组')}</span>
                    <input
                      ref={headerFileInputRef}
                      type="file"
                      accept="video/*,.mkv,.mov,.ogg"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files) {
                          onImportFiles?.(e.target.files);
                          e.target.value = '';
                        }
                      }}
                    />
                  </label>
                </div>
              </section>
            )}

            {/* 同曲目聚合与一键 VS 对比横幅 (Milestone M2) */}
            {selectedTag?.startsWith('🎵 ') && (
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-gradient-to-r from-purple-950/70 via-zinc-900 to-cyan-950/70 border border-purple-500/40 text-xs shadow-lg shadow-purple-950/20">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-purple-600/30 border border-purple-500/40 text-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.3)]">
                    <Music2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-white">
                        舞曲档案: {selectedTag.replace('🎵 ', '')}
                      </h4>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-500/30">
                        {displayVideos.length} 个视频
                      </span>
                    </div>
                    <p className="text-zinc-400 text-[11px] mt-0.5">
                      同一首舞曲下的多版本/多机位练习档案。支持一键调出双轨左右同屏对比（VS 对比）。
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {displayVideos.length >= 2 && (
                    <button
                      onClick={() => setComparePair([displayVideos[0], displayVideos[1]])}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-white font-medium text-xs shadow-lg shadow-purple-600/30 transition cursor-pointer"
                      title={tr('将本曲目前两个视频载入左右双屏对比')}
                    >
                      <Sliders className="w-3.5 h-3.5 text-cyan-200" />
                      <span>{tr('👯 左右同屏对比 (VS)')}</span>
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedTag(null)}
                    className="px-2.5 py-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition text-xs cursor-pointer"
                  >
                    退出曲目
                  </button>
                </div>
              </div>
            )}

            {/* 子文件夹大卡片网格（支持拖拽视频直接移入） */}
            {selectedFolderPath && subfolders.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 font-mono">
                    <FolderOpen className="w-4 h-4 text-amber-400" />
                    <span>子文件夹 · Folders ({subfolders.length})</span>
                  </div>
                  <span className="text-[11px] text-zinc-500">{tr('点击进入 · 拖放整理')}</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {subfolders.map((folder) => {
                    const isTarget = dragOverFolderId === folder.fullPath;
                    return (
                      <div
                        key={folder.fullPath}
                        data-testid="folder-card"
                        data-folder-path={folder.fullPath}
                        data-count={folder.videoCount}
                        onClick={() => openFolder(folder.fullPath)}
                        onDoubleClick={() => openFolder(folder.fullPath)}
                        onDragOver={(e) => {
                          const types = Array.from(e.dataTransfer.types || []);
                          if (
                            types.some(
                              (t) =>
                                t.includes('dance-echo-video') ||
                                t.includes('dance-video') ||
                                t.includes('text/plain')
                            )
                          ) {
                            e.preventDefault();
                            e.stopPropagation();
                            e.dataTransfer.dropEffect = 'move';
                            if (dragOverFolderId !== folder.fullPath) {
                              setDragOverFolderId(folder.fullPath);
                            }
                          }
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (dragOverFolderId === folder.fullPath) {
                            setDragOverFolderId(null);
                          }
                        }}
                        onDrop={(e) => handleDropOnFolder(folder.fullPath, folder.name, e)}
                        className={`group relative p-4 rounded-2xl transition-all duration-200 cursor-pointer flex flex-col justify-between aspect-[16/11] ${
                          isTarget
                            ? 'bg-cyan-950/90 border-2 border-cyan-400 scale-[1.05] shadow-[0_0_35px_rgba(34,211,238,0.5)] ring-2 ring-cyan-400/80 z-20'
                            : 'bg-zinc-900/70 hover:bg-zinc-800/80 border border-white/[0.06] hover:border-cyan-500/40 shadow-lg hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]'
                        }`}
                        title={`文件夹：${folder.name}（支持将视频拖入此处）`}
                      >
                        {isTarget ? (
                          <div className="absolute inset-0 rounded-2xl bg-cyan-950/95 backdrop-blur-md flex flex-col items-center justify-center p-3 text-center border-2 border-dashed border-cyan-400 animate-in fade-in zoom-in-95 duration-150 z-30">
                            <FolderInput className="w-8 h-8 text-cyan-300 animate-bounce mb-1" />
                            <span className="text-xs font-bold text-white tracking-wide">
                              松开移入「{folder.name}」
                            </span>
                            <span className="text-[10px] text-cyan-300/80 font-mono mt-0.5">
                              放置视频至此文件夹
                            </span>
                          </div>
                        ) : null}

                        <div className="relative aspect-video overflow-hidden rounded-xl border border-amber-500/30 bg-zinc-950/80 shadow-[0_0_12px_rgba(245,158,11,0.15)]">
                          {folderCoverVideos.get(folder.fullPath)?.thumbnailUrl ? (
                            <img
                              src={folderCoverVideos.get(folder.fullPath)?.thumbnailUrl}
                              alt=""
                              className="h-full w-full object-cover opacity-80 transition group-hover:scale-105 group-hover:opacity-100"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-amber-400">
                              <Folder className="h-8 w-8 fill-current" />
                            </div>
                          )}
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 group-hover:bg-cyan-950 text-zinc-400 group-hover:text-cyan-300 border border-white/5 group-hover:border-cyan-500/30 transition-colors">
                            {folder.videoCount} 视频
                          </span>
                        </div>

                        <div className="mt-3">
                          <h4 className="text-sm font-semibold text-zinc-200 group-hover:text-cyan-300 truncate transition-colors">
                            {folder.name}
                          </h4>
                          <p className="text-[10px] text-zinc-500 group-hover:text-zinc-400 transition-colors mt-0.5 flex items-center gap-1">
                            <span>{tr('打开目录')}</span>
                            <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 视频网格：根目录只列"未分组"视频（分组内容进卡片看）；搜索/过滤时回退成全库结果；文件夹内列本层视频 */}
            {selectedFolderPath ? (
              <div>
                {displayVideos.length > 0 ? (
                  viewMode === 'list' ? (
                    <VirtualVideoList videos={displayVideos} scrollRef={mainScrollRef} showGroup={false} sortBy={sortBy} onSortChange={setSortBy} />
                  ) : (
                    <VirtualVideoGrid videos={displayVideos} columns={columns} scrollRef={mainScrollRef} showGroup={false} />
                  )
                ) : subfolders.length > 0 ? (
                  <div className="p-8 text-center rounded-2xl bg-zinc-900/30 border border-white/5 text-zinc-500 text-xs">
                    此目录下暂无直接视频文件，请点击上方子文件夹浏览
                  </div>
                ) : (
                  <div
                    data-testid="folder-empty-hint"
                    className="p-8 text-center rounded-2xl bg-zinc-900/30 border border-white/5 text-zinc-500 text-xs leading-relaxed"
                  >
                    此文件夹还没有视频。可以把视频卡片拖到左侧文件夹，或用「批量移动」整理进来。
                  </div>
                )}
              </div>
            ) : hasTextQuery ? (
              <div>
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-zinc-200">
                  <Film className="h-3.5 w-3.5 text-cyan-400/80" />
                  搜索结果
                  <span className="font-mono text-[10px] font-normal text-zinc-500">{displayVideos.length}</span>
                </div>
                {viewMode === 'list' ? (
                  <VirtualVideoList videos={displayVideos} scrollRef={mainScrollRef} sortBy={sortBy} onSortChange={setSortBy} />
                ) : (
                  <VirtualVideoGrid videos={displayVideos} columns={columns} scrollRef={mainScrollRef} />
                )}
              </div>
            ) : homeGroups.length > 0 || ungroupedVideos.length > 0 || (selectedCategory === 'starred' && favoriteGroups.length > 0) ? (
              <div>
            {selectedCategory === 'starred' && !selectedFolderPath && favoriteGroups.length > 0 && (
              <div className="mb-5" data-testid="favorite-groups">
                <div className="flex flex-wrap gap-3">
                  {favoriteGroups.map((group) => {
                    const cover = group.cover?.thumbnailUrl
                      || (group.cover?.serverId ? videoThumbUrl(group.cover.serverId) : undefined);
                    return (
                      <button
                        key={group.path}
                        type="button"
                        data-testid="favorite-group-card"
                        data-folder-path={group.path}
                        onClick={() => openFolder(group.path)}
                        className="group w-[168px] shrink-0 text-left"
                      >
                        <div className="relative aspect-video overflow-hidden rounded-xl border border-amber-500/25 bg-zinc-950">
                          {cover ? (
                            <img src={cover} alt="" className="h-full w-full object-cover opacity-85 transition group-hover:opacity-100" />
                          ) : (
                            <div className="flex h-full items-center justify-center text-amber-400/70">
                              <Folder className="h-7 w-7 fill-current" />
                            </div>
                          )}
                          <span className="absolute bottom-2 right-2 text-amber-300">
                            <Star className="h-3.5 w-3.5 fill-current" />
                          </span>
                        </div>
                        <div className="mt-1.5 truncate text-xs text-zinc-300 group-hover:text-cyan-300">
                          {group.name}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

                {homeGroups.length > 0 && (
                  <GroupCardGrid
                    groups={homeGroups}
                    columns={columns}
                    scrollRef={mainScrollRef}
                    favorites={folderFavorites}
                    onOpen={openFolder}
                    onToggleFavorite={toggleFolderFavorite}
                    isBatchMode={isBatchMode}
                    selectedPaths={selectedFolderPaths}
                    onToggleSelect={toggleSelectedFolder}
                    onDropVideos={(path, ids) => {
                      const group = homeGroups.find((item) => item.path === path);
                      void moveIdsToFolder(path, group?.name ?? path, ids);
                    }}
                    onRename={(path, name) => {
                      void renameFolder(path, name).then((ok) => {
                        showToast(ok ? tr('已改名为「{name}」', { name }) : tr('改名失败，可能有同名分组'));
                      });
                    }}
                    onDelete={(path, name) => {
                      const count = homeGroups.find((item) => item.path === path)?.count ?? 0;
                      setDeleteFolderTarget({ paths: [path], label: name, videoCount: count });
                    }}
                  />
                )}
                {ungroupedVideos.length > 0 && (
                  <div className={homeGroups.length > 0 ? 'mt-6' : ''}>
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-zinc-200">
                      <Folder className="h-3.5 w-3.5 text-zinc-500" />
                      {tr('未分组')}
                      <span className="font-mono text-[10px] font-normal text-zinc-500">{ungroupedVideos.length}</span>
                    </div>
                    {viewMode === 'list' ? (
                      <VirtualVideoList
                        videos={ungroupedVideos}
                        scrollRef={mainScrollRef}
                        showGroup={false}
                        sortBy={sortBy}
                        onSortChange={setSortBy}
                      />
                    ) : (
                      <VirtualVideoGrid
                        videos={ungroupedVideos}
                        columns={columns}
                        scrollRef={mainScrollRef}
                        showGroup={false}
                      />
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/[0.08] bg-zinc-900/20 p-8 text-center text-xs text-zinc-500">
                {tr('这里还没有视频。导入视频，或用「导入一组」建一个分组。')}
              </div>
            )}
          </div>
        )}
        {/* 日期抽屉：只在首页出现，选一天就只看那天拍的组 */}
        {isDateDrawerOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onMouseDown={() => setIsDateDrawerOpen(false)}
          >
            <aside
              data-testid="date-drawer"
              className="absolute right-0 top-0 flex h-full w-[352px] max-w-[92vw] flex-col border-l border-white/10 bg-zinc-950 shadow-2xl"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <span className="text-xs font-semibold text-zinc-200">{tr('练习轨迹')}</span>
                <button
                  type="button"
                  onClick={() => setIsDateDrawerOpen(false)}
                  className="rounded p-1 text-zinc-500 hover:bg-white/10 hover:text-white"
                  aria-label={tr('关闭')}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex flex-1 flex-col overflow-y-auto px-3 py-3">
                <PracticeHeatmap
                  logs={practiceLogs}
                  videoCounts={videoCountsByDate}
                  selectedDate={selectedDateStr}
                  onCellClick={(dateStr) => {
                    const [y, m, d] = dateStr.split('-').map(Number);
                    const dayMs = new Date(y, m - 1, d).getTime();
                    setSelectedDay((prev) => (prev === dayMs ? null : dayMs));
                  }}
                />

                {selectedDay ? (
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/5 pt-2.5">
                    <span className="min-w-0 truncate text-[11px] text-zinc-400">
                      {tr(dayLabelOf(selectedDay))}
                      <span className="ml-1.5 font-mono tabular-nums text-zinc-500">
                        {selectedDayVideos.length} {tr('个视频')}
                      </span>
                    </span>
                    <button
                      type="button"
                      data-testid="date-drawer-clear"
                      onClick={() => setSelectedDay(null)}
                      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-zinc-500 transition hover:bg-white/5 hover:text-zinc-300"
                    >
                      {tr('清除筛选')}
                    </button>
                  </div>
                ) : (
                  <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
                    {tr('点一格，只看那天整理和练过的视频')}
                  </p>
                )}

                <PracticeStatsRail
                  className="mt-auto mb-14"
                  logs={practiceLogs}
                  noteTotal={noteTotal}
                  filmTotal={videos.length}
                  filmSeconds={filmSeconds}
                  months={monthFilmCounts}
                />
              </div>
            </aside>
          </div>
        )}

      </main>

      {/* 仅在 isBatchMode 为 true 时显示多选悬浮控制条（彻底移除顶栏常驻的 已选 0 个 标签） */}
      {isBatchMode && (
        <div className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-full border border-white/10 bg-zinc-900/95 px-4 py-2 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 duration-200">
          <span className="px-2 text-xs font-mono font-semibold text-cyan-300 border-r border-white/10 pr-3">
            {selectedFolderPaths.length > 0
              ? tr('已选 {n} 视频 / {m} 分组', { n: selectedCount, m: selectedFolderPaths.length })
              : tr('已选 {n} 视频', { n: selectedCount })}
          </span>
          <button
            type="button"
            data-testid="batch-select-all"
            onClick={() => {
              const nextVideos = allVisibleSelected ? [] : filteredVideos.map((video) => video.id);
              const nextFolders = allVisibleSelected ? [] : homeGroups.map((group) => group.path);
              selectVideos(nextVideos);
              selectFolders(nextFolders);
            }}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 transition cursor-pointer"
            title={tr('全选当前视图')}
          >
            <CheckSquare className="h-3.5 w-3.5 text-cyan-400" />
            <span>{allVisibleSelected ? '取消全选' : '全选当前'}</span>
          </button>

          {/* 选中 2 个视频时唤起左右同屏对比 (VS) */}
          {selectedCount === 2 && (
            <button
              type="button"
              onClick={() => {
                const selected = videos.filter((v) => selectedVideoIds.includes(v.id));
                if (selected.length === 2) {
                  setComparePair([selected[0], selected[1]]);
                }
              }}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 border border-cyan-400/50 shadow-[0_0_15px_rgba(168,85,247,0.35)] transition cursor-pointer"
              title={tr('将选中的 2 个视频进行左右同屏 VS 扒舞对比')}
            >
              <Sliders className="h-3.5 w-3.5 text-cyan-200" />
              <span>{tr('👯 左右同屏对比 (VS)')}</span>
            </button>
          )}

          {/* 批量移动按钮：唤起 BatchMoveModal */}
          <button
            type="button"
            data-testid="batch-move-open"
            disabled={selectedCount === 0}
            onClick={() => setActiveBatchModal('move')}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-200 bg-zinc-800/90 hover:bg-cyan-950/60 hover:text-cyan-300 border border-white/10 hover:border-cyan-500/40 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer"
            title={tr('批量移动所选视频到文件夹')}
          >
            <Move className="h-3.5 w-3.5 text-cyan-400" />
            <span>{tr('批量移动...')}</span>
          </button>

          {/* 快速分组：不用开弹窗，点选已有分组即可归档；也可以现场新建 */}
          <div className="relative" ref={quickGroupRef}>
            <button
              type="button"
              data-testid="batch-quick-group-open"
              disabled={selectedCount === 0}
              onClick={() => setShowQuickGroup((prev) => !prev)}
              aria-expanded={showQuickGroup}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold border transition cursor-pointer disabled:opacity-40 disabled:pointer-events-none ${
                showQuickGroup
                  ? 'bg-cyan-500 text-zinc-950 border-cyan-400'
                  : 'bg-cyan-950/70 text-cyan-300 border-cyan-500/40 hover:bg-cyan-900/70'
              }`}
              title={tr('把选中的视频快速归入某个分组')}
            >
              <FolderInput className="h-3.5 w-3.5" />
              <span>{tr('快速分组')}</span>
            </button>

            {showQuickGroup && (
              <div
                data-testid="quick-group-panel"
                className="absolute bottom-full left-1/2 z-50 mb-3 w-[min(560px,88vw)] -translate-x-1/2 rounded-2xl border border-white/10 bg-zinc-900/98 p-3 text-left shadow-2xl backdrop-blur-xl"
              >
                <div className="mb-2 flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-xs font-semibold text-white">
                    {tr('把选中的')} <span className="font-mono text-cyan-300">{selectedCount}</span> {tr('个视频归入')}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowQuickGroup(false)}
                    className="rounded-lg p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200 cursor-pointer"
                    title={tr('关闭')}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto pr-1">
                  <button
                    type="button"
                    data-testid="quick-group-target"
                    data-folder-path=""
                    onClick={() => void doQuickMove('')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/5 bg-zinc-800/80 px-2.5 py-1.5 text-[11px] text-zinc-300 transition hover:border-cyan-500/40 hover:bg-cyan-950/70 hover:text-cyan-300 cursor-pointer"
                  >
                    <Folder className="h-3 w-3 text-zinc-400" />
                    <span>{tr('根目录')}</span>
                  </button>
                  {quickGroupTargets.length === 0 && (
                    <span className="px-1 py-1.5 text-[11px] text-zinc-500">
                      {tr('还没有分组，直接在下面新建一个')}
                    </span>
                  )}
                  {quickGroupTargets.map((target) => (
                    <button
                      key={target.path}
                      type="button"
                      data-testid="quick-group-target"
                      data-folder-path={target.path}
                      onClick={() => void doQuickMove(target.path)}
                      className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-white/5 bg-zinc-800/80 px-2.5 py-1.5 text-[11px] text-zinc-300 transition hover:border-cyan-500/40 hover:bg-cyan-950/70 hover:text-cyan-300 cursor-pointer"
                      title={target.path}
                    >
                      <FolderOpen className="h-3 w-3 shrink-0 text-amber-400/80" />
                      <span className="truncate">{target.name}</span>
                      <span className="shrink-0 font-mono text-[10px] text-zinc-500">{target.count}</span>
                    </button>
                  ))}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const name = quickGroupInput.trim();
                    if (name) void doQuickMove(name);
                  }}
                  className="mt-3 flex items-center gap-2 border-t border-white/5 pt-3"
                >
                  <input
                    data-testid="quick-group-input"
                    type="text"
                    value={quickGroupInput}
                    onChange={(e) => setQuickGroupInput(e.target.value)}
                    placeholder={tr('新建分组名（如 Kpop / 2026 联排）')}
                    className="min-w-0 flex-1 rounded-lg border border-white/10 bg-zinc-950/90 px-2.5 py-1.5 text-[11px] text-white placeholder-zinc-500 transition focus:border-cyan-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    data-testid="quick-group-create"
                    disabled={!quickGroupInput.trim()}
                    className="shrink-0 rounded-lg bg-cyan-600 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {tr('新建并归入')}
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* 批量打标签按钮：唤起 BatchTagModal */}
          <button
            type="button"
            disabled={selectedCount === 0}
            onClick={() => setActiveBatchModal('tag')}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-200 bg-zinc-800/90 hover:bg-emerald-950/60 hover:text-emerald-300 border border-white/10 hover:border-emerald-500/40 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer"
            title={tr('批量为所选视频添加标签')}
          >
            <Tags className="h-3.5 w-3.5 text-emerald-400" />
            <span>{tr('批量打标签...')}</span>
          </button>

          {/* 清除标签 */}
          <button
            type="button"
            disabled={selectedCount === 0}
            onClick={() => void clearTagsFromSelected()}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-red-300 hover:bg-red-950/40 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer"
            title={tr('清除所选视频标签')}
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>{tr('清除标签')}</span>
          </button>

          <button
            type="button"
            data-testid="batch-remove-selected"
            disabled={selectedCount === 0}
            onClick={() => setPendingRemoveSelected(true)}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-red-300 hover:bg-red-950/40 disabled:opacity-40 disabled:pointer-events-none transition cursor-pointer"
            title={tr('从媒体库移除所选视频')}
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>{tr('移除所选')}</span>
          </button>

          {selectedFolderPaths.length > 0 && (
            <button
              type="button"
              data-testid="batch-remove-folders"
              onClick={() => {
                const total = homeGroups
                  .filter((group) => selectedFolderPaths.includes(group.path))
                  .reduce((sum, group) => sum + group.count, 0);
                const singleName = selectedFolderPaths.length === 1
                  ? homeGroups.find((group) => group.path === selectedFolderPaths[0])?.name
                  : undefined;
                setDeleteFolderTarget({
                  paths: [...selectedFolderPaths],
                  label: singleName || tr('{n} 个分组', { n: selectedFolderPaths.length }),
                  videoCount: total,
                });
              }}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-rose-300 hover:bg-rose-950/40 border border-rose-500/30 transition cursor-pointer"
              title={tr('移除选中的分组')}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{tr('移除分组')}</span>
            </button>
          )}

          {/* 退出批量模式 */}
          <button
            type="button"
            data-testid="batch-exit"
            onClick={() => setIsBatchMode(false)}
            className="rounded-full p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-white transition cursor-pointer"
            title={tr('退出批量管理')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ─── 批量打标签 Modal (对标 4.0.html pickModal: 上方新建 + 下方芯片点选) ─── */}
      {activeBatchModal === 'tag' && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setActiveBatchModal(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-zinc-900/95 border border-white/10 p-5 shadow-2xl backdrop-blur-xl animate-in zoom-in-95 duration-150 flex flex-col gap-4 text-zinc-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 标题栏 */}
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-950/70 border border-emerald-500/30 text-emerald-400">
                  <Tags className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-semibold text-white">{tr('批量打标签')}</h3>
                <span className="text-[11px] font-mono font-medium text-cyan-300 bg-cyan-950/80 border border-cyan-500/30 px-2 py-0.5 rounded-full">
                  已选 {selectedCount} 个视频
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveBatchModal(null)}
                className="text-zinc-500 hover:text-zinc-200 p-1 rounded-lg hover:bg-zinc-800 transition cursor-pointer"
                title={tr('关闭')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              输入标签名称按回车新建，或直接点选下方已有标签库一键打标：
            </p>

            {/* 输入新建 / 敲回车添加 */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleDoBatchTag(batchTagInput);
              }}
              className="flex items-center gap-2"
            >
              <div className="relative flex-1">
                <Tag className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  ref={batchTagInputRef}
                  type="text"
                  value={batchTagInput}
                  onChange={(e) => setBatchTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setActiveBatchModal(null);
                  }}
                  placeholder={tr('输入标签名称（敲回车快速添加）...')}
                  className="w-full bg-zinc-950/90 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-400 transition"
                />
              </div>
              <button
                type="submit"
                disabled={!batchTagInput.trim()}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white font-medium text-xs transition shadow-lg shadow-cyan-600/30 cursor-pointer flex-shrink-0"
              >
                添加
              </button>
            </form>

            {/* QUICK ADD 标签云 (对标 4.0.html QUICK ADD) */}
            <div>
              <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-2">
                <span>{tr('QUICK ADD · 已有与推荐标签')}</span>
                <span>{allAvailableTags.length} 个可用</span>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pr-1">
                {allAvailableTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => void handleDoBatchTag(tag)}
                    title={tag}
                    className="group/chip inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-zinc-800/80 hover:bg-cyan-950/70 text-zinc-300 hover:text-cyan-300 border border-white/5 hover:border-cyan-500/40 transition cursor-pointer"
                  >
                    <span className="text-zinc-500 group-hover/chip:text-cyan-400 font-mono text-[10px]">+</span>
                    <span>{tagDisplayName(tag)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 弹窗底部操作 */}
            <div className="pt-2 border-t border-white/5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setActiveBatchModal(null)}
                className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition cursor-pointer"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 批量移至文件夹 Modal (对标 4.0.html pickModal: 上方新建 + 下方文件夹点选) ─── */}
      {activeBatchModal === 'move' && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setActiveBatchModal(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-zinc-900/95 border border-white/10 p-5 shadow-2xl backdrop-blur-xl animate-in zoom-in-95 duration-150 flex flex-col gap-4 text-zinc-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 标题栏 */}
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-cyan-950/70 border border-cyan-500/30 text-cyan-400">
                  <Move className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-semibold text-white">{tr('批量移动到文件夹')}</h3>
                <span className="text-[11px] font-mono font-medium text-cyan-300 bg-cyan-950/80 border border-cyan-500/30 px-2 py-0.5 rounded-full">
                  已选 {selectedCount} 个视频
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveBatchModal(null)}
                className="text-zinc-500 hover:text-zinc-200 p-1 rounded-lg hover:bg-zinc-800 transition cursor-pointer"
                title={tr('关闭')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              输入新建目录路径（如 <span className="font-mono text-zinc-300">Kpop/NewJeans</span>），或从下方已有文件夹一键移动：
            </p>

            {/* 输入新建 / 敲回车移动 */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleDoBatchMove(batchMoveInput);
              }}
              className="flex items-center gap-2"
            >
              <div className="relative flex-1">
                <FolderOpen className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  ref={batchMoveInputRef}
                  data-testid="batch-move-input"
                  type="text"
                  value={batchMoveInput}
                  onChange={(e) => setBatchMoveInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setActiveBatchModal(null);
                  }}
                  placeholder={tr('新建或输入目录路径（敲回车移动）...')}
                  className="w-full bg-zinc-950/90 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-400 transition"
                />
              </div>
              <button
                type="submit"
                disabled={!batchMoveInput.trim()}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white font-medium text-xs transition shadow-lg shadow-cyan-600/30 cursor-pointer flex-shrink-0"
              >
                移动
              </button>
            </form>

            {/* QUICK SELECT 文件夹列表 */}
            <div>
              <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-2">
                <span>{tr('QUICK SELECT · 目标文件夹')}</span>
                <span>{folderOptions.length + 1} 个位置</span>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pr-1">
                {/* 移动到根目录 */}
                <button
                  type="button"
                  data-testid="batch-move-target"
                  data-folder-path=""
                  onClick={() => void handleDoBatchMove('')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs bg-zinc-800/80 hover:bg-cyan-950/70 text-zinc-200 hover:text-cyan-300 border border-white/5 hover:border-cyan-500/40 transition cursor-pointer"
                >
                  <Folder className="w-3.5 h-3.5 text-zinc-400" />
                  <span>{tr('根目录 (顶层)')}</span>
                </button>

                {folderOptions.map((fPath) => (
                  <button
                    key={fPath}
                    type="button"
                    data-testid="batch-move-target"
                    data-folder-path={fPath}
                    onClick={() => void handleDoBatchMove(fPath)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs bg-zinc-800/80 hover:bg-cyan-950/70 text-zinc-300 hover:text-cyan-300 border border-white/5 hover:border-cyan-500/40 transition cursor-pointer"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-amber-400/80" />
                    <span>{fPath}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 弹窗底部操作 */}
            <div className="pt-2 border-t border-white/5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setActiveBatchModal(null)}
                className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition cursor-pointer"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ─── 标签筛选弹出面板 ─── */}
      {showTagFilter && filterPanelPos && typeof document !== 'undefined' &&
        createPortal(
          <div
            data-testid="tag-filter-panel"
            className="fixed z-[115] w-[440px] max-h-[65vh] overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950/97 shadow-2xl shadow-black/60 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100"
            style={{ left: filterPanelPos.left, top: filterPanelPos.top }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
              <span className="text-xs font-semibold text-zinc-200">{tr('标签筛选')}</span>
              <button
                type="button"
                onClick={() => setShowTagFilter(false)}
                className="rounded-lg p-1 text-zinc-500 transition hover:bg-white/10 hover:text-white"
                aria-label={tr('关闭筛选')}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {/* 快捷筛选：只看有留言的视频（原顶栏胶囊并入这里） */}
            <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
              <div className="flex items-center gap-1.5 text-xs text-zinc-300">
                <MessageSquare className="h-3.5 w-3.5 text-zinc-500" />
                <span>{tr('只看有留言的视频')}</span>
              </div>
              <button
                type="button"
                data-testid="filter-notes"
                aria-pressed={selectedCategory === 'hasNotes'}
                onClick={() => {
                  setSelectedCategory(selectedCategory === 'hasNotes' ? null : 'hasNotes');
                  setSelectedTag(null);
                }}
                className={`relative h-4 w-7 rounded-full transition ${
                  selectedCategory === 'hasNotes' ? 'bg-zinc-200' : 'bg-zinc-700'
                }`}
                title={tr('只看有留言的视频')}
              >
                <span
                  className={`absolute top-0.5 h-3 w-3 rounded-full bg-zinc-950 transition-all ${
                    selectedCategory === 'hasNotes' ? 'left-3.5' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
            <TagFilterBar variant="panel" />
          </div>,
          document.body,
        )}

      {showCreateGroup && (
        <FolderNameDialog
          open
          title={tr('新建空分组')}
          initialValue=""
          confirmLabel="创建分组"
          hint="分组是虚拟的：之后可以把视频拖进去，或批量移动进来。"
          onSubmit={async (name) => {
            const ok = await createFolder(name);
            if (ok) {
              setShowCreateGroup(false);
  
              showToast(`已创建分组「${name}」，把视频拖进去即可整理`);
            }
          }}
          onCancel={() => setShowCreateGroup(false)}
        />
      )}

      {/* ─── 批量移除确认（替代 window.confirm，移动端同样可用）─── */}
      <ConfirmDialog
        open={pendingRemoveSelected}
        danger
        title={`从媒体库移除选中的 ${selectedCount} 个视频？`}
        message={(
          <div className="space-y-3">
            <p>仅从媒体库移除整理记录，磁盘上的原始视频文件不会被删除。</p>
            <label className="flex cursor-pointer items-start gap-2 text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={pruneTagsOnDelete}
                onChange={(event) => setPruneTagsOnDelete(event.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 accent-cyan-400"
                data-testid="prune-tags-checkbox"
              />
              <span>
                同时清理只被这些视频使用的标签
                <span className="block text-[11px] text-zinc-500">
                  {selectionTagStats.total === 0
                    ? '这些视频还没有标签，标签库不会变化。'
                    : selectionTagStats.orphan.length > 0
                      ? `将清理 ${selectionTagStats.orphan.length} 个标签：${selectionTagStats.orphan.slice(0, 6).join('、')}${selectionTagStats.orphan.length > 6 ? ' 等' : ''}。取消勾选可保留，方便以后给同类视频复用。`
                      : '这些视频的标签仍被其他视频或标签预设使用，删除视频不会影响标签库。'}
                </span>
              </span>
            </label>
          </div>
        )}
        confirmLabel="移除所选"
        onCancel={() => setPendingRemoveSelected(false)}
        onConfirm={() => {
          void deleteVideos(selectedVideoIds, { pruneTags: pruneTagsOnDelete }).then(() => {
            clearSelection();
            setPendingRemoveSelected(false);
            showToast(`已从媒体库移除 ${selectedCount} 个视频`);
          });
        }}
      />

      {/* ─── 移除分组确认（可选：仅删分组 / 连同视频进回收区）─── */}
      <DeleteFolderDialog
        open={Boolean(deleteFolderTarget)}
        folderName={deleteFolderTarget?.label ?? ''}
        videoCount={deleteFolderTarget?.videoCount ?? 0}
        onCancel={() => setDeleteFolderTarget(null)}
        onConfirm={(mode) => {
          const target = deleteFolderTarget;
          if (!target) return;
          setDeleteFolderTarget(null);
          void (async () => {
            for (const path of target.paths) await deleteFolder(path, { videos: mode });
            if (mode === 'trash') {
              showToast(tr('已移除 {n} 个分组，视频已移入回收区', { n: target.paths.length }));
            } else {
              showToast(tr('已移除 {n} 个分组，视频已移到媒体库根目录', { n: target.paths.length }));
            }
          })();
        }}
      />

      {/* ─── 双屏同曲目 VS 左右扒舞对比 Modal (Milestone M2) ─── */}
      {comparePair && (
        <DualVideoCompareModal
          isOpen={true}
          videoA={comparePair[0]}
          videoB={comparePair[1]}
          onClose={() => setComparePair(null)}
        />
      )}
    </div>
  );
};
