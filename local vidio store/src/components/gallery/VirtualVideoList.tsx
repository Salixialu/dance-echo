import { ChevronDown } from 'lucide-react';
import { useI18n } from '../../i18n';
import type { VideoItem } from '../../types';
import { useVirtualRows } from '../../hooks/useVirtualGrid';
import { LIST_COL as COL, LIST_ROW_HEIGHT, VideoListRow } from './VideoListRow';

const ROW_GAP = 4;

interface Props {
  videos: readonly VideoItem[];
  scrollRef: React.RefObject<HTMLElement | null>;
  /** 分组内部视图里每行的分组名都一样，没必要重复。 */
  showGroup?: boolean;
  /** 当前排序键；点表头可直接改排序，跟上方下拉框共用同一份状态。 */
  sortBy?: SortKey;
  onSortChange?: (key: SortKey) => void;
}

type SortKey = 'name' | 'date' | 'duration' | 'rating';

/**
 * 列表视图：一行一条视频，按列对齐。
 *
 * 上千个 `mmexport…` 在网格里只能靠缩略图认片，列表把「名称 / 标签 / 时长 / 日期 / 分组」
 * 摊成可扫的列。行高固定，因此复用同一套虚拟化策略，只渲染视口内的行。
 */
export function VirtualVideoList({ videos, scrollRef, showGroup = true, sortBy, onSortChange }: Props) {
  const { tr } = useI18n();

  const { innerRef, total, start, end, step } = useVirtualRows(
    scrollRef,
    videos.length,
    LIST_ROW_HEIGHT,
    ROW_GAP,
  );

  const rows = videos.slice(start, end);

  return (
    <div>
      <VideoListHeader showGroup={showGroup} sortBy={sortBy} onSortChange={onSortChange} />
      <div ref={innerRef} data-testid="virtual-video-list" className="relative" style={{ height: total }}>
        {rows.map((video, offset) => {
          const index = start + offset;
          return (
            <VideoListRow
              key={video.id}
              video={video}
              showGroup={showGroup}
              style={{ top: index * step, height: LIST_ROW_HEIGHT }}
            />
          );
        })}
      </div>
    </div>
  );
}

interface HeaderProps {
  showGroup?: boolean;
  sortBy?: SortKey;
  onSortChange?: (key: SortKey) => void;
}

/** 列表列头：首页按天时间轴用列表模式时也要有同一套列头，否则每行只剩缩略图和名字。 */
export function VideoListHeader({ showGroup = true, sortBy, onSortChange }: HeaderProps) {
  const { tr } = useI18n();
  // 表头可点排序：列表里最自然的排序入口就是列头，比回到右上角下拉框快
  const sortHeader = (label: string, key: SortKey, className: string) => {
    const active = sortBy === key;
    return (
      <button
        type="button"
        data-testid={`list-sort-${key}`}
        onClick={() => onSortChange?.(key)}
        aria-sort={active ? 'descending' : 'none'}
        className={`${className} flex items-center gap-0.5 transition hover:text-zinc-200 ${
          active ? 'text-cyan-300' : ''
        } ${onSortChange ? 'cursor-pointer' : 'cursor-default'}`}
      >
        {label}
        {active && <ChevronDown className="h-2.5 w-2.5" />}
      </button>
    );
  };

  return (
    <>
      {/* 表头：滚动时吸顶，列宽与下方行共用 COL */}
      <div className="sticky top-0 z-10 mb-1 flex items-center gap-3 border-b border-white/[0.06] bg-[#0b0d10]/95 px-2 py-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500 backdrop-blur">
        <span className={`${COL.thumb} shrink-0`}>{tr('封面')}</span>
        <div className="flex min-w-0 flex-1">{sortHeader(tr('名称'), 'name', '')}</div>
        <div className={`${COL.duration} flex shrink-0 justify-end`}>{sortHeader(tr('时长'), 'duration', '')}</div>
        <div className={`${COL.date} flex shrink-0 justify-end`}>{sortHeader(tr('日期'), 'date', '')}</div>
        {showGroup && <span className={`${COL.group} hidden shrink-0 md:block`}>{tr('分组')}</span>}
        <span className={`${COL.action} shrink-0`} />
      </div>
    </>
  );
}
