import React from 'react';
import { createPortal } from 'react-dom';
import { Folder, Star, Pencil, Trash2, Copy, LogIn } from 'lucide-react';
import type { VideoItem } from '../../types';
import { useVirtualGrid } from '../../hooks/useVirtualGrid';
import { GALLERY_GAP } from '../../utils/galleryRows';
import { videoThumbUrl } from '../../services/api/serverUrl';
import { useI18n } from '../../i18n';

export interface HomeGroup {
  /** 组的虚拟路径（= 文件夹 path） */
  path: string;
  /** 组名（导入时写的歌名，识别失败则为「新分组 N」） */
  name: string;
  count: number;
  cover?: VideoItem;
  lastModified: number;
}

interface GroupCardGridProps {
  groups: HomeGroup[];
  columns: number;
  scrollRef: React.RefObject<HTMLElement | null>;
  favorites: string[];
  onOpen: (path: string) => void;
  onToggleFavorite: (path: string) => void;
  /** 把拖进卡片的视频移进这个组（视频卡本来就支持拖拽） */
  onDropVideos?: (path: string, ids: string[]) => void;
  /** 右键菜单：重命名 */
  onRename?: (path: string, name: string) => void | Promise<unknown>;
  /** 右键菜单：删除分组（调用方负责二次确认 + 提示） */
  onDelete?: (path: string, name: string) => void;
  /** 批量管理模式：卡片可勾选，点卡片 = 勾选而不是打开 */
  isBatchMode?: boolean;
  /** 已勾选的分组路径 */
  selectedPaths?: string[];
  onToggleSelect?: (path: string) => void;
}

/** 组卡片是 4:3 的块，比 16:9 的视频卡更矮更方，扫一行能看更多 */
const groupRowHeight = (containerWidth: number, columns: number) => {
  const perRow = Math.max(1, columns);
  const columnWidth = Math.max(0, (containerWidth - GALLERY_GAP * (perRow - 1)) / perRow);
  return Math.round((columnWidth * 3) / 4);
};

const coverUrl = (video?: VideoItem): string | undefined => {
  if (!video) return undefined;
  if (video.thumbnailUrl) return video.thumbnailUrl;
  return video.serverId ? videoThumbUrl(video.serverId) : undefined;
};

interface MenuState {
  path: string;
  name: string;
  x: number;
  y: number;
}

const MENU_WIDTH = 168;

/**
 * 首页第一屏：一首歌一张卡。
 * 卡片内容刻意极简 —— 封面 / 歌名 / 右下角星标；日期、机位数、标签都不外显。
 * 想改名、删组、复制组名时，右键卡片或点右上角「⋯」。
 */
