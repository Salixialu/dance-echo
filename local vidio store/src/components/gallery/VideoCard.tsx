/**
 * VideoCard.tsx — 视频网格卡片（Agent A 任务清单：卡片微交互与多选收敛）
 * 升级：
 * 1. 仅在 isBatchMode 为 true 时显示勾选框与选中态发光边框
 * 2. 卡片右上角增加 Hover 出现的 ... 快捷浮层（一键设为星标、打标、加入循环队列）
 * 3. 保持 Hover Scrubbing 时间轴滑动微预览 + Dark Studio 视觉规范（DESIGN.md）
 */
import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Play, Clock, Star, Tag, Check, MoreHorizontal, Repeat, X, Trash2, Folder, FolderOpen, Heart } from 'lucide-react';
import { useI18n } from '../../i18n';
import type { VideoItem } from '../../types';
import { useVideoStore } from '../../store/useVideoStore';
import { calculateScrubbingTime } from '../../services/storage/tagConfig';
import { tagDisplayName } from '../../utils/tagDisplay';
import { isFavorite, nextFavoriteRating } from '../../utils/favorites';
import { displayFileName, displayTitle } from '../../utils/displayTitle';
import { resolveVideoStreamUrl, videoThumbUrl } from '../../services/api/serverUrl';
import { requestThumbBackfill } from '../../services/thumbBackfill';

