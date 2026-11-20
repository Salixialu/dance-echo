import { useEffect, useRef } from 'react';
import { useVideoStore } from '../store/useVideoStore';

/**
 * 画廊的 URL 路由：把「当前所在分组 / 搜索词 / 排序 / 网格或列表」写进 hash。
 *
 * 之前整个应用没有一条 pushState：刷一下回到首页、按后退直接退出应用、也无法把某个分组发给别人。
 * 这里用 hash 路由（不需要服务器配合，file:// 与 vite dev 都成立），并且：
 *   - 切换分组 → pushState，后退键能回上一个分组；
 *   - 搜索 / 排序 / 视图切换 → replaceState，不往历史里灌垃圾；
 *   - 首屏与 popstate/hashchange 都从 URL 反向恢复状态。
 */

export type GalleryHomeView = 'groups' | 'timeline';
export type GalleryViewMode = 'grid' | 'list';
/** 工作流筛选：最近观看 / 收藏 / 留言 */
export type GalleryCategory = '' | 'continue' | 'starred' | 'hasNotes';
/** 工具面板：标签库 / 回收区（弹层同样进 URL，刷新与后退可恢复） */
export type GalleryPanel = '' | 'tags' | 'trash';

export interface RouteState {
  folder: string;
  q: string;
  sort: string;
  view: GalleryViewMode;
  home: GalleryHomeView;
  category: GalleryCategory;
  panel: GalleryPanel;
}

const SORTS = new Set(['date', 'name', 'duration', 'rating']);
const CATEGORIES = new Set(['continue', 'starred', 'hasNotes']);
const PANELS = new Set(['tags', 'trash']);

// 首页现在恒为「按天时间轴」：分组不再是一个可选页面，所以 home 默认 timeline，
// 旧的 `?home=groups` 链接也会被解析成 timeline（分组视图已经删除）。
export const DEFAULT_ROUTE: RouteState = { folder: '', q: '', sort: 'date', view: 'grid', home: 'timeline', category: '', panel: '' };

export function buildHash(state: RouteState): string {
  const segments = state.folder
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => encodeURIComponent(part));
  const path = segments.length ? `#/f/${segments.join('/')}` : '#/';
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.sort && state.sort !== DEFAULT_ROUTE.sort) params.set('sort', state.sort);
  if (state.view && state.view !== DEFAULT_ROUTE.view) params.set('view', state.view);
  if (state.home && state.home !== DEFAULT_ROUTE.home) params.set('home', state.home);
  if (state.category) params.set('category', state.category);
  if (state.panel) params.set('panel', state.panel);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export function parseHash(hash: string): RouteState {
  const raw = (hash || '').replace(/^#/, '');
  const [rawPath, rawQuery] = raw.split('?');
  const folderSegments = rawPath
    .replace(/^\/?f\/?/, '')
    .split('/')
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    });
  const params = new URLSearchParams(rawQuery || '');
  const sort = params.get('sort') || DEFAULT_ROUTE.sort;
  const view = params.get('view') === 'list' ? 'list' : 'grid';
  const home: GalleryHomeView = 'timeline';
  const categoryRaw = params.get('category') || '';
  const panelRaw = params.get('panel') || '';
  return {
    folder: folderSegments.join('/'),
    q: params.get('q') || '',
    sort: SORTS.has(sort) ? sort : DEFAULT_ROUTE.sort,
    view,
    home,
    category: CATEGORIES.has(categoryRaw) ? (categoryRaw as GalleryCategory) : '',
    panel: PANELS.has(panelRaw) ? (panelRaw as GalleryPanel) : '',
  };
}

interface GalleryRouteOptions {
  viewMode: GalleryViewMode;
  homeView: GalleryHomeView;
  setViewMode: (mode: GalleryViewMode) => void;
  setHomeView: (view: GalleryHomeView) => void;
  /** 视频列表加载完成后才允许把 URL 里的分组当作有效值 */
  ready: boolean;
}

