/**
 * 标签的「显示名」与「分类」。
 *
 * 标签数据有两种形态：
 * - `分类:值`（如 `舞种:Jazz`）：预设点选写入，分类信息自带在标签里；
 * - 纯名字（如 `待复盘`）：手打标签，没有分类。
 *
 * 界面上默认只显示「名字」部分（Jazz / 待复盘），完整标签放进 title / aria-label，
 * 避免每个 chip 都挂着「舞种:」前缀。
 */
export function tagDisplayName(tag: string): string {
  const index = tag.indexOf(':');
  if (index < 0) return tag;
  const name = tag.slice(index + 1).trim();
  return name || tag;
}

/** 标签里自带的分类前缀（没有则返回空串）。 */
export function tagPrefix(tag: string): string {
  const index = tag.indexOf(':');
  if (index <= 0) return '';
  return tag.slice(0, index).trim();
}

/** 分组：优先用用户显式归类，其次用标签自带前缀，最后归入「其他」。 */
export function tagCategory(tag: string, assignment?: string): string {
  if (assignment && assignment.trim()) return assignment.trim();
  const prefix = tagPrefix(tag);
  return prefix || '其他';
}