const DEFAULT_PRESET_TAGS = [
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

interface VideoCardProps {
  video: VideoItem;
  /** 已经在某个分组内部时，分组名对每张卡都一样，没必要重复显示。 */
  showGroup?: boolean;
}

/** 卡片元信息行的日期标签：当年 `M-DD`，跨年 `YYYY/M`，够短又不丢信息。 */
function cardDateLabel(ms?: number): string {
  if (!ms || !Number.isFinite(ms)) return '';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  const month = d.getMonth() + 1;
  if (d.getFullYear() !== new Date().getFullYear()) return `${d.getFullYear()}/${month}`;
  return `${month}-${String(d.getDate()).padStart(2, '0')}`;
}

const VideoCardBase: React.FC<VideoCardProps> = ({ video, showGroup = true }) => {
  const { t, tr } = useI18n();
  const videos = useVideoStore((s) => s.videos);
  const folders = useVideoStore((s) => s.folders);
  const isBatchMode = useVideoStore((s) => s.isBatchMode);
  const isSelected = useVideoStore((s) => s.selectedVideoIds.includes(video.id));
  const isQueued = useVideoStore((s) => s.loopQueue.includes(video.id));
  const {
    setCurrentVideo,
    updateRating,
    addTag,
    removeTag,
    toggleSelectedVideo,
    setIsBatchMode,
    toggleLoopQueue,
    deleteVideo,
    moveVideoToFolder,
    showToast,
  } = useVideoStore.getState();
  // 分组归属由虚拟路径的目录部分表示（与 store 的 extractVideoDir 同口径）
  const currentFolder = (() => {
    const p = video.path || '';
    const idx = p.lastIndexOf('/');
    return idx > 0 ? p.slice(0, idx) : '';
  })();

  // ─── 快捷浮层与打标状态 ───────────────────────────────────────────────────
  const [showMenu, setShowMenu] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [hoverRating, setHoverRating] = useState(0);
  const [menuView, setMenuView] = useState<'root' | 'move'>('root');
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  /** 右键弹出的坐标；有值时菜单贴着鼠标走，没有则贴 ⋯ 按钮 */
  const [contextPos, setContextPos] = useState<{ x: number; y: number } | null>(null);
  const [customTag, setCustomTag] = useState('');
  const [tagPopoverPosition, setTagPopoverPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const menuContainerRef = useRef<HTMLDivElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);

  // 汇聚媒体库已有标签与常用预设，按使用频率优先排序
  const popularTags = useMemo(() => {
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
    const set = new Set([...libraryTagsSorted, ...DEFAULT_PRESET_TAGS]);
    return Array.from(set).slice(0, 14);
  }, [videos]);

  // 打开快捷打标浮层时自动聚焦输入框
  useEffect(() => {
    if (showTagModal) {
      const timer = window.setTimeout(() => tagInputRef.current?.focus(), 60);
      return () => clearTimeout(timer);
    }
  }, [showTagModal]);

  useEffect(() => {
    if (!showTagModal) {
      setTagPopoverPosition(null);
      return;
    }

    const updatePosition = () => {
      const anchor = containerRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const width = Math.min(288, window.innerWidth - 16);
      const left = Math.max(8, Math.min(anchor.right - width, window.innerWidth - width - 8));
      const maxTop = Math.max(8, window.innerHeight - Math.min(400, window.innerHeight - 16) - 8);
      const top = Math.max(8, Math.min(anchor.top + 8, maxTop));
      setTagPopoverPosition({ top, left, width });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [showTagModal]);

  const handleAddCustomTag = (tagToAdd?: string) => {
    const t = (tagToAdd !== undefined ? tagToAdd : customTag).trim();
    if (!t) return;
    if (!video.tags?.includes(t)) {
      void addTag(video.id, t);
    }
    setCustomTag('');
  };

  const handleToggleTag = (tag: string) => {
    if (video.tags?.includes(tag)) {
      void removeTag(video.id, tag);
    } else {
      void addTag(video.id, tag);
    }
  };

  // 快捷菜单用 fixed 定位挂在 body 上：跟着 ⋯ 按钮走，不被卡片裁切
  useEffect(() => {
    if (!showMenu) {
      setMenuPos(null);
      return;
    }
    if (contextPos) {
      setMenuPos({
        top: Math.min(contextPos.y, Math.max(8, window.innerHeight - 240)),
        left: Math.max(8, Math.min(contextPos.x, window.innerWidth - 200)),
      });
      return;
    }
    const anchor = menuContainerRef.current?.getBoundingClientRect();
    if (!anchor) return;
    setMenuPos({
      top: Math.min(anchor.bottom + 6, window.innerHeight - 220),
      left: Math.max(8, anchor.right - 176),
    });
  }, [showMenu, contextPos]);

  // 点击空白处关闭浮层
  useEffect(() => {
    if (!showMenu && !showTagModal) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        menuContainerRef.current &&
        !menuContainerRef.current.contains(target) &&
        !target.closest('[data-quick-tag-popover]') &&
        !target.closest('[data-card-menu]')
      ) {
        setShowMenu(false);
        setShowTagModal(false);
        setContextPos(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu, showTagModal]);

  const handleToggleQueue = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleLoopQueue(video.id);
    setShowMenu(false);
  };

  const handleDeleteVideo = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`从媒体库移除“${video.name}”？原始本地文件不会被删除。`)) {
      void deleteVideo(video.id);
      setShowMenu(false);
    }
  };

  const handleMoveTo = async (folderPath: string) => {
    if (currentFolder === folderPath) {
      setShowMenu(false);
      setMenuView('root');
      return;
    }
    await moveVideoToFolder(video.id, folderPath);
    showToast(
      folderPath
        ? `已移动到「${folderPath}」`
        : '已移回媒体库根目录'
    );
    setShowMenu(false);
    setMenuView('root');
  };

  // ─── 拖拽状态 ─────────────────────────────────────────────────────────────
  const [isDragging, setIsDragging] = useState(false);

  // ─── Hover Scrubbing 状态 ─────────────────────────────────────────────────
  const [isHovering, setIsHovering] = useState(false);
  const [scrubPercent, setScrubPercent] = useState<number>(0);
  const [scrubTime, setScrubTime] = useState<number>(0);
  const [scrubbingUrl, setScrubbingUrl] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scrubTimerRef = useRef<number | null>(null);

  // 懒创建离屏 video 元素，使用服务端 Range 流；不依赖 file/handle
  const getOrCreateVideoEl = useCallback((): HTMLVideoElement => {
    if (!videoRef.current) {
      const el = document.createElement('video');
      el.muted = true;
      el.preload = 'metadata';
      el.crossOrigin = 'anonymous';
      el.src = resolveVideoStreamUrl(video);
      videoRef.current = el;
    }
    return videoRef.current;
  }, [video.id, video.serverId]);

  // 鼠标在封面上移动时，根据 X 轴百分比计算抽帧时间点（SNIPPETS.md §3）
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!containerRef.current || !video.duration) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      setScrubPercent(pct);
      const seekTime = calculateScrubbingTime(e.clientX, rect, video.duration);
      setScrubTime(seekTime);

      if (scrubTimerRef.current !== null) {
        clearTimeout(scrubTimerRef.current);
      }
      scrubTimerRef.current = window.setTimeout(() => {
        const el = getOrCreateVideoEl();
        if (!el) return;
        el.currentTime = seekTime;
        const onSeeked = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 320;
          canvas.height = 180;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            // 与卡片一致：竖屏抽帧按 contain 落在 16:9 画布内，两侧留黑，避免被拉扁
            const vw = el.videoWidth || 16;
            const vh = el.videoHeight || 9;
            const scale = Math.min(320 / vw, 180 / vh);
            const dw = vw * scale;
            const dh = vh * scale;
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, 320, 180);
            ctx.drawImage(el, (320 - dw) / 2, (180 - dh) / 2, dw, dh);
            setScrubbingUrl(canvas.toDataURL('image/jpeg', 0.6));
          }
          el.removeEventListener('seeked', onSeeked);
        };
        el.addEventListener('seeked', onSeeked);
      }, 60); // 60ms 防抖
    },
    [video.duration, getOrCreateVideoEl],
  );

  const handleMouseEnter = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    setIsHovering(true);
    if (containerRef.current && video.duration) {
      const rect = containerRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      setScrubPercent(pct);
      const seekTime = calculateScrubbingTime(e.clientX, rect, video.duration);
      setScrubTime(seekTime);
    }
  }, [video.duration]);

  const handleMouseLeave = useCallback(() => {
    setIsHovering(false);
    setScrubbingUrl(null);
    setScrubPercent(0);
    setScrubTime(0);
    if (scrubTimerRef.current !== null) {
      clearTimeout(scrubTimerRef.current);
    }
  }, []);

  // 组件卸载时释放 Blob URL
  useEffect(() => {
    return () => {
      if (videoRef.current?.src.startsWith('blob:')) {
        URL.revokeObjectURL(videoRef.current.src);
      }
      if (scrubTimerRef.current !== null) {
        clearTimeout(scrubTimerRef.current);
      }
    };
  }, []);

  // ─── 格式化工具 ──────────────────────────────────────────────────────────────
  const formatDuration = (secs: number) => {
    if (!secs) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 MB';
    const mb = bytes / (1024 * 1024);
    return mb > 1024 ? (mb / 1024).toFixed(1) + ' GB' : mb.toFixed(1) + ' MB';
  };

  // 总览用统一 16:9 裁切：整齐、信息密度高；完整画面留给播放页
  const coverAspectClass = 'aspect-video';

  // 服务端没装 ffmpeg 时 /thumb 会 404：失败一次后不再重试，改用占位图
  const [thumbBroken, setThumbBroken] = useState(false);
  // 卡片进入视口后由浏览器补一帧封面并回传服务端，避免 1400 张卡一次性抽帧
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [backfillWanted, setBackfillWanted] = useState(false);
  const [backfilledUrl, setBackfilledUrl] = useState<string | null>(null);

  useEffect(() => {
    setThumbBroken(false);
  }, [video.id, video.serverId, video.thumbnailUrl]);

  useEffect(() => {
    if (video.thumbnailUrl || !(video.serverId || video.id)) return;
    const node = cardRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setBackfillWanted(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [video.id, video.serverId, video.thumbnailUrl]);

  useEffect(() => {
    if (!backfillWanted) return;
    const serverId = video.serverId ?? video.id;
    return requestThumbBackfill(serverId, (url) => {
      setBackfilledUrl(url);
      setThumbBroken(false);
    });
  }, [backfillWanted, video.id, video.serverId]);

  // 当前封面图 URL（scrubbing 优先，其次是浏览器补出的封面）
  const displayThumbnail = isHovering && scrubbingUrl
    ? scrubbingUrl
    : (backfilledUrl || video.thumbnailUrl || videoThumbUrl(video.serverId ?? video.id));

  // 元信息行：顶层分组 + 首个标签。上千条 mmexport… 只看文件名根本分不清，
  // 日期/分组/标签这几条才是用户真正在找的索引。
  const cardMeta = useMemo(() => {
    const parts: string[] = [];
    const p = video.path ?? '';
    const slash = p.lastIndexOf('/');
    if (showGroup && slash > 0) {
      const top = p.slice(0, slash).split('/').filter(Boolean)[0];
      if (top && top !== '.') parts.push(top);
    }
    // 舞曲标签（🎵 歌名）只在播放器信息栏里出现，卡片上不再重复显示
    const firstTag = (video.tags ?? []).find((tag) => !tag.startsWith('🎵 '));
    if (firstTag) parts.push(`#${tagDisplayName(firstTag)}`);
    return parts;
  }, [video.path, video.tags, showGroup]);

  // 续播进度条：只在看过一部分时出现，不额外占卡片高度。
  const watchedPct =
    video.playbackPosition && video.duration > 0
      ? Math.min(1, video.playbackPosition / video.duration)
      : 0;

  return (
    // content-visibility: auto 大幅提升海量卡片列表性能（AGENT_B_PROMPT.md §2.3）
    <div
      ref={cardRef}
      data-testid="video-card"
      draggable={!showMenu && !showTagModal}
      onDragStart={(e) => {
        setIsDragging(true);
        const dragIds = isBatchMode && isSelected ? useVideoStore.getState().selectedVideoIds : [video.id];
        const encodedIds = dragIds.join(',');
        e.dataTransfer.setData('text/plain', encodedIds);
        e.dataTransfer.setData('application/dance-echo-video-id', encodedIds);
        e.dataTransfer.setData('application/dance-echo-video-ids', encodedIds);
        e.dataTransfer.setData('application/x-dance-video-id', encodedIds);
        e.dataTransfer.effectAllowed = 'copyMove';
      }}
      onDragEnd={() => {
        setIsDragging(false);
      }}
      onContextMenu={(event) => {
        // 右键 = 打开同一个快捷菜单，坐标跟随鼠标
        event.preventDefault();
        event.stopPropagation();
        setContextPos({ x: event.clientX, y: event.clientY });
        setShowTagModal(false);
        setMenuView('root');
        setShowMenu(true);
      }}
      onClick={() => {
        if (isBatchMode) {
          toggleSelectedVideo(video.id);
        } else {
          setCurrentVideo(video);
        }
      }}
      className={`video-card group relative flex flex-col rounded-lg overflow-visible bg-space-surface border transition-all duration-200 ${
        isDragging
          ? 'opacity-40 scale-95 border-dashed border-cyan-400 shadow-[0_0_25px_rgba(34,211,238,0.35)] cursor-grabbing'
          : isBatchMode && isSelected
          ? 'border-cyan-400 shadow-[0_0_18px_rgba(34,211,238,0.35)] ring-1 ring-cyan-400/80 cursor-pointer'
          : isBatchMode
          ? 'border-hairline hover:border-hairline-hover cursor-pointer'
          : 'border-hairline hover:border-hairline-hover hover:shadow-hairline cursor-grab active:cursor-grabbing'
      }`}
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 260px' } as React.CSSProperties}
    >
      {/* 正在拖拽时的占位提示遮罩 */}
      {isDragging && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-zinc-950/85 backdrop-blur-sm rounded-lg border-2 border-dashed border-cyan-400 p-2 text-center pointer-events-none">
          <div className="px-3 py-1.5 rounded-full bg-cyan-500/20 border border-cyan-400 text-cyan-300 text-xs font-mono font-medium shadow-[0_0_15px_rgba(34,211,238,0.5)] flex items-center gap-1.5 animate-pulse">
            <span>{t('card.movingToFolder')}</span>
          </div>
        </div>
      )}

      {/* 批量模式：勾选框常驻；非批量模式：悬停才露出，点它就进入批量并选中 */}
      {isBatchMode ? (
        <button
          type="button"
          data-testid="card-select"
          data-selected={isSelected ? 'true' : 'false'}
          aria-label={isSelected ? `取消选择 ${video.name}` : `选择 ${video.name}`}
          onClick={(event) => {
            event.stopPropagation();
            toggleSelectedVideo(video.id);
          }}
          className={`absolute left-3 top-3 z-20 flex h-5 w-5 items-center justify-center rounded-md border backdrop-blur-md transition ${
            isSelected
              ? 'border-cyan-300 bg-cyan-400 text-zinc-950 shadow-[0_0_10px_rgba(34,211,238,0.6)]'
              : 'border-white/30 bg-zinc-950/80 text-transparent hover:border-cyan-400/80'
          }`}
        >
          <Check className="h-3.5 w-3.5 stroke-[3]" />
        </button>
      ) : (
        <button
          type="button"
          data-testid="card-enter-batch"
          onClick={(event) => {
            event.stopPropagation();
            setIsBatchMode(true);
            toggleSelectedVideo(video.id);
          }}
          title="选择（进入批量管理）"
          aria-label={`选择 ${video.name}`}
          className="absolute left-3 top-3 z-20 flex h-5 w-5 items-center justify-center rounded-md border border-white/30 bg-zinc-950/70 text-transparent opacity-0 backdrop-blur-md transition group-hover:opacity-100 hover:border-zinc-300/70 hover:text-zinc-300"
        >
          <Check className="h-3.5 w-3.5 stroke-[3]" />
        </button>
      )}

      {/* 封面图容器：16:9 统一卡片高度；竖屏视频用同一张封面做虚化底，画面本身 object-contain 不裁切 */}
      <div
        ref={containerRef}
        className={`relative ${coverAspectClass} w-full bg-space-void overflow-hidden flex items-center justify-center select-none`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseMove={handleMouseMove}
      >
        {displayThumbnail && !thumbBroken ? (
          <>
            {/* 虚化底：以前是一张重复的 <img> + blur(40px)。1401 张卡就是 1401 个模糊滤镜，
                滚动时明显拖帧。改成同一张图的 CSS 背景（不滤镜、不重复解码），仍然填满留白。 */}
            <div
              aria-hidden="true"
              className="absolute inset-0 scale-105 bg-cover bg-center opacity-30 saturate-50"
              style={{ backgroundImage: `url("${displayThumbnail}")` }}
            />
            <img
              src={displayThumbnail}
              alt={video.name}
              className={`relative z-10 h-full w-full object-contain object-center transition-transform duration-300 ease-out ${isHovering ? 'scale-[1.02]' : ''}`}
              loading="lazy"
              onError={() => setThumbBroken(true)}
            />
          </>
        ) : (
          <div className="flex flex-col items-center justify-center text-zinc-600 gap-1">
            <Play className="w-8 h-8 opacity-40" />
            <span className="text-xs">{t('card.noThumbnail')}</span>
          </div>
        )}

        {/* 悬停播放遮罩（仅在非多选模式下显示） */}
        <div
          className={`absolute inset-0 bg-black/40 transition-opacity flex items-center justify-center backdrop-blur-[1px] pointer-events-none ${
            isHovering && !isBatchMode ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="p-3 rounded-full bg-cyan-500/90 text-white shadow-[0_0_20px_rgba(34,211,238,0.5)] transform scale-95 group-hover:scale-105 transition-transform duration-200">
            <Play className="w-5 h-5 ml-0.5 fill-current" />
          </div>
        </div>

        {/* 续播进度条：悬停时让位给 scrubbing 发丝线，不额外占高度 */}
        {!isHovering && watchedPct > 0.02 && (
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 h-[3px] bg-black/40">
            <div className="h-full bg-cyan-400/90" style={{ width: `${watchedPct * 100}%` }} />
          </div>
        )}

        {/* Hover Scrubbing 动态跟随光标 2px 发丝进度线 */}
        {isHovering && video.duration > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/10 z-10 overflow-hidden pointer-events-none">
            <div
              className="h-full bg-white/40 transition-[width] duration-75"
              style={{ width: `${scrubPercent}%` }}
            />
          </div>
        )}

        {/* 悬停微擦除时间戳跟随气泡 (Floating Timecode Tooltip) */}
        {isHovering && video.duration > 0 && (
          <div
            className="absolute bottom-2.5 pointer-events-none z-20 -translate-x-1/2 px-1.5 py-0.5 rounded-md bg-space-void/90 border border-hairline shadow-[0_2px_10px_rgba(0,0,0,0.8)] text-[10px] font-mono font-medium text-cyan-300 backdrop-blur-md transition-[left] duration-75 select-none"
            style={{ left: `${Math.max(12, Math.min(88, scrubPercent))}%` }}
          >
            {formatDuration(scrubTime)}
          </div>
        )}

        {/* 卡片右上角 Hover 出现的 ... 快捷浮层 */}
        <div
          ref={menuContainerRef}
          className="absolute top-2 right-2 z-20"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              setShowMenu((prev) => !prev);
              setShowTagModal(false);
              setMenuView('root');
            }}
            className={`p-1.5 rounded-lg bg-black/70 backdrop-blur-md border border-white/10 text-zinc-300 hover:text-white hover:bg-black/90 transition-all cursor-pointer ${
              showMenu || showTagModal
                ? 'opacity-100 bg-black/95 text-cyan-400 ring-1 ring-cyan-400/40'
                : 'opacity-0 group-hover:opacity-100'
            }`}
            title="快捷菜单"
            aria-label={t('card.moreActions')}
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>

          {/* ... 快捷浮层下拉菜单（Portal 到 body，避免被封面容器的 overflow-hidden 裁掉） */}
          {showMenu && !showTagModal && menuPos && typeof document !== 'undefined' && createPortal(
            <div
              data-card-menu
              style={{ position: 'fixed', top: menuPos.top, left: menuPos.left, width: menuView === 'move' ? 216 : 176 }}
              onClick={(e) => e.stopPropagation()}
              className="rounded-xl bg-space-void/95 border border-white/10 p-1.5 shadow-2xl backdrop-blur-xl z-[120] animate-in fade-in zoom-in-95 duration-150 flex flex-col gap-0.5 text-xs text-zinc-200"
            >
              {menuView === 'move' ? (
                <>
                  <div className="flex items-center justify-between px-1.5 pb-1">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                      {tr('移动到')}
                    </span>
                    <button
                      type="button"
                      onClick={() => setMenuView('root')}
                      className="rounded px-1 text-[10px] text-zinc-500 hover:text-zinc-200"
                    >
                      {tr('返回')}
                    </button>
                  </div>
                  <div className="max-h-52 overflow-y-auto">
                    <button
                      type="button"
                      data-testid="card-move-root"
                      onClick={() => void handleMoveTo('')}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.08] text-left transition cursor-pointer"
                    >
                      <Folder className="w-3.5 h-3.5 text-zinc-500" />
                      <span>{tr('媒体库根目录')}</span>
                    </button>
                    {folders.filter((f) => f.path !== currentFolder).map((folder) => (
                      <button
                        key={folder.id}
                        type="button"
                        data-testid="card-move-target"
                        onClick={() => void handleMoveTo(folder.path)}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.08] text-left transition cursor-pointer"
                      >
                        <FolderOpen className="w-3.5 h-3.5 text-zinc-500" />
                        <span className="truncate">{folder.path}</span>
                      </button>
                    ))}
                    {folders.length === 0 && (
                      <div className="px-2.5 py-1.5 text-[11px] text-zinc-500">
                        {tr('还没有分组，先去侧栏新建')}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
              {/* 多选：从这里也能进批量管理 */}
              <button
                type="button"
                data-testid="card-menu-multiselect"
                onClick={() => {
                  setIsBatchMode(true);
                  if (!isSelected) toggleSelectedVideo(video.id);
                  setShowMenu(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.08] text-left transition cursor-pointer"
              >
                <Check className="w-3.5 h-3.5 text-zinc-400" />
                <span>{tr('多选')}</span>
              </button>

              {/* 快捷打标 */}
              <button
                type="button"
                onClick={() => {
                  setShowTagModal(true);
                  setShowMenu(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.08] text-left transition cursor-pointer"
              >
                <Tag className="w-3.5 h-3.5 text-cyan-400" />
                <span>{t('card.quickTag')}</span>
              </button>

              {/* 移动到分组：二阶面板，直接选目标文件夹 */}
              <button
                type="button"
                data-testid="card-menu-move"
                onClick={() => setMenuView('move')}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.08] text-left transition cursor-pointer"
              >
                <FolderOpen className="w-3.5 h-3.5 text-cyan-400" />
                <span className="flex-1">{tr('移动到分组')}</span>
                <span className="text-[10px] text-zinc-500 truncate max-w-[64px]">
                  {currentFolder || tr('根目录')}
                </span>
              </button>

              {/* 加入循环队列 */}
              <button
                type="button"
                onClick={handleToggleQueue}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.08] text-left transition cursor-pointer"
              >
                <Repeat
                  className={`w-3.5 h-3.5 ${isQueued ? 'text-emerald-400' : 'text-zinc-400'}`}
                />
                <span>{isQueued ? t('card.loopQueueRemove') : t('card.loopQueue')}</span>
              </button>

              <button
                type="button"
                onClick={handleDeleteVideo}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-red-950/60 text-left text-red-300 transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t('card.deleteVideo')}</span>
              </button>
                </>
              )}
            </div>
          , document.body)}

          {/* 快捷打标浮层 */}
          {showTagModal && tagPopoverPosition && createPortal(
            <div
              data-quick-tag-popover
              draggable={false}
              onClick={(e) => e.stopPropagation()}
              onDragStart={(e) => e.stopPropagation()}
              style={{
                position: 'fixed',
                top: tagPopoverPosition.top,
                left: tagPopoverPosition.left,
                width: tagPopoverPosition.width,
                maxHeight: 'calc(100vh - 16px)',
              }}
              className="rounded-xl bg-space-void/95 border border-white/10 p-3 shadow-2xl backdrop-blur-xl z-[100] animate-in fade-in zoom-in-95 duration-150 flex flex-col gap-2.5 text-xs text-zinc-200 overflow-y-auto overscroll-contain"
            >
              <div className="flex items-center justify-between text-zinc-300 font-medium pb-1.5 border-b border-white/5">
                <span className="flex items-center gap-1.5 font-semibold text-white">
                  <Tag className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{t('card.quickTagTitle')}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowTagModal(false)}
                  className="text-zinc-500 hover:text-zinc-200 p-0.5 rounded hover:bg-white/[0.08] transition cursor-pointer"
                  title={t('common.close')}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* 现有标签 */}
              <div>
                <div className="text-[10px] font-mono text-zinc-400 mb-1">{t('card.currentTags')}</div>
                <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto pr-0.5">
                  {(video.tags || []).length > 0 ? (
                    video.tags.map((tName) => (
                      <span
                        key={tName}
                        title={tName}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-950/70 text-[11px] text-cyan-300 border border-cyan-500/30"
                      >
                        #{tagDisplayName(tName)}
                        <button
                          type="button"
                          onClick={() => void removeTag(video.id, tName)}
                          className="hover:text-red-400 text-cyan-500/80 cursor-pointer text-xs ml-0.5 transition"
                          title={`移除 #${tName}`}
                        >
                          ×
                        </button>
                      </span>
                    ))
                  ) : (
                    <span className="text-[11px] text-zinc-500 italic">{t('card.noTags')}</span>
                  )}
                </div>
              </div>

              {/* 常用与推荐标签快速点选 */}
              <div className="pt-1.5 border-t border-white/5">
                <div className="text-[10px] font-mono text-zinc-400 mb-1.5 flex items-center justify-between">
                  <span>{t('card.popularTags')}</span>
                  <span className="text-[9px] text-zinc-500 font-sans">{t('card.tagClickHint')}</span>
                </div>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-0.5">
                  {popularTags.map((tagOption) => {
                    const isTagged = video.tags?.includes(tagOption);
                    return (
                      <button
                        key={tagOption}
                        type="button"
                        onClick={() => handleToggleTag(tagOption)}
                        className={`px-2 py-0.5 rounded-full text-[10px] transition cursor-pointer flex items-center gap-1 ${
                          isTagged
                            ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 shadow-[0_0_8px_rgba(34,211,238,0.2)]'
                            : 'bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-white/5'
                        }`}
                        title={tagOption}
                      >
                        <span className="text-[9px] font-mono">{isTagged ? '✓' : '+'}</span>
                        <span>{tagDisplayName(tagOption)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 自定义输入标签（敲回车即时打标） */}
              <div className="pt-1.5 border-t border-white/5">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleAddCustomTag();
                  }}
                  className="flex min-w-0 gap-1.5"
                >
                  <input
                    ref={tagInputRef}
                    type="text"
                    value={customTag}
                    onChange={(e) => setCustomTag(e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomTag();
                      } else if (e.key === 'Escape') {
                        setShowTagModal(false);
                      }
                    }}
                    placeholder={t('card.tagPlaceholder')}
                    className="min-w-0 flex-1 bg-zinc-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-400 transition"
                  />
                  <button
                    type="submit"
                    disabled={!customTag.trim()}
                    className="px-2.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 rounded-lg text-xs text-white font-medium transition cursor-pointer flex-shrink-0"
                  >
                    {t('card.addTag')}
                  </button>
                </form>
              </div>
            </div>
          , document.body)}
        </div>

        {/* 右下角时长徽标 (电影级超细发丝徽标) */}
        <div
          className={`absolute bottom-2 right-2 px-1.5 py-0.5 rounded-md bg-space-void/85 text-[10px] font-mono font-medium text-zinc-300 border border-hairline backdrop-blur-md pointer-events-none select-none transition-opacity duration-200 ${
            isHovering ? 'opacity-0' : 'opacity-100'
          }`}
        >
          {formatDuration(video.duration)}
        </div>

        {/* 右上角循环队列指示（低干扰，仅在加入循环队列时显示） */}
        {isQueued && (
          <div className="absolute top-2 right-10 px-1.5 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 text-[10px] font-mono font-medium border border-emerald-500/40 flex items-center gap-1 shadow-sm backdrop-blur-sm pointer-events-none">
            <Repeat className="w-2.5 h-2.5 text-emerald-400" />
            <span>{t('card.loopBadge')}</span>
          </div>
        )}
      </div>

      {/* 底部信息区：名称 + 收藏心形 +（新增）元信息行 */}
      <div className="flex h-[46px] min-w-0 flex-col justify-center px-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
        <h3
          className="min-w-0 flex-1 truncate text-[12px] font-medium text-zinc-200 transition-colors group-hover:text-zinc-50"
          title={video.title ? `${displayTitle(video)} · ${video.name}` : video.name}
          data-testid="card-title"
        >
          {video.title ? displayTitle(video) : displayFileName(video)}
        </h3>
        <button
          type="button"
          data-testid="card-favorite"
          aria-pressed={isFavorite(video.rating)}
          onClick={(e) => {
            e.stopPropagation();
            void updateRating(video.id, nextFavoriteRating(video.rating));
          }}
          title={isFavorite(video.rating) ? tr('取消收藏') : tr('收藏')}
          aria-label={isFavorite(video.rating) ? tr('取消收藏') : tr('收藏')}
          className="shrink-0 cursor-pointer rounded-md p-1 transition-colors hover:bg-white/[0.06]"
        >
          <Heart
            className={`h-3.5 w-3.5 transition-colors ${
              isFavorite(video.rating) ? 'fill-rose-400 text-rose-400' : 'text-zinc-600 hover:text-zinc-300'
            }`}
            strokeWidth={1.6}
          />
        </button>
        </div>
        <div
          className="mt-0.5 flex h-[18px] items-center gap-1 overflow-hidden px-0.5 text-[10px] leading-none text-zinc-500"
          data-testid="card-meta"
        >
          <span className="shrink-0 font-mono tabular-nums">{cardDateLabel(video.lastModified)}</span>
          {cardMeta.length > 0 && (
            <>
              <span aria-hidden="true" className="shrink-0 text-zinc-700">·</span>
              <span className="min-w-0 flex-1 truncate text-zinc-500" title={cardMeta.join(' · ')}>
                {cardMeta.join(' · ')}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * 卡片在 1401 条的分组里会渲染几十张，父组件因为搜索框输入 / 批量选择 / 视图切换而重渲染时，
 * 这些没变过的卡片不必跟着重算（内部状态与 store 订阅保持原样，只是跳过相同的 props）。
 */
export const VideoCard = React.memo(VideoCardBase);
