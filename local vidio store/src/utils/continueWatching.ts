import type { VideoItem } from '../types';

/**
 * “最近观看 / 继续观看”的唯一判定规则。
 *
 * 之前侧边栏用「进度 > 1 秒」计数，播放器网格却用「进度 ≥ max(5 秒, 8%) 且未看完且 45 天内」过滤，
 * 于是侧边栏显示 1、点进去却是空的。这里收敛成一份谓词，两边共用，标签数量与列表内容永远一致。
 */
export const CONTINUE_START_MIN_SECONDS = 5;
export const CONTINUE_START_RATIO = 0.08;
export const CONTINUE_DONE_RATIO = 0.95;
export const CONTINUE_STALE_MS = 45 * 24 * 60 * 60 * 1000;

export function isContinueWatching(video: VideoItem, now: number = Date.now()): boolean {
  const progress = video.playbackPosition || 0;
  const duration = video.duration || 0;
  const startGate = Math.max(CONTINUE_START_MIN_SECONDS, duration * CONTINUE_START_RATIO);
  if (progress < startGate) return false;
  if (duration > 0 && progress >= duration * CONTINUE_DONE_RATIO) return false;
  const lastPlayed = video.lastPlayedAt || 0;
  if (lastPlayed && now - lastPlayed > CONTINUE_STALE_MS) return false;
  return true;
}

export function countContinueWatching(videos: VideoItem[], now: number = Date.now()): number {
  return videos.reduce((total, video) => (isContinueWatching(video, now) ? total + 1 : total), 0);
}
