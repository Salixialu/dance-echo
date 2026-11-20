import { Star } from 'lucide-react';
import { memo, type CSSProperties } from 'react';
import { useI18n } from '../../i18n';
import type { VideoItem } from '../../types';
import { useVideoStore } from '../../store/useVideoStore';
import { tagDisplayName } from '../../utils/tagDisplay';
import { isFavorite, nextFavoriteRating } from '../../utils/favorites';
import { displayFileName, displayTitle } from '../../utils/displayTitle';
import { videoThumbUrl } from '../../services/api/serverUrl';

/** 列表视图的列宽：表头与行必须共用这一套，否则会慢慢错位。 */
export const LIST_COL = {
  thumb: 'w-[82px]',
  tags: 'w-[180px]',
  duration: 'w-[56px]',
  date: 'w-[64px]',
  group: 'w-[140px]',
  action: 'w-[32px]',
};

export const LIST_ROW_HEIGHT = 56;

export function formatListDuration(secs: number): string {
  if (!secs) return '00:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function listDateLabel(ms?: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return d.getFullYear() === now.getFullYear()
    ? `${d.getMonth() + 1}-${pad(d.getDate())}`
    : `${d.getFullYear()}/${d.getMonth() + 1}`;
}

interface Props {
  video: VideoItem;
  showGroup?: boolean;
  style?: CSSProperties;
}

/** 列表视图的单行。VirtualVideoList 与「按日期 + 列表」共用同一份渲染。 */
function VideoListRowBase({ video, showGroup = true, style }: Props) {
  const { tr } = useI18n();
  const isBatchMode = useVideoStore((s) => s.isBatchMode);
  const selected = useVideoStore((s) => s.selectedVideoIds.includes(video.id));
  const { setCurrentVideo, updateRating, toggleSelectedVideo } = useVideoStore.getState();
  const p = video.path ?? '';
  const slash = p.lastIndexOf('/');
  const group = slash > 0 ? p.slice(0, slash).split('/').filter(Boolean)[0] : '';
  const watchedPct =
    video.playbackPosition && video.duration > 0
      ? Math.min(1, video.playbackPosition / video.duration)
      : 0;

  return (
    <div
      data-testid="video-row"
      draggable
      onDragStart={(e) => {
        const dragIds = isBatchMode && selected ? useVideoStore.getState().selectedVideoIds : [video.id];
        const encoded = dragIds.join(',');
        e.dataTransfer.setData('text/plain', encoded);
        e.dataTransfer.setData('application/dance-echo-video-id', encoded);
        e.dataTransfer.setData('application/dance-echo-video-ids', encoded);
        e.dataTransfer.setData('application/x-dance-video-id', encoded);
        e.dataTransfer.effectAllowed = 'copyMove';
      }}
      onClick={() => {
        if (isBatchMode) toggleSelectedVideo(video.id);
        else setCurrentVideo(video);
      }}
      className={`group absolute inset-x-0 flex cursor-pointer items-center gap-3 rounded-lg border px-2 transition-colors ${
        selected
          ? 'border-cyan-400/70 bg-cyan-500/10'
          : 'border-transparent hover:border-hairline-hover hover:bg-white/[0.04]'
      }`}
      style={style}
    >
      <div className={`${LIST_COL.thumb} relative h-[46px] shrink-0 overflow-hidden rounded-md bg-black/60`}>
        <img
          src={videoThumbUrl(video.serverId ?? video.id)}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
        {watchedPct > 0.02 && (
          <div className="absolute inset-x-0 bottom-0 h-[2px] bg-black/50">
            <div className="h-full bg-cyan-400/90" style={{ width: `${watchedPct * 100}%` }} />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="min-w-0 shrink truncate text-[13px] leading-tight text-zinc-200 group-hover:text-white">
          {video.title ? displayTitle(video) : displayFileName(video)}
        </span>
        {(video.tags ?? []).filter((tag) => !tag.startsWith('🎵 ')).slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="hidden max-w-[72px] shrink-0 truncate rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[9px] leading-tight text-zinc-400 lg:inline-block"
          >
            {tagDisplayName(tag)}
          </span>
        ))}
      </div>

      <div className={`${LIST_COL.duration} shrink-0 text-right font-mono text-[11px] tabular-nums text-zinc-400`}>
        {formatListDuration(video.duration)}
      </div>

      <div className={`${LIST_COL.date} shrink-0 text-right font-mono text-[10px] tabular-nums text-zinc-500`}>
        {listDateLabel(video.lastModified)}
      </div>

      {showGroup && (
        <div className={`${LIST_COL.group} hidden shrink-0 truncate text-[10px] text-zinc-500 md:block`}>
          {group}
        </div>
      )}

      <button
        type="button"
        data-testid="row-favorite"
        aria-pressed={isFavorite(video.rating)}
        onClick={(e) => {
          e.stopPropagation();
          void updateRating(video.id, nextFavoriteRating(video.rating));
        }}
        title={isFavorite(video.rating) ? tr('取消收藏') : tr('收藏')}
        aria-label={isFavorite(video.rating) ? tr('取消收藏') : tr('收藏')}
        className={`${LIST_COL.action} flex shrink-0 cursor-pointer justify-center rounded-md p-1.5 transition-colors hover:bg-white/[0.06]`}
      >
        <Star
          className={`h-3.5 w-3.5 transition-colors ${
            isFavorite(video.rating) ? 'fill-amber-300 text-amber-300' : 'text-zinc-600 hover:text-zinc-300'
          }`}
          strokeWidth={1.6}
        />
      </button>
    </div>
  );
}

export const VideoListRow = memo(VideoListRowBase);
