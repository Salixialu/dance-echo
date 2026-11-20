import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Flame,
  Sparkles,
  CalendarDays,
  Clock,
  NotebookPen,
  CalendarCheck2,
  TrendingUp,
  PlusCircle,
  RefreshCw,
} from 'lucide-react';
import { PracticeHeatmap } from './PracticeHeatmap';
import {
  getMonthlySummary,
  subscribePracticeLogs,
  recordPracticeDuration,
  recordObservationCount,
  seedDemoPracticeLogs,
} from '../../services/storage/practiceLogService';

export interface GrowthStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GrowthStatsModal: React.FC<GrowthStatsModalProps> = ({ isOpen, onClose }) => {
  const [summary, setSummary] = useState({
    totalMinutes: 0,
    activeDays: 0,
    totalNotes: 0,
    streakWeeks: 0,
  });
  const [isLoading, setIsLoading] = useState(false);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const loadData = async () => {
    const res = await getMonthlySummary(currentYear, currentMonth);
    setSummary(res);
  };

  useEffect(() => {
    if (!isOpen) return;

    void loadData();
    const unsubscribe = subscribePracticeLogs(() => {
      void loadData();
    });

    return () => {
      unsubscribe();
    };
  }, [isOpen]);

  // 手动模拟增加 15 分钟练习（方便测试）
  const handleSimulatePractice = async () => {
    setIsLoading(true);
    await recordPracticeDuration(15 * 60);
    await loadData();
    setIsLoading(false);
  };

  // 手动模拟增加 1 条心得打卡
  const handleSimulateNote = async () => {
    setIsLoading(true);
    await recordObservationCount(1);
    await loadData();
    setIsLoading(false);
  };

  // 载入演示数据
  const handleSeedDemo = async () => {
    setIsLoading(true);
    await seedDemoPracticeLogs();
    await loadData();
    setIsLoading(false);
  };

  // 根据心得和练习状态生成激励回看语
  const getGrowthInsight = () => {
    if (summary.totalNotes >= 5) {
      return {
        title: '你已经不再只记录“哪里没跟上”。',
        body: '最近的笔记开始写下重量、呼吸和音乐之间的关系。身体对律动的敏感度正在跃升。',
      };
    }
    if (summary.activeDays >= 7) {
      return {
        title: '稳定的肌肉记忆正在成型。',
        body: '无论时长多长，持续回归身体的动作模式，是建立深层肢体直觉的唯一路径。',
      };
    }
    return {
      title: '每一次镜前练习，都是与身体的真实对话。',
      body: '无需追求完美，把注意留给重心的落点和肩膀的放松。随时在视频上写下你的感受。',
    };
  };

  const insight = getGrowthInsight();

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-zinc-900/95 p-6 shadow-2xl space-y-5 text-white max-h-[92vh] overflow-y-auto">
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-950/80 border border-cyan-800/40 text-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.25)]">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">我的成长看板</h2>
              <p className="text-[11px] text-zinc-400">记录身体变化，不给自己打分</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
            aria-label="关闭成长看板"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 核心英雄指标卡 */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-zinc-950/90 to-zinc-900/90 border border-white/[0.08] relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
            <Flame className="w-24 h-24 text-amber-500" />
          </div>

          <div className="relative z-10 space-y-3">
            <div>
              <span className="text-[11px] font-semibold tracking-wider uppercase text-cyan-400">
                {currentYear} 年 {currentMonth} 月
              </span>
              <div className="text-xl font-extrabold text-white tracking-tight mt-0.5">
                这个月你留住了 <span className="text-cyan-300 font-mono text-2xl">{summary.activeDays}</span> 次练习
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">开始更早发现自己的变化与发力感知</p>
            </div>

            {/* 统计指标三联卡 */}
            <div className="grid grid-cols-3 gap-2.5 pt-1">
              <div className="p-2.5 rounded-lg bg-zinc-900/70 border border-white/[0.04]">
                <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 mb-1">
                  <Clock className="w-3.5 h-3.5 text-cyan-400" />
                  <span>练习时长</span>
                </div>
                <div className="text-lg font-bold font-mono text-white">
                  {summary.totalMinutes} <span className="text-xs font-normal text-zinc-400">分钟</span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-zinc-900/70 border border-white/[0.04]">
                <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 mb-1">
                  <CalendarCheck2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>活跃天数</span>
                </div>
                <div className="text-lg font-bold font-mono text-white">
                  {summary.activeDays} <span className="text-xs font-normal text-zinc-400">天</span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-zinc-900/70 border border-white/[0.04]">
                <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 mb-1">
                  <NotebookPen className="w-3.5 h-3.5 text-amber-400" />
                  <span>留下观察</span>
                </div>
                <div className="text-lg font-bold font-mono text-white">
                  {summary.totalNotes} <span className="text-xs font-normal text-zinc-400">条</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 练习热力图网格 */}
        <div className="p-4 rounded-xl bg-zinc-950/60 border border-white/[0.06] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
              <CalendarDays className="w-4 h-4 text-cyan-400" />
              <span>练习轨迹矩阵 (近 35 天)</span>
            </div>
            <span className="text-[11px] font-mono text-zinc-500">
              点亮热度代表持续投入
            </span>
          </div>

          <PracticeHeatmap compact={false} />
        </div>

        {/* 连续打卡激励与火焰徽章 */}
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-amber-950/25 border border-amber-500/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.35)] animate-pulse">
              <Flame className="w-5 h-5 fill-amber-400 text-amber-300" />
            </div>
            <div>
              <div className="text-xs text-amber-200/80">连续练习周数</div>
              <div className="text-base font-bold text-amber-300 font-mono">
                {summary.streakWeeks} <span className="text-xs font-normal text-amber-400/80">周保持活跃</span>
              </div>
            </div>
          </div>
          <span className="text-[11px] px-2.5 py-1 rounded-full bg-amber-900/40 border border-amber-500/40 text-amber-300 font-medium">
            🔥 动作手感已激活
          </span>
        </div>

        {/* 成长金句卡片 */}
        <div className="p-3.5 rounded-xl bg-cyan-950/20 border border-cyan-800/30 flex items-start gap-3">
          <div className="p-1.5 rounded-lg bg-cyan-900/50 text-cyan-300 mt-0.5">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="space-y-0.5 flex-1">
            <div className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wider">
              本月回看
            </div>
            <div className="text-xs font-semibold text-zinc-200">
              {insight.title}
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              {insight.body}
            </p>
          </div>
        </div>

        {/* 底部快捷打卡操作栏 */}
        <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={handleSimulatePractice}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition"
              title="模拟今日练舞 15 分钟"
            >
              <PlusCircle className="w-3.5 h-3.5 text-cyan-400" />
              <span>+15m 练习</span>
            </button>
            <button
              onClick={handleSimulateNote}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition"
              title="模拟今日写下 1 条心得"
            >
              <NotebookPen className="w-3.5 h-3.5 text-emerald-400" />
              <span>+1 心得</span>
            </button>
            <button
              onClick={handleSeedDemo}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition"
              title="载入近 30 天样例练舞数据"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${isLoading ? 'animate-spin' : ''}`} />
              <span>载入样例</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium transition shadow-md shadow-cyan-600/30"
          >
            完成
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default GrowthStatsModal;
