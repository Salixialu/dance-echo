/**
 * tagConfig.ts — 双层标签体系配置 + 算法函数（直接移植自 SNIPPETS.md 2.x 节）
 * Agent B 专属文件，对标 4.0.html 标签系统。
 */

// ─── 标签层级配置 ────────────────────────────────────────────────────────────

export interface TagCategory {
  /** 父标签显示名称（如 "舞种"） */
  label: string;
  /** 匹配该分组的子标签关键词（子集，运行时从实际 tags 扩充） */
  defaultChildren: string[];
  /** 颜色语义标记（用于父标签头部色点区分） */
  color: string;
}

/**
 * 预设的父标签分组配置。
 * 子标签在运行时从所有视频 tags 中动态归入，匹配 defaultChildren 中的项，
 * 其余未匹配的 tag 统一归入「其他」组。
 */
export const TAG_CATEGORIES: TagCategory[] = [
  {
    label: '老师',
    defaultChildren: [],
    color: '#F472B6', // Pink
  },
  {
    label: '舞种',
    defaultChildren: ['Jazz', 'HipHop', 'Kpop', 'Urban', 'Breaking', 'Contemporary', 'Waacking', 'Locking', 'Popping', '编舞', '律动', '步法'],
    color: '#22D3EE', // Motion Cyan
  },
  {
    label: '来源',
    defaultChildren: ['内置示范', '老师示范', '自己练习', '课堂录像', '本地导入', '本地文件夹', '内置示范库', '单文件导入'],
    color: '#F59E0B', // Amber
  },
  {
    label: '难度',
    defaultChildren: [],
    color: '#A78BFA', // Violet
  },
];

export const TAG_CATEGORY_STORAGE_KEY = 'dance_echo_tag_categories';

/**
 * 标签分类的可选值：内置分类 + 用户在设置里自定义的预设分类名。
 * 用字符串而不是字面量联合，是为了让「老师 / 难度 / 自定义分类」都能归类。
 */
export type TagCategoryLabel = string;

/** 预设分类名（老师 / 舞种 / 来源 / 难度 / 自定义…），供标签库分组与归类下拉使用。 */
export function loadCategoryLabels(): string[] {
  const labels = new Set<string>(TAG_CATEGORIES.map((category) => category.label));
  try {
    // 动态读取，避免 tagConfig 与设置模块形成静态循环依赖
    const raw = localStorage.getItem('dance_echo_tag_presets');
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      for (const group of parsed) {
        const name = typeof group?.name === 'string' ? group.name.trim() : '';
        if (name) labels.add(name);
      }
    }
  } catch {
    /* 预设解析失败时只保留内置分类 */
  }
  labels.add('其他');
  return [...labels];
}

