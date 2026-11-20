import React, { useState, useEffect } from 'react';
import type { TagPresetGroup } from '../../services/settings/appPreferences';
import {
  X,
  MessageSquare,
  Info,
  Music2,
  Search,
  Radio,
  Sparkles,
  Check,
  Disc,
  ExternalLink,
  LoaderCircle,
  FileVideo,
  Hash,
  Activity,
  Layers,
  Pencil,
  Heart,
  Star,
  Plus,
  FolderInput,
  XCircle,
} from 'lucide-react';
import type { VideoItem } from '../../types';
import { isFavorite, nextFavoriteRating } from '../../utils/favorites';
import { displayFileNameHint, displayTitle } from '../../utils/displayTitle';
import { songService, type SongMetadata } from '../../services/music/songService';
import { tagDisplayName } from '../../utils/tagDisplay';
import { SongPreviewPlayer } from '../music/SongPreviewPlayer';
import { useI18n } from '../../i18n/I18nContext';
import { ObservationPanel } from './ObservationPanel';

export type RightDrawerTab = 'notes' | 'info' | 'song';

interface DancePlayerRightDrawerProps {
  isOpen: boolean;
  activeTab: RightDrawerTab;
  onTabChange: (tab: RightDrawerTab) => void;
  onClose: () => void;
  video: VideoItem;
  currentTime: number;
  duration: number;
  bpm: number;
  videoElement: HTMLVideoElement | null;
  onSeek: (time: number) => void;
  /** 点留言时间戳：跳到该秒并暂停 */
  onSeekAndPause: (time: number) => void;
  /** 当前视频的留言条数（页签徽标与信息栏共用） */
  noteCount?: number;
  onNoteCountChange?: (count: number) => void;
  onUnbindSong?: () => Promise<void> | void;
  onSaveSong: (metadata: SongMetadata) => Promise<void>;
  onRenameVideo: (name: string) => Promise<void>;
  onUpdateRating: (rating: number) => Promise<void> | void;
  onAddTag: (tag: string) => Promise<void> | void;
  onRemoveTag: (tag: string) => Promise<void> | void;
  onMoveToFolder: (folderPath: string) => Promise<void> | void;
  /** 把识别/绑定到的歌一次性同步给本组其他视频（同一支舞的多个机位） */
  onBindSongToGroup?: (metadata: SongMetadata) => Promise<void> | void;
  /** 本组视频总数（含当前这条） */
  groupVideoCount?: number;
  /** 歌名正好等于另一个分组的名字时，给出归并目标 */
  siblingGroup?: { path: string; name: string; count: number } | null;
  onMergeIntoGroup?: (folderPath: string) => void;
  folderPath: string;
  folderOptions: string[];
  tagSuggestions: string[];
  /** 标签预设维度（老师/舞种/来源…），点一下即写入「维度:值」 */
  tagPresetGroups?: TagPresetGroup[];
  formatTime: (secs: number) => string;
  /** 试听时暂停视频，避免两路声音叠加 */
  onPauseVideo?: () => void;
}

