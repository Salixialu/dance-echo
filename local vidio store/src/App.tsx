import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { I18nProvider } from './i18n';
import { useI18n } from './i18n/I18nContext';
import { useDomPhraseTranslation } from './i18n/domTranslate';
import { Sidebar } from './components/sidebar/Sidebar';
import { VideoGrid } from './components/gallery/VideoGrid';
import type { SettingsTab } from './components/settings/SettingsModal';

// 重组件懒加载：3D 场景(three) + 姿态识别(mediapipe) 只在打开播放器时才下载，
// 媒体库首页不再被迫拉下 ~850KB 的 vendor-three / vendor-ai。
const DancePlayer = lazy(() => import('./components/player/DancePlayer').then((m) => ({ default: m.DancePlayer })));
const DanceBuddyDrawer = lazy(() => import('./components/ai/DanceBuddyDrawer').then((m) => ({ default: m.DanceBuddyDrawer })));
const SettingsModal = lazy(() => import('./components/settings/SettingsModal'));
import { useVideoStore } from './store/useVideoStore';
import { WebStorageAdapter, SUPPORTED_VIDEO_EXTENSIONS } from './services/storage/webAdapter';
import { createDemoDanceVideo } from './services/demoVideoGenerator';
import { extractVideoMetaAndThumbnail } from './services/thumbnail';
import { db } from './services/db';
import { api, ApiError } from './services/api/client';
import { registerServerId } from './services/api/idMap';
import { pushMeta } from './services/api/metaSync';
import { videoThumbUrl } from './services/api/serverUrl';
import { songService, type SongMetadata } from './services/music/songService';
import { requestPersistentStorage } from './services/storage/storageManager';
import { loadPreferences, type TagPresetGroup } from './services/settings/appPreferences';
import type { VideoItem } from './types';
import { MessageCircle, X, FolderOpen, Tag, Music2 } from 'lucide-react';

interface ImportConfig {
  folder: string;
  tags: string[];
  /**
   * 整批只挑一个文件去听歌识曲（见 fileKey）；null = 这批不识别。
   * 一次导入 = 一支舞，所以一次识别就够，别按文件数烧额度。
   */
  recognizeFromKey: string | null;
  /** 面板里已经识别好的结果：导入时直接复用，不再重复请求一次额度 */
  previewSong?: SongMetadata | null;
}

/** 一次导入里唯一标识一个文件的 key（同一批里可能同名不同大小） */
const fileKey = (file: File) => `${file.name}-${file.lastModified}`;

