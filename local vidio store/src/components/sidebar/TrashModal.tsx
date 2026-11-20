import React, { useCallback, useEffect, useState } from 'react';
import { RotateCcw, Trash2, X, LoaderCircle, Film } from 'lucide-react';
import { api, type ServerVideo } from '../../services/api/client';
import { videoThumbUrl } from '../../services/api/serverUrl';

interface TrashModalProps {
  open: boolean;
  onClose: () => void;
  /** 恢复成功后通知外层刷新媒体库 */
  onChanged: () => void;
}

/**
 * 回收区：列服务端已移入回收的视频，可逐条恢复。
 * 只恢复应用记录，磁盘文件从未被动过。
 */
export const TrashModal: React.FC<TrashModalProps> = ({ open, onClose, onChanged }) => {
  const [items, setItems] = useState<ServerVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const library = await api.library({ includeTrashed: true });
      setItems(library.videos.filter((video) => (video.meta?.trashedAt ?? 0) > 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取回收区失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const restore = async (id: string) => {
    setBusyId(id);
    try {
      await api.restoreVideo(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : '恢复失败');
    } finally {
      setBusyId(null);
    }
  };

  const clearAll = async () => {
    if (!items.length || clearing) return;
    const confirmed = window.confirm(`清空回收区？将移除 ${items.length} 条应用记录，磁盘文件保持不动。`);
    if (!confirmed) return;
    setClearing(true);
    try {
      await api.clearTrash();
      setItems([]);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : '清空回收区失败');
    } finally {
      setClearing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-lg border border-hairline bg-space-void shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="回收区"
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-hairline">
          <div className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-zinc-400" />
            <h2 className="text-sm font-semibold text-zinc-100">回收区</h2>
            <span className="text-[11px] text-zinc-500">移除的只是应用记录，磁盘文件从未改动</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="trash-clear-all"
              disabled={loading || clearing || items.length === 0}
              onClick={() => void clearAll()}
              className="flex items-center gap-1 rounded border border-rose-400/40 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-300 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {clearing ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              清空回收区
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-zinc-500 hover:bg-white/[0.06] hover:text-white"
              aria-label="关闭回收区"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-zinc-500 py-6 justify-center">
              <LoaderCircle className="h-4 w-4 animate-spin" /> 正在读取…
            </div>
          ) : error ? (
            <div className="text-xs text-rose-300 py-6 text-center">
              {error}
              <button type="button" onClick={() => void load()} className="ml-2 underline hover:text-rose-200">
                重试
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="text-xs text-zinc-500 py-8 text-center">回收区是空的</div>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {items.map((item) => (
                <li key={item.id} className="flex items-center gap-3 py-2.5">
                  <span className="relative flex h-10 w-16 shrink-0 items-center justify-center overflow-hidden rounded bg-zinc-900">
                    <Film className="absolute h-4 w-4 text-zinc-700" />
                    <img
                      src={videoThumbUrl(item.id)}
                      alt=""
                      className="relative h-full w-full object-cover"
                      onError={(event) => {
                        (event.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-zinc-200">{item.name}</p>
                    <p className="truncate text-[11px] text-zinc-500">
                      {item.relPath}
                      {item.meta?.trashedAt
                        ? ` · ${new Date(item.meta.trashedAt).toLocaleDateString('zh-CN')} 移入`
                        : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => void restore(item.id)}
                    className="flex shrink-0 items-center gap-1 rounded border border-cyan-400/40 bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-50"
                  >
                    {busyId === item.id ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                    恢复
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
};