export const DancePlayerRightDrawer: React.FC<DancePlayerRightDrawerProps> = ({
  isOpen,
  activeTab,
  onTabChange,
  onClose,
  video,
  currentTime,
  duration,
  bpm,
  videoElement,
  onSeek,
  onSeekAndPause,
  noteCount = 0,
  onNoteCountChange,
  onUnbindSong,
  onSaveSong,
  onRenameVideo,
  onUpdateRating,
  onAddTag,
  onRemoveTag,
  onMoveToFolder,
  onBindSongToGroup,
  groupVideoCount = 1,
  siblingGroup = null,
  onMergeIntoGroup,
  folderPath,
  folderOptions,
  tagSuggestions,
  tagPresetGroups = [],
  formatTime,
  onPauseVideo,
}) => {
  const { t, tr } = useI18n();
  // ── 信息栏状态 ──────────────────────────────────────────
  const [isRenamingVideo, setIsRenamingVideo] = useState(false);
  const [videoNameDraft, setVideoNameDraft] = useState(video.title ?? '');
  const [tagDraft, setTagDraft] = useState('');

  const handleAddTag = async () => {
    const nextTag = tagDraft.trim().replace(/^#/, '');
    if (!nextTag) return;
    if (!(video.tags ?? []).includes(nextTag)) {
      await onAddTag(nextTag);
    }
    setTagDraft('');
  };

  useEffect(() => {
    setVideoNameDraft(video.title ?? '');
  }, [video.title]);

  const commitVideoRename = async () => {
    const nextTitle = videoNameDraft.trim();
    if (nextTitle === (video.title ?? '')) {
      setIsRenamingVideo(false);
      return;
    }
    // 空串表示清除标题，回退到文件名
    try {
      await onRenameVideo(nextTitle);
    } finally {
      // 无论服务端是否成功，都退出编辑态，避免输入框卡住
      setIsRenamingVideo(false);
    }
  };

  // ── 歌曲栏状态 ──────────────────────────────────────────
  const [songSubTab, setSongSubTab] = useState<'search' | 'audio' | 'manual'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SongMetadata[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedSong, setSelectedSong] = useState<SongMetadata | null>(null);

  // 音频识曲状态
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [recognizeMessage, setRecognizeMessage] = useState<string | null>(null);

  // 手动输入
  const [manualTitle, setManualTitle] = useState(video.songTitle || '');
  const [manualArtist, setManualArtist] = useState(video.songArtist || '');

  // 当切入歌曲Tab或打开抽屉时预填
  useEffect(() => {
    if (!isOpen) return;

    if (video.songTitle) {
      setSelectedSong({
        title: video.songTitle,
        artist: video.songArtist || '',
        source: 'manual',
      });
      setManualTitle(video.songTitle);
      setManualArtist(video.songArtist || '');
    }

    const guessed = songService.cleanFileNameForSearch(video.name);
    const initialQuery = guessed || video.songTitle || '';
    setSearchQuery(initialQuery);

    if (initialQuery && searchResults.length === 0) {
      setIsSearching(true);
      songService.searchSong(initialQuery).then((results) => {
        setSearchResults(results);
        setIsSearching(false);
      });
    }
  }, [isOpen, video.id]);

  const handleSearchSong = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const results = await songService.searchSong(searchQuery.trim());
      setSearchResults(results);
    } finally {
      setIsSearching(false);
    }
  };

  const handleStartAcrRecognition = async () => {
    if (!videoElement) {
      setRecognizeMessage('未检测到视频播放元素，请确保视频已开始加载');
      return;
    }

    setIsRecognizing(true);
    setRecognizeMessage('正在截取视频 6 秒音频片段...');

    try {
      const audioBlob = await songService.extractAudioSnippet(videoElement, 6);
      setRecognizeMessage('正在发送指纹检索云端音乐库...');
      const res = await songService.recognizeWithACRCloud(audioBlob);

      if (res.success && res.metadata) {
        setSelectedSong(res.metadata);
        const confidence = res.metadata.confidence;
        const strong = confidence === undefined || confidence >= 0.6;
        if (!strong) {
          // 置信度偏低只给建议、不落库：宁可让用户点一下确认，也不要写错歌名污染标签。
          setRecognizeMessage(
            `🤔 可能是《${res.metadata.title}》 - ${res.metadata.artist}（置信度 ${Math.round(
              (confidence ?? 0) * 100,
            )}%）。觉得对就点下面「确认绑定」，不对可以换个播放位置再识别。`,
          );
          return;
        }
        // 高置信度就立刻落地：写 songTitle/songArtist/bpm，并自动打上「🎵 歌名」标签，
        // 这样关掉播放器也不丢，首页标签筛选也能直接命中。
        try {
          await onSaveSong(res.metadata);
          setRecognizeMessage(
            `🎉 已绑定《${res.metadata.title}》 - ${res.metadata.artist}　识别错了可以在上面点「解绑」，或改用「手动填写」`,
          );
        } catch (saveError) {
          setRecognizeMessage(
            `已识别《${res.metadata.title}》，但保存失败：${
              saveError instanceof Error ? saveError.message : '未知错误'
            }，请重试`,
          );
        }
      } else {
        setRecognizeMessage(res.message);
      }
    } catch (err) {
      setRecognizeMessage(err instanceof Error ? err.message : '识别失败，请重试');
    } finally {
      setIsRecognizing(false);
    }
  };

  const handleApplySong = async (songToApply: SongMetadata) => {
    setSelectedSong(songToApply);
    await onSaveSong(songToApply);
  };

  const handleApplyManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTitle.trim()) return;
    const meta: SongMetadata = {
      title: manualTitle.trim(),
      artist: manualArtist.trim() || '自定',
      source: 'manual',
    };
    setSelectedSong(meta);
    await onSaveSong(meta);
  };

  if (!isOpen) return null;

  return (
    <aside
      id="dancePlayerRightDrawer"
      className="w-[calc(100vw-1rem)] max-w-80 md:w-84 h-full flex flex-col bg-zinc-950/95 border-l border-white/10 text-zinc-200 backdrop-blur-2xl shadow-2xl z-20 flex-shrink-0 animate-in slide-in-from-right duration-200 select-none overflow-hidden"
    >
      {/* 抽屉头：三个分区标签 + 收起 */}
      <div className="flex items-center gap-0.5 border-b border-white/10 px-2 py-1.5 bg-zinc-900/40 flex-shrink-0">
        {([
          { key: 'info' as const, label: '信息', icon: Info },
          { key: 'notes' as const, label: '留言', icon: MessageSquare },
          { key: 'song' as const, label: '舞曲', icon: Music2 },
        ]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            data-testid={`drawer-tab-${key}`}
            onClick={() => onTabChange(key)}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition cursor-pointer ${
              activeTab === key ? 'bg-white/[0.10] text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
            }`}
            title={label}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{tr(label)}</span>
            {key === 'notes' && (noteCount ?? 0) > 0 && (
              <span className="font-mono text-[10px] text-zinc-500">{noteCount}</span>
            )}
          </button>
        ))}

        <button
          type="button"
          onClick={onClose}
          className="ml-auto p-1 rounded-md text-zinc-500 hover:text-white hover:bg-white/10 transition cursor-pointer"
          title={tr('收起抽屉')}
          aria-label={tr('收起抽屉')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── 内容体 ────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ==================== 1. 留言 ==================== */}
        {activeTab === 'notes' && (
          <ObservationPanel
            videoId={video.id}
            currentTime={currentTime}
            onSeekAndPause={onSeekAndPause}
            onCountChange={onNoteCountChange}
          />
        )}

        {/* ==================== 2. 简化信息栏 ==================== */}
        {activeTab === 'info' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            {/* 概览：不套卡片，靠分隔线与字重分层 */}
            <div className="space-y-2.5">
              <div className="min-w-0">
                {isRenamingVideo ? (
                  <input
                    autoFocus
                    value={videoNameDraft}
                    placeholder={video.name}
                    onChange={(event) => setVideoNameDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void commitVideoRename();
                      } else if (event.key === 'Escape') {
                        setVideoNameDraft(video.title ?? '');
                        setIsRenamingVideo(false);
                      }
                    }}
                    className="w-full rounded-md border border-white/15 bg-zinc-950 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-white/30"
                    aria-label={tr('显示标题')}
                  />
                ) : (
                  <div className="flex items-start gap-1.5">
                    <div className="min-w-0 flex-1 text-sm font-medium text-zinc-100 break-all leading-snug">
                      {displayTitle(video)}
                    </div>
                    <button
                      type="button"
                      data-testid="info-favorite"
                      aria-pressed={isFavorite(video.rating)}
                      onClick={() => void onUpdateRating(nextFavoriteRating(video.rating))}
                      className={`shrink-0 rounded p-1 transition hover:bg-white/10 ${
                        isFavorite(video.rating) ? 'text-amber-300' : 'text-zinc-500 hover:text-amber-200'
                      }`}
                      title={isFavorite(video.rating) ? tr('取消收藏') : tr('收藏')}
                      aria-label={isFavorite(video.rating) ? tr('取消收藏') : tr('收藏')}
                    >
                      <Star className="h-3.5 w-3.5" fill={isFavorite(video.rating) ? 'currentColor' : 'none'} />
                    </button>
                    <button
                      type="button"
                      data-testid="info-rename-title"
                      onClick={() => setIsRenamingVideo(true)}
                      className="shrink-0 rounded p-1 text-zinc-500 hover:bg-white/10 hover:text-zinc-200"
                      title={tr('改名（只改显示标题，不动磁盘文件）')}
                      aria-label={tr('改名（只改显示标题，不动磁盘文件）')}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                {displayFileNameHint(video) && (
                  <div className="mt-0.5 truncate text-[10px] text-zinc-600" title={video.name}>
                    {video.name}
                  </div>
                )}
                <div className="mt-0.5 font-mono text-[10px] text-zinc-600">
                  ID: {video.id.slice(0, 8)}…
                </div>
              </div>

              <dl className="divide-y divide-white/5 border-t border-white/5 text-xs">
                <div className="flex items-center justify-between gap-3 py-1.5">
                  <dt className="text-zinc-500">{tr('时长')}</dt>
                  <dd className="font-mono text-zinc-200">{formatTime(duration)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 py-1.5">
                  <dt className="text-zinc-500">{tr('节拍')}</dt>
                  <dd className="font-mono text-zinc-200">
                    {Math.round(bpm) || 120} <span className="text-zinc-500">BPM</span>
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 py-1.5">
                  <dt className="text-zinc-500">{tr('留言')}</dt>
                  <dd className="font-mono text-zinc-200">{noteCount ?? 0}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 py-1.5">
                  <dt className="shrink-0 text-zinc-500">{tr('舞曲')}</dt>
                  <dd className="truncate text-zinc-200" title={video.songTitle || '未绑定'}>
                    {video.songTitle ? `《${video.songTitle}》` : '未绑定'}
                  </dd>
                </div>
              </dl>
            </div>

            {/* 评分：5 颗爱心，1~5 级；点当前等级再点一次清零。
                满分 5 与「收藏」共用同一个 rating 字段，所以 5 心 = 已收藏。 */}
            <div className="space-y-2">
              <div className="flex items-baseline justify-between px-1">
                <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                  评分
                </span>
                <span className="text-[10px] text-zinc-500">
                  {video.rating ? `${Math.min(5, video.rating)} / 5` : '未评分'}
                </span>
              </div>
              <div className="flex items-center gap-1 px-1">
                {[1, 2, 3, 4, 5].map((level) => {
                  const filled = (video.rating ?? 0) >= level;
                  return (
                    <button
                      key={level}
                      type="button"
                      data-testid="info-rating-heart"
                      data-level={level}
                      aria-label={tr('{n} 颗爱心', { n: level })}
                      aria-pressed={filled}
                      title={level === 5 ? tr('{n} 颗爱心（同时记为收藏）', { n: level }) : tr('{n} 颗爱心', { n: level })}
                      onClick={() => void onUpdateRating(video.rating === level ? 0 : level)}
                      className="rounded-md p-1 transition hover:bg-white/[0.06]"
                    >
                      <Heart
                        className={`h-4.5 w-4.5 transition-colors ${
                          filled ? 'fill-rose-400 text-rose-400' : 'text-zinc-600 hover:text-rose-300'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 所属分组 */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider px-1">
                所属分组
              </div>
              <div className="flex items-center gap-2 px-1">
                <FolderInput className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                <select
                  data-testid="info-folder-select"
                  value={folderPath}
                  onChange={(event) => void onMoveToFolder(event.target.value)}
                  className="min-w-0 flex-1 cursor-pointer rounded-lg border border-white/10 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-cyan-400"
                  aria-label={tr('所属分组')}
                >
                  <option value="">{tr('媒体库根目录')}</option>
                  {folderOptions.map((option) => (
                    <option key={option} value={option}>
                      {option.replace(/\//g, ' / ')}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 标签管理 */}
            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider px-1">
                分类与舞种标签
              </div>
              <div className="flex flex-wrap gap-1.5 px-1">
                {video.tags && video.tags.length > 0 ? (
                  video.tags.map((tag) => (
                    <span
                      key={tag}
                      title={tag}
                      className="group inline-flex items-center gap-1 rounded-full border border-white/10 bg-zinc-900 px-2 py-0.5 font-mono text-[11px] text-zinc-300"
                    >
                      #{tagDisplayName(tag)}
                      <button
                        type="button"
                        data-testid={`info-tag-remove-${tag}`}
                        onClick={() => void onRemoveTag(tag)}
                        className="rounded-full text-zinc-500 transition hover:text-red-400"
                        title={`移除标签 #${tag}`}
                        aria-label={`移除标签 ${tag}`}
                      >
                        <XCircle className="h-3 w-3" />
                      </button>
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-zinc-500">{tr('暂无标签，可在下方输入添加')}</span>
                )}
              </div>

              <div className="flex gap-1.5 px-1">
                <input
                  type="text"
                  data-testid="info-tag-input"
                  value={tagDraft}
                  onChange={(event) => setTagDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void handleAddTag();
                    }
                  }}
                  placeholder={tr('输入标签后回车，如：待复盘')}
                  className="flex-1 rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-1.5 text-xs text-white placeholder-zinc-500 outline-none focus:border-cyan-400"
                />
                <button
                  type="button"
                  data-testid="info-tag-add"
                  onClick={() => void handleAddTag()}
                  className="flex shrink-0 items-center gap-1 rounded-lg bg-cyan-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-cyan-500"
                >
                  <Plus className="h-3 w-3" />
                  添加
                </button>
              </div>

              {tagPresetGroups.filter((group) => group.values.length > 0).length > 0 && (
                <div className="space-y-1.5 px-1 pt-1">
                  {tagPresetGroups
                    .filter((group) => group.values.length > 0)
                    .map((group) => (
                      <div key={group.name} className="space-y-1">
                        <div className="text-[10px] text-zinc-600">{group.name}</div>
                        <div className="flex flex-wrap gap-1">
                          {group.values.map((value) => {
                            const presetTag = group.name + ":" + value;
                            const selected = (video.tags ?? []).includes(presetTag);
                            return (
                              <button
                                key={presetTag}
                                type="button"
                                data-testid={"tag-preset-" + group.name + "-" + value}
                                aria-pressed={selected}
                                onClick={() =>
                                  selected ? void onRemoveTag(presetTag) : void onAddTag(presetTag)
                                }
                                className={
                                  selected
                                    ? 'rounded-full border border-cyan-400/50 bg-cyan-500/15 px-2 py-0.5 text-[10px] text-cyan-200 transition'
                                    : 'rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-zinc-400 transition hover:border-white/25 hover:text-zinc-200'
                                }
                              >
                                {value}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                </div>
              )}
              {tagSuggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-1 pt-0.5">
                  <span className="text-[10px] text-zinc-600">{tr('常用：')}</span>
                  {tagSuggestions.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => void onAddTag(tag)}
                      className="rounded-full border border-white/5 bg-zinc-900/60 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 transition hover:border-cyan-500/40 hover:text-cyan-300"
                      title={`添加标签 #${tag}`}
                    >
                      +{tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== 3. 歌曲栏（内嵌免弹窗识曲） ==================== */}
        {activeTab === 'song' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            {/* 当前绑定状态卡片 */}
            <div className="p-3 rounded-xl bg-purple-950/40 border border-purple-500/30 flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-1.5 rounded-lg bg-purple-900/60 text-purple-300 border border-purple-400/30">
                  <Disc className="w-4 h-4 animate-spin" style={{ animationDuration: '8s' }} />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white truncate">
                    {selectedSong?.title || video.songTitle ? `《${selectedSong?.title || video.songTitle}》` : '未绑定舞曲'}
                  </div>
                  <div className="text-[10px] text-purple-300/80 truncate">
                    {selectedSong?.artist || video.songArtist || '可通过下方搜歌或识曲快速绑定'}
                  </div>
                </div>
              </div>
              {video.songTitle ? (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-900/80 text-purple-200 border border-purple-400/30">
                    已关联
                  </span>
                  <button
                    type="button"
                    data-testid="song-unbind"
                    onClick={() => void onUnbindSong?.()}
                    title={tr('取消绑定这首舞曲（不影响视频本身）')}
                    className="rounded px-1.5 py-0.5 text-[10px] text-zinc-400 transition hover:bg-white/[0.06] hover:text-rose-300"
                  >
                    {tr('解绑')}
                  </button>
                </div>
              ) : null}
            </div>

            {/* 本组共用一首歌：识别/绑定成功后一键同步到同组其它机位 */}
            {video.songTitle && groupVideoCount > 1 && (
              <button
                type="button"
                data-testid="song-bind-group"
                onClick={() =>
                  void onBindSongToGroup?.({
                    title: video.songTitle || '',
                    artist: video.songArtist || '',
                    bpm: video.bpm,
                    source: 'acrcloud',
                  })
                }
                className="w-full rounded-xl border border-purple-400/30 bg-purple-950/40 px-3 py-2 text-[11px] font-medium text-purple-200 transition hover:bg-purple-900/50"
              >
                {tr('把《{title}》同步到本组另外 {n} 个视频', {
                  title: video.songTitle,
                  n: groupVideoCount - 1,
                })}
              </button>
            )}

            {/* 同名归并：歌名已经是一个分组名，说明这支舞早就有组了 */}
            {siblingGroup && (
              <div
                data-testid="song-merge-sibling"
                className="rounded-xl border border-amber-400/30 bg-amber-950/30 p-2.5 text-[11px] text-amber-100"
              >
                <div className="leading-relaxed">
                  {tr('已经有同名分组「{name}」（{n} 个视频）', { name: siblingGroup.name, n: siblingGroup.count })}
                </div>
                <button
                  type="button"
                  onClick={() => onMergeIntoGroup?.(siblingGroup.path)}
                  className="mt-1.5 w-full rounded-lg border border-amber-400/40 bg-amber-900/40 px-2 py-1 text-[11px] font-medium text-amber-100 transition hover:bg-amber-900/60"
                >
                  {tr('把这条视频并到那个分组')}
                </button>
              </div>
            )}

            {/* 识别/绑定成功后可直接试听官方 30 秒片段 */}
            <SongPreviewPlayer
              title={selectedSong?.title || video.songTitle}
              artist={selectedSong?.artist || video.songArtist}
              onStart={onPauseVideo}
            />

            {/* 子选项卡：搜歌 / 音频识曲 / 手动录入 */}
            <div className="flex border-b border-white/10 text-xs">
              <button
                type="button"
                onClick={() => setSongSubTab('search')}
                className={`flex-1 py-1.5 text-center font-medium transition cursor-pointer border-b-2 ${
                  songSubTab === 'search'
                    ? 'border-purple-400 text-purple-300'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                搜索歌曲
              </button>
              <button
                type="button"
                onClick={() => setSongSubTab('audio')}
                className={`flex-1 py-1.5 text-center font-medium transition cursor-pointer border-b-2 ${
                  songSubTab === 'audio'
                    ? 'border-purple-400 text-purple-300'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                听音识曲
              </button>
              <button
                type="button"
                onClick={() => setSongSubTab('manual')}
                className={`flex-1 py-1.5 text-center font-medium transition cursor-pointer border-b-2 ${
                  songSubTab === 'manual'
                    ? 'border-purple-400 text-purple-300'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                手动填写
              </button>
            </div>

            {/* 子视图 1: 歌曲检索 */}
            {songSubTab === 'search' && (
              <div className="space-y-3">
                <form onSubmit={handleSearchSong} className="flex gap-1.5">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input
                      type="text"
                      placeholder={tr('歌曲名 / 歌手 / 编舞曲名...')}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-zinc-900 border border-white/10 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-400"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSearching}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition cursor-pointer flex-shrink-0"
                  >
                    {isSearching ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : '搜索'}
                  </button>
                </form>

                {/* 候选歌曲列表 */}
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {searchResults.map((song, idx) => {
                    const isCurrent =
                      selectedSong?.title === song.title && selectedSong?.artist === song.artist;
                    return (
                      <div
                        key={`${song.title}-${song.artist}-${idx}`}
                        onClick={() => void handleApplySong(song)}
                        className={`flex items-center justify-between p-2 rounded-xl border text-xs transition cursor-pointer ${
                          isCurrent
                            ? 'bg-purple-950/80 border-purple-500/60 text-white shadow'
                            : 'bg-zinc-900/60 border-white/5 text-zinc-300 hover:bg-zinc-800'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <div className="font-medium truncate text-zinc-100">{song.title}</div>
                          <div className="text-[10px] text-zinc-500 truncate">{song.artist}</div>
                        </div>
                        <button
                          type="button"
                          className={`px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 flex-shrink-0 ${
                            isCurrent
                              ? 'bg-purple-500 text-zinc-950 font-bold'
                              : 'bg-zinc-800 text-purple-300 hover:bg-purple-900/60'
                          }`}
                        >
                          {isCurrent ? <Check className="w-3 h-3" /> : null}
                          <span>{isCurrent ? '已绑定' : '绑定'}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 子视图 2: 听音识曲 (无弹窗内嵌) */}
            {songSubTab === 'audio' && (
              <div className="space-y-3 p-3 rounded-xl bg-zinc-900/60 border border-white/5 text-center">
                <div className="w-10 h-10 rounded-full bg-purple-950/80 border border-purple-500/30 text-purple-300 flex items-center justify-center mx-auto shadow-[0_0_15px_rgba(168,85,247,0.2)]">
                  <Radio className={`w-5 h-5 ${isRecognizing ? 'animate-pulse text-purple-400' : ''}`} />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white">{tr('从视频音轨直接识曲')}</h4>
                  <p className="text-[10px] text-zinc-400 mt-0.5">
                    自动截取当前视频的 6 秒声纹，连接云端音乐库识别
                  </p>
                </div>

                <button
                  type="button"
                  disabled={isRecognizing}
                  onClick={() => void handleStartAcrRecognition()}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-lg shadow-purple-600/30 transition cursor-pointer disabled:opacity-50"
                >
                  {isRecognizing ? (
                    <>
                      <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                      <span>{tr('正在提取音轨并识别...')}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{tr('立即开始识别音轨')}</span>
                    </>
                  )}
                </button>

                {/* 低置信度：把决定权交给用户，一键确认后走同一套保存逻辑 */}
                {selectedSong && !video.songTitle && (
                  <button
                    type="button"
                    data-testid="song-confirm-recognized"
                    onClick={() => void handleApplySong(selectedSong)}
                    className="w-full py-1.5 rounded-lg border border-emerald-400/40 bg-emerald-950/40 text-[11px] font-medium text-emerald-200 transition hover:bg-emerald-900/50"
                  >
                    {tr('确认识别结果，绑定《{title}》', { title: selectedSong.title })}
                  </button>
                )}

                {recognizeMessage && (
                  <p className="text-[11px] font-mono text-cyan-300 break-words text-left pt-1">
                    {recognizeMessage}
                  </p>
                )}
              </div>
            )}

            {/* 子视图 3: 手动录入 */}
            {songSubTab === 'manual' && (
              <form onSubmit={handleApplyManual} className="space-y-2.5">
                <div>
                  <label className="text-[10px] text-zinc-400 block mb-1">{tr('歌曲标题')}</label>
                  <input
                    type="text"
                    required
                    placeholder={tr('如: Hype Boy')}
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                    className="w-full bg-zinc-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-400"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-400 block mb-1">{tr('演唱者 / 编舞师')}</label>
                  <input
                    type="text"
                    placeholder={tr('如: NewJeans')}
                    value={manualArtist}
                    onChange={(e) => setManualArtist(e.target.value)}
                    className="w-full bg-zinc-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-400"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-medium transition cursor-pointer"
                >
                  保存曲目档案
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
