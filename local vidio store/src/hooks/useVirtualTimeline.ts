import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  buildTimelineUnits,
  cardRowHeight,
  columnsForViewport,
  layoutTimelineUnits,
  visibleRange,
  type TimelineSectionInput,
  type TimelineUnit,
} from '../utils/galleryRows';

/** 保持默认展开的近期时间桶；其余（月份桶）首次进入时折叠。 */
const RECENT_SECTION_KEYS = new Set(['today', 'yesterday', 'week', 'month']);

/** 列表视图的行高，与 `VirtualVideoList` 的 ROW_HEIGHT 必须一致。 */
export const LIST_ROW_HEIGHT = 56;

/** 跟随 tailwind 断点的列数。 */
export function useViewportColumns(): number {
  const [columns, setColumns] = useState(() =>
    columnsForViewport(typeof window === 'undefined' ? 1280 : window.innerWidth),
  );

  useEffect(() => {
    const update = () => setColumns(columnsForViewport(window.innerWidth));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return columns;
}

export function useTimelineCollapse(storageKey: string) {
  /** 是否已经决定过初始折叠集合：有存储 = 已决定；无存储时等 seedDefaults 决定。 */
  const seededRef = useRef(false);
  const [collapsed, setCollapsed] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(storageKey);
      seededRef.current = raw !== null;
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (!seededRef.current) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(collapsed));
    } catch {
      /* 忽略隐私模式下的写入失败 */
    }
  }, [collapsed, storageKey]);

  const toggle = (sectionKey: string) => {
    setCollapsed((current) =>
      current.includes(sectionKey) ? current.filter((key) => key !== sectionKey) : [...current, sectionKey],
    );
  };

  /**
   * 首次使用（本地还没有折叠记录）时写入默认值：
   * 今天/昨天/最近 7 天/最近 30 天保持展开，更早的月份默认折叠。
   * 已经点过的用户保持自己的选择，不再覆盖。
   */
  const seedDefaults = useCallback(
    (sectionKeys: readonly string[], defaultCollapsed?: readonly string[]) => {
      if (!sectionKeys.length || typeof window === 'undefined') return;
      try {
        if (window.localStorage.getItem(storageKey) !== null) {
          seededRef.current = true;
          return;
        }
      } catch {
        return;
      }
      seededRef.current = true;
      const preset = defaultCollapsed ? new Set(defaultCollapsed) : null;
      setCollapsed(
        sectionKeys.filter((key) => (preset ? preset.has(key) : !RECENT_SECTION_KEYS.has(key))),
      );
    },
    [storageKey],
  );

  return { collapsed, toggle, seedDefaults };
}

/**
 * 时间轴虚拟化：只算「哪些 unit 在视口里」以及行高。
 * 滚动容器由调用方传入（首页是 main 滚动区）。
 */
export function useVirtualTimeline<V>(
  scrollRef: RefObject<HTMLElement | null>,
  sections: TimelineSectionInput<V>[],
  collapsed: readonly string[],
  columns: number,
  options: { mode?: 'grid' | 'list' } = {},
) {
  const mode = options.mode ?? 'grid';
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(800);
  const [containerWidth, setContainerWidth] = useState(0);
  const innerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    let frame = 0;
    const handleScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setScrollTop(element.scrollTop));
    };

    const observer = new ResizeObserver(() => setViewportHeight(element.clientHeight));
    observer.observe(element);
    setViewportHeight(element.clientHeight);
    setScrollTop(element.scrollTop);
    element.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      element.removeEventListener('scroll', handleScroll);
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [scrollRef]);

  useEffect(() => {
    const element = innerRef.current;
    if (!element) return;

    const observer = new ResizeObserver(() => setContainerWidth(element.clientWidth));
    observer.observe(element);
    setContainerWidth(element.clientWidth);

    return () => observer.disconnect();
  }, []);

  const rowHeight = useMemo(
    () => cardRowHeight(containerWidth || 1180, columns),
    [containerWidth, columns],
  );

  const units = useMemo<TimelineUnit<V>[]>(
    () => buildTimelineUnits(sections, new Set(collapsed), columns, { mode }),
    [sections, collapsed, columns, mode],
  );

  // 列表模式每行只有一条视频，行高固定 56（与 VirtualVideoList 保持一致）。
  const effectiveRowHeight = mode === 'list' ? LIST_ROW_HEIGHT : rowHeight;
  const laid = useMemo(
    () => layoutTimelineUnits(units, effectiveRowHeight),
    [units, effectiveRowHeight],
  );

  const windowRange = useMemo(
    () => visibleRange(laid.items as Parameters<typeof visibleRange>[0], scrollTop, viewportHeight),
    [laid, scrollTop, viewportHeight],
  );

  return { innerRef, rowHeight: effectiveRowHeight, laid, windowRange };
}
