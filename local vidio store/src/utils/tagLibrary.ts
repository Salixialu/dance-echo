/**
 * 标签库（localStorage 里的“单独标签”）与视频删除的联动。
 *
 * 背景：标签库弹窗把用户手动新增/重命名的标签存在 `dance_echo_custom_tags`。
 * 删除视频后，只有该视频用过的标签会从视频列表消失，但仍残留在标签库里，
 * 变成点不开、也没人用的“孤儿标签”。这里在删除后统一收敛：
 * 保留「仍被任意视频使用」或「仍属于当前标签预设」的标签。
 */
import { loadPreferences } from '../services/settings/appPreferences';

export const CUSTOM_TAGS_KEY = 'dance_echo_custom_tags';
export const TAGS_CHANGED_EVENT = 'danceecho:tags-changed';

export function loadCustomTags(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_TAGS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function saveCustomTags(tags: string[]) {
  localStorage.setItem(CUSTOM_TAGS_KEY, JSON.stringify(tags));
  window.dispatchEvent(new CustomEvent(TAGS_CHANGED_EVENT));
}

/** 当前标签预设里出现过的标签值（这些标签即使暂时没人用也保留）。 */
export function collectPresetTags(): Set<string> {
  const set = new Set<string>();
  try {
    for (const group of loadPreferences().tagPresets) {
      for (const value of group.values) set.add(value);
    }
  } catch {
    /* 预读取失败时按空集合处理 */
  }
  return set;
}

/** 删除视频后调用：remainingVideoTags 为删除后媒体库中仍存在的全部标签。 */
export function pruneCustomTags(remainingVideoTags: Iterable<string>): string[] {
  const keep = new Set(remainingVideoTags);
  for (const tag of collectPresetTags()) keep.add(tag);
  const current = loadCustomTags();
  const next = current.filter((tag) => keep.has(tag));
  if (next.length !== current.length) saveCustomTags(next);
  return next;
}