export function useGalleryRoute({ viewMode, homeView, setViewMode, setHomeView, ready }: GalleryRouteOptions) {
  const optionsRef = useRef({ viewMode, homeView, setViewMode, setHomeView });
  optionsRef.current = { viewMode, homeView, setViewMode, setHomeView };

  const lastNavRef = useRef<string | null>(null);
  const appliedRef = useRef(false);
  const applyingRef = useRef(false);

  const applyFromUrl = () => {
    const route = parseHash(window.location.hash);
    const store = useVideoStore.getState();
    // 先认账再做改动：store 的 subscribe 会在 setter 里同步触发，若此时 lastNav 还是旧值，
    // 就会被误判成「用户切了分组」而 pushState，把浏览器的前进栈清掉。
    lastNavRef.current = [route.folder, route.category, route.panel].join('|');
    applyingRef.current = true;
    try {
      if (route.folder !== store.selectedFolderPath) store.setSelectedFolderPath(route.folder);
      if (route.q !== store.searchQuery) store.setSearchQuery(route.q);
      if (route.sort !== store.sortBy) store.setSortBy(route.sort as typeof store.sortBy);
      if (route.view !== optionsRef.current.viewMode) optionsRef.current.setViewMode(route.view);
      if (route.home !== optionsRef.current.homeView) optionsRef.current.setHomeView(route.home);
      if ((route.category || null) !== store.selectedCategory) store.setSelectedCategory(route.category || null);
      if ((route.panel || null) !== store.activePanel) store.setActivePanel(route.panel || null);
    } finally {
      appliedRef.current = true;
      applyingRef.current = false;
    }
  };

  // URL → 状态：首屏恢复 + 浏览器前进/后退
  useEffect(() => {
    applyFromUrl();
    const onPop = () => applyFromUrl();
    window.addEventListener('popstate', onPop);
    window.addEventListener('hashchange', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('hashchange', onPop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 状态 → URL
  useEffect(() => {
    if (!ready || !appliedRef.current || applyingRef.current) return;
    const store = useVideoStore.getState();
    const next = buildHash({
      folder: store.selectedFolderPath,
      q: store.searchQuery,
      sort: store.sortBy,
      view: viewMode,
      home: homeView,
      category: (store.selectedCategory ?? '') as GalleryCategory,
      panel: store.activePanel ?? '',
    });
    if (next === window.location.hash) return;
    const nav = [store.selectedFolderPath, store.selectedCategory ?? '', store.activePanel ?? ''].join('|');
    const navChanged = lastNavRef.current !== null && lastNavRef.current !== nav;
    if (navChanged) {
      window.history.pushState({ nav }, '', next);
    } else {
      window.history.replaceState({ nav }, '', next);
    }
    lastNavRef.current = nav;
  }, [ready, viewMode, homeView]);

  // 分组 / 搜索 / 排序 在 store 里，单独订阅一次即可（不依赖组件重渲染时机）
  useEffect(() => {
    if (!ready || !appliedRef.current) return;
    let queued = false;
    const sync = () => {
      if (applyingRef.current || queued) return;
      queued = true;
      // 用宏任务合并：一次操作里连续触发的多个 setter（进入分组的同时清筛选）
      // 会各自唤起订阅回调，等到下一个宏任务时状态已经稳定，只写一次 URL。
      setTimeout(() => {
        queued = false;
        if (applyingRef.current) return;
        const store = useVideoStore.getState();
        const next = buildHash({
          folder: store.selectedFolderPath,
          q: store.searchQuery,
          sort: store.sortBy,
          view: optionsRef.current.viewMode,
          home: optionsRef.current.homeView,
          category: (store.selectedCategory ?? '') as GalleryCategory,
          panel: store.activePanel ?? '',
        });
        if (next === window.location.hash) return;
        const nav = [store.selectedFolderPath, store.selectedCategory ?? '', store.activePanel ?? ''].join('|');
        const navChanged = lastNavRef.current !== null && lastNavRef.current !== nav;
        if (navChanged) {
          window.history.pushState({ nav }, '', next);
        } else {
          window.history.replaceState({ nav }, '', next);
        }
        lastNavRef.current = nav;
      });
    };
    const unsubscribe = useVideoStore.subscribe(sync);
    sync();
    return unsubscribe;
  }, [ready]);
}
