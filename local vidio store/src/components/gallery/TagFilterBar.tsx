/**
 * TagFilterBar.tsx — 双层三态标签过滤栏（对标 4.0.html，Agent B 阶段 1）
 *
 * 父标签（舞种 / 状态 / 来源 / 其他）可折叠展开，
 * 子标签三态：包含（青色）→ 排除（红色删除线）→ 无选中。
 * 交互规则（来自 AGENT_B_PROMPT.md §2）：
 *   - 单击        → 设为「包含」
 *   - Alt+单击    → 设为「排除」
 *   - 双击        → 设为「排除」（防止操作失误）
 *   - 再次点击已选中的 → 清除
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, X, SlidersHorizontal } from 'lucide-react';
import { useVideoStore } from '../../store/useVideoStore';
import { TAG_CATEGORIES, loadTagCategoryAssignments, type TagCategory, type TagCategoryLabel } from '../../services/storage/tagConfig';
import { tagDisplayName } from '../../utils/tagDisplay';

// ─── 工具函数 ──────────────────────────────────────────────────────────────────

function classifyTags(
  allTags: string[],
  categories: TagCategory[],
  assignments: Record<string, TagCategoryLabel>,
): { category: TagCategory | null; label: string; tags: string[] }[] {
  const assigned = new Set<string>();
  const result: { category: TagCategory | null; label: string; tags: string[] }[] = [];

  for (const cat of categories) {
    const matched = allTags.filter((t) => assignments[t] === cat.label || (!assignments[t] && cat.defaultChildren.includes(t)));
    if (matched.length > 0) {
      matched.forEach((t) => assigned.add(t));
      result.push({ category: cat, label: cat.label, tags: matched });
    }
  }

  // 未被任何分组收纳的 tag 归入「其他」
  const others = allTags.filter((t) => assignments[t] === '其他' || !assigned.has(t));
  if (others.length > 0) {
    result.push({ category: null, label: '其他', tags: others });
  }

  return result;
}

// ─── 子组件：单个子标签胶囊 ─────────────────────────────────────────────────

interface TagChipProps {
  tag: string;
  isIncluded: boolean;
  isExcluded: boolean;
  onInclude: (tag: string) => void;
  onExclude: (tag: string) => void;
}

const TagChip: React.FC<TagChipProps> = ({ tag, isIncluded, isExcluded, onInclude, onExclude }) => {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.altKey) {
        onExclude(tag);
      } else {
        onInclude(tag);
      }
    },
    [tag, onInclude, onExclude],
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onExclude(tag);
    },
    [tag, onExclude],
  );

  let chipClass =
    'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all duration-150 cursor-pointer select-none border ';

  if (isIncluded) {
    // 包含态：青色高亮（DESIGN.md §3.3）
    chipClass +=
      'bg-cyan-950/40 text-cyan-300 border-cyan-500/40 hover:bg-cyan-900/50 shadow-[0_0_6px_rgba(34,211,238,0.20)]';
  } else if (isExcluded) {
    // 排除态：红色删除线（DESIGN.md §3.3）
    chipClass +=
      'bg-red-950/40 text-red-400 border-red-500/40 line-through hover:bg-red-900/40';
  } else {
    // 空态：中性色
    chipClass +=
      'bg-zinc-900 text-zinc-400 border-white/[0.06] hover:border-white/20 hover:text-zinc-200 hover:bg-zinc-800';
  }

  return (
    <button
      className={chipClass}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      title={`单击包含 · Alt+单击/双击排除：${tag}`}
    >
      {tagDisplayName(tag)}
    </button>
  );
};

// ─── 主组件：TagFilterBar ────────────────────────────────────────────────────

export const TagFilterBar: React.FC<{ variant?: 'band' | 'panel' }> = ({ variant = 'band' }) => {
  const {
    videos,
    tagFilter,
    toggleTagInclude,
    toggleTagExclude,
    toggleParentExpanded,
    clearTagFilter,
  } = useVideoStore();
  const [assignments, setAssignments] = useState<Record<string, TagCategoryLabel>>(() => loadTagCategoryAssignments());

  useEffect(() => {
    const refresh = () => setAssignments(loadTagCategoryAssignments());
    window.addEventListener('dance-echo-tag-categories-changed', refresh);
    return () => window.removeEventListener('dance-echo-tag-categories-changed', refresh);
  }, []);

  // 收集所有真实存在的 tag
  const allTags = Array.from(new Set(videos.flatMap((v) => v.tags || []))).filter(Boolean);

  if (allTags.length === 0) return null;

  const groups = classifyTags(allTags, TAG_CATEGORIES, assignments);
  const hasActiveFilter =
    tagFilter.includeSet.size > 0 || tagFilter.excludeSet.size > 0;

  return (
    <div
      className={
        variant === 'band'
          ? 'px-6 py-3 border-b border-white/[0.06] bg-zinc-950/75 backdrop-blur-md'
          : 'p-3'
      }
      role="toolbar"
      aria-label="标签过滤栏"
    >
      {/* 标题行 */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
          <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-500" />
          标签过滤
          {hasActiveFilter && (
            <span className="px-1.5 py-0.5 rounded-full bg-cyan-950/60 text-cyan-400 border border-cyan-500/30 font-mono text-[10px]">
              {tagFilter.includeSet.size + tagFilter.excludeSet.size} 已选
            </span>
          )}
        </div>
        {hasActiveFilter && (
          <button
            onClick={clearTagFilter}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition"
            title="清除所有过滤条件"
          >
            <X className="w-3 h-3" />
            清除
          </button>
        )}
      </div>

      {/* 分组列表 */}
      <div className="space-y-1.5">
        {groups.map(({ category, label, tags }) => {
          const isExpanded = tagFilter.expandedParents.has(label);
          const dotColor = category?.color ?? '#71717A';
          // 该分组内是否有任何选中的 tag
          const groupHasActive = tags.some(
            (t) => tagFilter.includeSet.has(t) || tagFilter.excludeSet.has(t),
          );

          return (
            <div key={label}>
              {/* 父标签折叠行 */}
              <button
                onClick={() => toggleParentExpanded(label)}
                className={`flex items-center gap-1.5 w-full text-left px-1.5 py-1 rounded-md transition group ${
                  isExpanded
                    ? 'bg-zinc-800/60 text-zinc-200'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40'
                }`}
              >
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3 flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-3 h-3 flex-shrink-0" />
                )}
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: dotColor }}
                />
                <span className="text-[11px] font-semibold tracking-wide">{label}</span>
                <span className="ml-auto text-[10px] font-mono text-zinc-600 group-hover:text-zinc-500">
                  {tags.length}
                </span>
                {groupHasActive && !isExpanded && (
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 flex-shrink-0" />
                )}
              </button>

              {/* 子标签胶囊（展开时显示；弹窗形态直接全量展示，避免"空壳折叠"） */}
              {(isExpanded || variant === 'panel') && (
                <div className="flex flex-wrap gap-1.5 pl-5 pt-1.5 pb-0.5">
                  {tags.map((tag) => (
                    <TagChip
                      key={tag}
                      tag={tag}
                      isIncluded={tagFilter.includeSet.has(tag)}
                      isExcluded={tagFilter.excludeSet.has(tag)}
                      onInclude={toggleTagInclude}
                      onExclude={toggleTagExclude}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
