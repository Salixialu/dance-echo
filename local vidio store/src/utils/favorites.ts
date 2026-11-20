/**
 * 收藏的唯一判定规则。
 *
 * 数据仍以 rating 存储（历史兼容）：收藏写 5，取消写 0。
 * UI 与筛选都从这里取值，避免出现 4 / 3 / 5 三套阈值。
 */
export const FAVORITE_RATING = 5;

export function isFavorite(rating: number | null | undefined): boolean {
  return (rating ?? 0) >= FAVORITE_RATING;
}

/** 收藏按钮的写入值：已收藏则取消，否则收藏。 */
export function nextFavoriteRating(rating: number | null | undefined): number {
  return isFavorite(rating) ? 0 : FAVORITE_RATING;
}
