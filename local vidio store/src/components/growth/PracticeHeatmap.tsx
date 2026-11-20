import React, { useState, useEffect, useMemo } from 'react';
import type { DailyPracticeLog } from '../../types';
import { useI18n } from '../../i18n';
import {
  getRecentDaysLogs,
  subscribePracticeLogs,
  formatLocalDate,
} from '../../services/storage/practiceLogService';

export interface PracticeHeatmapProps {
  /** 练习日志；不传则自己从 storage 读取并订阅 */
  logs?: DailyPracticeLog[];
  /** 按天视频数（date 字符串 → 数量）：没有计时记录的日期用它折算深浅 */
  videoCounts?: Record<string, number>;
  /** 紧凑模式：不带月份切换与统计行，用于弹窗内 */
  compact?: boolean;
  onCellClick?: (dateStr: string) => void;
  selectedDate?: string;
  className?: string;
  /** 受控月份（该月 1 号）；不传则自己管 */
  month?: Date;
  onMonthChange?: (month: Date) => void;
  /** 每月统计行的口径后缀，如「次」「分钟」 */
  showSummary?: boolean;
}

export type HeatLevel = 0 | 1 | 2 | 3;

/** 只按时长分档（保留旧行为，GrowthStatsModal 等仍在用） */
export function getHeatLevel(log: DailyPracticeLog): HeatLevel {
  const minutes = Math.floor(log.durationSeconds / 60);
  if (minutes === 0 && log.observationCount === 0) return 0;
  if (minutes < 10) return 1;
  if (minutes <= 30) return 2;
  return 3;
}

/**
 * 一天的档位：有真实练习时长就按时长（<10m / ≤30m / >30m），
 * 没有则按当天整理的视频数折算（1 / 2 / 3+）。
 */
export function resolveDayLevel(
  dateStr: string,
  logMap: Map<string, DailyPracticeLog>,
  videoCounts?: Record<string, number>,
): HeatLevel {
  const log = logMap.get(dateStr);
  if (log && log.durationSeconds > 0) return getHeatLevel(log);
  const count = videoCounts?.[dateStr] ?? 0;
  if (count <= 0) return 0;
  if (count >= 5) return 3;
  return count >= 2 ? 2 : 1;
}

/** 4 级色阶：单色系递进，不用发光与缩放，避免工作台里喧闹 */
export const HEAT_CLASSES: Record<HeatLevel, string> = {
  0: 'bg-white/[0.045] ring-1 ring-inset ring-white/[0.055] hover:ring-white/20',
  1: 'bg-cyan-950/70 ring-1 ring-inset ring-cyan-900/40 hover:ring-cyan-700/60',
  2: 'bg-cyan-800/70 ring-1 ring-inset ring-cyan-600/35 hover:ring-cyan-500/60',
  3: 'bg-cyan-500/75 ring-1 ring-inset ring-cyan-300/30 hover:ring-cyan-200/70',
};

/** 格子里的日期数字：按底色深浅换字色，保证对比度 */
const DAY_NUMBER_CLASSES: Record<HeatLevel, string> = {
  0: 'text-zinc-500',
  1: 'text-cyan-300/70',
  2: 'text-cyan-100/85',
  3: 'text-zinc-950/85',
};

const WEEKDAY_FULL_ZH = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const WEEKDAY_FULL_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_LABELS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const dateKey = (d: Date) => formatLocalDate(d);

