/**
 * 首页时间轴的纯计算层：把「日期分组 + 卡片网格」拍平成可虚拟化的 unit。
 *
 * 只做算术，不碰 DOM —— 这样能在 node 契约脚本里直接断言行数、总高度和可见窗口。
 */

export const GALLERY_GAP = 12;
export const TIMELINE_HEADER_HEIGHT = 40;
export const TIMELINE_SUBHEADER_HEIGHT = 24;
export const CARD_INFO_HEIGHT = 46;
export const CARD_BORDER = 2;

export interface TimelineSectionGroup<V> {
  key: string;
  label: string;
  videos: V[];
}

export interface TimelineSectionInput<V> {
  key: string;
  label: string;
  videos: V[];
  /** 同一天里按分组再分一层；只有两个以上分组时才会画出小标题。 */
  groups?: TimelineSectionGroup<V>[];
}

export type TimelineUnit<V> =
  | { kind: 'header'; key: string; sectionKey: string; label: string; count: number; collapsed: boolean }
  | {
      kind: 'subheader';
      key: string;
      sectionKey: string;
      subKey: string;
      label: string;
      count: number;
    }
  | { kind: 'row'; key: string; sectionKey: string; videos: V[] };

export interface BuildTimelineOptions {
  /** grid：一行铺满 columns 张卡；list：一行一条视频（列表视图）。 */
  mode?: 'grid' | 'list';
}

export type LaidTimelineUnit<V> = TimelineUnit<V> & {
  top: number;
  height: number;
};

/** 与 tailwind 的 grid-cols-2 sm:3 md:4 lg:5 xl:6 断点保持一致。 */
export function columnsForViewport(viewportWidth: number): number {
  if (viewportWidth < 640) return 2;
  if (viewportWidth < 768) return 3;
  if (viewportWidth < 1024) return 4;
  if (viewportWidth < 1280) return 5;
  return 6;
}

/** 一行卡片的高度：缩略图 16:9 + 底部信息行 + 上下边框。 */
export function cardRowHeight(containerWidth: number, columns: number): number {
  const width = Math.max(240, containerWidth);
  const columnWidth = (width - GALLERY_GAP * (columns - 1)) / columns;
  return (columnWidth * 9) / 16 + CARD_INFO_HEIGHT + CARD_BORDER;
}

export function buildTimelineUnits<V>(
  sections: TimelineSectionInput<V>[],
  collapsed: ReadonlySet<string>,
  columns: number,
  options: BuildTimelineOptions = {},
): TimelineUnit<V>[] {
  const units: TimelineUnit<V>[] = [];
  const perRow = options.mode === 'list' ? 1 : Math.max(1, columns);

  const pushRows = (sectionKey: string, videos: V[], keyPrefix = '') => {
    for (let index = 0; index < videos.length; index += perRow) {
      units.push({
        kind: 'row',
        key: `row:${sectionKey}:${keyPrefix}${index}`,
        sectionKey,
        videos: videos.slice(index, index + perRow),
      });
    }
  };

  for (const section of sections) {
    const isCollapsed = collapsed.has(section.key);
    units.push({
      kind: 'header',
      key: `header:${section.key}`,
      sectionKey: section.key,
      label: section.label,
      count: section.videos.length,
      collapsed: isCollapsed,
    });
    if (isCollapsed) continue;

    const groups = section.groups;
    // 只有一天里跨了两个以上分组时才画二级标题，否则纯属噪音。
    if (groups && groups.length > 1) {
      for (const group of groups) {
        units.push({
          kind: 'subheader',
          key: `sub:${section.key}:${group.key}`,
          sectionKey: section.key,
          subKey: group.key,
          label: group.label,
          count: group.videos.length,
        });
        pushRows(section.key, group.videos, `${group.key}:`);
      }
      continue;
    }

    pushRows(section.key, groups && groups.length === 1 ? groups[0].videos : section.videos);
  }

  return units;
}

export function layoutTimelineUnits<V>(
  units: TimelineUnit<V>[],
  rowHeight: number,
): { items: LaidTimelineUnit<V>[]; total: number } {
  const items: LaidTimelineUnit<V>[] = [];
  let top = 0;

  for (const unit of units) {
    const height =
      unit.kind === 'header'
        ? TIMELINE_HEADER_HEIGHT
        : unit.kind === 'subheader'
          ? TIMELINE_SUBHEADER_HEIGHT
          : rowHeight;
    items.push({ ...unit, top, height });
    top += height + GALLERY_GAP;
  }

  return { items, total: Math.max(0, top - GALLERY_GAP) };
}

export function visibleRange(
  items: LaidTimelineUnit<unknown>[],
  scrollTop: number,
  viewportHeight: number,
  overscan = 3,
): { start: number; end: number } {
  if (items.length === 0) return { start: 0, end: 0 };

  let lo = 0;
  let hi = items.length - 1;
  let first = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const item = items[mid];
    if (item.top + item.height < scrollTop) {
      lo = mid + 1;
    } else {
      first = mid;
      hi = mid - 1;
    }
  }

  const start = Math.max(0, first - overscan);
  const limit = scrollTop + viewportHeight;
  let end = start;
  while (end < items.length && items[end].top < limit) end += 1;
  end = Math.min(items.length, Math.max(end, start + 1) + overscan);

  return { start, end };
}
