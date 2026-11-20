import { db } from '../db';
import type { DailyPracticeLog } from '../../types';
import { api } from '../api/client';

/** 双写服务端（失败仅告警，不打断本地记录） */
function pushLog(log: DailyPracticeLog): void {
  void api
    .upsertPracticeLog(log.date, {
      durationSeconds: log.durationSeconds,
      videoCount: log.videoCount,
      observationCount: log.observationCount,
    })
    .catch((error: unknown) => console.warn('[DanceEcho] 练习日志同步失败（本地已保存）:', error));
}

type Listener = () => void;
const listeners = new Set<Listener>();

function notifySubscribers() {
  for (const listener of listeners) {
    try {
      listener();
    } catch (err) {
      console.error('Error in practiceLogService listener:', err);
    }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('dance-echo-practice-log-updated'));
  }
}

/**
 * 格式化日期为本地 YYYY-MM-DD
 */
export function formatLocalDate(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 获取指定日期的练习记录（若不存在返回全零对象）
 */
export async function getLogForDate(dateStr: string): Promise<DailyPracticeLog> {
  const existing = await db.practiceLogs.get(dateStr);
  if (existing) {
    return existing;
  }
  return {
    date: dateStr,
    durationSeconds: 0,
    videoCount: 0,
    observationCount: 0,
    lastUpdatedAt: Date.now(),
  };
}

/**
 * 累加练舞时长（秒）
 */
export async function recordPracticeDuration(
  seconds: number,
  videoId?: string
): Promise<DailyPracticeLog> {
  const todayStr = formatLocalDate();
  const current = await getLogForDate(todayStr);

  const newDuration = Math.max(0, current.durationSeconds + Math.round(seconds));
  const newVideoCount = videoId && current.videoCount === 0 ? 1 : current.videoCount;

  const updated: DailyPracticeLog = {
    ...current,
    durationSeconds: newDuration,
    videoCount: newVideoCount,
    lastUpdatedAt: Date.now(),
  };

  await db.practiceLogs.put(updated);
  pushLog(updated);
  notifySubscribers();
  return updated;
}

/**
 * 累加心得打卡数
 */
export async function recordObservationCount(count: number = 1): Promise<DailyPracticeLog> {
  const todayStr = formatLocalDate();
  const current = await getLogForDate(todayStr);

  const updated: DailyPracticeLog = {
    ...current,
    observationCount: Math.max(0, current.observationCount + count),
    lastUpdatedAt: Date.now(),
  };

  await db.practiceLogs.put(updated);
  pushLog(updated);
  notifySubscribers();
  return updated;
}

/**
 * 获取近 N 天（默认 35 天）的连续每日热度记录
 * 严格按时间正序排列（从 34 天前到今天）
 */
export async function getRecentDaysLogs(days = 35): Promise<DailyPracticeLog[]> {
  const result: DailyPracticeLog[] = [];
  const today = new Date();

  // 获取数据库中的所有记录，构建快速查找表
  const allLogs = await db.practiceLogs.toArray();
  const logMap = new Map<string, DailyPracticeLog>();
  for (const log of allLogs) {
    logMap.set(log.date, log);
  }

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = formatLocalDate(d);

    const existing = logMap.get(dateStr);
    if (existing) {
      result.push(existing);
    } else {
      result.push({
        date: dateStr,
        durationSeconds: 0,
        videoCount: 0,
        observationCount: 0,
        lastUpdatedAt: 0,
      });
    }
  }

  return result;
}

/**
 * 计算两个日期的周数差
 */
