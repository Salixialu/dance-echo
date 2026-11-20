import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Sparkles,
  Clock,
  Send,
  Trash2,
  Copy,
  Check,
  Tag as TagIcon,
  RotateCcw,
  MessageSquare,
} from 'lucide-react';
import type { VideoObservation } from '../../types';
import { observationService } from '../../services/storage/observationService';
import { tagDisplayName } from '../../utils/tagDisplay';

interface ObservationPanelProps {
  videoId: string;
  currentTime: number;
  /** 点击留言的时间戳：跳到该秒并暂停 */
  onSeekAndPause: (time: number) => void;
  /** 列表条数变化时回调，供页签计数使用 */
  onCountChange?: (count: number) => void;
}

/** 舞者常用预置快捷标签 */
const PRESET_TAGS = ['发力点', '节奏', '重心', '待攻克', '动作细节', '呼吸'];

/**
 * 留言面板 —— 右侧抽屉「留言」页的唯一内容。
 *
 * 一条留言 = 一段评价文字 + 可选关联秒数 + 可选标签，可多条并存。
 * 这里只负责「写 / 看 / 删」，不做抽屉外框，由 DancePlayerRightDrawer 包裹。
 */
export const ObservationPanel: React.FC<ObservationPanelProps> = ({
  videoId,
  currentTime,
  onSeekAndPause,
  onCountChange,
}) => {
  const [observations, setObservations] = useState<VideoObservation[]>([]);
  const [loading, setLoading] = useState(false);
  // 父组件每次渲染都会新建 onCountChange，直接进 useCallback 依赖会变成
  // 「加载 → 回调 → 父重渲染 → 新回调 → 再加载」的无限循环，所以走 ref。
  const onCountChangeRef = useRef(onCountChange);
  useEffect(() => {
    onCountChangeRef.current = onCountChange;
  }, [onCountChange]);
  const [content, setContent] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [includeTimestamp, setIncludeTimestamp] = useState(true);
  const [pinnedTime, setPinnedTime] = useState<number>(currentTime);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 输入框为空时，抓取的秒数跟着播放进度走
  useEffect(() => {
    if (content.trim() === '') {
      setPinnedTime(currentTime);
    }
  }, [currentTime, content]);

  const loadObservations = useCallback(async () => {
    setLoading(true);
    try {
      const items = await observationService.getObservationsByVideo(videoId);
      setObservations(items);
      onCountChangeRef.current?.(items.length);
    } catch (err) {
      console.error('[DanceEcho] 加载留言失败:', err);
    } finally {
      setLoading(false);
    }
  }, [videoId]);

  useEffect(() => {
    void loadObservations();
  }, [loadObservations]);

  const formatTime = (secs?: number) => {
    if (secs === undefined || isNaN(secs)) return '--:--';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 10);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
  };

  const formatRelativeDate = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes} 分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} 天前`;
    const d = new Date(timestamp);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) return;

    try {
      await observationService.addObservation(
        videoId,
        trimmed,
        includeTimestamp ? pinnedTime : undefined,
        selectedTag || undefined,
      );
      setContent('');
      setSelectedTag(null);
      setPinnedTime(currentTime);
      await loadObservations();
    } catch (err) {
      console.error('[DanceEcho] 保存留言失败:', err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await observationService.deleteObservation(id);
      await loadObservations();
    } catch (err) {
      console.error('[DanceEcho] 删除留言失败:', err);
    }
  };

  const handleCopy = async (item: VideoObservation, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const textToCopy =
        item.timestamp !== undefined
          ? `[${formatTime(item.timestamp)}] ${item.tag ? `[${item.tag}] ` : ''}${item.content}`
          : `${item.tag ? `[${item.tag}] ` : ''}${item.content}`;
      await navigator.clipboard.writeText(textToCopy);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.warn('[DanceEcho] 复制留言失败:', err);
    }
  };

  const filteredObservations = filterTag
    ? observations.filter((obs) => obs.tag === filterTag)
    : observations;

  return (
    <div data-testid="note-panel" className="space-y-4 animate-in fade-in duration-150">
      {/* 记录区 */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex items-center justify-between text-xs">
          <label className="flex items-center gap-2 cursor-pointer text-zinc-300 hover:text-white transition">
            <input
              type="checkbox"
              checked={includeTimestamp}
              onChange={(e) => setIncludeTimestamp(e.target.checked)}
              className="rounded border-zinc-700 bg-zinc-800 text-cyan-500 focus:ring-cyan-400 cursor-pointer"
            />
            <span className="flex items-center gap-1 font-mono">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span>关联秒数:</span>
              <strong className="text-cyan-300 font-semibold">{formatTime(pinnedTime)}</strong>
            </span>
          </label>

          <button
            type="button"
            onClick={() => setPinnedTime(currentTime)}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-zinc-400 hover:text-cyan-300 hover:bg-zinc-800 border border-transparent hover:border-cyan-500/30 transition cursor-pointer"
            title="把关联秒数更新为当前播放位置"
          >
            <RotateCcw className="w-3 h-3" />
            <span>重新抓取</span>
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {PRESET_TAGS.map((tag) => {
            const isSelected = selectedTag === tag;
            return (
              <button
                key={tag}
                type="button"
                title={tag}
                onClick={() => setSelectedTag(isSelected ? null : tag)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition cursor-pointer ${
                  isSelected
                    ? 'bg-cyan-950/80 text-cyan-300 border-cyan-400/60 shadow-[0_0_10px_rgba(34,211,238,0.25)]'
                    : 'bg-zinc-900/80 text-zinc-400 border-white/10 hover:border-white/20 hover:text-zinc-200'
                }`}
              >
                #{tagDisplayName(tag)}
              </button>
            );
          })}
        </div>

        <div className="relative">
          <textarea
            ref={textareaRef}
            rows={3}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="写下这支舞的感受，例如：“这个转身要留头，重心落在右前脚掌”"
            className="w-full resize-none rounded-xl border border-white/10 bg-zinc-900/90 px-3 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 transition focus:border-cyan-400/60 focus:outline-none focus:ring-1 focus:ring-cyan-400/30"
          />

          <div className="mt-2 flex items-center justify-between pt-1">
            <span className="font-mono text-[10px] text-zinc-500">Enter 发送 / Shift+Enter 换行</span>
            <button
              type="submit"
              disabled={!content.trim()}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                content.trim()
                  ? 'cursor-pointer bg-cyan-500 text-zinc-950 shadow-[0_0_12px_rgba(34,211,238,0.35)] hover:bg-cyan-400'
                  : 'cursor-not-allowed bg-zinc-800 text-zinc-500'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>留下留言</span>
            </button>
          </div>
        </div>
      </form>

      {/* 列表 */}
      <div className="flex items-center justify-between border-y border-white/5 py-2 text-xs">
        <span className="flex items-center gap-1.5 font-semibold text-zinc-300">
          <MessageSquare className="w-3.5 h-3.5 text-cyan-400" />
          <span>留言 ({observations.length})</span>
        </span>

        {observations.some((obs) => obs.tag) && (
          <div className="flex items-center gap-1 text-[11px]">
            <TagIcon className="w-3 h-3 text-zinc-500" />
            <select
              value={filterTag || ''}
              onChange={(e) => setFilterTag(e.target.value || null)}
              className="cursor-pointer rounded border border-white/10 bg-zinc-900 px-1.5 py-0.5 text-[11px] text-zinc-300 focus:border-cyan-400 focus:outline-none"
            >
              <option value="">全部标签</option>
              {Array.from(new Set(observations.map((o) => o.tag).filter(Boolean))).map((t) => (
                <option key={t} value={t!}>
                  #{t}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="py-10 text-center text-xs text-zinc-500">正在读取留言…</div>
        ) : filteredObservations.length === 0 ? (
          <div className="space-y-3 px-4 py-10 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-cyan-500/20 bg-cyan-950/40 text-cyan-400">
              <Sparkles className="w-5 h-5 opacity-70" />
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-semibold text-zinc-300">还没有留言</h4>
              <p className="mx-auto max-w-[220px] text-[11px] leading-relaxed text-zinc-500">
                看到值得反复揣摩的瞬间，就把当时的感受写下来。留言可以挂在某个秒数上，下次点一下就跳回去。
              </p>
            </div>
          </div>
        ) : (
          filteredObservations.map((obs) => (
            <div
              key={obs.id}
              className="group relative space-y-2 rounded-xl border border-white/5 bg-zinc-900/70 p-3 shadow-sm transition-all hover:border-cyan-500/30 hover:bg-zinc-900"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {obs.timestamp !== undefined ? (
                    <button
                      type="button"
                      onClick={() => onSeekAndPause(obs.timestamp!)}
                      className="flex cursor-pointer items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-950/80 px-2 py-0.5 font-mono text-xs text-cyan-300 transition hover:bg-cyan-500 hover:text-zinc-950"
                      title="跳到这一秒并暂停"
                    >
                      <Clock className="w-3 h-3" />
                      <span>{formatTime(obs.timestamp)}</span>
                    </button>
                  ) : (
                    <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[11px] text-zinc-500">
                      整段留言
                    </span>
                  )}

                  {obs.tag && (
                    <span className="rounded-full border border-cyan-500/20 bg-cyan-950/50 px-2 py-0.5 text-[10px] font-medium text-cyan-300">
                      #{obs.tag}
                    </span>
                  )}
                </div>

                <span className="font-mono text-[10px] text-zinc-500">{formatRelativeDate(obs.createdAt)}</span>
              </div>

              <p
                onClick={() => {
                  if (obs.timestamp !== undefined) onSeekAndPause(obs.timestamp);
                }}
                className={`text-xs leading-relaxed text-zinc-200 ${
                  obs.timestamp !== undefined ? 'cursor-pointer hover:text-cyan-200' : ''
                }`}
                title={obs.timestamp !== undefined ? '点击跳到这一秒' : undefined}
              >
                {obs.content}
              </p>

              <div className="flex items-center justify-end gap-1 pt-1 opacity-60 transition group-hover:opacity-100">
                <button
                  type="button"
                  onClick={(e) => void handleCopy(obs, e)}
                  className="cursor-pointer rounded p-1 text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
                  title="复制留言"
                >
                  {copiedId === obs.id ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={(e) => void handleDelete(obs.id, e)}
                  className="cursor-pointer rounded p-1 text-zinc-400 transition hover:bg-zinc-800 hover:text-red-400"
                  title="删除这条留言"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ObservationPanel;
