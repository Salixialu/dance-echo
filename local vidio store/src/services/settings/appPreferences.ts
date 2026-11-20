/**
 * 应用偏好设置（本地持久化）
 * ---------------------------------------------------------------
 * 目前只有姿态识别相关的性能/精度开关。之所以放在 localStorage 而不是
 * IndexedDB：这些设置在 MediaPipe 模型初始化之前就要读到（同步读取），
 * 而初始化是应用启动时的第一件事。
 */

export type PoseQuality = 'lite' | 'full';
/** 头部呈现：cross = 颈线+耳线（轻量）；sphere = 半透明球 + 视线箭头（接近动捕软件） */
export type PoseHeadModel = 'cross' | 'sphere';

/** 标签预设的一个维度，比如「老师」「舞种」「来源」。值会以「维度:值」写入标签 */
export interface TagPresetGroup {
  name: string;
  values: string[];
}

export interface AppPreferences {
  /** 姿态模型精度：lite = 极速（默认，低延迟）/ full = 高精度（更慢更稳） */
  poseQuality: PoseQuality;
  /** 是否识别多人（2 人）。开启后单帧推理成本翻倍，跟手性会明显下降 */
  allowMultiPose: boolean;
  /** 头部画法 */
  poseHeadModel: PoseHeadModel;
  /** 标签预设维度（老师在信息页点选，不必每次手打） */
  tagPresets: TagPresetGroup[];
}

/** 默认预设：老师留空由用户自己填，其余给一份可直接用的起点 */
export const DEFAULT_TAG_PRESETS: TagPresetGroup[] = [
  { name: '老师', values: [] },
  { name: '舞种', values: ['Jazz', 'Hiphop', 'Popping', 'Locking', 'Waacking', 'Breaking', 'K-pop'] },
  { name: '来源', values: ['舞室', '网络', '演出'] },
  { name: '难度', values: ['入门', '进阶', '高难'] },
];

const QUALITY_KEY = 'dance_echo_pose_quality';
const MULTI_KEY = 'dance_echo_pose_multi';
const HEAD_KEY = 'dance_echo_pose_head';
const TAG_PRESETS_KEY = 'dance_echo_tag_presets';

export const DEFAULT_PREFERENCES: AppPreferences = {
  poseQuality: 'full',
  allowMultiPose: false,
  poseHeadModel: 'cross',
  tagPresets: DEFAULT_TAG_PRESETS,
};

function parseTagPresets(raw: string | null): TagPresetGroup[] {
  if (!raw) return DEFAULT_TAG_PRESETS.map((group) => ({ ...group, values: [...group.values] }));
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_TAG_PRESETS.map((group) => ({ ...group, values: [...group.values] }));
    return parsed
      .filter((group) => group && typeof group.name === 'string')
      .map((group) => ({
        name: String(group.name).trim(),
        values: Array.isArray(group.values)
          ? group.values.map((value: unknown) => String(value).trim()).filter(Boolean)
          : [],
      }))
      .filter((group) => group.name.length > 0);
  } catch {
    return DEFAULT_TAG_PRESETS.map((group) => ({ ...group, values: [...group.values] }));
  }
}

export function loadPreferences(): AppPreferences {
  if (typeof window === 'undefined') return { ...DEFAULT_PREFERENCES };
  try {
    const quality = window.localStorage.getItem(QUALITY_KEY);
    const multi = window.localStorage.getItem(MULTI_KEY);
    const head = window.localStorage.getItem(HEAD_KEY);
    return {
      poseQuality: quality === 'full' ? 'full' : 'lite',
      allowMultiPose: multi === '1',
      poseHeadModel: head === 'sphere' ? 'sphere' : 'cross',
      tagPresets: parseTagPresets(window.localStorage.getItem(TAG_PRESETS_KEY)),
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(next: Partial<AppPreferences>): AppPreferences {
  const current = loadPreferences();
  const merged: AppPreferences = { ...current, ...next };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(QUALITY_KEY, merged.poseQuality);
      window.localStorage.setItem(MULTI_KEY, merged.allowMultiPose ? '1' : '0');
      window.localStorage.setItem(HEAD_KEY, merged.poseHeadModel);
      window.localStorage.setItem(TAG_PRESETS_KEY, JSON.stringify(merged.tagPresets));
    } catch {
      // 隐私模式等场景下写入失败不应阻断界面
    }
  }
  return merged;
}