export const GroupCardGrid: React.FC<GroupCardGridProps> = ({
  groups,
  columns,
  scrollRef,
  favorites,
  onOpen,
  onToggleFavorite,
  onDropVideos,
  onRename,
  onDelete,
  isBatchMode = false,
  selectedPaths,
  onToggleSelect,
}) => {
  const { tr } = useI18n();
  const [dragOverPath, setDragOverPath] = React.useState<string | null>(null);
  const [menu, setMenu] = React.useState<MenuState | null>(null);
  const [renaming, setRenaming] = React.useState<string | null>(null);
  const [renameDraft, setRenameDraft] = React.useState('');
  const renameInputRef = React.useRef<HTMLInputElement | null>(null);

  const readIds = (dataTransfer: DataTransfer): string[] => {
    const raw =
      dataTransfer.getData('application/dance-echo-video-ids') ||
      dataTransfer.getData('application/dance-echo-video-id') ||
      dataTransfer.getData('application/x-dance-video-id') ||
      dataTransfer.getData('text/plain');
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      return raw.includes(',') ? raw.split(',').filter(Boolean) : [raw];
    }
  };
  const { innerRef, laid, range } = useVirtualGrid(scrollRef, groups, columns, 2, groupRowHeight);

  // 菜单开着时：点别处 / 按 Esc / 滚动都关掉
  React.useEffect(() => {
    if (!menu) return;
    const close = (event?: Event) => {
      const target = event?.target as HTMLElement | null;
      if (target?.closest?.('[data-testid="group-context-menu"]')) return;
      if (target?.closest?.('[data-testid="group-menu-trigger"]')) return;
      setMenu(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [menu]);

  React.useEffect(() => {
    if (renaming) renameInputRef.current?.focus();
  }, [renaming]);

  const openMenu = (event: React.MouseEvent, group: HomeGroup) => {
    event.preventDefault();
    event.stopPropagation();
    const x = Math.min(event.clientX, window.innerWidth - MENU_WIDTH - 8);
    const y = Math.min(event.clientY, window.innerHeight - 190);
    setMenu({ path: group.path, name: group.name, x, y });
  };

  const startRename = (group: { path: string; name: string }) => {
    setMenu(null);
    setRenaming(group.path);
    setRenameDraft(group.name);
  };

  const commitRename = (path: string, fallback: string) => {
    const next = renameDraft.trim();
    setRenaming(null);
    if (!next || next === fallback) return;
    void onRename?.(path, next);
  };

  const copyName = (name: string) => {
    setMenu(null);
    if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(name);
  };

  return (
    <div ref={innerRef} data-testid="home-group-grid" className="relative" style={{ height: laid.total }}>
      {laid.items.slice(range.start, range.end).map((unit) => (
        <div
          key={unit.key}
          className="absolute inset-x-0 grid items-start"
          style={{
            top: unit.top,
            height: unit.height,
            gap: GALLERY_GAP,
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          }}
        >
          {unit.row.map((group) => {
            const cover = coverUrl(group.cover);
            const isFavorite = favorites.includes(group.path);
            const isRenaming = renaming === group.path;
            const isSelected = Boolean(isBatchMode && selectedPaths?.includes(group.path));
            return (
              <div
                key={group.path}
                role="button"
                tabIndex={0}
                data-testid="home-group-card"
                data-folder-path={group.path}
                data-selected={isSelected ? 'true' : 'false'}
                aria-pressed={isBatchMode ? isSelected : undefined}
                onClick={() => {
                  if (isRenaming) return;
                  if (isBatchMode && onToggleSelect) {
                    onToggleSelect(group.path);
                    return;
                  }
                  onOpen(group.path);
                }}
                onContextMenu={(event) => openMenu(event, group)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    if (isBatchMode && onToggleSelect) onToggleSelect(group.path);
                    else onOpen(group.path);
                  }
                  if (event.key === 'F2' || (event.key === 'ContextMenu')) {
                    event.preventDefault();
                    startRename(group);
                  }
                }}
                onDragOver={(event) => {
                  if (!onDropVideos) return;
                  if (!Array.from(event.dataTransfer.types || []).some((type) => type.startsWith('application/dance-echo') || type === 'text/plain')) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  setDragOverPath(group.path);
                }}
                onDragLeave={() => setDragOverPath((current) => (current === group.path ? null : current))}
                onDrop={(event) => {
                  if (!onDropVideos) return;
                  event.preventDefault();
                  event.stopPropagation();
                  setDragOverPath(null);
                  const ids = readIds(event.dataTransfer);
                  if (ids.length) onDropVideos(group.path, ids);
                }}
                className={`group relative h-full w-full cursor-pointer overflow-hidden rounded-xl border bg-zinc-900/40 transition-colors ${
                  isSelected
                    ? 'border-cyan-400 ring-1 ring-cyan-400/80 shadow-[0_0_18px_rgba(34,211,238,0.35)]'
                    : dragOverPath === group.path
                      ? 'border-cyan-400 ring-2 ring-cyan-400/40'
                      : 'border-white/[0.07] hover:border-cyan-400/40'
                }`}
              >
                {/* 批量管理：与视频卡同位置同形态的勾选框 */}
                {isBatchMode ? (
                  <button
                    type="button"
                    data-testid="group-select"
                    data-selected={isSelected ? 'true' : 'false'}
                    aria-label={isSelected ? tr('取消选择分组 {name}', { name: group.name }) : tr('选择分组 {name}', { name: group.name })}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleSelect?.(group.path);
                    }}
                    className={`absolute left-3 top-3 z-20 flex h-5 w-5 items-center justify-center rounded-md border backdrop-blur-md transition ${
                      isSelected
                        ? 'border-cyan-300 bg-cyan-400 text-zinc-950 shadow-[0_0_10px_rgba(34,211,238,0.6)]'
                        : 'border-white/30 bg-zinc-950/80 text-transparent hover:border-cyan-400/80'
                    }`}
                  >
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </button>
                ) : null}
                {cover ? (
                  <img
                    src={cover}
                    alt=""
                    loading="lazy"
                    draggable={false}
                    className="absolute inset-0 h-full w-full object-cover opacity-85 transition-opacity group-hover:opacity-100"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-800/60 to-zinc-900">
                    <Folder className="h-7 w-7 text-zinc-700" />
                  </div>
                )}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 flex items-end gap-2 p-2.5 pr-8">
                  {isRenaming ? (
                    <input
                      ref={renameInputRef}
                      data-testid="group-rename-input"
                      value={renameDraft}
                      onChange={(event) => setRenameDraft(event.target.value)}
                      onClick={(event) => event.stopPropagation()}
                      onBlur={() => commitRename(group.path, group.name)}
                      onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.key === 'Enter') commitRename(group.path, group.name);
                        if (event.key === 'Escape') setRenaming(null);
                      }}
                      className="min-w-0 flex-1 rounded-md border border-cyan-400/60 bg-black/70 px-1.5 py-0.5 text-xs font-semibold text-white outline-none"
                    />
                  ) : (
                    <h3 className="min-w-0 flex-1 truncate text-xs font-semibold text-white drop-shadow">
                      {group.name}
                    </h3>
                  )}
                </div>

                {/* 右上角「⋯」：右键的等价入口，触屏 / 触控板用户靠它 */}
                <button
                  type="button"
                  data-testid="group-menu-trigger"
                  aria-label={tr('更多操作')}
                  onClick={(event) => openMenu(event, group)}
                  className="absolute right-1.5 top-1.5 rounded-md bg-black/45 p-1 text-white/70 opacity-0 transition-opacity hover:bg-black/70 hover:text-white group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <span className="block h-3.5 w-3.5 text-center text-[13px] font-bold leading-[14px]">⋯</span>
                </button>

                <button
                  type="button"
                  data-testid="group-favorite"
                  aria-label={tr('收藏这个分组')}
                  aria-pressed={isFavorite}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleFavorite(group.path);
                  }}
                  className={`absolute bottom-2 right-2 rounded-full p-1 transition-colors ${
                    isFavorite
                      ? 'text-amber-300'
                      : 'text-white/45 hover:text-white/90'
                  }`}
                >
                  <Star className="h-3.5 w-3.5" fill={isFavorite ? 'currentColor' : 'none'} />
                </button>
              </div>
            );
          })}
        </div>
      ))}

      {menu
        ? createPortal(
            <div
              data-testid="group-context-menu"
              role="menu"
              style={{ position: 'fixed', left: menu.x, top: menu.y, width: MENU_WIDTH }}
              className="z-[120] overflow-hidden rounded-xl border border-white/10 bg-zinc-900/95 py-1 shadow-2xl backdrop-blur"
            >
              <div className="truncate px-3 py-1.5 text-[10px] text-zinc-500">{menu.name}</div>
              <button
                type="button"
                role="menuitem"
                data-testid="group-menu-open"
                onClick={() => {
                  setMenu(null);
                  onOpen(menu.path);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-200 hover:bg-white/10"
              >
                <LogIn className="h-3.5 w-3.5" /> {tr('打开')}
              </button>
              <button
                type="button"
                role="menuitem"
                data-testid="group-menu-favorite"
                onClick={() => {
                  onToggleFavorite(menu.path);
                  setMenu(null);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-200 hover:bg-white/10"
              >
                <Star
                  className={`h-3.5 w-3.5 ${favorites.includes(menu.path) ? 'text-amber-300' : ''}`}
                  fill={favorites.includes(menu.path) ? 'currentColor' : 'none'}
                />
                {favorites.includes(menu.path) ? tr('取消收藏') : tr('收藏')}
              </button>
              <button
                type="button"
                role="menuitem"
                data-testid="group-menu-rename"
                onClick={() => startRename(menu)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-200 hover:bg-white/10"
              >
                <Pencil className="h-3.5 w-3.5" /> {tr('重命名')}
              </button>
              <button
                type="button"
                role="menuitem"
                data-testid="group-menu-copy"
                onClick={() => copyName(menu.name)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-200 hover:bg-white/10"
              >
                <Copy className="h-3.5 w-3.5" /> {tr('复制组名')}
              </button>
              {onDelete ? (
                <button
                  type="button"
                  role="menuitem"
                  data-testid="group-menu-delete"
                  onClick={() => {
                    const target = menu;
                    setMenu(null);
                    onDelete(target.path, target.name);
                  }}
                  className="flex w-full items-center gap-2 border-t border-white/5 px-3 py-1.5 text-left text-xs text-rose-300 hover:bg-rose-500/10"
                >
                  <Trash2 className="h-3.5 w-3.5" /> {tr('删除分组')}
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
};
