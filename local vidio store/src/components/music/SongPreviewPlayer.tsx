import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, LoaderCircle, Pause, Play, TriangleAlert } from 'lucide-react';
import { songService, type SongPreview } from '../../services/music/songService';
import { useI18n } from '../../i18n/I18nContext';

interface SongPreviewPlayerProps {
  title?: string;
  artist?: string;
  /** 试听开始时回调：一般用来暂停背景视频，避免两个声音打架 */
  onStart?: () => void;
  className?: string;
}

/**
 * 舞曲试听条：根据曲名/歌手去 Apple Music 找 30 秒官方试听片段，
 * 直接在页面里播放（<audio> 播放跨域媒体不受 CORS 限制）。
 */
export const SongPreviewPlayer: React.FC<SongPreviewPlayerProps> = ({
  title,
  artist,
  onStart,
  className = '',
}) => {
  const { t, tr } = useI18n();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [preview, setPreview] = useState<SongPreview | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'playing' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const hasSong = Boolean(title && title.trim());

  useEffect(() => {
    setPreview(null);
    setStatus('idle');
    setProgress(0);
    setError('');
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
    }
  }, [title, artist]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => {
      if (audio.duration && Number.isFinite(audio.duration)) {
        setProgress(Math.min(1, audio.currentTime / audio.duration));
      }
    };
    const onEnd = () => {
      setStatus('idle');
      setProgress(0);
    };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnd);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnd);
    };
  }, []);

  useEffect(
    () => () => {
      audioRef.current?.pause();
    },
    []
  );

  const toggle = async () => {
    if (!hasSong) return;
    const audio = audioRef.current;
    if (!audio) return;

    if (status === 'playing') {
      audio.pause();
      setStatus('idle');
      return;
    }

    if (preview?.previewUrl) {
      try {
        await audio.play();
        setStatus('playing');
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : '播放失败');
      }
      return;
    }

    setStatus('loading');
    setError('');
    const result = await songService.fetchSongPreview(title || '', artist || '');
    if (!result) {
      setStatus('error');
      setError('曲库里没找到可试听的官方片段，可用下方链接去音乐 App 搜');
      return;
    }
    setPreview(result);
    audio.src = result.previewUrl;
    audio.load();
    onStart?.();
    try {
      await audio.play();
      setStatus('playing');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : '浏览器拦截了播放，请再点一次');
    }
  };

  if (!hasSong) return null;

  const searching = status === 'loading';
  const playing = status === 'playing';
  const externalUrl =
    preview?.trackViewUrl ||
    `https://music.apple.com/cn/search?term=${encodeURIComponent(
      [title, artist].filter((part) => part && part.trim()).join(' ')
    )}`;

  return (
    <div
      data-testid="song-preview"
      className={`rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 ${className}`}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="song-preview-toggle"
          onClick={() => void toggle()}
          disabled={searching}
          className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-purple-500 text-white transition hover:bg-purple-400 disabled:opacity-60"
          title={playing ? '暂停试听' : '试听 30 秒'}
          aria-label={playing ? '暂停试听' : '试听 30 秒'}
        >
          {searching ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : playing ? (
            <Pause className="h-3.5 w-3.5" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="truncate text-[11px] font-medium text-zinc-200">
              {preview?.trackName || title}
            </span>
            <span className="flex-shrink-0 text-[10px] text-zinc-500">{tr('试听 30s')}</span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-purple-400 transition-[width] duration-150"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        </div>

        {externalUrl && (
          <a
            href={externalUrl}
            target="_blank"
            rel="noreferrer"
            className="flex-shrink-0 rounded-md p-1 text-zinc-500 transition hover:text-purple-300"
            title={tr('在 Apple Music 打开 / 搜索')}
            aria-label={tr('在 Apple Music 打开或搜索')}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {status === 'error' && (
        <div className="mt-1.5 flex items-start gap-1.5 text-[10px] leading-relaxed text-amber-300/90">
          <TriangleAlert className="mt-0.5 h-3 w-3 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <audio ref={audioRef} preload="none" className="hidden" />
    </div>
  );
};
