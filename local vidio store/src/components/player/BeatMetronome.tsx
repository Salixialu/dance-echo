import React, { useRef, useEffect, useState } from 'react';
import { Volume2, VolumeX, Minus, Plus, Music2, RotateCcw } from 'lucide-react';
import { useI18n } from '../../i18n';
import { beatIndexAt } from '../../services/audio/beatAnalysis';

interface BeatMetronomeProps {
  currentTime: number;
  /**
   * 精确取视频当前时间。React state 的 currentTime 来自 timeupdate（约 4Hz），
   * 用它触发节拍会抖 ±250ms；播放时传入 () => video.currentTime 即可把抖动压到 ±1 帧。
   */
  getTime?: () => number;
  isPlaying: boolean;
  playbackRate: number;
  bpm: number;
  offset: number;
  /** 逐拍时间戳（秒，来自音轨分析）。有它时优先用它排程，bpm+offset 只作兜底 */
  beats?: number[];
  isAudioTickEnabled?: boolean;
  onBpmChange?: (bpm: number) => void;
  onOffsetChange?: (offset: number) => void;
  onToggleAudioTick?: () => void;
  onResetBeat?: () => void;
  onClose?: () => void;
}

export const BeatMetronome: React.FC<BeatMetronomeProps> = ({
  currentTime,
  getTime,
  isPlaying,
  playbackRate,
  bpm,
  offset,
  beats,
  isAudioTickEnabled = false,
  onBpmChange,
  onOffsetChange,
  onToggleAudioTick,
  onResetBeat,
  onClose,
}) => {
  const { t, tr } = useI18n();
  const audioContextRef = useRef<AudioContext | null>(null);
  const getTimeRef = useRef(getTime);
  getTimeRef.current = getTime;
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;

  // 节拍解算（考虑视频慢放倍速）
  const effectiveBpm = bpm || 120;
  const beatDuration = 60 / effectiveBpm;
  const timeDelta = currentTime - offset;
  const rawBeatIndex = Math.floor(timeDelta / beatDuration);
  const countIn8FromGrid = timeDelta < 0 ? 1 : (((rawBeatIndex % 8) + 8) % 8) + 1;

  /**
   * 8 拍指示器的当前拍号。
   *
   * 有逐拍时间戳时按「当前落在第几个 beat 上」取模——变速曲里鼓点不会按等分周期落，
   * 用 (time - offset) / beatDuration 会让指示器与实际的拍脱节。没有逐拍数据才退回等分。
   * 播放中用 rAF 驱动：timeupdate 只有 4Hz，用它更新指示灯会慢半拍以上。
   */
  const [liveBeatIndex, setLiveBeatIndex] = useState<number | null>(null);

  const computeBeatIndex = (): number => {
    const time = getTimeRef.current ? getTimeRef.current() : currentTimeRef.current;
    // offset 是「整条逐拍网格往后挪多少」的人工微调量，排程与指示灯都要跟着挪
    if (beats && beats.length > 1) return beatIndexAt(beats, time - offset);
    const delta = time - offset;
    return delta < 0 ? -1 : Math.floor(delta / beatDuration);
  };
  const computeRef = useRef(computeBeatIndex);
  computeRef.current = computeBeatIndex;

  // 暂停 / 拖动时跟随 currentTime 落点
  useEffect(() => {
    if (isPlaying) return;
    setLiveBeatIndex(computeRef.current());
  }, [isPlaying, currentTime, beats, offset, beatDuration]);

  // 播放中逐帧更新
  useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    const loop = () => {
      setLiveBeatIndex(computeRef.current());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);

  const countIn8 =
    liveBeatIndex === null
      ? countIn8FromGrid
      : liveBeatIndex < 0
      ? 1
      : (((liveBeatIndex % 8) + 8) % 8) + 1;

  /**
   * 节拍音：WebAudio 预排，而不是「检测到越过拍点再响」。
   * 每一帧算出下一拍的视频时间，换算成真实秒，提前 ≤250ms 排进音频时钟，
   * 这样抖动只受帧率影响（≈16ms），也不受 React 提交时机影响。
   */
  useEffect(() => {
    if (!isAudioTickEnabled || !isPlaying) return;

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioContextRef.current) audioContextRef.current = new AudioContextClass();
    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const beat = 60 / (bpm || 120);
    const rate = playbackRate || 1;
    const LOOKAHEAD_SECONDS = 0.25;
    const grid = beats && beats.length > 1 ? beats : null;
    let raf = 0;
    let lastScheduledIndex = -1;

    const scheduleTick = (atAudioTime: number, beatIndex: number) => {
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        const beatInBar = (((beatIndex % 8) + 8) % 8) + 1;
        const isDownbeat = beatInBar === 1;
        const isMidbeat = beatInBar === 5;
        osc.frequency.setValueAtTime(isDownbeat ? 1300 : isMidbeat ? 1000 : 750, atAudioTime);
        gain.gain.setValueAtTime(0.18, atAudioTime);
        gain.gain.exponentialRampToValueAtTime(0.001, atAudioTime + 0.035);
        osc.start(atAudioTime);
        osc.stop(atAudioTime + 0.04);
      } catch {
        // 浏览器自动播放策略或音频节点创建失败时静默跳过
      }
    };

    /** 在逐拍时间戳里找「第一个晚于 t 的拍」及其索引 */
    const nextBeatFromGrid = (t: number): { time: number; index: number } | null => {
      if (!grid) return null;
      let lo = 0;
      let hi = grid.length - 1;
      if (t >= grid[hi]) return null;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (grid[mid] <= t) lo = mid + 1;
        else hi = mid;
      }
      return { time: grid[lo], index: lo };
    };

    const loop = () => {
      const absTime = getTimeRef.current ? getTimeRef.current() : currentTimeRef.current;
      // 逐拍网格与 offset 微调量统一到「网格时间轴」上比较
      const gridTime = absTime - offset;
      const hit = nextBeatFromGrid(gridTime);

      if (hit) {
        // 有音轨逐拍数据时，直接按真实拍点排程（曲线变速也能对上）
        const leadAudioSeconds = (hit.time - gridTime) / rate;
        if (
          leadAudioSeconds >= 0 &&
          leadAudioSeconds <= LOOKAHEAD_SECONDS &&
          hit.index !== lastScheduledIndex
        ) {
          lastScheduledIndex = hit.index;
          scheduleTick(ctx.currentTime + leadAudioSeconds, hit.index);
        }
      } else if (!grid) {
        // 有逐拍数据但已经播到最后一拍之后：宁可安静，也不要拿等分网格糊弄——
        // 尾巴上硬塞的拍点全都不在鼓上，那正是「不跟音乐」。
        // 没有逐拍数据（手动点拍 / 分析置信度太低）时才用 bpm + offset 等分网格兜底。
        const videoTime = absTime - offset;
        if (videoTime >= 0) {
          const nextBeatIndex = Math.floor(videoTime / beat) + 1;
          const leadVideoSeconds = nextBeatIndex * beat - videoTime;
          const leadAudioSeconds = leadVideoSeconds / rate;
          if (
            leadAudioSeconds >= 0 &&
            leadAudioSeconds <= LOOKAHEAD_SECONDS &&
            nextBeatIndex !== lastScheduledIndex
          ) {
            lastScheduledIndex = nextBeatIndex;
            scheduleTick(ctx.currentTime + leadAudioSeconds, nextBeatIndex);
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(raf);
  }, [bpm, offset, playbackRate, isAudioTickEnabled, isPlaying, beats]);

  return (
    <div
      id="beatMetronomeContainer"
      className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-zinc-950/90 backdrop-blur-2xl border border-cyan-500/30 text-white shadow-[0_8px_32px_rgba(0,0,0,0.7)] select-none animate-in fade-in zoom-in-95 duration-200"
    >
      {/* 左侧：音乐图标与 BPM 调节 */}
      <div className="flex items-center gap-1.5 pr-2 border-r border-white/10">
        <div className="p-1 rounded-full bg-cyan-950/90 text-cyan-400 border border-cyan-400/40">
          <Music2 className="w-3 h-3 animate-pulse" />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs font-mono font-bold text-cyan-300">
            {Math.round(effectiveBpm)}
          </span>
          <span className="text-[10px] font-mono text-zinc-400">{t('metronome.bpm')}</span>
          {playbackRate !== 1.0 && (
            <span className="text-[9px] font-mono text-amber-300/90 ml-0.5">
              ({Math.round(effectiveBpm * playbackRate)})
            </span>
          )}
        </div>

        {/* BPM 微调 */}
        <div className="flex items-center gap-0.5 ml-1">
          <button
            type="button"
            onClick={() => onBpmChange?.(Math.max(40, effectiveBpm - 1))}
            className="p-1 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition cursor-pointer"
            title={`${t('metronome.adjustTempo')} -1`}
          >
            <Minus className="w-2.5 h-2.5" />
          </button>
          <button
            type="button"
            onClick={() => onBpmChange?.(Math.min(220, effectiveBpm + 1))}
            className="p-1 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition cursor-pointer"
            title={`${t('metronome.adjustTempo')} +1`}
          >
            <Plus className="w-2.5 h-2.5" />
          </button>
        </div>
      </div>

      {/* 中间：8 拍脉冲指示灯矩阵 */}
      <div className="flex items-center gap-1 px-0.5">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((beatNum) => {
          const isActive = countIn8 === beatNum;
          const isOne = beatNum === 1;
          const isFive = beatNum === 5;

          // 样式状态机
          let badgeClass =
            'bg-zinc-900/90 text-zinc-500 border-white/5 opacity-60 scale-95';
          if (isActive) {
            if (isOne) {
              badgeClass =
                'bg-cyan-400 text-zinc-950 font-black border-cyan-300 shadow-[0_0_16px_rgba(34,211,238,0.95)] scale-115 z-10';
            } else if (isFive) {
              badgeClass =
                'bg-fuchsia-400 text-zinc-950 font-black border-fuchsia-300 shadow-[0_0_16px_rgba(217,70,239,0.95)] scale-115 z-10';
            } else {
              badgeClass =
                'bg-white text-zinc-950 font-bold border-white shadow-[0_0_10px_rgba(255,255,255,0.85)] scale-105 z-10';
            }
          }

          return (
            <div
              key={beatNum}
              className={`beat-indicator beat-indicator-${beatNum} relative flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-mono border transition-all duration-75 cursor-default ${badgeClass}`}
              title={
                isOne
                  ? `1 - ${t('metronome.downbeat')}`
                  : isFive
                  ? `5 - ${t('metronome.accent')}`
                  : `${beatNum}`
              }
            >
              <span>{beatNum}</span>
              {isActive && (
                <span
                  className={`absolute inset-0 rounded-full animate-ping opacity-35 ${
                    isOne ? 'bg-cyan-400' : isFive ? 'bg-fuchsia-400' : 'bg-white'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* 右侧：首拍 Offset 微调 & 节拍发音开关 */}
      <div className="flex items-center gap-1.5 pl-2 border-l border-white/10">
        {/* 首拍时间偏移 */}
        <div className="flex items-center gap-1 text-[11px] font-mono text-zinc-400" title={t('metronome.offset')}>
          <span>{t('player.offset')}:</span>
          <span className="text-zinc-200 font-medium">
            {offset >= 0 ? `+${offset.toFixed(2)}` : offset.toFixed(2)}s
          </span>
          <div className="flex items-center gap-0.5 ml-0.5">
            <button
              type="button"
              onClick={() => onOffsetChange?.(Math.round((offset - 0.05) * 100) / 100)}
              className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition cursor-pointer"
              title={t('metronome.offsetEarly')}
            >
              <Minus className="w-2.5 h-2.5" />
            </button>
            <button
              type="button"
              onClick={() => onOffsetChange?.(Math.round((offset + 0.05) * 100) / 100)}
              className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition cursor-pointer"
              title={t('metronome.offsetLate')}
            >
              <Plus className="w-2.5 h-2.5" />
            </button>
          </div>
        </div>

        {/* 辅助节拍音开关 */}
        <button
          type="button"
          onClick={onToggleAudioTick}
          id="btnToggleAudioTick"
          className={`p-1.5 rounded-lg border text-xs transition cursor-pointer ${
            isAudioTickEnabled
              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/50'
              : 'bg-zinc-800 text-zinc-400 border-white/5 hover:text-white'
          }`}
          title={t('metronome.clickSound')}
        >
          {isAudioTickEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
        </button>

        {/* 重置节拍测算 */}
        {onResetBeat && (
          <button
            type="button"
            onClick={onResetBeat}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition cursor-pointer"
            title={t('metronome.recalculate')}
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        )}

        {/* 关闭节拍器 */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 transition cursor-pointer ml-0.5"
            title={t('metronome.close')}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
};
