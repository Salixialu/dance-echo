import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  FlipHorizontal,
  FastForward,
  Repeat,
  Sliders,
  Sparkles,
  Music2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { VideoItem } from '../../types';
import { resolveVideoStreamUrl } from '../../services/api/serverUrl';

interface DualVideoCompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoA: VideoItem;
  videoB: VideoItem;
}

export const DualVideoCompareModal: React.FC<DualVideoCompareModalProps> = ({
  isOpen,
  onClose,
  videoA,
  videoB,
}) => {
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);

  const [urlA, setUrlA] = useState<string>('');
  const [urlB, setUrlB] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 同步播放控制状态
  const [isPlaying, setIsPlaying] = useState(false);
  const [masterTime, setMasterTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);

  // 左右独立画面与声音控制
  const [mirrorA, setMirrorA] = useState(false);
  const [mirrorB, setMirrorB] = useState(true); // 练习视频默认推荐开启镜像以对照
  const [audioSource, setAudioSource] = useState<'A' | 'B' | 'both' | 'none'>('A'); // 默认只播放 A 轨音频避免声音回音重叠

  // 时间偏移校准 (B 相对于 A 的偏移秒数)
  // 若 B 动作比 A 慢了 0.4 秒，设置 offsetB = -0.4s
  const [offsetB, setOffsetB] = useState<number>(0);

  // AB 循环
  const [isLooping, setIsLooping] = useState(false);
  const [loopA, setLoopA] = useState<number | null>(null);
  const [loopB, setLoopB] = useState<number | null>(null);

  // 加载服务端 Range 流 URL，避免在对比播放中复制本地视频 Blob
  useEffect(() => {
    if (!isOpen) return;
    setIsLoading(true);
    setLoadError(null);
    setUrlA(resolveVideoStreamUrl(videoA));
    setUrlB(resolveVideoStreamUrl(videoB));
    setIsLoading(false);
    return () => {
      setUrlA('');
      setUrlB('');
    };
  }, [isOpen, videoA, videoB]);

  // 更新总时长为两者最大值
  const handleLoadedMetadata = () => {
    const durA = videoARef.current?.duration || 0;
    const durB = videoBRef.current?.duration || 0;
    const maxDur = Math.max(durA, durB, videoA.duration || 0, videoB.duration || 0);
    if (maxDur > 0) setDuration(maxDur);
  };

  // 同步播放与暂停
  const togglePlay = useCallback(() => {
    const elA = videoARef.current;
    const elB = videoBRef.current;
    if (!elA || !elB) return;

    if (isPlaying) {
      elA.pause();
      elB.pause();
      setIsPlaying(false);
    } else {
      // 对齐时间后播放
      const currentA = masterTime;
      const currentB = Math.max(0, masterTime + offsetB);
      elA.currentTime = currentA;
      elB.currentTime = currentB;

      Promise.all([elA.play(), elB.play()])
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  }, [isPlaying, masterTime, offsetB]);

  // 主进度轴 Seek
  const handleSeek = (newTime: number) => {
    setMasterTime(newTime);
    if (videoARef.current) {
      videoARef.current.currentTime = newTime;
    }
    if (videoBRef.current) {
      videoBRef.current.currentTime = Math.max(0, newTime + offsetB);
    }
  };

  const handleSeekB = (newTime: number) => {
    const clamped = Math.max(0, newTime);
    if (videoBRef.current) videoBRef.current.currentTime = clamped;
    setOffsetB(parseFloat((clamped - masterTime).toFixed(2)));
  };

  const alignCurrentFrames = () => {
    const timeA = videoARef.current?.currentTime ?? masterTime;
    const timeB = videoBRef.current?.currentTime ?? Math.max(0, masterTime + offsetB);
    setMasterTime(timeA);
    setOffsetB(parseFloat((timeB - timeA).toFixed(2)));
  };

  // 倍速控制
  const handleRateChange = (rate: number) => {
    setPlaybackRate(rate);
    if (videoARef.current) videoARef.current.playbackRate = rate;
    if (videoBRef.current) videoBRef.current.playbackRate = rate;
  };

  // 音频静音源切换
  useEffect(() => {
    if (videoARef.current) {
      videoARef.current.muted = audioSource !== 'A' && audioSource !== 'both';
    }
    if (videoBRef.current) {
      videoBRef.current.muted = audioSource !== 'B' && audioSource !== 'both';
    }
  }, [audioSource]);

  // 高精度同步播放主循环监听
  useEffect(() => {
    let animId: number;

    const syncLoop = () => {
      const elA = videoARef.current;
      const elB = videoBRef.current;

      if (elA && !elA.paused) {
        const timeA = elA.currentTime;
        setMasterTime(timeA);

        // 检查 AB 循环
        if (isLooping && loopB !== null && loopA !== null && timeA >= loopB) {
          elA.currentTime = loopA;
          if (elB) elB.currentTime = Math.max(0, loopA + offsetB);
          animId = requestAnimationFrame(syncLoop);
          return;
        }

        // 定期校准 Video B，防止轻微漂移（若偏差超过 0.1s 则轻柔吸附）
        if (elB && !elB.paused) {
          const expectedB = Math.max(0, timeA + offsetB);
          if (Math.abs(elB.currentTime - expectedB) > 0.12) {
            elB.currentTime = expectedB;
          }
        }
      }

      if (isOpen) {
        animId = requestAnimationFrame(syncLoop);
      }
    };

    animId = requestAnimationFrame(syncLoop);
    return () => cancelAnimationFrame(animId);
  }, [isOpen, offsetB, isLooping, loopA, loopB]);

  // 快捷键支持
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handleSeek(Math.max(0, masterTime - 2));
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleSeek(Math.min(duration, masterTime + 2));
      } else if (e.code === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, togglePlay, masterTime, duration, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex flex-col justify-between animate-in fade-in duration-200 select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* ── 顶栏标题与对齐状态 ── */}
      <header className="px-6 py-3.5 border-b border-white/[0.08] bg-zinc-950/80 backdrop-blur-md flex items-center justify-between z-10">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-gradient-to-tr from-cyan-600 to-purple-600 text-white shadow-lg shadow-cyan-600/30">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-tight">
                双屏同曲目 VS 对比工作台
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-500/30">
                双轨对齐
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              左侧: <span className="text-cyan-300 font-medium">{videoA.name}</span> · 右侧:{' '}
              <span className="text-purple-300 font-medium">{videoB.name}</span>
            </p>
          </div>
        </div>

        {/* 快捷音频源选择与关闭 */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center bg-zinc-900 border border-white/10 rounded-xl p-1 text-xs text-zinc-400">
            <span className="px-2 font-mono text-[11px] text-zinc-500">主声音:</span>
            <button
              onClick={() => setAudioSource('A')}
              className={`px-2.5 py-1 rounded-lg transition ${
                audioSource === 'A'
                  ? 'bg-cyan-600 text-white font-medium shadow-md shadow-cyan-600/30'
                  : 'hover:text-zinc-200'
              }`}
            >
              仅左轨 (原版)
            </button>
            <button
              onClick={() => setAudioSource('B')}
              className={`px-2.5 py-1 rounded-lg transition ${
                audioSource === 'B'
                  ? 'bg-purple-600 text-white font-medium shadow-md shadow-purple-600/30'
                  : 'hover:text-zinc-200'
              }`}
            >
              仅右轨 (练习)
            </button>
            <button
              onClick={() => setAudioSource('both')}
              className={`px-2.5 py-1 rounded-lg transition ${
                audioSource === 'both' ? 'bg-zinc-700 text-white font-medium' : 'hover:text-zinc-200'
              }`}
            >
              同时混音
            </button>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 border border-white/5 transition"
            title="退出对比 (ESC)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* ── 双屏视频对比视口主区域 ── */}
      <main className="flex-1 relative flex flex-col md:flex-row items-center justify-center p-4 gap-4 overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-20">
            <div className="w-10 h-10 border-4 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin mb-3" />
            <p className="text-xs font-mono text-cyan-300">正在就绪双路视频流解码...</p>
          </div>
        )}

        {loadError && (
          <div className="p-6 rounded-2xl bg-red-950/60 border border-red-500/30 text-red-300 text-sm max-w-md text-center">
            {loadError}
          </div>
        )}

        {/* 视口 A (左侧：示范/原版) */}
        <div className="relative flex-1 w-full h-full max-h-[75vh] bg-zinc-950 rounded-2xl overflow-hidden border border-cyan-500/30 shadow-[0_0_30px_rgba(34,211,238,0.15)] flex items-center justify-center group">
          <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-md border border-cyan-500/40 text-[11px] font-mono text-cyan-300">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span>左轨 [A · 示范]</span>
          </div>

          <button
            onClick={() => setMirrorA((prev) => !prev)}
            className={`absolute top-3 right-3 z-10 p-1.5 rounded-lg border text-xs transition ${
              mirrorA
                ? 'bg-cyan-600 text-white border-cyan-400'
                : 'bg-black/60 text-zinc-400 hover:text-white border-white/10'
            }`}
            title="水平镜像翻转 A"
          >
            <FlipHorizontal className="w-4 h-4" />
          </button>

          <video
            ref={videoARef}
            src={urlA}
            crossOrigin="anonymous"
            playsInline
            onLoadedMetadata={handleLoadedMetadata}
            className={`w-full h-full object-contain ${mirrorA ? 'scale-x-[-1]' : ''}`}
          />
        </div>

        {/* 视口 B (右侧：练习/学员) */}
        <div className="relative flex-1 w-full h-full max-h-[75vh] bg-zinc-950 rounded-2xl overflow-hidden border border-purple-500/30 shadow-[0_0_30px_rgba(168,85,247,0.15)] flex items-center justify-center group">
          <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-md border border-purple-500/40 text-[11px] font-mono text-purple-300">
            <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
            <span>右轨 [B · 练习]</span>
          </div>

          <button
            onClick={() => setMirrorB((prev) => !prev)}
            className={`absolute top-3 right-3 z-10 p-1.5 rounded-lg border text-xs transition ${
              mirrorB
                ? 'bg-purple-600 text-white border-purple-400'
                : 'bg-black/60 text-zinc-400 hover:text-white border-white/10'
            }`}
            title="水平镜像翻转 B"
          >
            <FlipHorizontal className="w-4 h-4" />
          </button>

          <video
            ref={videoBRef}
            src={urlB}
            crossOrigin="anonymous"
            playsInline
            onLoadedMetadata={handleLoadedMetadata}
            className={`w-full h-full object-contain ${mirrorB ? 'scale-x-[-1]' : ''}`}
          />
        </div>
      </main>

      {/* ── 底栏多轨控制台 (Master Controller) ── */}
      <footer className="p-4 bg-zinc-950/90 border-t border-white/[0.08] backdrop-blur-xl flex flex-col gap-3 z-10">
        {/* 双轨独立进度条：拖动 B 会自动更新右轨偏移 */}
        <div className="space-y-2 rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="w-20 text-[10px] font-mono text-cyan-300">左轨 A</span>
            <input type="range" min={0} max={duration || 100} step={0.05} value={masterTime}
              onChange={(e) => handleSeek(parseFloat(e.target.value))} className="h-1.5 flex-1 accent-cyan-400 cursor-pointer" />
            <span className="w-14 text-right text-xs font-mono text-zinc-300">{formatSeconds(masterTime)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-20 text-[10px] font-mono text-purple-300">右轨 B</span>
            <input type="range" min={0} max={videoB.duration || duration || 100} step={0.05}
              value={Math.max(0, masterTime + offsetB)}
              onChange={(e) => handleSeekB(parseFloat(e.target.value))} className="h-1.5 flex-1 accent-purple-400 cursor-pointer" />
            <span className="w-14 text-right text-xs font-mono text-zinc-300">{formatSeconds(Math.max(0, masterTime + offsetB))}</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-500">
            <span>右轨相对左轨：<strong className="text-purple-300">{offsetB > 0 ? '+' : ''}{offsetB.toFixed(2)}s</strong></span>
            <button type="button" onClick={alignCurrentFrames} className="rounded-md border border-cyan-500/30 px-2 py-1 text-cyan-300 hover:bg-cyan-950/50">按当前画面对齐</button>
          </div>
        </div>

        {/* 核心控制组合 */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* 左组：播放、倍速、AB 循环 */}
          <div className="flex items-center space-x-2">
            <button
              onClick={togglePlay}
              className="p-3 rounded-2xl bg-gradient-to-tr from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-white shadow-lg shadow-cyan-600/30 transition active:scale-95 cursor-pointer"
              title="播放/暂停 (空格)"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>

            {/* 倍速切换 */}
            <div className="flex items-center bg-zinc-900 border border-white/10 rounded-xl p-1 text-xs">
              {[0.5, 0.75, 1.0, 1.25].map((rate) => (
                <button
                  key={rate}
                  onClick={() => handleRateChange(rate)}
                  className={`px-2 py-1 rounded-lg transition font-mono ${
                    playbackRate === rate
                      ? 'bg-zinc-700 text-cyan-300 font-bold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {rate}x
                </button>
              ))}
            </div>

            {/* AB 循环点设定 */}
            <div className="flex items-center gap-1 bg-zinc-900 border border-white/10 rounded-xl px-2 py-1 text-xs text-zinc-400">
              <Repeat className={`w-3.5 h-3.5 ${isLooping ? 'text-amber-400' : 'text-zinc-500'}`} />
              <button
                onClick={() => setLoopA(masterTime)}
                className={`px-1.5 py-0.5 rounded font-mono ${
                  loopA !== null ? 'bg-cyan-950 text-cyan-300 font-semibold' : 'hover:text-zinc-200'
                }`}
                title="设定循环起点 A"
              >
                A: {loopA !== null ? formatSeconds(loopA) : '--'}
              </button>
              <span>-</span>
              <button
                onClick={() => setLoopB(masterTime)}
                className={`px-1.5 py-0.5 rounded font-mono ${
                  loopB !== null ? 'bg-purple-950 text-purple-300 font-semibold' : 'hover:text-zinc-200'
                }`}
                title="设定循环终点 B"
              >
                B: {loopB !== null ? formatSeconds(loopB) : '--'}
              </button>
              {loopA !== null && loopB !== null && (
                <button
                  onClick={() => setIsLooping((prev) => !prev)}
                  className={`px-2 py-0.5 rounded font-semibold text-[11px] transition ${
                    isLooping
                      ? 'bg-amber-500 text-black shadow-sm'
                      : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  }`}
                >
                  {isLooping ? '循环中' : '启动循环'}
                </button>
              )}
            </div>
          </div>

          {/* 右组：时间偏移微调 (Offset Fine-Tuning) */}
          <div className="flex items-center gap-2 bg-zinc-900 border border-white/10 rounded-2xl px-3 py-1.5 text-xs text-zinc-300">
            <span className="text-zinc-400 flex items-center gap-1 font-medium">
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              <span>右轨微调对齐:</span>
            </span>

            <button
              onClick={() => setOffsetB((prev) => parseFloat((prev - 0.2).toFixed(2)))}
              className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
              title="右轨滞后 0.2s"
            >
              -0.2s
            </button>
            <button
              onClick={() => setOffsetB((prev) => parseFloat((prev - 0.05).toFixed(2)))}
              className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
              title="右轨滞后 0.05s"
            >
              -0.05s
            </button>

            <span
              className={`font-mono text-xs px-2 py-0.5 rounded ${
                offsetB !== 0
                  ? 'bg-purple-950/80 text-purple-300 border border-purple-500/40 font-bold'
                  : 'bg-zinc-950 text-zinc-400'
              }`}
            >
              {offsetB > 0 ? `+${offsetB.toFixed(2)}s` : `${offsetB.toFixed(2)}s`}
            </span>

            <button
              onClick={() => setOffsetB((prev) => parseFloat((prev + 0.05).toFixed(2)))}
              className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
              title="右轨提前 0.05s"
            >
              +0.05s
            </button>
            <button
              onClick={() => setOffsetB((prev) => parseFloat((prev + 0.2).toFixed(2)))}
              className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
              title="右轨提前 0.2s"
            >
              +0.2s
            </button>

            {offsetB !== 0 && (
              <button
                onClick={() => setOffsetB(0)}
                className="text-[10px] text-zinc-500 hover:text-cyan-400 ml-1 underline"
              >
                归零
              </button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
};

function formatSeconds(sec: number): string {
  if (isNaN(sec) || sec < 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