const AppContent: React.FC = () => {
  const {
    videos,
    setVideos,
    currentVideo,
    setCurrentVideo,
    setIsScanning,
    setScanProgress,
    folders,
    ensureFolderPath,
    toastMessage,
    showToast: storeShowToast,
    setIsAIBuddyOpen,
    isAIBuddyOpen,
    refreshNoteCounts,
  } = useVideoStore();

  // 留言数用于侧栏「留言」入口与网格过滤器的徽标，视频集合变动后重算一次
  useEffect(() => {
    void refreshNoteCounts();
  }, [videos.length, refreshNoteCounts]);

  const [notification, setNotification] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [importFolder, setImportFolder] = useState('待整理');
  const [importTags, setImportTags] = useState('');
  /** 从设置 → 标签预设里点选的标签，形如「老师:Kane」，导入时与手打标签合并 */
  const [importPresetTags, setImportPresetTags] = useState<string[]>([]);
  const [importPresetGroups, setImportPresetGroups] = useState<TagPresetGroup[]>([]);
  const [recognizeFromKey, setRecognizeFromKey] = useState<string | null>(null);
  /** 用户是否手动改过组名：改过就不再自动追加 #2 */
  const [importFolderTouched, setImportFolderTouched] = useState(false);
  /** 选完文件就先识别一次，让用户在点「导入」之前看到歌名 */
  const [previewSong, setPreviewSong] = useState<SongMetadata | null>(null);
  const [previewState, setPreviewState] = useState<'idle' | 'running' | 'done' | 'failed'>('idle');
  const previewedKeyRef = useRef<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('ai');
  const { tr, locale } = useI18n();
  useDomPhraseTranslation(locale);
  // 每次渲染读一次：用户可能刚在设置里填完 ACRCloud 密钥就回来导入
  const acrConfigured = songService.getACRCloudConfig().isConfigured;

  /** 名字已被占用时追加 #2 / #3…；用户手改过的名字不参与唯一化（允许并进已有组） */
  const uniqueGroupName = (base: string): string => {
    const existing = new Set(folders.map((folder) => folder.path));
    const clean = base.trim();
    if (!clean) return '';
    if (!existing.has(clean)) return clean;
    for (let n = 2; ; n += 1) {
      const candidate = `${clean} #${n}`;
      if (!existing.has(candidate)) return candidate;
    }
  };

  /**
   * 一次导入 = 一个组 = 一支舞：优先用原目录名，否则先给个「新分组 N」，
   * 等听歌识曲认出歌名后由导入流程改成歌名。
   */
  const suggestGroupName = (files: File[]): string => {
    const relative = files[0]?.webkitRelativePath || '';
    const top = relative.split('/')[0];
    if (top) return uniqueGroupName(top);
    const existing = new Set(folders.map((folder) => folder.path));
    for (let n = 1; ; n += 1) {
      const candidate = `新分组 ${n}`;
      if (!existing.has(candidate)) return candidate;
    }
  };

  const showToast = (msg: string) => {
    storeShowToast(msg);
    setNotification(msg);
    setTimeout(() => setNotification(null), 3200);
  };

  // 初始化：先合并服务端媒体库与本地元数据缓存（视频本体永远不落地到浏览器存储）
  const reloadLibraryRef = useRef<() => Promise<void>>(() => Promise.resolve());
  useEffect(() => {
    async function loadLibrary() {
      let serverVideos: Awaited<ReturnType<typeof api.library>>['videos'] = [];
      try {
        const library = await api.library();
        // 服务端是可见性规则的唯一写入方；客户端不再重复过滤回收站。
        serverVideos = library.videos;
      } catch (err) {
        console.warn('[DanceEcho] 服务端媒体库不可用，退回本地缓存视图:', err);
      }

      const records = await db.videos.toArray();
      const recordById = new Map(records.map((r) => [r.id, r]));
      const recordByKey = new Map(records.map((r) => [`${r.name}|${r.size}|${r.lastModified}`, r]));

      const merged: VideoItem[] = [];
      const usedRecordIds = new Set<string>();
      // 服务端文件夹是扁平模型（name = 完整路径），hydration 时还原为本地路径
      let serverFolderPathById = new Map<string, string>();
      try {
        const { folders } = await api.folders();
        serverFolderPathById = new Map(folders.map((folder) => [folder.id, folder.name]));
      } catch {
        /* 离线时忽略，退回本地路径 */
      }

      for (const video of serverVideos) {
        const cached =
          recordByKey.get(`${video.name}|${video.size}|${Date.parse(video.mtime)}`) ??
          recordById.get(video.id);
        if (cached) usedRecordIds.add(cached.id);
        const localId = cached?.id ?? video.id;
        registerServerId(localId, video.id);
        registerServerId(video.id, video.id);
        const serverMeta = video.meta;
        const folderPath = serverMeta?.folderId ? serverFolderPathById.get(serverMeta.folderId) : undefined;
        merged.push({
          id: localId,
          serverId: video.id,
          name: video.name,
          title: serverMeta?.title || cached?.title || undefined,
          path: folderPath ? `${folderPath}/${video.name}` : (cached?.path ?? video.relPath),
          size: video.size,
          lastModified: Date.parse(video.mtime),
          duration: video.duration ?? cached?.duration ?? 0,
          width: video.width ?? cached?.width ?? 0,
          height: video.height ?? cached?.height ?? 0,
          thumbnailUrl: videoThumbUrl(video.id),
          tags: serverMeta?.tags?.length ? serverMeta.tags : (cached?.tags ?? []),
          category: serverMeta?.category || cached?.category,
          rating: serverMeta?.rating ?? cached?.rating ?? 0,
          playCount: serverMeta?.playCount ?? cached?.playCount ?? 0,
          playbackPosition: serverMeta?.progress || cached?.playbackPosition,
          bpm: serverMeta?.bpm || cached?.bpm,
          beatOffset: serverMeta?.beatOffset ?? cached?.beatOffset,
          songTitle: serverMeta?.songTitle || cached?.songTitle,
          songArtist: serverMeta?.songArtist || cached?.songArtist,
          file: cached?.blob
            ? new File([cached.blob], cached.name, { type: cached.blob.type, lastModified: cached.lastModified })
            : undefined,
        });
      }

      // 服务端没有、但本地仍有元数据的记录（例如目录挂载的旧条目）保留在列表里，不丢用户信息
      for (const r of records) {
        if (usedRecordIds.has(r.id)) continue;
        if (recordByKey.has(`${r.name}|${r.size}|${r.lastModified}`) && usedRecordIds.has(r.id)) continue;
        merged.push({
          id: r.id,
          name: r.name,
          title: r.title || undefined,
          path: r.path,
          size: r.size,
          lastModified: r.lastModified,
          duration: r.duration,
          width: r.width,
          height: r.height,
          thumbnailUrl: r.thumbnailBase64,
          tags: r.tags || [],
          category: r.category,
          rating: r.rating || 0,
          playCount: r.playCount || 0,
          playbackPosition: r.playbackPosition,
          bpm: r.bpm,
          beatOffset: r.beatOffset,
          songTitle: r.songTitle,
          songArtist: r.songArtist,
          file: r.blob
            ? new File([r.blob], r.name, { type: r.blob.type, lastModified: r.lastModified })
            : undefined,
        });
      }

      if (merged.length > 0) setVideos(merged);
    }
    reloadLibraryRef.current = loadLibrary;
    const onLibraryChanged = () => {
      void loadLibrary().catch((err) => console.warn('[DanceEcho] 媒体库刷新失败:', err));
    };
    window.addEventListener('danceecho:library-changed', onLibraryChanged);
    // 静默尝试一次持久化申请：Chrome / Edge 会按站点使用度决定是否直接授予，
    // 拿到之后浏览器就不会在磁盘紧张时清掉媒体库。失败也不打断启动。
    void requestPersistentStorage().catch(() => {});
    loadLibrary().catch((err) => {
      console.warn('媒体库读取失败:', err);
      showToast('媒体库读取失败，请确认 DanceEcho Server 已启动');
    });
    return () => window.removeEventListener('danceecho:library-changed', onLibraryChanged);
  }, []);

  // 任意入口（如全局标签库）都可以请求打开设置并直达某个 tab
  useEffect(() => {
    const onOpenSettings = (event: Event) => {
      const tab = (event as CustomEvent<{ tab?: SettingsTab }>).detail?.tab;
      if (tab) setSettingsTab(tab);
      setIsSettingsOpen(true);
    };
    window.addEventListener('danceecho:open-settings', onOpenSettings);
    return () => window.removeEventListener('danceecho:open-settings', onOpenSettings);
  }, []);

  // 挂载本地视频目录
  const handleOpenDirectory = async () => {
    if (!WebStorageAdapter.isFileSystemAccessSupported()) {
      alert(tr('您的浏览器不支持 File System Access API，推荐使用 Chrome / Edge 浏览器体验完整本地挂载能力。'));
      return;
    }

    try {
      const dirHandle = await window.showDirectoryPicker({
        mode: 'read',
      });

      setIsScanning(true);
      showToast(tr('正在上传目录视频到 DanceEcho Server...'));

      const scannedVideos = await WebStorageAdapter.scanDirectory(
        dirHandle,
        (scanned, currentName) => {
          setScanProgress({ total: scanned, currentName });
        }
      );

      setVideos(scannedVideos);
      setIsScanning(false);
      const recognizedCount = scannedVideos.filter((v) => v.songTitle).length;
      if (recognizedCount > 0) {
        const sampleSong = scannedVideos.find((v) => v.songTitle)?.songTitle;
        showToast(tr('成功导入 {n} 个视频！已自动识别舞曲《{song}》等并归入歌曲曲库与标签！', { n: scannedVideos.length, song: sampleSong ?? '' }));
      } else {
        showToast(tr('成功导入 {n} 个视频文件！已智能打标并归档。', { n: scannedVideos.length }));
      }
    } catch (err: any) {
      setIsScanning(false);
      if (err.name !== 'AbortError') {
        console.error('选择目录出错:', err);
        showToast(tr('选择目录失败或被取消'));
      }
    }
  };

  /**
   * 用视频里的**音频**识别歌曲（导入时没有 <video> 元素，直接解码文件）。
   * ACRCloud 没配 / 解码失败 / 没匹配到，都会退回按文件名猜。
   */
  const recognizeSongFromFile = async (file: File) => {
    const { isConfigured } = songService.getACRCloudConfig();
    if (isConfigured) {
      try {
        const snippet = await songService.extractAudioSnippetFromBlob(file, { startFraction: 0.35 });
        const result = await songService.recognizeWithACRCloud(snippet);
        if (result.success && result.metadata) return result.metadata;
        console.info('[DanceEcho] 听歌识曲未匹配到曲目:', file.name, result.message);
      } catch (error) {
        console.warn('[DanceEcho] 听歌识曲失败，改用文件名猜测:', file.name, error);
      }
    }
    try {
      return await songService.guessFromVideoName(file.name);
    } catch {
      return null;
    }
  };

  /**
   * 面板打开时就把识别跑完：用户在下拉里选「用哪个文件识别」，
   * 结果立刻写进组名，点「导入」时不再等一次网络请求。
   */
  useEffect(() => {
    if (!pendingFiles.length || !recognizeFromKey) {
      setPreviewSong(null);
      setPreviewState('idle');
      previewedKeyRef.current = null;
      return;
    }
    if (previewedKeyRef.current === recognizeFromKey) return;
    previewedKeyRef.current = recognizeFromKey;
    const target = pendingFiles.find((file) => fileKey(file) === recognizeFromKey);
    if (!target) return;
    let cancelled = false;
    setPreviewState('running');
    setPreviewSong(null);
    void (async () => {
      const song = await recognizeSongFromFile(target);
      if (cancelled) return;
      if (song) {
        setPreviewSong(song);
        setPreviewState('done');
        if (!importFolderTouched) setImportFolder(uniqueGroupName(song.title));
      } else {
        setPreviewState('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
    // importFolderTouched / importFolder 故意不放进依赖：识别结果只回填一次，用户改过就别覆盖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFiles, recognizeFromKey]);

  const handleImportFiles = async (files: FileList | File[] | null, config?: ImportConfig) => {
    if (!files?.length) return;
    setIsScanning(true);
    const imported: VideoItem[] = [];
    // 逐个文件记失败原因：服务端没起来 vs 其他错误，最后给一条能对症的提示
    const failed: { name: string; network: boolean }[] = [];
    // 听歌识曲的命中统计：最后要如实告诉用户「试了几条、认出几条」
    const recognition = { attempted: 0, matched: 0 };

    try {
      const videoFiles = Array.from(files).filter((file) =>
        WebStorageAdapter.isSupportedVideo(file.name),
      );

      // 整批只识别一次：同一支舞的几个机位不需要逐个烧额度
      const recognizeTarget = config?.recognizeFromKey
        ? videoFiles.find((file) => fileKey(file) === config.recognizeFromKey) ?? null
        : null;
      let batchSong: Awaited<ReturnType<typeof recognizeSongFromFile>> = config?.previewSong ?? null;
      if (!batchSong && recognizeTarget) {
        setScanProgress({ total: 0, currentName: tr('听歌识曲中 · {name}', { name: recognizeTarget.name }) });
        recognition.attempted += 1;
        batchSong = await recognizeSongFromFile(recognizeTarget);
        if (batchSong) recognition.matched += 1;
      }

      const typedFolder = config?.folder?.trim() || '';
      // 组名来源优先级：用户/面板填的 → 识别到的歌名（自动唯一化）→ 空（放根目录）
      const requestedFolder = typedFolder
        ? typedFolder
        : batchSong?.title
          ? uniqueGroupName(batchSong.title)
          : '';

      for (const [index, file] of videoFiles.entries()) {
        setScanProgress({ total: index + 1, currentName: file.name });
        const id = `${file.name}-${file.size}-${file.lastModified}`;
        const existing = await db.videos.get(id);
        let metadata = { duration: existing?.duration ?? 0, width: existing?.width ?? 0, height: existing?.height ?? 0, thumbnailBase64: existing?.thumbnailBase64 ?? '' };

        if (!metadata.thumbnailBase64) {
          try {
            metadata = await extractVideoMetaAndThumbnail(file);
          } catch (error) {
            console.warn('视频元数据提取失败，仍保留原文件:', file.name, error);
          }
        }

        let songTitle = existing?.songTitle;
        let songArtist = existing?.songArtist;
        let bpm = existing?.bpm;
        let inferredTags = existing?.tags;

        if (!inferredTags || inferredTags.length === 0 || inferredTags.every((t) => t === '未分类')) {
          const tags: string[] = [];

          if (batchSong) {
            songTitle = batchSong.title;
            songArtist = batchSong.artist;
            if (batchSong.bpm) bpm = batchSong.bpm;
            tags.push(`🎵 ${batchSong.title}`);
            if (batchSong.genre) {
              const mainGenre = batchSong.genre.split('/')[0].trim();
              if (!tags.includes(mainGenre)) tags.push(mainGenre);
            }
          }

          const manualTags = config?.tags || [];
          inferredTags = [...new Set([...tags, ...manualTags])];
        }

        if (config?.tags?.length) {
          inferredTags = [...new Set([...(inferredTags || []), ...config.tags])];
        }

        const targetFolder = requestedFolder;
        const storedPath = targetFolder
          ? `${targetFolder}/${file.name}`
          : file.webkitRelativePath || file.name;

        // 视频本体上传到 DanceEcho Server（落媒体根目录 uploads/），浏览器不再保存 Blob
        let serverId: string | undefined;
        try {
          const uploaded = await api.upload(file);
          serverId = uploaded.uploaded.id;
          if (serverId && metadata.thumbnailBase64) {
            try {
              await api.uploadThumb(serverId, metadata.thumbnailBase64);
            } catch (thumbError) {
              console.warn('[DanceEcho] 封面上传失败:', file.name, thumbError);
            }
          }
        } catch (uploadError) {
          console.error('[DanceEcho] 上传失败:', file.name, uploadError);
          failed.push({
            name: file.name,
            network: uploadError instanceof ApiError && uploadError.code === 'NETWORK_ERROR',
          });
          continue;
        }

        const displayTitle = batchSong
          ? videoFiles.length > 1
            ? `${batchSong.title} · ${index + 1}`
            : batchSong.title
          : existing?.title;

        const item: VideoItem = {
          id,
          serverId,
          name: file.name,
          title: displayTitle,
          path: storedPath,
          size: file.size,
          lastModified: file.lastModified,
          duration: metadata.duration,
          width: metadata.width,
          height: metadata.height,
          thumbnailUrl: serverId ? videoThumbUrl(serverId) : metadata.thumbnailBase64 || undefined,
          tags: inferredTags,
          category: existing?.category ?? (targetFolder || '本地导入'),
          rating: existing?.rating ?? 0,
          playCount: existing?.playCount ?? 0,
          bpm,
          songTitle,
          songArtist,
          file,
        };

        await db.videos.put({
          id: item.id,
          name: item.name,
          title: item.title,
          path: item.path,
          size: item.size,
          lastModified: item.lastModified,
          duration: item.duration,
          width: item.width,
          height: item.height,
          thumbnailBase64: serverId ? undefined : item.thumbnailUrl,
          tags: item.tags,
          category: item.category,
          rating: item.rating,
          playCount: item.playCount ?? 0,
          bpm,
          songTitle,
          songArtist,
        });
        imported.push(item);
      }

      if (imported.length) {
        // 批量导入后统一重扫一次（上传接口本身不再每个文件全量扫描）
        try {
          await api.rescan();
        } catch (rescanError) {
          console.warn('[DanceEcho] 导入后重扫失败，可稍后手动刷新:', rescanError);
        }
        // 扫描完成后服务端才认识这些 id，此时把导入时选的标签写回服务端
        for (const item of imported) {
          if (item.serverId) {
            pushMeta(item.serverId, {
              tags: item.tags,
              ...(item.title ? { title: item.title } : {}),
            });
          }
        }
        // 导入目标文件夹必须落成真实记录，否则视频移走后目录会凭空消失
        if (requestedFolder) await ensureFolderPath(requestedFolder);
        setVideos([...imported, ...videos.filter((video) => !imported.some((item) => item.id === video.id))]);
        const recognizedCount = imported.filter((v) => v.songTitle).length;
        const where = requestedFolder ? tr('「{name}」分组', { name: requestedFolder }) : tr('媒体库根目录');
        const baseMessage = recognizedCount > 0
          ? tr('已导入 {n} 个视频到{where}，并识别出舞曲《{song}》', { n: imported.length, where, song: imported.find((v) => v.songTitle)?.songTitle ?? '' })
          : tr('已导入 {n} 个视频到{where}，可随时离线练习', { n: imported.length, where });
        // 识别了但没认出来，也要说清楚试了几条，别让用户以为「识别开关没反应」
        const recognitionNote = recognition.attempted === 0
          ? ''
          : recognition.matched > 0
            ? tr('（听歌识曲：{n} 条中认出 {m} 条）', { n: recognition.attempted, m: recognition.matched })
            : tr('（听歌识曲试了 {n} 条都没匹配到曲目）', { n: recognition.attempted });
        showToast(
          `${baseMessage}${recognitionNote}${failed.length ? tr('（另有 {n} 个上传失败）', { n: failed.length }) : ''}`,
        );
      } else if (failed.some((item) => item.network)) {
        // 服务没起来是上传失败最常见的原因：直接把动作说清楚，别甩锅给文件格式
        showToast(tr('无法连接 DanceEcho Server（127.0.0.1:8090），请先运行「启动DanceEcho服务端.bat」再重试'));
      } else if (failed.length) {
        showToast(tr('导入失败：{n} 个视频未能上传，请确认 DanceEcho Server 正在运行', { n: failed.length }));
      } else {
        showToast(tr('没有找到支持的视频文件'));
      }
    } catch (error) {
      console.error('导入视频失败:', error);
      showToast(tr('导入失败，请确认 DanceEcho Server 正在运行'));
    } finally {
      setIsScanning(false);
    }
  };

  const openImportConfig = (files: FileList | null) => {
    const all = files ? Array.from(files) : [];
    const supported = all.filter((file) => WebStorageAdapter.isSupportedVideo(file.name));
    if (!supported.length) {
      // 之前这里是静默 return：选了 .avi 之类的文件，界面毫无反应，看起来就像“上传功能坏了”
      if (all.length) {
        const exts = Array.from(
          new Set(
            all.map((file) => {
              const dot = file.name.lastIndexOf('.');
              return dot >= 0 ? file.name.slice(dot).toLowerCase() : tr('（无扩展名）');
            }),
          ),
        );
        showToast(
          tr('不支持这些格式：{names}；可导入 {list}', {
            names: exts.join(' '),
            list: SUPPORTED_VIDEO_EXTENSIONS.join(' '),
          }),
        );
      }
      return;
    }
    setPendingFiles(supported);
    // 一次导入默认 = 一个分组，名字自动建议，用户可改
    setImportFolder(suggestGroupName(supported));
    // 预设标签每次重新读取设置里的配置，选择状态从空开始
    setImportPresetTags([]);
    setImportPresetGroups(loadPreferences().tagPresets.filter((group) => group.values.length > 0));
    setImportFolderTouched(false);
    setPreviewSong(null);
    setPreviewState('idle');
    previewedKeyRef.current = null;
    // 默认：配了 ACRCloud 就拿这批里最大的文件去识别一次（整批共享结果）；没配就不识别
    const configured = songService.getACRCloudConfig().isConfigured;
    const largest = supported.reduce((best, file) => (file.size > best.size ? file : best), supported[0]);
    setRecognizeFromKey(configured && largest ? fileKey(largest) : null);
  };

  const toggleImportPresetTag = (tag: string) => {
    setImportPresetTags((current) =>
      current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]
    );
  };

  const confirmImport = async () => {
    if (!pendingFiles.length) return;
    const typedTags = importTags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean);
    const merged = Array.from(new Set([...importPresetTags, ...typedTags]));
    const config: ImportConfig = {
      folder: importFolder.trim(),
      tags: merged,
      recognizeFromKey,
      previewSong,
    };
    setPendingFiles([]);
    await handleImportFiles(pendingFiles, config);
  };

  // 生成内置演示视频供体验
  const handleLoadDemoVideos = async () => {
    setIsScanning(true);
    setScanProgress({ total: 1, currentName: tr('生成演示视频中...') });

    try {
      const demo1 = await createDemoDanceVideo('NewJeans - Super Shy (编舞官方示范)', 2.5, '#d946ef');
      const demo2 = await createDemoDanceVideo('NewJeans - Super Shy (个人练习机位 B)', 2.5, '#06b6d4');
      const demo3 = await createDemoDanceVideo('aespa - Supernova (舞台分解教学)', 2.5, '#f59e0b');

      const demos = [
        {
          file: demo1,
          tags: ['Kpop', '编舞', '🎵 Super Shy'],
          songTitle: 'Super Shy',
          songArtist: 'NewJeans (뉴진스)',
          bpm: 150,
          beatOffset: 0.35,
        },
        {
          file: demo2,
          tags: ['Kpop', '练习', '🎵 Super Shy'],
          songTitle: 'Super Shy',
          songArtist: 'NewJeans (뉴진스)',
          bpm: 150,
          beatOffset: 0.40,
        },
        {
          file: demo3,
          tags: ['HipHop', '分解', '🎵 Supernova'],
          songTitle: 'Supernova',
          songArtist: 'aespa (에스파)',
          bpm: 124,
          beatOffset: 0.28,
        },
      ];
      const newItems: VideoItem[] = [];

      for (let i = 0; i < demos.length; i++) {
        const d = demos[i];
        setScanProgress({ total: i + 1, currentName: d.file.name });
        const meta = await extractVideoMetaAndThumbnail(d.file);

        // 演示视频同样上传服务端，保持“浏览器不保存视频本体”的一致规则
        let demoServerId: string | undefined;
        try {
          const uploaded = await api.upload(d.file);
          demoServerId = uploaded.uploaded.id;
          if (demoServerId && meta.thumbnailBase64) {
            try {
              await api.uploadThumb(demoServerId, meta.thumbnailBase64);
            } catch (thumbError) {
              console.warn('[DanceEcho] 演示视频封面上传失败:', thumbError);
            }
          }
        } catch (uploadError) {
          console.warn('[DanceEcho] 演示视频上传失败:', uploadError);
        }

        const item: VideoItem = {
          id: `demo-${i + 1}-${Date.now()}`,
          serverId: demoServerId,
          name: d.file.name,
          path: '内置示范库',
          size: d.file.size,
          lastModified: Date.now(),
          duration: meta.duration,
          width: meta.width,
          height: meta.height,
          thumbnailUrl: demoServerId ? videoThumbUrl(demoServerId) : meta.thumbnailBase64,
          tags: d.tags,
          category: '内置示范',
          rating: 5,
          playCount: 1,
          bpm: d.bpm,
          beatOffset: d.beatOffset,
          songTitle: d.songTitle,
          songArtist: d.songArtist,
          file: d.file,
        };

        // 存入 Dexie（仅元数据，不含视频本体）
        await db.videos.put({
          id: item.id,
          name: item.name,
          path: item.path,
          size: item.size,
          lastModified: item.lastModified,
          duration: item.duration,
          width: item.width,
          height: item.height,
          thumbnailBase64: demoServerId ? undefined : item.thumbnailUrl,
          tags: item.tags,
          category: item.category,
          rating: item.rating,
          playCount: item.playCount ?? 0,
          bpm: item.bpm,
          beatOffset: item.beatOffset,
          songTitle: item.songTitle,
          songArtist: item.songArtist,
        });

        newItems.push(item);
      }

      setVideos([...newItems, ...videos]);
      setIsScanning(false);
      showToast(tr('3 个演示舞蹈视频已就绪，点击即可体验镜像翻转、AB循环与留言！'));
    } catch (e) {
      console.error(e);
      setIsScanning(false);
      showToast(tr('生成演示视频失败'));
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-space-void font-sans text-accent-silver">
      {/* 侧边导航栏 */}
      <Sidebar
        onOpenDirectory={handleOpenDirectory}
        onLoadDemoVideos={handleLoadDemoVideos}
        onImportFiles={openImportConfig}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* 主展示区 */}
      <VideoGrid
        onOpenDirectory={handleOpenDirectory}
        onLoadDemoVideos={handleLoadDemoVideos}
        onImportFiles={openImportConfig}
      />

      {/* 专用播放器模态层 */}
      {currentVideo && (
        <Suspense fallback={null}>
          <DancePlayer
            video={currentVideo}
            onClose={() => setCurrentVideo(null)}
          />
        </Suspense>
      )}

      {/* AI 舞蹈朋友抽屉 */}
      <Suspense fallback={null}>
        <DanceBuddyDrawer />
      </Suspense>

      {/* 统一设置中心：AI / 歌曲识别 / 识别性能 / 关于 */}
      <Suspense fallback={null}>
        <SettingsModal open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} initialTab={settingsTab} />
      </Suspense>

      <button
        type="button"
        data-testid="ai-chat-launcher"
        aria-label={tr('打开 AI 对话')}
        aria-pressed={isAIBuddyOpen}
        title={isAIBuddyOpen ? tr('收起 AI 对话') : tr('AI 对话')}
        onClick={() => setIsAIBuddyOpen(!isAIBuddyOpen)}
        className={`fixed bottom-5 right-5 z-[89] flex h-11 w-11 items-center justify-center rounded-full border shadow-lg shadow-black/40 transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
          isAIBuddyOpen
            ? 'border-cyan-300/70 bg-cyan-950 text-cyan-200'
            : 'border-cyan-400/30 bg-zinc-900 text-cyan-300 hover:border-cyan-300/60'
        }`}
      >
        <MessageCircle className="h-5 w-5" />
      </button>

      {/* 消息 Toast 浮动提示 (Dark Studio 发光质感) */}
      {(notification || toastMessage) && (
        <div className="fixed bottom-6 right-6 z-[95] px-4 py-2.5 rounded-xl bg-zinc-900/95 border border-cyan-500/40 text-white text-xs shadow-[0_0_25px_rgba(34,211,238,0.25)] backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-200 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span>{notification || toastMessage}</span>
        </div>
      )}

      {pendingFiles.length > 0 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div data-testid="import-modal" className="w-full max-w-lg rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-white">{tr('导入为视频分组')}</h2>
                <p className="mt-1 text-xs text-zinc-500">
                  {tr('本次选择 {n} 个视频，将归入同一个分组，导入后直接出现在首页文件夹卡片', { n: pendingFiles.length })}
                </p>
              </div>
              <button type="button" onClick={() => setPendingFiles([])} className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/10 hover:text-white" aria-label={tr('取消导入')}><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-4 px-5 py-5">
              <label className="block">
                <span className="mb-1.5 flex items-center gap-2 text-xs text-zinc-400">
                  <FolderOpen className="h-3.5 w-3.5 text-cyan-400" />
                  {tr('组名（一首歌一组）')}
                </span>
                <input
                  value={importFolder}
                  onChange={(e) => { setImportFolder(e.target.value); setImportFolderTouched(true); }}
                  data-testid="import-folder-input"
                  placeholder={tr('留空则用识别到的歌名，认不出就叫「新分组 N」')}
                  className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/60"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => { setImportFolder(suggestGroupName(pendingFiles)); setImportFolderTouched(false); }}
                    className="rounded-full border border-cyan-500/30 bg-cyan-950/50 px-2.5 py-1 text-[11px] text-cyan-300 hover:bg-cyan-900/60"
                  >
                    ✨ {tr('自动命名')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportFolder('待整理')}
                    className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                      importFolder === '待整理'
                        ? 'border-cyan-500/40 bg-cyan-950/60 text-cyan-300'
                        : 'border-white/10 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {tr('待整理')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportFolder('')}
                    className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                      importFolder === ''
                        ? 'border-cyan-500/40 bg-cyan-950/60 text-cyan-300'
                        : 'border-white/10 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {tr('不分组（放根目录）')}
                  </button>
                </div>
              </label>
              <label className="block">
                <span className="mb-1.5 flex items-center gap-2 text-xs text-zinc-400"><Tag className="h-3.5 w-3.5 text-violet-400" />{tr('批量标签')}</span>
                <input value={importTags} onChange={(e) => setImportTags(e.target.value)} placeholder={tr('多个标签用逗号分隔，例如：Kpop, 想学习')} className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/60" />
              </label>
              <div className="block">
                <span className="mb-1.5 flex items-center gap-2 text-xs text-zinc-400">
                  <Tag className="h-3.5 w-3.5 text-emerald-400" />
                  {tr('从预设标签点选')}
                  {importPresetTags.length > 0 && (
                    <span data-testid="import-preset-count" className="rounded-full bg-cyan-950/60 px-1.5 py-0.5 text-[10px] text-cyan-300">{tr('已选 {n}', { n: importPresetTags.length })}</span>
                  )}
                </span>
                <div data-testid="import-preset-tags" className="max-h-32 space-y-2 overflow-y-auto rounded-lg border border-white/5 bg-black/20 px-3 py-2">
                  {importPresetGroups.length === 0 && (
                    <p className="py-1 text-[11px] text-zinc-500">{tr('还没有预设标签：去 设置 → 标签预设 里添加老师、舞种、来源')}</p>
                  )}
                  {importPresetGroups.map((group) => (
                    <div key={group.name} className="flex flex-wrap items-start gap-1.5">
                      <span className="w-10 shrink-0 pt-1 text-[11px] text-zinc-500">{group.name}</span>
                      <div className="flex flex-1 flex-wrap gap-1.5">
                        {group.values.map((value) => {
                          const tag = `${group.name}:${value}`;
                          const active = importPresetTags.includes(tag);
                          return (
                            <button
                              key={tag}
                              type="button"
                              aria-pressed={active}
                              data-testid={`import-preset-tag-${group.name}-${value}`}
                              onClick={() => toggleImportPresetTag(tag)}
                              className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                                active
                                  ? 'border-cyan-400/60 bg-cyan-950/70 text-cyan-200'
                                  : 'border-white/10 bg-zinc-900 text-zinc-400 hover:border-white/20 hover:text-zinc-200'
                              }`}
                            >
                              {value}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-xs text-zinc-300">
                    <Music2 className="h-3.5 w-3.5 text-purple-400" />
                    <strong className="font-medium">{tr('听歌识曲：整批只识别一次')}</strong>
                  </span>
                  <span className="text-[11px] text-zinc-500" data-testid="import-recognize-count">
                    {recognizeFromKey
                      ? tr('1 条识别，结果应用到 {total} 条', { total: pendingFiles.length })
                      : tr('这批不识别')}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                  {acrConfigured
                    ? tr('同一支舞的几个机位认一次就够了：挑一个文件识别，歌名会写到整批的标题和标签里（分组名也用歌名）。')
                    : tr('还没填 ACRCloud 密钥，暂时只能按文件名猜。到 设置 → 歌曲识别 填写后就能听音频识别。')}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <select
                    data-testid="import-recognize-source"
                    value={recognizeFromKey ?? ''}
                    onChange={(event) => setRecognizeFromKey(event.target.value || null)}
                    className="min-w-0 flex-1 rounded-lg border border-white/10 bg-zinc-950 px-2.5 py-1.5 text-[11px] text-zinc-200 outline-none focus:border-cyan-400/60"
                  >
                    <option value="">{tr('这批不识别（手动命名）')}</option>
                    {pendingFiles.map((file) => (
                      <option key={fileKey(file)} value={fileKey(file)}>
                        {tr('识别这个：{name}', { name: file.name })}
                      </option>
                    ))}
                  </select>
                  {!acrConfigured && (
                    <button
                      type="button"
                      onClick={() => {
                        setPendingFiles([]);
                        setSettingsTab('music');
                        setIsSettingsOpen(true);
                      }}
                      className="shrink-0 rounded-full border border-cyan-500/30 bg-cyan-950/50 px-2.5 py-1 text-[11px] text-cyan-300 hover:bg-cyan-900/60"
                    >
                      {tr('去填写密钥')}
                    </button>
                  )}
                </div>
                {recognizeFromKey && previewState !== 'idle' && (
                  <p
                    data-testid="import-recognize-preview"
                    className={`mt-1.5 text-[11px] leading-relaxed ${
                      previewState === 'done'
                        ? 'text-cyan-300'
                        : previewState === 'failed'
                          ? 'text-zinc-500'
                          : 'text-zinc-400'
                    }`}
                  >
                    {previewState === 'running' && tr('正在听音频识别…')}
                    {previewState === 'done' && previewSong
                      ? tr('识别到：{song} — 组名已填好，可直接导入', {
                          song: [previewSong.title, previewSong.artist].filter(Boolean).join(' · '),
                        })
                      : null}
                    {previewState === 'failed'
                      ? tr('没识别出来：可以换个文件再试，或直接手填组名，导入不会因此失败。')
                      : null}
                  </p>
                )}
                {pendingFiles.length > 1 && recognizeFromKey && (
                  <p className="mt-1.5 text-[11px] leading-relaxed text-amber-300/80" data-testid="import-recognize-warning">
                    {tr('如果这批里其实是两支不同的舞，只识别一条会把另一支也打上同一个歌名——建议关掉识别，分开导入。')}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-white/10 px-5 py-4">
              <span className="text-[11px] text-zinc-500">
                {importFolder.trim()
                  ? tr('将创建分组「{name}」', { name: importFolder.trim() })
                  : tr('将直接放入媒体库根目录')}
              </span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setPendingFiles([])} className="rounded-lg border border-white/10 px-4 py-2 text-xs text-zinc-400 hover:bg-white/5 hover:text-white">{tr('取消')}</button>
                <button type="button" data-testid="import-confirm" onClick={() => void confirmImport()} className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-cyan-400">{tr('导入 {n} 个视频', { n: pendingFiles.length })}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  );
};

export default App;