function getWeekKey(d: Date): string {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  // 周四作为基准
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${date.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/**
 * 计算当月练舞概要统计
 */
export async function getMonthlySummary(
  targetYear?: number,
  targetMonth?: number
): Promise<{
  totalMinutes: number;
  activeDays: number;
  totalNotes: number;
  streakWeeks: number;
}> {
  const now = new Date();
  const year = targetYear ?? now.getFullYear();
  const month = targetMonth ?? now.getMonth() + 1;
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;

  const allLogs = await db.practiceLogs.toArray();

  let totalSeconds = 0;
  let activeDays = 0;
  let totalNotes = 0;

  for (const log of allLogs) {
    if (log.date.startsWith(monthPrefix)) {
      totalSeconds += log.durationSeconds;
      totalNotes += log.observationCount;
      if (log.durationSeconds > 0 || log.observationCount > 0) {
        activeDays++;
      }
    }
  }

  // 计算连续打卡周数 Streak Weeks
  // 收集所有打卡活跃的周 Key
  const activeWeeks = new Set<string>();
  for (const log of allLogs) {
    if (log.durationSeconds > 0 || log.observationCount > 0) {
      const parts = log.date.split('-');
      if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        activeWeeks.add(getWeekKey(d));
      }
    }
  }

  let streakWeeks = 0;
  let checkDate = new Date(now);

  // 检查本周是否有打卡
  const currentWeekKey = getWeekKey(checkDate);
  if (!activeWeeks.has(currentWeekKey)) {
    // 宽限机制：如果是本周刚开始且尚无打卡，检查上周是否有打卡，若有则从上周开始向前算连续周
    checkDate.setDate(checkDate.getDate() - 7);
  }

  while (activeWeeks.has(getWeekKey(checkDate))) {
    streakWeeks++;
    checkDate.setDate(checkDate.getDate() - 7);
    if (streakWeeks > 104) break; // 避免无限死循环上限 2 年
  }

  return {
    totalMinutes: Math.floor(totalSeconds / 60),
    activeDays,
    totalNotes,
    streakWeeks,
  };
}

/**
 * 订阅记录变更
 */
export function subscribePracticeLogs(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ── 自动练舞时长监听器（基于浏览器 DOM 事件捕获） ─────────────────────────

let trackerInitialized = false;
let bufferedDurationSeconds = 0;
let flushTimer: number | null = null;
let activeVideoEl: HTMLVideoElement | null = null;
let lastVideoCurrentTime = 0;
let lastWallClockTime = 0;

function flushBufferedTime() {
  if (bufferedDurationSeconds >= 1) {
    const toFlush = bufferedDurationSeconds;
    bufferedDurationSeconds = 0;
    void recordPracticeDuration(toFlush);
  }
}

/**
 * 启动自动全局视频播放练舞计时监控
 */
export function initAutoTracker(): () => void {
  if (trackerInitialized || typeof window === 'undefined') {
    return () => {};
  }
  trackerInitialized = true;

  // 定时每 5 秒冲洗一次缓冲时长到 IndexedDB
  flushTimer = window.setInterval(() => {
    flushBufferedTime();
  }, 5000);

  // 捕获阶段拦截所有视频播放事件
  const handlePlay = (e: Event) => {
    const target = e.target as HTMLElement;
    if (target && target.tagName === 'VIDEO') {
      activeVideoEl = target as HTMLVideoElement;
      lastVideoCurrentTime = activeVideoEl.currentTime;
      lastWallClockTime = Date.now();
    }
  };

  const handleTimeUpdate = (e: Event) => {
    const target = e.target as HTMLElement;
    if (target && target.tagName === 'VIDEO') {
      const video = target as HTMLVideoElement;
      if (!video.paused && !video.ended) {
        const now = Date.now();
        if (lastWallClockTime > 0) {
          const deltaSec = (now - lastWallClockTime) / 1000;
          // 合理的时间增量（0.1s ~ 3s 内算作有效连续播放）
          if (deltaSec > 0.1 && deltaSec < 3.0) {
            bufferedDurationSeconds += deltaSec;
          }
        }
        lastWallClockTime = now;
        lastVideoCurrentTime = video.currentTime;
      }
    }
  };

  const handlePauseOrEnd = () => {
    flushBufferedTime();
    lastWallClockTime = 0;
  };

  const handleVisibilityChange = () => {
    if (document.hidden) {
      flushBufferedTime();
    } else {
      lastWallClockTime = Date.now();
    }
  };

  window.addEventListener('play', handlePlay, true);
  window.addEventListener('timeupdate', handleTimeUpdate, true);
  window.addEventListener('pause', handlePauseOrEnd, true);
  window.addEventListener('ended', handlePauseOrEnd, true);
  window.addEventListener('beforeunload', flushBufferedTime);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // 绑定 Dexie 观察笔记自动累加 hook
  try {
    db.observations.hook('creating', function () {
      void recordObservationCount(1);
    });
  } catch (err) {
    console.warn('Could not attach Dexie creating hook for observations:', err);
  }

  return () => {
    if (flushTimer !== null) clearInterval(flushTimer);
    window.removeEventListener('play', handlePlay, true);
    window.removeEventListener('timeupdate', handleTimeUpdate, true);
    window.removeEventListener('pause', handlePauseOrEnd, true);
    window.removeEventListener('ended', handlePauseOrEnd, true);
    window.removeEventListener('beforeunload', flushBufferedTime);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    flushBufferedTime();
    trackerInitialized = false;
  };
}

/**
 * 载入用于演示的打卡种子数据（方便评测体验）
 */
export async function seedDemoPracticeLogs(): Promise<void> {
  const today = new Date();
  const demoDays = [
    { offset: 0, duration: 42 * 60, notes: 3 },
    { offset: 1, duration: 25 * 60, notes: 1 },
    { offset: 2, duration: 0, notes: 0 },
    { offset: 3, duration: 35 * 60, notes: 2 },
    { offset: 4, duration: 8 * 60, notes: 1 },
    { offset: 5, duration: 50 * 60, notes: 4 },
    { offset: 7, duration: 18 * 60, notes: 1 },
    { offset: 8, duration: 32 * 60, notes: 2 },
    { offset: 10, duration: 15 * 60, notes: 0 },
    { offset: 12, duration: 45 * 60, notes: 2 },
    { offset: 14, duration: 28 * 60, notes: 1 },
    { offset: 15, duration: 60 * 60, notes: 3 },
    { offset: 17, duration: 12 * 60, notes: 1 },
    { offset: 21, duration: 35 * 60, notes: 2 },
    { offset: 23, duration: 20 * 60, notes: 1 },
    { offset: 28, duration: 40 * 60, notes: 3 },
  ];

  for (const item of demoDays) {
    const d = new Date(today);
    d.setDate(today.getDate() - item.offset);
    const dateStr = formatLocalDate(d);
    await db.practiceLogs.put({
      date: dateStr,
      durationSeconds: item.duration,
      videoCount: item.duration > 0 ? 1 : 0,
      observationCount: item.notes,
      lastUpdatedAt: Date.now(),
    });
  }

  notifySubscribers();
}

// 默认在浏览器环境下自动初始化监控
if (typeof window !== 'undefined') {
  initAutoTracker();
}
