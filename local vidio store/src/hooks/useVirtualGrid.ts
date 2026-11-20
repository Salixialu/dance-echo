import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { cardRowHeight, visibleRange } from '../utils/galleryRows';

/**
 * 平铺网格的虚拟化（分组内部视图 / 搜索结果）。
 *
 * 与首页时间轴的 `useVirtualTimeline` 共用 `galleryRows` 的算术层，差别只有两点：
 * 1. 没有日期头，单纯按列数切行；
 * 2. 自己量一次「网格相对滚动容器顶部的偏移」——分组视图上面还有面包屑和工具栏，
 *    不减这个偏移会让可见窗口整体错位半屏（首页时间轴靠 overscan 掩盖了这个误差）。
 */
export interface LaidGridRow<V> {
  key: string;
  top: number;
  height: number;
  row: V[];
}

export function buildGridRows<V>(items: readonly V[], columns: number): V[][] {
  const perRow = Math.max(1, columns);
  const rows: V[][] = [];
  for (let index = 0; index < items.length; index += perRow) {
    rows.push(items.slice(index, index + perRow));
  }
  return rows;
}

interface GridMetrics {
  scrollTop: number;
  viewportHeight: number;
  width: number;
  offsetTop: number;
}

export function useVirtualGrid<V>(
  scrollRef: RefObject<HTMLElement | null>,
  items: readonly V[],
  columns: number,
  overscan = 2,
  /** 自定义行高（默认是 16:9 视频卡）；组卡片用 4:3，所以这里允许换算式 */
  resolveRowHeight?: (containerWidth: number, columns: number) => number,
) {
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [metrics, setMetrics] = useState<GridMetrics>({
    scrollTop: 0,
    viewportHeight: 800,
    width: 0,
    offsetTop: 0,
  });

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    // 布局几何（宽度 / 网格在内容里的偏移）只在尺寸变化时量：偏移量与 scrollTop 无关，
    // 滚动时重复量 getBoundingClientRect 只会白白触发同步布局。
    const measureLayout = () => {
      const inner = innerRef.current;
      const offsetTop = inner
        ? inner.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
        : 0;
      setMetrics((prev) => ({
        ...prev,
        scrollTop: scroller.scrollTop,
        viewportHeight: scroller.clientHeight,
        width: inner ? inner.clientWidth : 0,
        offsetTop,
      }));
    };

    // 滚动时只读 scrollTop / clientHeight（不触发布局）。别套 rAF：后台标签页里 rAF 会被
    // 节流到 0Hz，虚拟窗口会卡在旧位置。
    const handleScroll = () => {
      setMetrics((prev) =>
        prev.scrollTop === scroller.scrollTop && prev.viewportHeight === scroller.clientHeight
          ? prev
          : { ...prev, scrollTop: scroller.scrollTop, viewportHeight: scroller.clientHeight },
      );
    };

    const observer = new ResizeObserver(measureLayout);
    observer.observe(scroller);
    if (innerRef.current) observer.observe(innerRef.current);

    measureLayout();
    scroller.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      scroller.removeEventListener('scroll', handleScroll);
      observer.disconnect();
    };
  }, [scrollRef]);

  const rowHeight = useMemo(() => {
    const width = metrics.width || 1180;
    return resolveRowHeight ? resolveRowHeight(width, columns) : cardRowHeight(width, columns);
  }, [metrics.width, columns, resolveRowHeight]);

  const laid = useMemo(() => {
    const rows = buildGridRows(items, columns);
    const result: LaidGridRow<V>[] = [];
    let top = 0;
    for (let index = 0; index < rows.length; index += 1) {
      result.push({ key: `row:${index}`, top, height: rowHeight, row: rows[index] });
      top += rowHeight + 12;
    }
    return { items: result, total: Math.max(0, top - 12) };
  }, [items, columns, rowHeight]);

  const range = useMemo(
    () =>
      visibleRange(
        laid.items as unknown as Parameters<typeof visibleRange>[0],
        Math.max(0, metrics.scrollTop - metrics.offsetTop),
        metrics.viewportHeight,
        overscan,
      ),
    [laid, metrics.scrollTop, metrics.offsetTop, metrics.viewportHeight, overscan],
  );

  return { innerRef, rowHeight, laid, range };
}

/**
 * 等高行清单的虚拟化（列表视图）。
 *
 * 与网格同源：同样的「偏移只在尺寸变化时量、滚动只读 scrollTop」策略，
 * 只是行高是常量而不是按容器宽度算的 16:9。
 */
export function useVirtualRows(
  scrollRef: RefObject<HTMLElement | null>,
  count: number,
  rowHeight: number,
  gap = 4,
  overscan = 6,
) {
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [metrics, setMetrics] = useState<GridMetrics>({
    scrollTop: 0,
    viewportHeight: 800,
    width: 0,
    offsetTop: 0,
  });

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    const measureLayout = () => {
      const inner = innerRef.current;
      const offsetTop = inner
        ? inner.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
        : 0;
      setMetrics((prev) => ({
        ...prev,
        scrollTop: scroller.scrollTop,
        viewportHeight: scroller.clientHeight,
        width: inner ? inner.clientWidth : 0,
        offsetTop,
      }));
    };

    const handleScroll = () => {
      setMetrics((prev) =>
        prev.scrollTop === scroller.scrollTop && prev.viewportHeight === scroller.clientHeight
          ? prev
          : { ...prev, scrollTop: scroller.scrollTop, viewportHeight: scroller.clientHeight },
      );
    };

    const observer = new ResizeObserver(measureLayout);
    observer.observe(scroller);
    if (innerRef.current) observer.observe(innerRef.current);

    measureLayout();
    scroller.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      scroller.removeEventListener('scroll', handleScroll);
      observer.disconnect();
    };
  }, [scrollRef]);

  const step = rowHeight + gap;
  const total = Math.max(0, count * step - gap);

  // 可见切片：从「相对网格顶部」的滚动量算，再向两侧各留 overscan 行
  const from = Math.max(0, metrics.scrollTop - metrics.offsetTop);
  const start = Math.max(0, Math.min(count, Math.floor(from / step) - overscan));
  const end = Math.max(start, Math.min(count, Math.ceil((from + metrics.viewportHeight) / step) + overscan));

  return { innerRef, total, start, end, step };
}