export const PracticeHeatmap: React.FC<PracticeHeatmapProps> = ({
  logs: externalLogs,
  videoCounts,
  compact = false,
  onCellClick,
  selectedDate,
  className = '',
  month: controlledMonth,
  onMonthChange,
  showSummary = true,
}) => {
  const { tr, locale } = useI18n();
  const [internalLogs, setInternalLogs] = useState<DailyPracticeLog[]>([]);
  const [monthState, setMonthState] = useState<Date>(() => startOfMonth(new Date()));
  const [hovered, setHovered] = useState<{ dateStr: string; level: HeatLevel; x: number; y: number } | null>(
    null,
  );

  const month = controlledMonth ? startOfMonth(controlledMonth) : monthState;
  const setMonth = (next: Date) => {
    if (!controlledMonth) setMonthState(next);
    onMonthChange?.(next);
  };

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const todayStr = useMemo(() => dateKey(today), [today]);

  // 没有外部 logs 时自己读库并订阅
  useEffect(() => {
    if (externalLogs) return;
    let active = true;
    const load = async () => {
      const data = await getRecentDaysLogs(400);
      if (active) setInternalLogs(data);
    };
    void load();
    const unsubscribe = subscribePracticeLogs(() => {
      void load();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [externalLogs]);

  const logMap = useMemo(() => {
    const map = new Map<string, DailyPracticeLog>();
    for (const log of externalLogs || internalLogs) {
      if (log.date) map.set(log.date, log);
    }
    return map;
  }, [externalLogs, internalLogs]);

  // 可翻到的最早月份：有日志或有视频计数的第一个月
  const earliestMonth = useMemo(() => {
    let min: Date | null = null;
    const keys = [...logMap.keys(), ...Object.keys(videoCounts || {})];
    for (const key of keys) {
      const [y, m] = key.split('-').map(Number);
      if (!y || !m) continue;
      const candidate = new Date(y, m - 1, 1);
      if (!min || candidate.getTime() < min.getTime()) min = candidate;
    }
    return min;
  }, [logMap, videoCounts]);

  const currentMonth = useMemo(() => startOfMonth(today), [today]);
  const canPrev = !!earliestMonth && month.getTime() > earliestMonth.getTime();
  const canNext = month.getTime() < currentMonth.getTime();
  const isCurrentMonth = month.getTime() === currentMonth.getTime();

  // 月历行：日期一律由「当月 1 号 + 偏移」算，不在循环里累加
  const weeks = useMemo(() => {
    const first = startOfMonth(month);
    const startDow = (first.getDay() + 6) % 7; // 周一 = 0
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const rowCount = Math.ceil((startDow + daysInMonth) / 7);
    const rows: { blank: boolean; dateStr: string; day: number; future: boolean }[][] = [];

    for (let r = 0; r < rowCount; r++) {
      const row: { blank: boolean; dateStr: string; day: number; future: boolean }[] = [];
      for (let c = 0; c < 7; c++) {
        const offset = r * 7 + c - startDow;
        const day = offset + 1;
        if (day < 1 || day > daysInMonth) {
          row.push({ blank: true, dateStr: '', day: 0, future: false });
          continue;
        }
        const date = new Date(month.getFullYear(), month.getMonth(), day);
        row.push({
          blank: false,
          dateStr: dateKey(date),
          day,
          future: date.getTime() > today.getTime(),
        });
      }
      rows.push(row);
    }
    return rows;
  }, [month, today]);

  // 本月合计：练了几天 / 多少分钟（与格子同一份口径）
  const monthStats = useMemo(() => {
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    let activeDays = 0;
    let minutes = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const key = dateKey(new Date(month.getFullYear(), month.getMonth(), day));
      const level = resolveDayLevel(key, logMap, videoCounts);
      if (level === 0) continue;
      activeDays += 1;
      const log = logMap.get(key);
      minutes += log ? Math.floor(log.durationSeconds / 60) : 0;
    }
    return { activeDays, minutes };
  }, [month, logMap, videoCounts]);

  // 连续周：从本周往回数，直到某一周完全没有练
  const streakWeeks = useMemo(() => {
    const endDow = (today.getDay() + 6) % 7;
    let streak = 0;
    for (let w = 0; w < 12; w++) {
      const monday = new Date(today);
      monday.setDate(today.getDate() - endDow - w * 7);
      let hit = false;
      for (let d = 0; d < 7; d++) {
        const date = new Date(monday);
        date.setDate(monday.getDate() + d);
        if (date.getTime() > today.getTime()) break;
        if (resolveDayLevel(dateKey(date), logMap, videoCounts) > 0) {
          hit = true;
          break;
        }
      }
      if (!hit) break;
      streak += 1;
    }
    return streak;
  }, [today, logMap, videoCounts]);

  const monthLabel =
    locale === 'en'
      ? `${MONTH_LABELS_EN[month.getMonth()]} ${month.getFullYear()}`
      : `${month.getFullYear()} 年 ${month.getMonth() + 1} 月`;

  const weekdayLabels =
    locale === 'en' ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'] : ['一', '二', '三', '四', '五', '六', '日'];

  return (
    <div className={`relative select-none ${className}`}>
      {/* 月份切换：只在非紧凑模式出现 */}
      {!compact && (
        <div className="mb-2.5 flex items-center gap-1">
          <button
            type="button"
            data-testid="calendar-prev-month"
            disabled={!canPrev}
            onClick={() => canPrev && setMonth(addMonths(month, -1))}
            className="grid h-6 w-6 place-items-center rounded-md text-[13px] leading-none text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200 disabled:opacity-25 disabled:hover:bg-transparent"
            aria-label={tr('上个月')}
          >
            ‹
          </button>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[13px] font-medium tracking-tight text-zinc-100">{monthLabel}</span>
            {isCurrentMonth && (
              <span className="rounded bg-cyan-500/10 px-1 py-px text-[9px] leading-[14px] text-cyan-300/80">
                {tr('本月')}
              </span>
            )}
          </div>
          <button
            type="button"
            data-testid="calendar-next-month"
            disabled={!canNext}
            onClick={() => canNext && setMonth(addMonths(month, 1))}
            className="grid h-6 w-6 place-items-center rounded-md text-[13px] leading-none text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200 disabled:opacity-25 disabled:hover:bg-transparent"
            aria-label={tr('下个月')}
          >
            ›
          </button>
          {!isCurrentMonth && (
            <button
              type="button"
              data-testid="calendar-this-month"
              onClick={() => setMonth(currentMonth)}
              className="ml-auto rounded-md px-1.5 py-0.5 text-[10px] text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300"
            >
              {tr('回到本月')}
            </button>
          )}
        </div>
      )}

      {/* 星期表头：与格子同为 7 列，天然对齐 */}
      <div className="mb-1 grid grid-cols-7 gap-1" aria-hidden>
        {weekdayLabels.map((label, index) => (
          <div key={index} className="text-center text-[10px] leading-none text-zinc-500">
            {label}
          </div>
        ))}
      </div>

      {/* 月历网格：7 列自适应，格子用 aspect-square 跟着容器宽度走 */}
      <div className="grid grid-cols-7 gap-1" role="grid" aria-label={tr('练习轨迹')}>
        {weeks.map((row, rowIndex) =>
          row.map((cell, cellIndex) => {
            if (cell.blank) {
              return <div key={`blank-${rowIndex}-${cellIndex}`} className="aspect-square" aria-hidden />;
            }
            const log = logMap.get(cell.dateStr);
            const level = cell.future ? 0 : resolveDayLevel(cell.dateStr, logMap, videoCounts);
            const isToday = cell.dateStr === todayStr;
            const isSelected = selectedDate === cell.dateStr;

            return (
              <button
                key={cell.dateStr}
                type="button"
                role="gridcell"
                data-testid={`calendar-day-${cell.dateStr}`}
                disabled={cell.future}
                onClick={() => !cell.future && onCellClick?.(cell.dateStr)}
                onMouseEnter={(event) => {
                  if (cell.future) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  setHovered({
                    dateStr: cell.dateStr,
                    level,
                    x: rect.left + rect.width / 2,
                    y: rect.top,
                  });
                }}
                onMouseLeave={() => setHovered(null)}
                className={`relative aspect-square w-full rounded-md transition-colors duration-100 ${
                  HEAT_CLASSES[level]
                } ${cell.future ? 'opacity-25' : ''} ${
                  isToday && !isSelected ? 'ring-1 ring-inset ring-cyan-300/60' : ''
                } ${isSelected ? 'ring-2 ring-inset ring-zinc-200' : ''}`}
                aria-label={cell.dateStr}
              >
                <span
                  className={`absolute left-[5px] top-[4px] font-mono text-[10px] leading-none tabular-nums ${
                    DAY_NUMBER_CLASSES[level]
                  }`}
                >
                  {cell.day}
                </span>
              </button>
            );
          }),
        )}
      </div>

      {hovered && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-white/10 bg-zinc-900/95 px-2 py-1.5 text-[11px] text-zinc-300 shadow-xl"
          style={{ left: hovered.x, top: hovered.y - 6 }}
        >
          <HoverCard
            dateStr={hovered.dateStr}
            log={logMap.get(hovered.dateStr)}
            videoCount={videoCounts?.[hovered.dateStr] ?? 0}
          />
        </div>
      )}

      {/* 本月合计 + 连续周数：把日历下方的空白用起来 */}
      {!compact && showSummary && (
        <div className="mt-3 flex items-baseline gap-1.5 border-t border-white/[0.055] pt-2.5 text-[11px] text-zinc-500">
          <span className="font-mono text-[13px] tabular-nums text-zinc-200">{monthStats.activeDays}</span>
          <span>{tr('天有练习')}</span>
          <span className="text-zinc-700">·</span>
          <span className="font-mono text-[13px] tabular-nums text-zinc-200">{monthStats.minutes}</span>
          <span>{tr('分钟')}</span>
          {streakWeeks > 0 && (
            <span className="ml-auto text-[10px] text-amber-700/90">
              {tr('连续')} <b className="font-semibold text-amber-500/90">{streakWeeks}</b> {tr('周')}
            </span>
          )}
        </div>
      )}

      {!compact && (
        <div className="mt-2 flex items-center gap-1 text-[10px] text-zinc-600">
          <span>{tr('少')}</span>
          {([0, 1, 2, 3] as HeatLevel[]).map((level) => (
            <span
              key={level}
              className={`inline-block rounded-[2px] ${HEAT_CLASSES[level]}`}
              style={{ width: 9, height: 9 }}
            />
          ))}
          <span>{tr('多')}</span>
          <span className="ml-auto text-[9px] text-zinc-700">{tr('有计时按时长 · 否则按视频数')}</span>
        </div>
      )}
    </div>
  );
};

const HoverCard: React.FC<{
  dateStr: string;
  log?: DailyPracticeLog;
  videoCount: number;
}> = ({ dateStr, log, videoCount }) => {
  const { tr, locale } = useI18n();
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const weekday = (locale === 'en' ? WEEKDAY_FULL_EN : WEEKDAY_FULL_ZH)[(date.getDay() + 6) % 7];
  const minutes = log ? Math.floor(log.durationSeconds / 60) : 0;
  const notes = log?.observationCount ?? 0;
  const hasDuration = minutes > 0;

  return (
    <div className="space-y-0.5">
      <div className="font-medium text-zinc-200">
        {locale === 'en' ? `${month}/${day} · ${weekday}` : `${month} 月 ${day} 日 · ${weekday}`}
      </div>
      {hasDuration ? (
        <div>
          {tr('练了')} <span className="font-mono text-cyan-300">{minutes}</span> {tr('分钟')}
          {videoCount > 0 && (
            <>
              {' · '}
              <span className="font-mono text-zinc-200">{videoCount}</span> {tr('个视频')}
            </>
          )}
          {notes > 0 && (
            <>
              {' · '}
              <span className="font-mono text-zinc-200">{notes}</span> {tr('条留言')}
            </>
          )}
        </div>
      ) : videoCount > 0 ? (
        <div>
          {tr('当天整理')} <span className="font-mono text-zinc-200">{videoCount}</span> {tr('个视频')}
          <span className="text-zinc-500">{tr('（按视频数折算）')}</span>
        </div>
      ) : (
        <div className="text-zinc-500">{tr('没有记录')}</div>
      )}
    </div>
  );
};

export default PracticeHeatmap;
