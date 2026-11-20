import React, { useState, useEffect } from 'react';
import {
  Music2,
  Search,
  Sparkles,
  Radio,
  Settings,
  Check,
  X,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Disc,
} from 'lucide-react';
import { songService, type SongMetadata } from '../../services/music/songService';
import type { VideoItem } from '../../types';
import { SongPreviewPlayer } from './SongPreviewPlayer';
import { useI18n } from '../../i18n/I18nContext';

interface SongRecognizeModalProps {
  isOpen: boolean;
  video: VideoItem;
  videoElement?: HTMLVideoElement | null;
  onClose: () => void;
  onSaveSong: (metadata: SongMetadata) => Promise<void>;
}

export const SongRecognizeModal: React.FC<SongRecognizeModalProps> = ({
  isOpen,
  video,
  videoElement,
  onClose,
  onSaveSong,
}) => {
  const { t, tr } = useI18n();
  const [activeTab, setActiveTab] = useState<'search' | 'audio' | 'manual'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SongMetadata[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedSong, setSelectedSong] = useState<SongMetadata | null>(null);

  // ACRCloud 设置与识别状态
  const [showAcrSettings, setShowAcrSettings] = useState(false);
  const [acrConfig, setAcrConfig] = useState(songService.getACRCloudConfig().config);
  const [isAcrConfigured, setIsAcrConfigured] = useState(songService.getACRCloudConfig().isConfigured);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [recognizeMessage, setRecognizeMessage] = useState<string | null>(null);

  // 手动输入表单
  const [manualTitle, setManualTitle] = useState(video.songTitle || '');
  const [manualArtist, setManualArtist] = useState(video.songArtist || '');

  // 初始加载：自动从视频文件名推导候选词并检索
  useEffect(() => {
    if (!isOpen) return;

    // 如果视频已有歌曲信息，默认选中
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

    if (initialQuery) {
      setIsSearching(true);
      songService.searchSong(initialQuery).then((results) => {
        setSearchResults(results);
        setIsSearching(false);
      });
    } else {
      // 默认呈现前 4 首热门编舞曲目
      songService.searchSong('NewJeans').then((results) => {
        setSearchResults(results);
      });
    }

    const { isConfigured, config } = songService.getACRCloudConfig();
    setIsAcrConfigured(isConfigured);
    setAcrConfig(config);
  }, [isOpen, video]);

  if (!isOpen) return null;

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const results = await songService.searchSong(searchQuery);
      setSearchResults(results);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSaveAcrConfig = () => {
    songService.saveACRCloudConfig(acrConfig);
    const { isConfigured } = songService.getACRCloudConfig();
    setIsAcrConfigured(isConfigured);
    setShowAcrSettings(false);
    setRecognizeMessage('ACRCloud 国内配置已保存');
  };

  const handleStartAcrRecognition = async () => {
    if (!videoElement) {
      setRecognizeMessage('未检测到视频播放元素，请在视频播放器内执行音频识别');
      return;
    }

    setIsRecognizing(true);
    setRecognizeMessage('正在从视频中提取 6 秒音轨片段...');

    try {
      const audioBlob = await songService.extractAudioSnippet(videoElement, 6);
      setRecognizeMessage('正在向 ACRCloud 国内节点发送音频指纹并检索...');
      const res = await songService.recognizeWithACRCloud(audioBlob);

      if (res.success && res.metadata) {
        setSelectedSong(res.metadata);
        setRecognizeMessage(`🎉 成功识别曲目: 《${res.metadata.title}》 - ${res.metadata.artist}`);
      } else {
        setRecognizeMessage(res.message);
      }
    } catch (err) {
      setRecognizeMessage(err instanceof Error ? err.message : '音频抽取与识别失败');
    } finally {
      setIsRecognizing(false);
    }
  };

  const handleConfirmSave = async () => {
    let target: SongMetadata | null = selectedSong;

    if (activeTab === 'manual') {
      if (!manualTitle.trim()) return;
      target = {
        title: manualTitle.trim(),
        artist: manualArtist.trim() || '自定',
        source: 'manual',
      };
    }

    if (target) {
      await onSaveSong(target);
      onClose();
    }
  };

  return (
    <div
      id="songRecognizeModal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-3xl bg-zinc-950 border border-cyan-500/30 text-white shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-zinc-900/60 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-950/80 text-cyan-400 border border-cyan-400/30">
              <Music2 className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
                <span>{tr('歌曲识别与曲目档案')}</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-500/40">
                  国内免翻墙
                </span>
              </h3>
              <p className="text-xs font-mono text-zinc-400 truncate max-w-md">
                当前视频: {video.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab 导航 */}
        <div className="flex border-b border-white/10 bg-zinc-900/30 px-6 pt-2 gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('search')}
            className={`pb-2.5 text-xs font-medium border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'search'
                ? 'border-cyan-400 text-cyan-300 font-bold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>{tr('开放搜歌 (免Key·直连)')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('audio')}
            className={`pb-2.5 text-xs font-medium border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'audio'
                ? 'border-cyan-400 text-cyan-300 font-bold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>{tr('听歌识曲 (ACRCloud国内节点)')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`pb-2.5 text-xs font-medium border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'manual'
                ? 'border-cyan-400 text-cyan-300 font-bold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Disc className="w-3.5 h-3.5" />
            <span>{tr('手动指定 (离线)')}</span>
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === 'search' && (
            <div className="space-y-4">
              {/* 搜索框 */}
              <form onSubmit={handleSearch} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={tr('输入舞曲歌名或歌手 (如: Super Shy / NewJeans)...')}
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSearching}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-zinc-950 font-bold text-xs transition cursor-pointer disabled:opacity-50"
                >
                  {isSearching ? '检索中...' : '搜索'}
                </button>
              </form>

              {/* 热门舞曲快速点选 */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-zinc-500 font-mono">{tr('🔥 热门编舞:')}</span>
                {['Super Shy', 'Whiplash', 'Antifragile', 'Supernova', 'Queencard', 'Seven', '本草纲目'].map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => {
                      setSearchQuery(name);
                      setIsSearching(true);
                      void songService.searchSong(name).then((res) => {
                        setSearchResults(res);
                        setIsSearching(false);
                      });
                    }}
                    className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-900 hover:bg-cyan-950 text-zinc-400 hover:text-cyan-300 border border-white/5 hover:border-cyan-500/30 transition cursor-pointer"
                  >
                    {name}
                  </button>
                ))}
              </div>

              {/* 提示信息 */}
              <p className="text-[11px] text-zinc-400 font-mono">
                💡 支持中国大陆直连搜歌，自动获取官方歌名、编舞艺人与封面图。
              </p>

              {/* 结果列表 */}
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {searchResults.length === 0 ? (
                  <div className="py-8 text-center text-xs text-zinc-500">
                    暂无匹配曲目，可尝试更换关键词或在“手动指定”中直接填写
                  </div>
                ) : (
                  searchResults.map((song, idx) => {
                    const isPicked =
                      selectedSong?.title === song.title &&
                      selectedSong?.artist === song.artist;
                    return (
                      <div
                        key={idx}
                        onClick={() => setSelectedSong(song)}
                        className={`flex items-center justify-between p-3 rounded-2xl border transition cursor-pointer ${
                          isPicked
                            ? 'bg-cyan-950/70 border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.25)]'
                            : 'bg-zinc-900/60 border-white/5 hover:border-white/20 hover:bg-zinc-900'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {song.coverUrl ? (
                            <img
                              src={song.coverUrl}
                              alt={song.title}
                              className="w-10 h-10 rounded-xl object-cover border border-white/10"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-white/10 flex items-center justify-center text-zinc-500">
                              <Music2 className="w-5 h-5" />
                            </div>
                          )}
                          <div>
                            <div className="text-xs font-bold text-white flex items-center gap-2">
                              <span>{song.title}</span>
                              {song.bpm && (
                                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-500/30">
                                  {song.bpm} BPM
                                </span>
                              )}
                              {song.genre && (
                                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 border border-white/5">
                                  {song.genre}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-zinc-400 truncate max-w-xs mt-0.5">
                              {song.artist} {song.album ? `· 《${song.album}》` : ''}
                            </p>
                          </div>
                        </div>

                        {isPicked && (
                          <div className="p-1 rounded-full bg-cyan-400 text-zinc-950">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {activeTab === 'audio' && (
            <div className="space-y-4">
              {/* ACRCloud 状态说明卡片 */}
              <div className="p-4 rounded-2xl bg-zinc-900/90 border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        isAcrConfigured ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                      }`}
                    />
                    <span className="text-xs font-semibold text-zinc-200">
                      ACRCloud 听歌识曲 (中国直连节点)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAcrSettings(!showAcrSettings)}
                    className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>{showAcrSettings ? '收起配置' : '配置国内节点'}</span>
                  </button>
                </div>

                <p className="text-[11px] text-zinc-400 font-mono leading-relaxed">
                  ACRCloud 是全球权威音频指纹识别服务商，国内提供北京/上海机房直连。注册开发者账号可享受每月{' '}
                  <strong className="text-cyan-300">{tr('10,000 次完全免费')}</strong> 听歌识曲额度。
                </p>

                {/* 折叠配置面板 */}
                {showAcrSettings && (
                  <div className="pt-3 border-t border-white/10 space-y-2.5 animate-in fade-in duration-150">
                    <div>
                      <label className="text-[10px] font-mono text-zinc-400 block mb-1">
                        接入 Host (国内直连)
                      </label>
                      <input
                        type="text"
                        value={acrConfig.host}
                        onChange={(e) => setAcrConfig({ ...acrConfig, host: e.target.value })}
                        placeholder="identify-cn-north-1.acrcloud.cn"
                        className="w-full bg-zinc-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-cyan-400"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-mono text-zinc-400 block mb-1">
                          Access Key
                        </label>
                        <input
                          type="text"
                          value={acrConfig.accessKey}
                          onChange={(e) => setAcrConfig({ ...acrConfig, accessKey: e.target.value })}
                          placeholder={tr('开发者后台生成的 Key')}
                          className="w-full bg-zinc-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-cyan-400"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-mono text-zinc-400 block mb-1">
                          Access Secret
                        </label>
                        <input
                          type="password"
                          value={acrConfig.accessSecret}
                          onChange={(e) => setAcrConfig({ ...acrConfig, accessSecret: e.target.value })}
                          placeholder="Secret"
                          className="w-full bg-zinc-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-cyan-400"
                        />
                      </div>
                    </div>
                    <div className="flex justify-between items-center pt-1">
                      <a
                        href="https://www.acrcloud.cn/"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1"
                      >
                        <span>{tr('免费申请中国区 Key')}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      <button
                        type="button"
                        onClick={handleSaveAcrConfig}
                        className="px-3 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-zinc-950 text-xs font-bold transition cursor-pointer"
                      >
                        保存凭据
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 识别操作区 */}
              <div className="p-5 rounded-2xl border border-dashed border-cyan-500/30 bg-cyan-950/20 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center mx-auto border border-cyan-400/40">
                  <Radio className={`w-6 h-6 ${isRecognizing ? 'animate-spin' : ''}`} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-zinc-200">
                    一键抽取 6 秒音频识别
                  </h4>
                  <p className="text-[11px] text-zinc-400 font-mono mt-1">
                    在视频播放中截取前 6 秒原声，生成指纹匹配曲目
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleStartAcrRecognition}
                  disabled={isRecognizing || !isAcrConfigured}
                  className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-zinc-950 text-xs font-bold transition cursor-pointer shadow-[0_0_15px_rgba(34,211,238,0.35)] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isRecognizing ? '正在识别中...' : isAcrConfigured ? '开始听歌识曲' : '请先配置国内 Key 激活'}
                </button>

                {recognizeMessage && (
                  <p className="text-xs font-mono text-cyan-300 animate-in fade-in pt-1">
                    {recognizeMessage}
                  </p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'manual' && (
            <div className="space-y-4">
              <p className="text-xs text-zinc-400 font-mono">
                ✏️ 100% 离线手动指定：直接为当前视频指定歌曲名与编舞者，保存后自动归入同曲目档案。
              </p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-mono text-zinc-300 block mb-1">
                    歌曲名称 (必填)
                  </label>
                  <input
                    type="text"
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                    placeholder={tr('如: Super Shy')}
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-mono text-zinc-300 block mb-1">
                    歌手 / 编舞团体 (选填)
                  </label>
                  <input
                    type="text"
                    value={manualArtist}
                    onChange={(e) => setManualArtist(e.target.value)}
                    placeholder={tr('如: NewJeans')}
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 试听 + 底栏操作 */}
        {selectedSong && (
          <div className="px-6 pb-2">
            <SongPreviewPlayer title={selectedSong.title} artist={selectedSong.artist} />
          </div>
        )}
        <div className="px-6 py-4 border-t border-white/10 bg-zinc-900/50 flex items-center justify-between">
          <div className="text-xs font-mono text-zinc-400 truncate max-w-xs">
            {selectedSong ? (
              <span className="text-cyan-300 font-bold">
                已选: 《{selectedSong.title}》 - {selectedSong.artist}
              </span>
            ) : (
              <span>{tr('请选择或输入要绑定的曲目')}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition cursor-pointer"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleConfirmSave}
              disabled={activeTab === 'manual' ? !manualTitle.trim() : !selectedSong}
              className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-zinc-950 text-xs font-bold transition cursor-pointer shadow-[0_0_15px_rgba(34,211,238,0.35)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              保存至曲目档案
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