export function loadTagCategoryAssignments(): Record<string, TagCategoryLabel> {
  try {
    const parsed = JSON.parse(localStorage.getItem(TAG_CATEGORY_STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

export function saveTagCategoryAssignment(tag: string, category: TagCategoryLabel) {
  const next = loadTagCategoryAssignments();
  next[tag] = category;
  localStorage.setItem(TAG_CATEGORY_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('dance-echo-tag-categories-changed'));
}

/** 取消显式归类，回到“按标签前缀自动归类”。 */
export function clearTagCategoryAssignment(tag: string) {
  const next = loadTagCategoryAssignments();
  if (!(tag in next)) return;
  delete next[tag];
  localStorage.setItem(TAG_CATEGORY_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('dance-echo-tag-categories-changed'));
}

// ─── 三态过滤算法（直接移植自 SNIPPETS.md §2） ────────────────────────────────

export type FilterAction = 'none' | 'include' | 'exclude';

export interface TagFilterState {
  includeSet: Set<string>;
  excludeSet: Set<string>;
  expandedParents: Set<string>;
}

export function makeEmptyTagFilter(): TagFilterState {
  return {
    includeSet: new Set(),
    excludeSet: new Set(),
    expandedParents: new Set(),
  };
}

/**
 * 三态循环转移算法（移植自 SNIPPETS.md §2.1）
 * 正常单击：无 → 包含 → 取消
 * Alt+单击 / 双击：快捷切换为排除态
 */
export function cycleTagState(
  tag: string,
  state: TagFilterState,
  isAltClickOrDoubleClick: boolean = false,
): TagFilterState {
  const nextInclude = new Set(state.includeSet);
  const nextExclude = new Set(state.excludeSet);

  if (isAltClickOrDoubleClick) {
    if (nextExclude.has(tag)) {
      nextExclude.delete(tag);
    } else {
      nextExclude.add(tag);
      nextInclude.delete(tag);
    }
  } else {
    if (nextInclude.has(tag)) {
      nextInclude.delete(tag);
    } else {
      nextInclude.add(tag);
      nextExclude.delete(tag);
    }
  }

  return { ...state, includeSet: nextInclude, excludeSet: nextExclude };
}

/**
 * 视频匹配过滤判定（移植自 SNIPPETS.md §2.1）
 * 1. 排除优先：命中任何 excludeSet 成员则淘汰
 * 2. 包含检查：必须满足所有 includeSet 成员
 */
export function isVideoMatchingTags(
  videoTags: string[],
  filterState: TagFilterState,
): boolean {
  const tags = new Set(videoTags || []);

  for (const ex of filterState.excludeSet) {
    if (tags.has(ex)) return false;
  }

  for (const inc of filterState.includeSet) {
    if (!tags.has(inc)) return false;
  }

  return true;
}

// ─── 虚拟文件夹树算法（移植自 SNIPPETS.md §4） ────────────────────────────────

export interface TreeNode {
  name: string;
  fullPath: string;
  children: Map<string, TreeNode>;
  /** 当前目录及其所有子目录内的视频总数（徽标口径） */
  videoCount: number;
  /** 仅当前目录直接包含的视频数（不含子目录） */
  directCount: number;
  isVirtual?: boolean;
}

/**
 * 从 flat 路径数组构建多层嵌套 TreeNode（移植自 SNIPPETS.md §4）
 */
export function buildFolderTree(videoPaths: string[], persistedPaths: string[] = []): TreeNode {
  const root: TreeNode = {
    name: '全部视频',
    fullPath: '',
    children: new Map(),
    videoCount: videoPaths.length,
    directCount: 0,
  };

  for (const path of videoPaths) {
    if (!path) continue;
    const parts = path.split('/').filter(Boolean);
    const lastPart = parts[parts.length - 1] || '';
    const isFileName = /\.(mp4|mov|mkv|webm|ogg|avi|flv|m4v)$/i.test(lastPart);
    if (isFileName) {
      parts.pop();
    }
    if (parts.length === 0) {
      root.directCount += 1;
      continue;
    }

    let curr = root;
    let currPath = '';
    for (const part of parts) {
      currPath = currPath ? `${currPath}/${part}` : part;
      if (!curr.children.has(part)) {
        curr.children.set(part, {
          name: part,
          fullPath: currPath,
          children: new Map(),
          videoCount: 0,
          directCount: 0,
        });
      }
      curr = curr.children.get(part)!;
      curr.videoCount += 1;
    }
    // 最深一级目录才是该视频的"直接父目录"
    curr.directCount += 1;
  }

  for (const folderPath of persistedPaths) {
    const parts = folderPath.split('/').filter(Boolean);
    let curr = root;
    let currPath = '';
    for (const part of parts) {
      currPath = currPath ? `${currPath}/${part}` : part;
      if (!curr.children.has(part)) {
        curr.children.set(part, {
          name: part,
          fullPath: currPath,
          children: new Map(),
          videoCount: 0,
          directCount: 0,
          isVirtual: true,
        });
      }
      curr = curr.children.get(part)!;
    }
  }

  return root;
}

/** 统计某节点下的子孙文件夹数量（不含自身） */
export function countSubfolders(node: TreeNode | undefined): number {
  if (!node) return 0;
  let total = 0;
  for (const child of node.children.values()) {
    total += 1 + countSubfolders(child);
  }
  return total;
}

/** 在树中按 fullPath 查找节点 */
export function findFolderNode(root: TreeNode, fullPath: string): TreeNode | undefined {
  if (fullPath === '') return root;
  const parts = fullPath.split('/').filter(Boolean);
  let curr: TreeNode | undefined = root;
  for (const part of parts) {
    curr = curr?.children.get(part);
    if (!curr) return undefined;
  }
  return curr;
}

// ─── Video Hub Hover Scrubbing 算法（移植自 SNIPPETS.md §3）──────────────────

/**
 * 鼠标在封面上水平滑动时，根据鼠标横轴百分比计算抽帧时间点。
 */
export function calculateScrubbingTime(
  clientX: number,
  containerRect: DOMRect,
  duration: number,
): number {
  if (duration <= 0) return 0;
  const offsetX = clientX - containerRect.left;
  const ratio = Math.max(0, Math.min(1, offsetX / containerRect.width));
  return ratio * duration;
}

