import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'dance_echo_folder_favorites';
// 同一标签页里可能有好几个组件各自 useFolderFavorites()：storage 事件不会在本窗口触发，
// 所以写完之后再广播一个自定义事件，侧栏计数才能跟着星标立刻变。
const CHANGE_EVENT = 'dance-echo:folder-favorites';

function readFavorites(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * 组级收藏：星标打在「一首歌一组」的组上，而不是单条视频上。
 * 纯本地（localStorage）：收藏是个人偏好，不需要跟服务端同步。
 */
export function useFolderFavorites() {
  const [favorites, setFavorites] = useState<string[]>(readFavorites);

  useEffect(() => {
    const sync = () => setFavorites(readFavorites());
    window.addEventListener('storage', sync);
    window.addEventListener(CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(CHANGE_EVENT, sync);
    };
  }, []);

  const toggleFavorite = useCallback((path: string) => {
    // 写盘和广播都放在 updater 外面：updater 会在渲染期执行，
    // 在里面做副作用既不安全，StrictMode 下还会被重复调用。
    const prev = readFavorites();
    const next = prev.includes(path) ? prev.filter((item) => item !== path) : [...prev, path];
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* 隐私模式下 localStorage 可能不可写：收藏只是锦上添花，不该打断浏览 */
    }
    setFavorites(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return { favorites, toggleFavorite };
}
