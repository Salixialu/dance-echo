import React, { useMemo } from 'react';
import type { DailyPracticeLog } from '../../types';
import { useI18n } from '../../i18n';

export interface PracticeStatsRailProps {
  /** 练习日志（与热力图同一份数据） */
  logs?: DailyPracticeLog[];
  /** 留言总条数 */
  noteTotal?: number;
  /** 库里视频总条数 */
  filmTotal: number;
  /** 库里视频总时长（秒） */
  filmSeconds: number;
  /** 近 12 个月入库条数，旧 → 新 */
  months: { key: string; count: number }[];
  className?: string;
}

const MIN_BAR = 2;
const MAX_BAR = 20;

/** 秒 → 「45 分钟」/「1 小时 20 分钟」，练习时长用 */
function formatSpan(seconds: number, tr: (k: string) => string): string {
  const totalMinutes = Math.floor(seconds / 60);
  if (totalMinutes <= 0) return `0 ${tr('分钟')}`;
  if (totalMinutes < 60) return `${totalMinutes} ${tr('分钟')}`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0
    ? `${hours} ${tr('小时')} ${minutes} ${tr('分钟')}`
    : `${hours} ${tr('小时')}`;
}

/** 秒 → 「13.5 小时」/「40 分钟」，媒体库体量用，保持一行放得下 */
function formatVolume(seconds: number, tr: (k: string) => string): string {
  if (seconds < 3600) return `${Math.max(0, Math.round(seconds / 60))} ${tr('分钟')}`;
  const hours = seconds / 3600;
  return `${hours >= 100 ? Math.round(hours) : hours.toFixed(1)} ${tr('小时')}`;
}

/**
 * 练习轨迹抽屉底部的统计条。
 *
 * 只放三样在这份数据里真的成立的东西：累计练习、留言总数、近 12 个月入库节奏。
 * 标签只有 0.6% 的视频有、BPM 只有 1%，所以这里不做舞种分布一类的图。
 */
export function PracticeStatsRail({
  logs,
  noteTotal = 0,
  filmTotal,
  filmSeconds,
  months,
  className,
}: PracticeStatsRailProps) {
  const { tr } = useI18n();

  const practiceStats = useMemo(() => {
    let days = 0;
    let seconds = 0;
    for (const log of logs || []) {
      if (!log?.date) continue;
      if (log.durationSeconds > 0) {
        days += 1;
        seconds += log.durationSeconds;
      }
    }
    return { days, seconds };
  }, [logs]);

  const maxCount = useMemo(
    () => months.reduce((max, item) => Math.max(max, item.count), 0),
    [months],
  );

  return (
    <div className={`border-t border-white/5 pt-3 ${className ?? ''}`}>
      {/* 累计练习 / 留言 */}
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="text-[10px] text-zinc-500">{tr('累计')}</span>
          <span className="font-mono text-[12px] tabular-nums text-zinc-200">
            {practiceStats.days}
          </span>
          <span className="text-[10px] text-zinc-500">{tr('天')}</span>
          <span className="text-[10px] text-zinc-600">·</span>
          <span className="truncate font-mono text-[12px] tabular-nums text-zinc-200">
            {formatSpan(practiceStats.seconds, tr)}
          </span>
        </span>
        <span className="flex shrink-0 items-baseline gap-1">
          <span className="font-mono text-[12px] tabular-nums text-zinc-200">{noteTotal}</span>
          <span className="text-[10px] text-zinc-500">{tr('条留言')}</span>
        </span>
      </div>

      {/* 近 12 个月入库节奏 */}
      <div className="mt-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="flex items-baseline gap-1">
            <span className="text-[10px] text-zinc-500">{tr('媒体库')}</span>
            <span className="font-mono text-[12px] tabular-nums text-zinc-300">{filmTotal}</span>
            <span className="text-[10px] text-zinc-500">{tr('条')}</span>
            <span className="text-[10px] text-zinc-600">·</span>
            <span className="font-mono text-[12px] tabular-nums text-zinc-300">
              {formatVolume(filmSeconds, tr)}
            </span>
          </span>
          <span className="shrink-0 text-[9px] text-zinc-600">{tr('近 12 个月')}</span>
        </div>

        <div className="mt-1.5 flex h-[20px] items-end gap-1">
          {months.map((item) => {
            const height =
              item.count > 0 && maxCount > 0
                ? Math.max(MIN_BAR, Math.round((item.count / maxCount) * MAX_BAR))
                : MIN_BAR;
            const isMax = item.count > 0 && item.count === maxCount;
            return (
              <div
                key={item.key}
                title={`${item.key} · ${item.count} ${tr('条')}`}
                data-testid={`stats-bar-${item.key}`}
                className={`flex-1 rounded-sm transition-colors ${
                  isMax ? 'bg-cyan-500/60' : item.count > 0 ? 'bg-white/20' : 'bg-white/[0.06]'
                } hover:bg-cyan-400/70`}
                style={{ height: `${height}px` }}
              />
            );
          })}
        </div>

        <div className="mt-1 flex justify-between text-[9px] leading-none text-zinc-600">
          <span>{months[0] ? months[0].key.replace('-', '/') : ''}</span>
          <span>{months[months.length - 1] ? months[months.length - 1].key.replace('-', '/') : ''}</span>
        </div>
      </div>
    </div>
  );
}
