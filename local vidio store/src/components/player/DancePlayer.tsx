import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Play,
  Pause,
  RotateCcw,
  FlipHorizontal,
  BookmarkPlus,
  Repeat,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  X,
  Clock,
  Trash2,
  Gauge,
  Activity,
  Download,
  Hand,
  LoaderCircle,
  Box,
  Columns,
  MousePointer,
  Compass,
  Sparkles,
  ScanLine,
  Users,
  Scan,
  Music2,
  Info,
  ChevronDown,
} from 'lucide-react';
import type { VideoItem, VideoObservation } from '../../types';
import { resolveVideoStreamUrl, videoTranscodeUrl } from '../../services/api/serverUrl';
import { api } from '../../services/api/client';
import { useVideoStore } from '../../store/useVideoStore';
import { displayTitle } from '../../utils/displayTitle';
import { useI18n } from '../../i18n';
import {
  usePoseTracker,
  renderCenteredPoseToCanvas,
  renderFittedPoseToCanvas,
  type PoseItem,
  type NormalizedRect,
} from '../../hooks/usePoseTracker';
import { PoseDetectorService } from '../../services/pose/pose-detector';
import { buildBvh } from '../../services/pose/bvhExport';
import {
  loadPoseTrack,
  persistPoseTrack,
  scanPoseTrack,
  type PoseTrack,
} from '../../services/pose/poseTrackService';
import { SceneManager } from '../../scene/scene-manager';
import { Skeleton3DController } from '../../scene/vrm-controller';
import { observationService } from '../../services/storage/observationService';
import { loadPreferences, savePreferences } from '../../services/settings/appPreferences';
import { BeatMetronome } from './BeatMetronome';
import { beatDetector } from '../../services/audio/beatDetector';
import { createMediaClock, type MediaClock } from '../../services/audio/mediaClock';
import { loadBeatGrid, saveBeatGrid, type BeatGridRecord } from '../../services/audio/beatGridStore';
import { SongRecognizeModal } from '../music/SongRecognizeModal';
import { DancePlayerRightDrawer, type RightDrawerTab } from './DancePlayerRightDrawer';
import { computeJointAngles, formatAngle, EMPTY_JOINT_ANGLES, type JointAngles } from '../../utils/poseAngles';

/** 菜单行尾的开/关指示点，避免整行被强调色填满 */
const SwitchDot: React.FC<{ on: boolean }> = ({ on }) => (
  <span
    aria-hidden="true"
    className={`ml-auto h-1.5 w-1.5 rounded-full transition-colors ${on ? 'bg-zinc-100' : 'bg-zinc-700'}`}
  />
);

interface DancePlayerProps {
  video: VideoItem;
  onClose: () => void;
}

/**
 * 分屏形态模式定义
 * off: 单屏纯视频播放
 * 2d-split: 左右分屏 (左原视频，右独立 2D 纯骨架画布)
 * 3d-split: 左右分屏 (左原视频，右 3D 空间可旋转骨架)
 * skeleton: 纯骨架全屏（隐藏原视频，只留骨架，适合大屏/投影演示）
 */
export type DisplayMode = 'off' | '2d-split' | '3d-split' | 'skeleton';

export const DancePlayer: React.FC<DancePlayerProps> = ({ video, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaClockRef = useRef<MediaClock | null>(null);
  const [beatGrid, setBeatGrid] = useState<BeatGridRecord | null>(null);
  const mediaAudioCtxRef = useRef<AudioContext | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 2D 独立分屏画布容器与 Canvas Refs
  const split2DContainerRef = useRef<HTMLDivElement>(null);
  const split2DCanvasRef = useRef<HTMLCanvasElement>(null);

  // 3D 场景与控制器 Refs
  const threeContainerRef = useRef<HTMLDivElement>(null);
  const sceneManagerRef = useRef<SceneManager | null>(null);
  const skeleton3DControllerRef = useRef<Skeleton3DController | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // 最新姿态帧缓存 (用于视窗切换时 0 延迟秒连)
  const lastLandmarksRef = useRef<{ landmarks: any[]; worldLandmarks: any[]; trails?: any } | null>(null);
  // 关节角度实时读数（仅 2D 纯骨架 / 纯骨架视图使用）
  const [jointAngles, setJointAngles] = useState<JointAngles>(EMPTY_JOINT_ANGLES);
  const lastAngleStampRef = useRef(0);

  const {
    playbackRate,
    setPlaybackRate,
    isMirrored,
    toggleMirror,
    abLoop,
    setABPointA,
    setABPointB,
    toggleABLoop,
    clearABLoop,
    noteCounts,
    setNoteCount,
    updatePlaybackPosition,
    updateVideoBeat,
    updateVideoSong,
    renameVideo,
    updateRating,
    addTag,
    removeTag,
    moveVideoToFolder,
    folders,
    videos,
  } = useVideoStore();

  const { t, tr, locale } = useI18n();

  // 视频信息栏可编辑项所需数据：所属分组、可选分组、标签候选
  const folderOptions = useMemo(
    () => folders.map((folder) => folder.path).sort((a, b) => a.localeCompare(b)),
    [folders]
  );
  const currentFolderPath = video.path && video.path.includes('/')
    ? video.path.slice(0, video.path.lastIndexOf('/'))
    : '';
  // 本组（同一支舞的多个机位）的视频：允许一次把识别到的歌绑定到全组
  const groupVideos = useMemo(
    () =>
      videos.filter((item) => {
        const dir = item.path && item.path.includes('/') ? item.path.slice(0, item.path.lastIndexOf('/')) : '';
        return dir === currentFolderPath;
      }),
    [videos, currentFolderPath],
  );

  // 同名分组：歌名正好是另一个分组的名字 → 说明这支舞已经有组了，提示并过去
  const siblingGroup = useMemo(() => {
    const title = (video.songTitle || '').trim();
    if (!title || !currentFolderPath) return null;
    const currentName = currentFolderPath.split('/').filter(Boolean).pop() || '';
    if (currentName === title) return null;
    const target = folders.find(
      (folder) =>
        folder.path !== currentFolderPath &&
        (folder.path.split('/').filter(Boolean).pop() || '') === title,
    );
    if (!target) return null;
    const count = videos.filter((item) => {
      const dir = item.path && item.path.includes('/') ? item.path.slice(0, item.path.lastIndexOf('/')) : '';
      return dir === target.path || dir.startsWith(`${target.path}/`);
    }).length;
    return { path: target.path, name: title, count };
  }, [video.songTitle, currentFolderPath, folders, videos]);

  const tagSuggestions = useMemo(() => {
    const counter = new Map<string, number>();
    videos.forEach((item) => {
      item.tags?.forEach((tag) => counter.set(tag, (counter.get(tag) ?? 0) + 1));
    });
    return [...counter.entries()]
      .filter(([tag]) => !(video.tags ?? []).includes(tag))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([tag]) => tag);
  }, [videos, video.tags]);

  const [isPlaying, setIsPlaying] = useState(false);

  // 悬浮 HUD 与 2.5s 闲置自动渐隐状态
  const [isHudVisible, setIsHudVisible] = useState(true);
  const [isHoveringHud, setIsHoveringHud] = useState(false);
  const idleTimerRef = useRef<number | null>(null);

  const handleUserActivity = useCallback(() => {
    setIsHudVisible(true);
    if (idleTimerRef.current !== null) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (isPlaying && !isHoveringHud) {
      idleTimerRef.current = window.setTimeout(() => {
        setIsHudVisible(false);
      }, 2500);
    }
  }, [isPlaying, isHoveringHud]);

  useEffect(() => {
    if (!isPlaying) {
      setIsHudVisible(true);
      if (idleTimerRef.current !== null) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    } else if (!isHoveringHud) {
      if (idleTimerRef.current !== null) {
        clearTimeout(idleTimerRef.current);
      }
      idleTimerRef.current = window.setTimeout(() => {
        setIsHudVisible(false);
      }, 2500);
    }
    return () => {
      if (idleTimerRef.current !== null) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, [isPlaying, isHoveringHud]);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(video.duration || 0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // 抽屉展开状态：宽屏默认展开、窄屏默认收起，并记住用户上次选择
  const [showRightDrawer, setShowRightDrawer] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const saved = window.localStorage.getItem('dance_echo_right_drawer');
    if (saved === '1') return true;
    if (saved === '0') return false;
    return window.matchMedia('(min-width: 1024px)').matches;
  });
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('dance_echo_right_drawer', showRightDrawer ? '1' : '0');
    }
  }, [showRightDrawer]);

  const [rightDrawerTab, setRightDrawerTab] = useState<RightDrawerTab>('notes');
  const [timeEcho, setTimeEcho] = useState<VideoObservation | null>(null);
  const [showTimeEcho, setShowTimeEcho] = useState<boolean>(false);
  /** 时间轴上要画的留言位置（只有带秒数的留言才有位置） */
  const [noteMarks, setNoteMarks] = useState<{ id: string; timestamp: number; content: string }[]>([]);
  // 服务端 Range 流 URL（不创建或缓存视频 Blob）
  const [videoBlobUrl, setVideoBlobUrl] = useState<string>('');
  const [isLoadingVideo, setIsLoadingVideo] = useState(true);
  // 首帧解码出来之前用缩略图占位：Chromium 对暂停在 t=0 的流不会解码首帧，
  // 而 poster 属性走 CORS（video 上的 crossOrigin 会把它变成跨域请求），
  // 缓存里那张无 CORS 头的缩略图会让 poster 加载失败 → 打开播放器就是纯黑。
  const [showPoster, setShowPoster] = useState(true);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [frameAspectRatio, setFrameAspectRatio] = useState<number | null>(null);
  // 浏览器不支持 HEVC 时，自动切到服务端转好的 H.264 副本
  const [transcodeSrc, setTranscodeSrc] = useState<string>('');
  const [transcoding, setTranscoding] = useState(false);
  const transcodeResumeRef = useRef(0);

  // 歌曲识别与曲目档案状态 (M2 模块)
  const [showSongModal, setShowSongModal] = useState(false);
  const [currentSongTitle, setCurrentSongTitle] = useState<string>(video.songTitle || '');
  const [currentSongArtist, setCurrentSongArtist] = useState<string>(video.songArtist || '');

  // 8 拍卡点动态节拍器状态 (M1 模块)
  const [isMetronomeEnabled, setIsMetronomeEnabled] = useState(true);
  const [bpm, setBpm] = useState<number>(video.bpm || 120);
  const [beatOffset, setBeatOffset] = useState<number>(video.beatOffset || 0);
  const [isAudioTickEnabled, setIsAudioTickEnabled] = useState(false);
  const [isAnalyzingBeat, setIsAnalyzingBeat] = useState(false);

  // 双模骨骼核心控制状态
  // 控制组 1: 视频附着 (2D 骨骼覆盖在原视频上)
  const [isOverlayEnabled, setIsOverlayEnabled] = useState(false);
  const [isTrailsEnabled, setIsTrailsEnabled] = useState(false);
  const videoStageRef = useRef<HTMLDivElement>(null);
  const [videoContentRect, setVideoContentRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  // 供点击选人等交互手动触发一次检测（暂停时没有新帧，不触发就永远不重绘）
  const poseDetectRef = useRef<(() => void) | null>(null);

  /**
   * 计算视频在 object-contain 下的真实内容矩形：
   * 骨骼 Canvas 必须与"视频实际画面"完全重合，否则容器与画幅比例不一致时会出现
   * 整体拉伸 / 上下错位（这正是之前"骨骼附着不准"的根因）。
   */
  const measureVideoContentRect = useCallback(() => {
    const stage = videoStageRef.current;
    const video = videoRef.current;
    if (!stage || !video) return;
    const cw = stage.clientWidth;
    const ch = stage.clientHeight;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!cw || !ch || !vw || !vh) return;
    const scale = Math.min(cw / vw, ch / vh);
    const width = vw * scale;
    const height = vh * scale;
    setVideoContentRect({
      left: (cw - width) / 2,
      top: (ch - height) / 2,
      width,
      height,
    });
  }, []);

  const scheduleContentRectUpdate = useCallback(() => {
    measureVideoContentRect();
    requestAnimationFrame(measureVideoContentRect);
    window.setTimeout(measureVideoContentRect, 120);
    window.setTimeout(measureVideoContentRect, 400);
  }, [measureVideoContentRect]);

  // 监听舞台尺寸与视频元数据变化，持续保持骨骼画布与视频内容对齐
  useEffect(() => {
    const stage = videoStageRef.current;
    const video = videoRef.current;
    if (!stage || !video) return;
    scheduleContentRectUpdate();
    const observer = new ResizeObserver(() => measureVideoContentRect());
    observer.observe(stage);
    video.addEventListener('loadedmetadata', scheduleContentRectUpdate);
    video.addEventListener('resize', scheduleContentRectUpdate);
    window.addEventListener('resize', scheduleContentRectUpdate);
    return () => {
      observer.disconnect();
      video.removeEventListener('loadedmetadata', scheduleContentRectUpdate);
      video.removeEventListener('resize', scheduleContentRectUpdate);
      window.removeEventListener('resize', scheduleContentRectUpdate);
    };
  }, [videoBlobUrl, measureVideoContentRect, scheduleContentRectUpdate]);

  // 控制组 2: 骨架分屏形态 (off | 2d-split | 3d-split)
  const [displayMode, setDisplayMode] = useState<DisplayMode>('off');
  // 2D 分屏骨架呈现：fitted = 贴合视频里那个人；centered = 居中放大便于看动作
  const [splitViewMode, setSplitViewMode] = useState<'fitted' | 'centered'>('fitted');
  const splitViewModeRef = useRef<'fitted' | 'centered'>('fitted');
  splitViewModeRef.current = splitViewMode;

  // 多人体动捕与目标选择状态
  // 单人/多人聚焦主体控制状态
  const [activePoseIndex, setActivePoseIndex] = useState(0);
  const [detectedPoseCount, setDetectedPoseCount] = useState(1);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const allPosesRef = useRef<PoseItem[]>([]);

  // 快捷键 HUD 反馈浮层状态
  const [hudMessage, setHudMessage] = useState<string | null>(null);
  const hudTimerRef = useRef<number | null>(null);
  // 点拍校准（Tap tempo）时间戳
  const tapTimesRef = useRef<number[]>([]);
  // 用户手动改过 BPM/offset 之后，自动校准不再覆盖（人的判断优先于算法）
  const manualBpmRef = useRef(false);

  const showHud = useCallback((msg: string) => {
    setHudMessage(msg);
    if (hudTimerRef.current !== null) {
      clearTimeout(hudTimerRef.current);
    }
    hudTimerRef.current = window.setTimeout(() => {
      setHudMessage(null);
      hudTimerRef.current = null;
    }, 1800);
  }, []);

  const handleSelectDancer = useCallback(
    (targetId: number) => {
      setActivePoseIndex(targetId);
      const target = allPosesRef.current[targetId] || allPosesRef.current[0];
      if (target && target.landmarks.length > 0) {
        const valid = target.landmarks.filter((p) => (p.visibility ?? 1) > 0.35);
        if (valid.length > 0) {
          const cx = valid.reduce((s, p) => s + p.x, 0) / valid.length;
          const cy = valid.reduce((s, p) => s + p.y, 0) / valid.length;
          setFocusPoint({ x: cx, y: cy });
        }
      }
      // 暂停状态下没有新视频帧，必须手动触发一次检测/重绘，否则切换看起来"没反应"。
      // 用 setTimeout 让 focusPoint 先完成一次 React 提交（hook 在 render 里同步 ref），否则用的是旧焦点。
      window.setTimeout(() => poseDetectRef.current?.(), 0);
    },
    [],
  );

  // 后台静默预热 AI 姿态估计引擎
  useEffect(() => {
    if (typeof PoseDetectorService?.getInstance === 'function') {
      void PoseDetectorService.getInstance().init().catch(() => {});
    }
  }, []);


  // 记忆续播 (Resume) 状态
  const [resumePosition, setResumePosition] = useState<number>(0);
  const [showResumePrompt, setShowResumePrompt] = useState<boolean>(false);
  const currentTimeRef = useRef<number>(0);

  // 检测上次播放进度
  useEffect(() => {
    const rawPos =
      video.playbackPosition ||
      Number(localStorage.getItem(`dance_echo_progress_${video.id}`)) ||
      0;
    if (rawPos > 2 && (!video.duration || rawPos < video.duration - 2)) {
      setResumePosition(rawPos);
      setShowResumePrompt(true);
      const timer = window.setTimeout(() => setShowResumePrompt(false), 9000);
      return () => clearTimeout(timer);
    }
  }, [video.id, video.playbackPosition, video.duration]);

  // 检测该视频是否留有“时间回声 (Time Echo)”心得笔记，若有则浮层提示
  useEffect(() => {
    let isMounted = true;
    let echoTimer: number | null = null;
    const fetchEchoAndCount = async () => {
      try {
        const [latest, items] = await Promise.all([
          observationService.getLatestEcho(video.id),
          observationService.getObservationsByVideo(video.id),
        ]);
        if (!isMounted) return;
        setNoteCount(video.id, items.length);
        setNoteMarks(
          items
            .filter((item) => item.timestamp !== undefined)
            .map((item) => ({ id: item.id, timestamp: item.timestamp as number, content: item.content })),
        );
        if (latest) {
          setTimeEcho(latest);
          setShowTimeEcho(true);
          echoTimer = window.setTimeout(() => {
            if (isMounted) setShowTimeEcho(false);
          }, 10000);
        }
      } catch (err) {
        console.warn('获取时间回声失败:', err);
      }
    };

    void fetchEchoAndCount();
    return () => {
      isMounted = false;
      if (echoTimer !== null) clearTimeout(echoTimer);
    };
  }, [video.id, setNoteCount]);

  // 退出并记录播放进度
  const handleClosePlayer = useCallback(() => {
    const time = currentTimeRef.current;
    if (time > 0) {
      localStorage.setItem(`dance_echo_progress_${video.id}`, time.toString());
      void updatePlaybackPosition(video.id, time);
    }
    onClose();
  }, [video.id, updatePlaybackPosition, onClose]);

  // 组件卸载时安全持久化播放进度与清理定时器
  useEffect(() => {
    return () => {
      const time = currentTimeRef.current;
      if (time > 0) {
        localStorage.setItem(`dance_echo_progress_${video.id}`, time.toString());
        void updatePlaybackPosition(video.id, time);
      }
      if (hudTimerRef.current !== null) {
        clearTimeout(hudTimerRef.current);
      }
      if (idleTimerRef.current !== null) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, [video.id, updatePlaybackPosition]);

  // —— 离线骨骼索引：有索引时播放期查表，没有才回退逐帧推理 ——
  const poseTrackKey = video.serverId || video.id;
  const [poseTrack, setPoseTrack] = useState<PoseTrack | null>(null);
  const [scanState, setScanState] = useState<{ running: boolean; progress: number }>({
    running: false,
    progress: 0,
  });
  const scanSignalRef = useRef<{ cancelled: boolean } | null>(null);

  // 姿态估计：当 视频附着 开启 或 处于分屏模式 时激活检测。
  // 扫描索引期间必须停掉实时推理：两路同时驱动同一个 PoseLandmarker 会互相踩时间戳，
  // 导致扫描结果整段为空。
  const isPoseActive = !scanState.running && (isOverlayEnabled || displayMode !== 'off');
  const [appPrefs, setAppPrefs] = useState(() => loadPreferences());

  useEffect(() => {
    let cancelled = false;
    setPoseTrack(null);
    loadPoseTrack(poseTrackKey)
      .then((track) => {
        if (!cancelled) setPoseTrack(track);
      })
      .catch(() => {
        if (!cancelled) setPoseTrack(null);
      });
    return () => {
      cancelled = true;
    };
  }, [poseTrackKey]);

  const handleScanPoseTrack = useCallback(async () => {
    const el = videoRef.current;
    if (!el || scanState.running) return;
    const signal = { cancelled: false };
    scanSignalRef.current = signal;
    setScanState({ running: true, progress: 0 });
    try {
      const track = await scanPoseTrack({
        videoKey: poseTrackKey,
        video: el,
        onProgress: (ratio) => setScanState({ running: true, progress: ratio }),
        signal,
      });
      if (track && !signal.cancelled) {
        await persistPoseTrack(track);
        setPoseTrack(track);
      }
    } catch (error) {
      console.warn('[DanceEcho] 骨骼扫描失败:', error);
    } finally {
      scanSignalRef.current = null;
      setScanState({ running: false, progress: 0 });
    }
  }, [poseTrackKey, scanState.running]);

  // 导出 BVH：把离线索引里的世界坐标按骨骼层级换算成旋转通道，
  // 交给 Blender / MotionBuilder / Maya 等 DCC 继续用。
  const handleExportBvh = useCallback(() => {
    if (!poseTrack || !poseTrack.frames?.length) {
      showHud('请先在「视图 → 骨骼索引」扫描一次，再导出');
      return;
    }
    try {
      const frames = poseTrack.frames.map((frame) => {
        const flat = new Float32Array(33 * 3);
        frame.world.forEach((p, i) => {
          flat[i * 3] = p.x;
          flat[i * 3 + 1] = p.y;
          flat[i * 3 + 2] = p.z;
        });
        return flat;
      });
      const text = buildBvh({ frames, fps: poseTrack.fps, sourceName: video.name });
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${video.name.replace(/\.[^.]+$/, '')}-dance-echo.bvh`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      showHud(`已导出 BVH：${poseTrack.frameCount} 帧 @ ${poseTrack.fps}fps`);
    } catch (error) {
      console.warn('[DanceEcho] BVH 导出失败:', error);
      showHud('BVH 导出失败，请先扫描骨骼索引');
    }
  }, [poseTrack, video.name, showHud]);

  const pose = usePoseTracker(videoRef, canvasRef, isPoseActive, {
    draw2D: isOverlayEnabled,
    isMirrored,
    focusPoint,
    trailsEnabled: isTrailsEnabled,
    poseTrack,
    headModel: appPrefs.poseHeadModel,
    onPoseCountChange: (count) => {
      setDetectedPoseCount(count);
    },
    onPoseDetected: (landmarks, worldLandmarks, allPoses, trails) => {
      allPosesRef.current = allPoses;
      lastLandmarksRef.current = { landmarks, worldLandmarks, trails };

      // 1. 若处于 3D 模式 (分屏)，驱动纯 3D 发光骨骼跟随锁定舞者
      if (displayMode === '3d-split' && skeleton3DControllerRef.current) {
        skeleton3DControllerRef.current.updatePose(landmarks, worldLandmarks, isMirrored);
      }

      // 2. 2D 分屏：按视频原始画幅贴合绘制（骨架叠在画面那个人身上）；
      //    纯骨架模式：居中归一化绘制（当作"动作剪影"大图看）
      if ((displayMode === '2d-split' || displayMode === 'skeleton') && split2DCanvasRef.current) {
        const canvas = split2DCanvasRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          if (displayMode === '2d-split' && splitViewModeRef.current === 'fitted') {
            const videoEl = videoRef.current;
            const aspect =
              videoEl && videoEl.videoHeight > 0
                ? videoEl.videoWidth / videoEl.videoHeight
                : 16 / 9;
            renderFittedPoseToCanvas(
              ctx,
              landmarks,
              canvas.width,
              canvas.height,
              aspect,
              isMirrored,
              trails,
            );
          } else {
            renderCenteredPoseToCanvas(ctx, landmarks, canvas.width, canvas.height, isMirrored, trails);
          }
        }
      }

      // 3. 关节角度读数：节流到 ~8fps，避免高频 setState 拖慢播放
      if (displayMode === '2d-split' || displayMode === 'skeleton') {
        const stamp = performance.now();
        if (stamp - lastAngleStampRef.current >= 120) {
          lastAngleStampRef.current = stamp;
          setJointAngles(computeJointAngles(landmarks, worldLandmarks));
        }
      }
    },
  });

  // 把检测函数暴露给点击/切换等交互，让暂停状态下也能立刻刷新骨架
  poseDetectRef.current = pose.detect;

  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);
  const [modeMenuPos, setModeMenuPos] = useState<{ left: number; top: number } | null>(null);
  const modeButtonRef = useRef<HTMLButtonElement>(null);

  // 骨架视图下拉菜单：点击空白处关闭
  useEffect(() => {
    if (!isModeMenuOpen) return;
    const close = () => {
      setIsModeMenuOpen(false);
      setModeMenuPos(null);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [isModeMenuOpen]);

  // 2D 分屏画布统一重绘入口
  // buffer 必须跟「画布自身」的 CSS 尺寸 × DPR，而不是容器尺寸：容器含标题栏，
  // 直接套容器高度会把骨架垂直压扁约 8%，不乘 DPR 则整幅发虚。
  const paintSplitCanvas = useCallback(() => {
    const canvas = split2DCanvasRef.current;
    if (!canvas) return;
    const container = split2DContainerRef.current;
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const cssW = canvas.clientWidth || container?.clientWidth || 600;
    const cssH = canvas.clientHeight || container?.clientHeight || 450;
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext('2d');
    const last = lastLandmarksRef.current;
    if (!ctx || !last?.landmarks) return;
    const videoEl = videoRef.current;
    const aspect = videoEl && videoEl.videoHeight > 0 ? videoEl.videoWidth / videoEl.videoHeight : 0;
    // 重绘必须尊重当前呈现方式：以前这里无条件画 centered，导致 fitted 模式下
    // 一切换分辨率/拉伸窗口，骨架就跳成居中大图，和视频里那个人对不上。
    if (splitViewModeRef.current === 'fitted' && aspect > 0) {
      renderFittedPoseToCanvas(
        ctx,
        last.landmarks,
        canvas.width,
        canvas.height,
        aspect,
        isMirrored,
        last.trails,
      );
    } else {
      renderCenteredPoseToCanvas(
        ctx,
        last.landmarks,
        canvas.width,
        canvas.height,
        isMirrored,
        last.trails,
      );
    }
  }, [isMirrored]);

  // 2D 独立分屏 / 纯骨架 Canvas 尺寸自适应监听与即时首帧渲染
  useEffect(() => {
    if (
      (displayMode !== '2d-split' && displayMode !== 'skeleton') ||
      !split2DContainerRef.current ||
      !split2DCanvasRef.current
    ) {
      return;
    }
    const container = split2DContainerRef.current;
    const canvas = split2DCanvasRef.current;

    paintSplitCanvas();
    const ro = new ResizeObserver(paintSplitCanvas);
    ro.observe(canvas);
    ro.observe(container);

    // 切换到 2D 分屏时立即检测一次，确保骨骼秒出
    pose.detect();

    return () => ro.disconnect();
    // pose 故意不入依赖：usePoseTracker 每次渲染返回新对象，入依赖会每帧重建观察器
  }, [displayMode, isMirrored, paintSplitCanvas]);

  // 「贴合 / 居中」切换时立即重绘：暂停状态不会产生新的视频帧，
  // 不重绘的话点按钮像没反应。
  useEffect(() => {
    if (displayMode === '2d-split') paintSplitCanvas();
  }, [splitViewMode, displayMode, paintSplitCanvas]);

  // 3D 视窗生命周期管理（初始化 Three.js SceneManager 与 Skeleton3DController）
  useEffect(() => {
    const is3D = displayMode === '3d-split';
    if (!is3D || !threeContainerRef.current) {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (skeleton3DControllerRef.current) {
        skeleton3DControllerRef.current.dispose();
        skeleton3DControllerRef.current = null;
      }
      if (sceneManagerRef.current) {
        sceneManagerRef.current.dispose();
        sceneManagerRef.current = null;
      }
      return;
    }

    const container = threeContainerRef.current;
    container.innerHTML = '';

    const sceneManager = new SceneManager(container);
    sceneManagerRef.current = sceneManager;

    const skeleton3DController = new Skeleton3DController(sceneManager.scene);
    skeleton3DControllerRef.current = skeleton3DController;

    // 若此前已有提取成功的姿态帧，先立即同步，秒级响应无黑屏
    if (lastLandmarksRef.current) {
      skeleton3DController.updatePose(
        lastLandmarksRef.current.landmarks,
        lastLandmarksRef.current.worldLandmarks,
        isMirrored
      );
    }

    // 立即触发一次姿态检测以立刻同步当前视频画面的骨架姿态
    pose.detect();

    let active = true;
    const renderLoop = () => {
      if (!active) return;
      sceneManager.render();
      animationFrameRef.current = requestAnimationFrame(renderLoop);
    };
    animationFrameRef.current = requestAnimationFrame(renderLoop);

    return () => {
      active = false;
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      skeleton3DController.dispose();
      skeleton3DControllerRef.current = null;
      sceneManager.dispose();
      sceneManagerRef.current = null;
    };
  }, [displayMode, isMirrored]);

  // 加载服务端视频源（支持 HTTP Range 拖动，不把视频复制进 IndexedDB）
  useEffect(() => {
    setIsLoadingVideo(true);
    setVideoError(null);
    setVideoBlobUrl(resolveVideoStreamUrl(video));
    setTranscodeSrc('');
    setTranscoding(false);
    return () => setVideoBlobUrl('');
  }, [video.id, video.serverId]);

  // 切到 H.264 副本后，恢复到原来的播放位置继续播
  useEffect(() => {
    if (!transcodeSrc) return;
    const node = videoRef.current;
    if (!node) return;
    const onMeta = () => {
      const target = Math.min(transcodeResumeRef.current, Number.isFinite(node.duration) ? node.duration : transcodeResumeRef.current);
      try {
        node.currentTime = target;
      } catch {
        /* ignore */
      }
      void node.play().catch(() => {});
    };
    node.addEventListener('loadedmetadata', onMeta, { once: true });
    return () => node.removeEventListener('loadedmetadata', onMeta);
  }, [transcodeSrc]);

  /**
   * HEVC 自动降级：请服务端用 ffmpeg 转一份 H.264 到 data/transcodes，
   * 轮询任务状态（而不是只 HEAD 产物）以便在失败时立刻回报原因，成功后无缝换源。
   *
   * 注意：不能只靠 <video> 的 onError 触发。Chromium 遇到不支持的 HEVC 时
   * 不抛 error，而是 error=null + videoWidth=0 + readyState=4 的「静默零尺寸」，
   * 所以调用方还要在 onLoadedMetadata / onCanPlay 里主动检测（见下方）。
   */
  const attemptTranscodeFallback = async () => {
    const serverId = video.serverId;
    if (!serverId || transcoding) return;
    transcodeResumeRef.current = videoRef.current?.currentTime ?? 0;
    setTranscoding(true);
    try {
      const start = await api.transcode(serverId);
      if (start.status === 'unavailable') {
        setVideoError(start.reason || '服务端未安装 ffmpeg，无法自动转码');
        return;
      }
      if (start.status === 'error') {
        setVideoError(`自动转码失败：${start.reason || '未知原因'}`);
        return;
      }
      const url = videoTranscodeUrl(serverId);
      // 每 1s 查一次任务状态；失败/不可用立即停止，避免盲等 3 分钟。
      for (let attempt = 0; attempt < 120; attempt += 1) {
        const status = await api.transcode(serverId).catch(() => null);
        if (status?.status === 'error') {
          setVideoError(`自动转码失败：${status.reason || '未知原因'}`);
          return;
        }
        if (status?.status === 'unavailable') {
          setVideoError(status.reason || '服务端未安装 ffmpeg，无法自动转码');
          return;
        }
        if (status?.status === 'ready') {
          // 服务端返回 ready 时产物已由 transcodeCacheFresh 校验过（存在且非空），
          // 无需再发一次跨域 HEAD：该路径若缺 CORS 头会被浏览器拦下，反而把
          // 已就绪的降级永久卡住（曾表现为「转码超时」）。
          setVideoError(null);
          setIsLoadingVideo(true);
          setTranscodeSrc(url);
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
      }
      setVideoError('转码超时，请稍后重试，或改用支持 HEVC 的浏览器');
    } catch (error) {
      console.warn('[DanceEcho] 自动转码失败:', error);
      setVideoError('自动转码失败，请确认服务端在线');
    } finally {
      setTranscoding(false);
    }
  };

  // 节拍网格：优先用本地存的音轨分析结果初始化 BPM / 首拍 / 逐拍时间戳
  useEffect(() => {
    const stored = loadBeatGrid(video.id);
    setBeatGrid(stored);
    if (stored) {
      setBpm(stored.bpm);
      setBeatOffset(stored.offset || 0);
    }
  }, [video.id]);

  // 媒体主时钟：在两次 timeupdate 之间做插值，让节拍排程不被事件间隔拖抖。
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    mediaClockRef.current = createMediaClock({ video });
    const resync = () => mediaClockRef.current?.resync();
    video.addEventListener('seeked', resync);
    video.addEventListener('ratechange', resync);
    video.addEventListener('playing', resync);
    video.addEventListener('pause', resync);
    return () => {
      video.removeEventListener('seeked', resync);
      video.removeEventListener('ratechange', resync);
      video.removeEventListener('playing', resync);
      video.removeEventListener('pause', resync);
      mediaClockRef.current?.dispose();
      mediaClockRef.current = null;
    };
  }, []);

  // 离线自动测算音频 BPM 与首拍偏移 (M1 模块)
  // 校准策略（不新增面板，全部在后台完成）：
  //  · 没有 BPM → 用分析结果初始化，置信度 ≥ 0.3 才落库；
  //  · 已有 BPM → 仍然分析一次，若与存档相差 ≥ 2 BPM 且置信度 ≥ 0.6，按音轨结果纠正；
  //  · 用户随时可以按 T 键点拍覆盖（优先级最高，会直接落库）。
  useEffect(() => {
    if (!videoBlobUrl) return;

    if (video.bpm && video.bpm > 0) {
      setBpm(video.bpm);
      setBeatOffset(video.beatOffset || 0);
    }

    let isCancelled = false;
    if (!video.bpm || video.bpm <= 0) {
      setIsAnalyzingBeat(true);
    }

    beatDetector
      .detectBpmFromUrl(videoBlobUrl)
      .then((info) => {
        if (isCancelled) return;
        const confidence = info.confidence ?? 0;
        setIsAnalyzingBeat(false);

        const storedBpm = video.bpm && video.bpm > 0 ? video.bpm : 0;
        if (!storedBpm) {
          setBpm(info.bpm);
          setBeatOffset(info.offset);
          if (confidence >= 0.3) {
            const grid = saveBeatGrid(video.id, { bpm: info.bpm, offset: 0, beats: info.beats, confidence: info.confidence });
          setBeatGrid(grid);
          void updateVideoBeat(video.id, info.bpm, 0, info.beats);
          }
          return;
        }

        // 已有存档：只在分析更强且差异明显时才纠正 BPM，避免闪动
        const differs = Math.abs(info.bpm - storedBpm) >= 2;

        // 不管 BPM 是否要纠正，只要没存过逐拍网格就先存一份——
        // 服务端库里的视频没有 Dexie 行，网格是「跟着音乐」的唯一依据。
        if (confidence >= 0.3 && !manualBpmRef.current && !loadBeatGrid(video.id)?.beats?.length) {
          const grid = saveBeatGrid(video.id, {
            bpm: info.bpm,
            offset: 0,
            beats: info.beats,
            confidence: info.confidence,
          });
          setBeatGrid(grid);
          if (Math.abs(info.bpm - storedBpm) < 2) {
            setBpm(info.bpm);
          }
        }

        if (differs && confidence >= 0.6 && !manualBpmRef.current) {
          setBpm(info.bpm);
          if (Math.abs(info.offset - (video.beatOffset || 0)) >= 0.02) {
            setBeatOffset(info.offset);
          }
          showHud(`已按音轨校准 BPM: ${storedBpm} → ${info.bpm}（置信度 ${Math.round(confidence * 100)}%）`);
          const grid = saveBeatGrid(video.id, { bpm: info.bpm, offset: 0, beats: info.beats, confidence: info.confidence });
          setBeatGrid(grid);
          void updateVideoBeat(video.id, info.bpm, 0, info.beats);
        }
      })
      .catch((err) => {
        if (isCancelled) return;
        console.warn('[DancePlayer] 离线节拍分析出错:', err);
        setIsAnalyzingBeat(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [videoBlobUrl, video.id, video.bpm, video.beatOffset, updateVideoBeat]);

  // 手动重测节拍
  const handleResetBeat = useCallback(() => {
    if (!videoBlobUrl) return;
    setIsAnalyzingBeat(true);
    showHud('正在重新解算音频 BPM 与首拍偏移...');
    beatDetector
      .detectBpmFromUrl(videoBlobUrl)
      .then((info) => {
        setBpm(info.bpm);
        setBeatOffset(0);
        setIsAnalyzingBeat(false);
        showHud(
          `测算完成: ${info.bpm} BPM${info.beats?.length ? `，${info.beats.length} 拍` : ''}（置信度 ${Math.round((info.confidence ?? 0) * 100)}%）`,
        );
        if ((info.confidence ?? 0) >= 0.3) {
          const grid = saveBeatGrid(video.id, { bpm: info.bpm, offset: 0, beats: info.beats, confidence: info.confidence });
          setBeatGrid(grid);
          void updateVideoBeat(video.id, info.bpm, 0, info.beats);
        }
      })
      .catch(() => {
        setIsAnalyzingBeat(false);
        showHud('节拍解算失败，使用默认 120 BPM');
      });
  }, [videoBlobUrl, video.id, updateVideoBeat, showHud]);

  // 同步播放速率
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // AB 循环检测与逻辑
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const time = videoRef.current.currentTime;
    setCurrentTime(time);
    currentTimeRef.current = time;

    if (
      abLoop.enabled &&
      abLoop.pointA !== null &&
      abLoop.pointB !== null &&
      abLoop.pointB > abLoop.pointA
    ) {
      if (time >= abLoop.pointB) {
        videoRef.current.currentTime = abLoop.pointA;
        videoRef.current.play();
        skeleton3DControllerRef.current?.resetSmoothing();
        pose.detect();
      }
    }
  };

  const togglePlay = async () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      try {
        await videoRef.current.play();
        setIsPlaying(true);
      } catch {
        setVideoError('视频暂时无法播放，请先等待加载完成后重试');
        setIsPlaying(false);
      }
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  // 视频主画面点击交互：支持点击指定舞者锁定聚焦主体，点击空白处播放/暂停
  const handleVideoContainerClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      void togglePlay();
      return;
    }

    // 关键：点击坐标必须落到「视频真实内容矩形」而不是容器矩形，
    // 否则 object-contain 留下的黑边会让落点整体偏移（点 A 却选中 B）。
    const content = videoContentRect;
    const offsetX = content ? content.left : 0;
    const offsetY = content ? content.top : 0;
    const boxWidth = content && content.width > 0 ? content.width : rect.width;
    const boxHeight = content && content.height > 0 ? content.height : rect.height;

    const rawX = (e.clientX - rect.left - offsetX) / boxWidth;
    const rawY = (e.clientY - rect.top - offsetY) / boxHeight;
    // 点在黑边上时钳制到内容区内，避免把黑边坐标当成画面坐标去选人
    const normX = Math.min(1, Math.max(0, rawX));
    const normY = Math.min(1, Math.max(0, rawY));
    const clickedInsideContent = rawX >= 0 && rawX <= 1 && rawY >= 0 && rawY <= 1;

    // 镜像翻转下将屏幕视口坐标逆映射为视频内部坐标
    const hitNormX = isMirrored ? (1 - normX) : normX;
    const hitNormY = normY;

    // 若当前处于姿态跟踪状态 (视频附着或分屏开启) 且画面中检测到了姿态
    if (clickedInsideContent && isPoseActive && allPosesRef.current && allPosesRef.current.length > 0) {
      let closestIdx = 0;
      let minDist = Infinity;
      allPosesRef.current.forEach((item, idx) => {
        const valid = item.landmarks.filter((p) => (p.visibility ?? 1) > 0.35);
        if (valid.length > 0) {
          const cx = valid.reduce((s, p) => s + p.x, 0) / valid.length;
          const cy = valid.reduce((s, p) => s + p.y, 0) / valid.length;
          const dist = Math.hypot(cx - hitNormX, cy - hitNormY);
          if (dist < minDist) {
            minDist = dist;
            closestIdx = idx;
          }
        }
      });
      setActivePoseIndex(closestIdx);
      setFocusPoint({ x: hitNormX, y: hitNormY });
      // 暂停时没有新帧，手动跑一次检测让选中结果立刻反映到骨架；
      // 先让 focusPoint 完成一次 React 提交再检测，否则 hook 读到的是旧焦点。
      window.setTimeout(() => poseDetectRef.current?.(), 0);
      return;
    }

    // 默认点击画面：切换播放/暂停
    void togglePlay();
  }, [isPoseActive, isMirrored, videoContentRect]);

  const handleSeek = (newTime: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
    currentTimeRef.current = newTime;
    skeleton3DControllerRef.current?.resetSmoothing();
    pose.detect();
  };

  // 精准跳帧并暂停以供复盘比对 (P1 模块核心动作)
  const handleSeekAndPause = useCallback((newTime: number) => {
    if (!videoRef.current) return;
    videoRef.current.pause();
    setIsPlaying(false);
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
    currentTimeRef.current = newTime;
    skeleton3DControllerRef.current?.resetSmoothing();
    pose.detect();
  }, [pose]);

  const handleResumePlayback = () => {
    if (resumePosition > 0 && videoRef.current) {
      handleSeek(resumePosition);
      setShowResumePrompt(false);
    }
  };

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs)) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 10);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
  };

  const formatTimeShort = (secs?: number) => {
    if (secs === undefined || isNaN(secs)) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleSetA = () => {
    if (videoRef.current) {
      const nextA = videoRef.current.currentTime;
      if (abLoop.pointB !== null && nextA >= abLoop.pointB) {
        setABPointB(null);
        showHud('起点已更新，请重新设置终点 B');
      }
      setABPointA(nextA);
    }
  };

  const handleSetB = () => {
    if (videoRef.current) {
      const nextB = videoRef.current.currentTime;
      if (abLoop.pointA !== null && nextB <= abLoop.pointA) {
        showHud('终点 B 必须晚于起点 A');
        return;
      }
      setABPointB(nextB);
    }
  };

  /** 重新统计留言：条数进 store（列表/侧栏共用），带秒数的进时间轴标记 */
  const reloadNoteMarks = useCallback(async () => {
    try {
      const items = await observationService.getObservationsByVideo(video.id);
      setNoteCount(video.id, items.length);
      setNoteMarks(
        items
          .filter((item) => item.timestamp !== undefined)
          .map((item) => ({ id: item.id, timestamp: item.timestamp as number, content: item.content })),
      );
    } catch (err) {
      console.warn('[DanceEcho] 刷新留言位置失败:', err);
    }
  }, [video.id, setNoteCount]);

  // 全屏切换
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      void containerRef.current.requestFullscreen().catch(() => {
        showHud('当前浏览器不允许进入全屏');
      });
    } else {
      void document.exitFullscreen().catch(() => {
        showHud('退出全屏失败');
      });
    }
  };

  useEffect(() => {
    const syncFullscreenState = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener('fullscreenchange', syncFullscreenState);
    return () => document.removeEventListener('fullscreenchange', syncFullscreenState);
  }, []);

  // 视角重置 (360° 复位居中)
  const handleResetCamera = useCallback(() => {
    sceneManagerRef.current?.resetCamera();
  }, []);

  // 变更分屏形态模式：开启分屏时自动关掉视频附着，避免分屏画幅变化产生拉伸变形
  const changeDisplayMode = useCallback((next: DisplayMode) => {
    if (next !== 'off') {
      setIsOverlayEnabled(false);
    }
    setDisplayMode(next);
  }, []);

  // 切换分屏形态模式 (off ➔ 2d-split ➔ 3d-split ➔ skeleton ➔ off)
  const cycleDisplayMode = useCallback(() => {
    setDisplayMode((current) => {
      const next: DisplayMode =
        current === 'off'
          ? '2d-split'
          : current === '2d-split'
          ? '3d-split'
          : current === '3d-split'
          ? 'skeleton'
          : 'off';

      // 当开启分屏时，自动关掉视频附着，避免变形
      if (next !== 'off') {
        setIsOverlayEnabled(false);
      }
      return next;
    });
  }, []);

  // 专业舞者键盘流快捷键监听
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(target.tagName) ||
          target.isContentEditable ||
          target.closest('button, a, [role="button"]'))
      ) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          togglePlay();
          break;
        case '2':
          e.preventDefault();
          setIsOverlayEnabled((prev) => !prev);
          break;
        case 't': {
          // Tap tempo：连按 T 取间隔中位数，直接校准 BPM（不新增面板，只复用 HUD 反馈）
          e.preventDefault();
          const now = performance.now();
          const taps = tapTimesRef.current.filter((t) => now - t < 4000);
          taps.push(now);
          tapTimesRef.current = taps.slice(-12);
          if (tapTimesRef.current.length >= 4) {
            const gaps: number[] = [];
            for (let i = 1; i < tapTimesRef.current.length; i++) {
              gaps.push(tapTimesRef.current[i] - tapTimesRef.current[i - 1]);
            }
            gaps.sort((a, b) => a - b);
            const median = gaps[Math.floor(gaps.length / 2)];
            const tapped = Math.round(60000 / median);
            if (tapped >= 40 && tapped <= 220) {
              manualBpmRef.current = true;
              setBpm(tapped);
              showHud(`${tr('点拍校准')}: ${tapped} BPM（第 ${tapTimesRef.current.length} 次点按）`);
              setBeatGrid(saveBeatGrid(video.id, { bpm: tapped, offset: 0, beats: [] }));
              void updateVideoBeat(video.id, tapped, 0, []);
            }
          } else {
            showHud(`${tr('点拍校准')}：继续按 T（已 ${tapTimesRef.current.length} 拍）`);
          }
          break;
        }
        case '3':
          e.preventDefault();
          cycleDisplayMode();
          break;
        case 'm':
          e.preventDefault();
          toggleMirror();
          break;
        case '[':
          e.preventDefault();
          handleSetA();
          break;
        case ']':
          e.preventDefault();
          handleSetB();
          break;
        case '\\':
          e.preventDefault();
          toggleABLoop();
          break;
        case 'arrowleft':
          e.preventDefault();
          const backStep = e.shiftKey ? 3 : 1;
          const targetBackTime = Math.max(0, (videoRef.current?.currentTime || currentTime) - backStep);
          handleSeek(targetBackTime);
          break;
        case 'arrowright':
          e.preventDefault();
          const forwardStep = e.shiftKey ? 3 : 1;
          const targetForwardTime = Math.min(duration, (videoRef.current?.currentTime || currentTime) + forwardStep);
          handleSeek(targetForwardTime);
          break;
        case ',':
        case '<': {
          e.preventDefault();
          const frameBack = Math.max(0, (videoRef.current?.currentTime || currentTime) - 0.033);
          handleSeek(frameBack);
          break;
        }
        case '.':
        case '>': {
          e.preventDefault();
          const frameForward = Math.min(duration, (videoRef.current?.currentTime || currentTime) + 0.033);
          handleSeek(frameForward);
          break;
        }
        case 'j': {
          e.preventDefault();
          const targetBackTime = Math.max(0, (videoRef.current?.currentTime || currentTime) - 1.5);
          handleSeek(targetBackTime);
          break;
        }
        case 'k': {
          e.preventDefault();
          togglePlay();
          break;
        }
        case 'l': {
          e.preventDefault();
          const rates = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
          const currIdx = rates.indexOf(playbackRate);
          const nextRate = rates[(currIdx + 1) % rates.length] || 1.0;
          setPlaybackRate(nextRate);
          if (videoRef.current) videoRef.current.playbackRate = nextRate;
          break;
        }
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'r':
          e.preventDefault();
          if (focusPoint) {
            setFocusPoint(null);
          }
          break;
        case 'b':
          e.preventDefault();
          setIsMetronomeEnabled((prev) => !prev);
          break;
        case 'o':
        case 'n':
          e.preventDefault();
          setRightDrawerTab('notes');
          setShowRightDrawer((prev) => (prev && rightDrawerTab === 'notes' ? false : true));
          break;
        case 'escape':
          if (focusPoint) {
            setFocusPoint(null);
            break;
          }
          if (!document.fullscreenElement) {
            handleClosePlayer();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTime, duration, isPlaying, abLoop, isMirrored, displayMode, handleClosePlayer, cycleDisplayMode, focusPoint]);

  // 2D 独立分屏纯骨架画布渲染
  const render2DSplitViewport = () => (
    <div
      ref={split2DContainerRef}
      className="relative flex-1 h-full flex flex-col bg-zinc-950 border border-cyan-500/30 rounded-2xl shadow-2xl overflow-hidden select-none transition-all"
    >
      {/* 2D 独立分屏顶栏控制 */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-zinc-900/80 border-b border-white/10 backdrop-blur-md z-10">
        <div className="flex items-center gap-2 truncate">
          <div className="p-1 rounded bg-cyan-950/80 text-cyan-400 border border-cyan-500/30">
            <Activity className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-semibold text-zinc-200">
            {displayMode === 'skeleton' ? '纯骨架视图 (动作剪影)' : '2D 纯骨架分屏 (动作剪影)'}
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950/80 text-cyan-300 border border-cyan-500/30 flex items-center gap-1.5 truncate">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          </span>
          {detectedPoseCount > 1 && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950/90 text-cyan-300 border border-cyan-400/50 flex items-center gap-1">
              <Users className="w-3 h-3 text-cyan-400" />
              <span>跟随舞者 #{activePoseIndex + 1}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* 骨架呈现方式：贴合视频（默认，和画面里那个人位置一致）/ 居中放大（便于看清动作） */}
          {displayMode === '2d-split' && (
            <div className="mr-1 flex items-center gap-0.5 rounded-lg bg-white/[0.04] p-0.5">
              <button
                type="button"
                data-testid="split-view-fitted"
                onClick={() => setSplitViewMode('fitted')}
                className={`rounded-md px-1.5 py-1 text-[10px] transition ${
                  splitViewMode === 'fitted'
                    ? 'bg-cyan-500/20 text-cyan-200'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title={tr('贴合视频：骨架叠在画面里舞者的真实位置上')}
              >
                贴合
              </button>
              <button
                type="button"
                data-testid="split-view-centered"
                onClick={() => setSplitViewMode('centered')}
                className={`rounded-md px-1.5 py-1 text-[10px] transition ${
                  splitViewMode === 'centered'
                    ? 'bg-cyan-500/20 text-cyan-200'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title={tr('居中放大：把舞者放大到画面中央，方便逐帧看清关节')}
              >
                居中
              </button>
            </div>
          )}

          {/* 切换至 3D 空间骨架 */}
          <button
            type="button"
            onClick={() => {
              changeDisplayMode('3d-split');
            }}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
            title={tr('切换至 3D 空间骨架')}
          >
            <Box className="w-3.5 h-3.5 text-cyan-400" />
          </button>

          {/* 关闭分屏 */}
          <button
            type="button"
            onClick={() => {
              changeDisplayMode('off');
            }}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition cursor-pointer"
            title={tr('关闭分屏 (返回单屏)')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2D 独立 Canvas 画布区域 */}
      <div className="relative flex-1 w-full h-full overflow-hidden flex items-center justify-center bg-[#09090b]">
        <canvas
          id="split2DCanvas"
          ref={split2DCanvasRef}
          className="w-full h-full block"
        />

        {/* 关节角度实时读数（膝/肘/髋，单位：度） */}
        <div
          data-testid="joint-angles"
          className="absolute left-3 top-3 z-20 rounded-xl border border-cyan-500/25 bg-black/55 px-3 py-2 backdrop-blur-md pointer-events-none select-none"
        >
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            关节角度
          </div>
          <div className="grid grid-cols-[auto_auto_auto_auto] gap-x-2.5 gap-y-0.5 font-mono text-[11px]">
            <span className="text-zinc-500">{tr('左膝')}</span>
            <span className="text-right text-cyan-300">{formatAngle(jointAngles.leftKnee)}</span>
            <span className="text-zinc-500">{tr('右膝')}</span>
            <span className="text-right text-cyan-300">{formatAngle(jointAngles.rightKnee)}</span>
            <span className="text-zinc-500">{tr('左肘')}</span>
            <span className="text-right text-cyan-300">{formatAngle(jointAngles.leftElbow)}</span>
            <span className="text-zinc-500">{tr('右肘')}</span>
            <span className="text-right text-cyan-300">{formatAngle(jointAngles.rightElbow)}</span>
            <span className="text-zinc-500">{tr('左髋')}</span>
            <span className="text-right text-cyan-300">{formatAngle(jointAngles.leftHip)}</span>
            <span className="text-zinc-500">{tr('右髋')}</span>
            <span className="text-right text-cyan-300">{formatAngle(jointAngles.rightHip)}</span>
          </div>
        </div>

        {/* 姿态识别引擎加载中提示 */}
        {pose.status === 'loading' && (
          <div className="absolute inset-0 z-20 bg-black/60 backdrop-blur-sm flex items-center justify-center gap-2 text-cyan-300 text-xs">
            <LoaderCircle className="w-4 h-4 animate-spin" />
            <span>{tr('AI 姿态估计引擎正在建立同步信号...')}</span>
          </div>
        )}
      </div>

    </div>
  );

  // 3D 视窗主体组件渲染（分屏）
  const render3DViewport = () => (
    <div className="relative flex flex-col bg-zinc-950 border border-cyan-500/30 overflow-hidden select-none flex-1 h-full rounded-2xl shadow-2xl">
      {/* 3D 视窗顶栏控制 */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-zinc-900/80 border-b border-white/10 backdrop-blur-md z-10">
        <div className="flex items-center gap-2 truncate">
          <div className="p-1 rounded bg-cyan-950/80 text-cyan-400 border border-cyan-500/30">
            <Box className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-semibold text-zinc-200">
            3D 空间可旋转骨架
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950/80 text-cyan-300 border border-cyan-500/30 flex items-center gap-1.5 truncate max-w-[170px]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>{tr('3D 发光骨骼 (实时同步)')}</span>
          </span>
          {detectedPoseCount > 1 && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950/90 text-cyan-300 border border-cyan-400/50 flex items-center gap-1">
              <Users className="w-3 h-3 text-cyan-400" />
              <span>跟随舞者 #{activePoseIndex + 1}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* 视角复位 */}
          <button
            type="button"
            onClick={handleResetCamera}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
            title={tr('视角复位 (居中前视)')}
          >
            <Compass className="w-3.5 h-3.5 text-cyan-400" />
          </button>

          {/* 关闭 3D 视窗 */}
          <button
            type="button"
            onClick={() => {
              changeDisplayMode('off');
            }}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition cursor-pointer"
            title={tr('关闭 3D 视窗')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Three.js Canvas 挂载容器 */}
      <div className="relative flex-1 w-full h-full overflow-hidden bg-[#09090b]">
        <div ref={threeContainerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

        {/* 姿态识别引擎加载中提示 */}
        {pose.status === 'loading' && (
          <div className="absolute inset-0 z-20 bg-black/60 backdrop-blur-sm flex items-center justify-center gap-2 text-cyan-300 text-xs">
            <LoaderCircle className="w-4 h-4 animate-spin" />
            <span>{tr('AI 姿态估计引擎正在建立同步信号...')}</span>
          </div>
        )}
      </div>

      {/* 3D 视窗底栏控制操作 */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900/80 border-t border-white/10 text-xs text-zinc-400 backdrop-blur-md z-10">
        <span className="text-[11px] font-mono text-zinc-500 flex items-center gap-1">
          <MousePointer className="w-3 h-3 text-cyan-400" />
          <span>{tr('左键 360° 旋转 · 右键平移 · 滚轮缩放')}</span>
        </span>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleResetCamera}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-[11px] font-medium border border-white/10 transition cursor-pointer"
            title={tr('居中前视复位')}
          >
            <Compass className="w-3.5 h-3.5 text-cyan-400" />
            <span>{tr('居中复位')}</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div
      ref={containerRef}
      id="playerModal"
      className="fixed inset-0 z-50 flex flex-col bg-space-void/95 text-white select-none backdrop-blur-md overflow-hidden"
      onMouseMove={handleUserActivity}
      onKeyDown={handleUserActivity}
      onTouchStart={handleUserActivity}
    >
      {/* 顶部轻量悬浮工具岛 (Top Lightweight Tool Island) */}
      <div
        className={`absolute top-3 left-2 right-2 sm:left-6 sm:right-6 z-30 flex flex-nowrap items-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2.5 rounded-xl bg-space-void/90 border border-hairline backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.85)] transition-opacity duration-300 overflow-x-auto no-scrollbar ${
          isHudVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onMouseEnter={() => setIsHoveringHud(true)}
        onMouseLeave={() => setIsHoveringHud(false)}
      >
        {/* 关闭播放器 */}
        <button
          onClick={handleClosePlayer}
          id="btnClosePlayer"
          className="p-1 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition cursor-pointer flex-shrink-0"
          title={`${t('common.close')} (Esc)`}
        >
          <X className="w-4 h-4" />
        </button>

        {/* 视频标题与时长 */}
        <div className="hidden sm:flex items-center gap-1.5 px-1.5 text-xs font-medium text-zinc-200 truncate max-w-[200px]" title={video.title ? `${displayTitle(video)} · ${video.name}` : video.name}>
          <span className="truncate" data-testid="player-title">{displayTitle(video)}</span>
        </div>

        <div className="w-[1px] h-3.5 bg-white/10 flex-shrink-0" />

        {/* 视图入口：骨架形态 + 显示开关，全部收在一个下拉里 */}
        <div className="relative flex-shrink-0" onMouseDown={(e) => e.stopPropagation()}>
          <button
            id="btnCycleDisplayMode"
            ref={modeButtonRef}
            onClick={() => {
              const rect = modeButtonRef.current?.getBoundingClientRect();
              setModeMenuPos(rect ? { left: rect.left, top: rect.bottom + 8 } : null);
              setIsModeMenuOpen((prev) => !prev);
            }}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition cursor-pointer ${
              displayMode !== 'off' || isOverlayEnabled || isMetronomeEnabled
                ? 'bg-white/[0.08] text-zinc-100'
                : 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200'
            }`}
            title={tr('视图：骨架分屏与显示开关')}
            data-state={displayMode}
          >
            {displayMode === '2d-split' || displayMode === 'skeleton' ? (
              <Activity className="h-4 w-4" />
            ) : displayMode === '3d-split' ? (
              <Box className="h-4 w-4" />
            ) : (
              <Columns className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">{tr('视图')}</span>
            <span className="hidden md:inline text-zinc-500">
              {displayMode === 'off'
                ? t('player.splitOff')
                : displayMode === '2d-split'
                ? t('player.split2D')
                : displayMode === '3d-split'
                ? t('player.split3D')
                : '纯骨架'}
            </span>
            <ChevronDown className="h-3 w-3 text-zinc-500" />
          </button>

          {isModeMenuOpen && modeMenuPos && typeof document !== 'undefined' &&
            createPortal(
              <div
                className="fixed z-[120] w-60 overflow-hidden rounded-xl border border-hairline bg-zinc-950/95 p-1 shadow-2xl backdrop-blur-xl"
                style={{ left: modeMenuPos.left, top: modeMenuPos.top }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="px-2 pt-1 pb-1 text-[10px] uppercase tracking-[0.12em] text-zinc-500">{tr('呈现')}</div>

                {/* 布局模式：四选一，单行分段按钮 */}
                <div className="flex items-center gap-0.5 rounded-lg bg-white/[0.04] p-0.5">
                  {[
                    { mode: 'off' as const, label: tr('视频'), title: tr('只看视频') },
                    { mode: '2d-split' as const, label: tr('2D'), title: tr('2D 骨骼分屏 · 看动作细节') },
                    { mode: '3d-split' as const, label: tr('3D'), title: tr('3D 骨架分屏 · 可旋转看空间轨迹') },
                    { mode: 'skeleton' as const, label: tr('纯骨架'), title: tr('隐藏视频 · 只看动作') },
                  ].map((item) => (
                    <button
                      key={item.mode}
                      type="button"
                      data-testid={`display-mode-${item.mode}`}
                      title={item.title}
                      onClick={() => {
                        changeDisplayMode(item.mode);
                        setIsModeMenuOpen(false);
                        setModeMenuPos(null);
                      }}
                      className={`flex-1 rounded-md px-2 py-1.5 text-[11px] transition ${
                        displayMode === item.mode
                          ? 'bg-cyan-500/20 text-cyan-200'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {/* 骨骼叠加：画在视频上；纯骨架模式已无视频，禁用 */}
                <button
                  type="button"
                  id="btnToggleOverlay"
                  data-state={pose.status}
                  disabled={displayMode === 'skeleton'}
                  onClick={() => setIsOverlayEnabled((prev) => !prev)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-zinc-300 transition hover:bg-white/[0.06] hover:text-white disabled:pointer-events-none disabled:opacity-40"
                  title={displayMode === 'skeleton' ? tr('纯骨架模式已隐藏视频，无需叠加') : t('player.overlayToggle')}
                >
                  <Activity className="h-3.5 w-3.5" />
                  <span>{tr('骨骼叠加')}</span>
                  {pose.status === 'loading' && isOverlayEnabled && <LoaderCircle className="h-3 w-3 animate-spin text-zinc-400" />}
                  <SwitchDot on={isOverlayEnabled} />
                </button>

                {/* 动捕 */}
                <div className="my-1 h-px bg-white/10" />
                <div className="px-2 pt-1 pb-1 text-[10px] uppercase tracking-[0.12em] text-zinc-500">{tr('动捕')}</div>

                {/* 骨骼索引：扫描一次，之后拖动/暂停都按时间查表 */}
                <button
                  type="button"
                  data-testid="pose-track-scan"
                  onClick={() => void handleScanPoseTrack()}
                  disabled={scanState.running}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-zinc-300 transition hover:bg-white/[0.06] hover:text-white disabled:pointer-events-none disabled:opacity-50"
                  title={tr('把整段视频的骨架扫成索引：之后拖动进度条、暂停都能立刻对上画面')}
                >
                  <ScanLine className="h-3.5 w-3.5" />
                  <span>{tr('骨骼索引')}</span>
                  {scanState.running ? (
                    <span className="ml-auto font-mono text-[10px] text-cyan-300">
                      {Math.round(scanState.progress * 100)}%
                    </span>
                  ) : (
                    <span className="ml-auto font-mono text-[10px] text-zinc-500">
                      {poseTrack ? `${poseTrack.frameCount} 帧` : tr('未扫描')}
                    </span>
                  )}
                </button>

                {/* 动捕导出：BVH 是动捕数据的通用格式，Blender/Maya/MotionBuilder 都能直接吃 */}
                <button
                  type="button"
                  data-testid="pose-export-bvh"
                  onClick={handleExportBvh}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-zinc-300 transition hover:bg-white/[0.06] hover:text-white"
                  title={tr('把整段骨骼导出为 .bvh，可导入 Blender / Maya / MotionBuilder 继续做动画')}
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>{tr('导出动捕 (BVH)')}</span>
                  <span className="ml-auto font-mono text-[10px] text-zinc-500">
                    {poseTrack ? `${poseTrack.frameCount} 帧` : tr('先扫描')}
                  </span>
                </button>

                <div className="my-1 h-px bg-white/10" />
                {/* 节拍器：播放辅助，独立于骨架呈现 */}
                <button
                  type="button"
                  id="btnToggleBeatMetronome"
                  onClick={() => setIsMetronomeEnabled((prev) => !prev)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-zinc-300 transition hover:bg-white/[0.06] hover:text-white"
                  title={t('player.metronomeToggle')}
                >
                  <Music2 className="h-3.5 w-3.5" />
                  <span>{tr('节拍器')}</span>
                  <span className="font-mono text-[10px] text-zinc-500">{isAnalyzingBeat ? '…' : Math.round(bpm)}</span>
                  <SwitchDot on={isMetronomeEnabled} />
                </button>

                <div className="px-2 pb-1 pt-1.5 text-[10px] leading-relaxed text-zinc-500">
                  {tr('快捷键：空格 播放/暂停 · ←/→ 5 秒 · 3 循环骨架')}
                </div>
              </div>,
              document.body,
            )}
        </div>

        {/* 多人动捕目标快速选择器 (检测到多人时呈现) */}
        {detectedPoseCount > 1 && (
          <div
            id="dancerSelectorBar"
            className="flex items-center gap-1 bg-white/5 rounded-full px-2 py-0.5 border border-white/5 flex-shrink-0"
          >
            <Users className="w-3 h-3 text-cyan-400" />
            <span className="text-zinc-400 text-[10px] font-mono">{t('player.dancerSelect')}:</span>
            <div className="flex items-center gap-1">
              {Array.from({ length: detectedPoseCount }).map((_, i) => {
                const isActive = activePoseIndex === i;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSelectDancer(i)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium transition cursor-pointer ${
                      isActive
                        ? 'bg-cyan-500 text-zinc-950 font-bold shadow-[0_0_8px_rgba(34,211,238,0.4)]'
                        : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white border border-white/5'
                    }`}
                    title={`#${i + 1}`}
                  >
                    #{i + 1}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 手动聚焦单人主体提示与一键重置 */}
        {focusPoint && (
          <button
            type="button"
            onClick={() => {
              setFocusPoint(null);
            }}
            className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-400 text-cyan-300 text-[11px] shadow-sm hover:bg-cyan-900 transition cursor-pointer flex-shrink-0"
            title={t('player.resetFocus')}
          >
            <Users className="w-3 h-3 text-cyan-400" />
            <span>{t('player.lockDancer')}</span>
            <span className="text-zinc-400 hover:text-white font-bold ml-0.5">×</span>
          </button>
        )}

        <div className="w-[1px] h-3.5 bg-white/10 flex-shrink-0" />

        {/* 单入口：信息（抽屉内含 信息 / 记录 / 音乐 三个分区） */}
        <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            onClick={() => {
              setShowRightDrawer((prev) => (prev && rightDrawerTab === 'info' ? false : true));
              setRightDrawerTab('info');
            }}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition cursor-pointer flex-shrink-0 ${
              showRightDrawer
                ? 'bg-white/[0.10] text-zinc-100'
                : 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200'
            }`}
            title={tr('信息：视频档案 · 留言 · 舞曲')}
          >
            <Info className="w-4 h-4" />
            <span className="hidden sm:inline">{tr('信息')}</span>
            {(noteCounts[video.id] ?? 0) > 0 && (
              <span className="hidden sm:inline font-mono text-[10px] text-zinc-500">{noteCounts[video.id]}</span>
            )}
          </button>
        </div>
      </div>

      {/* 核心播放与对照视窗区域 (100% Feet & Floor Clearance) */}
      <div
        className={`relative flex-1 w-full h-full flex overflow-hidden pb-36 max-md:pb-56 pt-24 px-2 sm:px-4 gap-2 sm:gap-4 ${
          showRightDrawer ? 'items-center justify-start' : 'items-center justify-center'
        }`}
      >
        {/* 长时/等待任务状态反馈浮层 (如模型加载、BPM测算、曲目绑定) */}
        {hudMessage && (
          <div
            id="playerHudToast"
            className="absolute top-6 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-full bg-zinc-950/90 border border-cyan-400/60 text-cyan-300 text-xs font-mono font-semibold shadow-[0_0_20px_rgba(34,211,238,0.35)] backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150 pointer-events-none flex items-center gap-2"
          >
            {hudMessage.includes('正在') && <LoaderCircle className="w-3.5 h-3.5 animate-spin text-cyan-400 flex-shrink-0" />}
            <span>{hudMessage}</span>
          </div>
        )}

        {/* 记忆续播提示条 (Resume) */}
        {showResumePrompt && resumePosition > 0 && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2 rounded-2xl bg-zinc-900/95 border border-cyan-400/40 text-xs text-zinc-200 shadow-[0_0_30px_rgba(0,0,0,0.9)] backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-200">
            <Clock className="w-4 h-4 text-cyan-400 flex-shrink-0" />
            <span>
              检测到上次播放至 <strong className="text-cyan-300 font-mono font-semibold">{formatTime(resumePosition)}</strong>
            </span>
            <button
              type="button"
              onClick={handleResumePlayback}
              className="px-3 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs transition cursor-pointer shadow-md shadow-cyan-600/30 flex-shrink-0"
            >
              跳转续播
            </button>
            <button
              type="button"
              onClick={() => setShowResumePrompt(false)}
              className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition cursor-pointer"
              title={tr('关闭')}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 时间回声（Time Echo）：不再用横幅压画面，改为进度条标记 + 控制排上的小徽标 */}

        {/* 视频主舞台（弹性占满剩余空间，自适应居左/居中，平滑避让右栏） */}
        <div className="flex-1 h-full flex items-center justify-center min-w-0 transition-all duration-300">
          {videoBlobUrl ? (
            <div
              className={`flex h-full w-full items-center justify-center overflow-hidden ${
                displayMode === '2d-split' || displayMode === '3d-split' || displayMode === 'skeleton'
                  ? frameAspectRatio && frameAspectRatio < 0.95
                    ? 'gap-4 max-w-5xl mx-auto'
                    : 'gap-3'
                  : ''
              }`}
            >
              {/* 视频画面主容器（纯骨架模式下隐藏，只留骨架视图占满舞台） */}
              <div
                className={`relative flex items-center justify-center overflow-hidden bg-black/80 rounded-lg border border-white/10 ${
                  displayMode === 'skeleton'
                    ? 'hidden'
                    : displayMode === '2d-split' || displayMode === '3d-split'
                    ? 'flex-1 h-full max-h-full'
                    : 'h-full w-full max-h-full'
                }`}
                style={
                  displayMode === 'skeleton' || displayMode === '2d-split' || displayMode === '3d-split'
                    ? undefined
                    : frameAspectRatio && frameAspectRatio < 1
                      // 竖屏素材：按内容比例收窄舞台，避免两侧出现大片黑色空盒
                      ? { maxWidth: `min(100%, calc((100vh - 240px) * ${frameAspectRatio}))` }
                      : { maxWidth: '72rem' }
                }
              >
                {/* 视频画幅舞台：视频用 object-contain 自适应，骨骼 Canvas 精确贴到"实际内容矩形"上 */}
                <div
                  ref={videoStageRef}
                  className="relative flex h-full w-full max-h-full items-center justify-center overflow-hidden select-none cursor-pointer"
                  data-testid="player-video-frame"
                  onClick={handleVideoContainerClick}
                >
                  <video
                    ref={videoRef}
                    id="videoElement"
                    src={transcodeSrc || videoBlobUrl}
                    // 不再用 poster 属性：缩略图可能是「当年抽帧抽到的纯黑图」，
                    // poster 会在暂停时一直盖在画面上（解码好的首帧也顶不掉），
                    // 于是打开播放器就是全黑。改用下面那张普通的 <img> 占位，解码出首帧后撤掉。
                    // Chromium 只有在需要时才解码：不写 preload 时暂停在 t=0 的 video 会一直是
                    // readyState=4 但 decodedFrameCount=0，画布上什么都画不出来（纯黑）。
                    preload="auto"
                    // 视频来自 DanceEcho Server（8090）属于跨域资源；不加这个属性会让 canvas 被标记为
                    // 污染源，MediaPipe 的 texImage2D 直接抛 "cross-origin data" 而永远识别不到骨架。
                    crossOrigin="anonymous"
                    className={`absolute inset-0 h-full w-full object-contain transition-transform duration-300 pointer-events-none ${
                      isMirrored ? 'mirrored scale-x-[-1]' : ''
                    }`}
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={() => {
                      if (videoRef.current) {
                        setDuration(videoRef.current.duration);
                        if (videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0) {
                          setFrameAspectRatio(videoRef.current.videoWidth / videoRef.current.videoHeight);
                        }
                        setIsLoadingVideo(false);
                        scheduleContentRectUpdate();
                        // 不支持 HEVC 的浏览器在 loadedmetadata 时 videoWidth 已是 0，
                        // 且可能根本不派发 canplay（没有可解码的视频轨）。
                        // 因此在这里就触发降级，不能等到 onCanPlay。
                        if (videoRef.current.videoWidth === 0 && !transcodeSrc && !transcoding) {
                          setVideoError('这个视频是 HEVC 编码，当前浏览器不支持。正在自动转为 H.264 副本…');
                          void attemptTranscodeFallback();
                        }
                      }
                    }}
                    onLoadedData={() => setShowPoster(false)}
                    onCanPlay={() => {
                      setIsLoadingVideo(false);
                      // 兜底：某些浏览器在 loadedmetadata 时 videoWidth 尚未确定，
                      // 到 canplay 才暴露 0；与上面的检测共用 transcoding 互斥，不会重复转码。
                      const node = videoRef.current;
                      if (node && node.videoWidth === 0 && !transcodeSrc && !transcoding) {
                        setVideoError('这个视频是 HEVC 编码，当前浏览器不支持。正在自动转为 H.264 副本…');
                        void attemptTranscodeFallback();
                      }
                    }}
                    onError={() => {
                      setIsLoadingVideo(false);
                      const code = videoRef.current?.error?.code;
                      if (code === 4) {
                        setVideoError('这个视频是 HEVC 编码，当前浏览器不支持。正在自动转为 H.264 副本…');
                        void attemptTranscodeFallback();
                      } else if (code === 2) {
                        setVideoError('视频读取失败：服务端未响应，或原文件已被移动。可到「设置 → 存储与备份」重新扫描。');
                      } else {
                        setVideoError('视频解码失败，请重试；若反复出现，可换用系统自带的 Edge / Chrome 播放。');
                      }
                    }}
                    onPlay={() => {
                      setIsPlaying(true);
                      setShowPoster(false);
                    }}
                    onPause={() => setIsPlaying(false)}
                  />
                  {/* 首帧占位：缩略图走普通 <img> 加载（不发 CORS 请求），
                      解码出真实首帧（onLoadedData）后自动撤掉，避免打开播放器时一片黑。 */}
                  {showPoster && video.thumbnailUrl && (
                    <img
                      src={video.thumbnailUrl}
                      alt=""
                      aria-hidden="true"
                      draggable={false}
                      data-testid="player-first-frame-poster"
                      className={`pointer-events-none absolute inset-0 h-full w-full object-contain ${
                        isMirrored ? 'mirrored scale-x-[-1]' : ''
                      }`}
                    />
                  )}
                  <canvas
                    ref={canvasRef}
                    id="poseOverlay"
                    data-state={pose.status}
                    hidden={!isOverlayEnabled}
                    aria-hidden="true"
                    style={
                      videoContentRect
                        ? {
                            left: `${videoContentRect.left}px`,
                            top: `${videoContentRect.top}px`,
                            width: `${videoContentRect.width}px`,
                            height: `${videoContentRect.height}px`,
                          }
                        : undefined
                    }
                    className={`pointer-events-none absolute inset-0 h-full w-full transition-opacity duration-200 ${
                      isMirrored ? 'mirrored scale-x-[-1]' : ''
                    }`}
                  />
                </div>

                {/* 分屏模式下的视频标签 */}
                {(displayMode === '2d-split' || displayMode === '3d-split') && (
                  <div className="absolute top-3 left-3 px-2 py-1 rounded-md bg-black/70 backdrop-blur-md text-[11px] font-mono text-zinc-300 border border-white/10 pointer-events-none z-10">
                    原视频视口
                  </div>
                )}
              </div>

              {/* 分屏模式下的右侧独立对照视窗 */}
              {(displayMode === '2d-split' || displayMode === 'skeleton') && render2DSplitViewport()}
              {displayMode === '3d-split' && render3DViewport()}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 text-center text-neutral-400">
              <span>{isLoadingVideo ? '正在加载本地视频流...' : videoError || '视频文件不可用'}</span>
              {videoError && !transcoding && (
                <span className="text-xs text-amber-300">
                  可到「设置 → 存储与备份」重新扫描媒体库，或重新挂载原视频目录
                </span>
              )}
              {transcoding && (
                <span className="flex items-center gap-2 text-xs text-cyan-300">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />
                  正在转码为 H.264（通常几秒，转好后自动继续播放）
                </span>
              )}
            </div>
          )}

          {/* 姿态识别状态提示浮层。
              画面不可解码时（Chromium 下 HEVC 静默零尺寸）不能继续说「骨骼识别中」，
              否则用户会一直以为模型在算，其实是没有任何视频帧可供解算。 */}
          <div
            id="poseStatus"
            className={`pointer-events-none absolute left-6 top-6 z-10 rounded-full border border-white/10 bg-zinc-950/75 px-3 py-1.5 text-xs text-zinc-300 backdrop-blur-md transition-opacity duration-200 ${
              isOverlayEnabled && (pose.message || transcoding) ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {transcoding
              ? '画面编码不受支持，正在转为 H.264…'
              : (videoRef.current && videoRef.current.videoWidth === 0 && !transcodeSrc)
                ? '画面未解码，无法识别姿态'
                : (pose.message || '骨骼识别中')}
          </div>

          {videoBlobUrl && isLoadingVideo && !videoError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm text-neutral-300 pointer-events-none">
              正在解析视频...
            </div>
          )}
          {videoBlobUrl && videoError && (
            <div className="absolute inset-x-6 bottom-24 rounded-lg border border-red-500/30 bg-red-950/80 px-4 py-3 text-center text-sm text-red-200">
              {videoError}
            </div>
          )}
        </div>

        {/* 统一右侧工作栏（包含留言、信息、免弹窗歌曲识曲三大选项卡） */}
        {showRightDrawer && (
          <DancePlayerRightDrawer
            isOpen={showRightDrawer}
            activeTab={rightDrawerTab}
            onTabChange={setRightDrawerTab}
            onClose={() => setShowRightDrawer(false)}
            video={video}
            currentTime={currentTime}
            duration={duration}
            bpm={bpm}
            videoElement={videoRef.current}
            onSeek={handleSeek}
            onSeekAndPause={handleSeekAndPause}
            noteCount={noteCounts[video.id] ?? 0}
            onNoteCountChange={() => {
              void reloadNoteMarks();
            }}
            onUnbindSong={async () => {
              await updateVideoSong(video.id, '', '', undefined);
              setCurrentSongTitle('');
              setCurrentSongArtist('');
              showHud('已解绑舞曲');
            }}
            onSaveSong={async (metadata) => {
              setCurrentSongTitle(metadata.title);
              setCurrentSongArtist(metadata.artist);
              if (metadata.bpm) setBpm(metadata.bpm);
              await updateVideoSong(video.id, metadata.title, metadata.artist, metadata.bpm);
              showHud(`🎵 已绑定舞曲: 《${metadata.title}》`);
            }}
            onRenameVideo={(title) => renameVideo(video.id, title)}
            onUpdateRating={(rating) => updateRating(video.id, rating)}
            onAddTag={(tag) => addTag(video.id, tag)}
            onRemoveTag={(tag) => removeTag(video.id, tag)}
            onMoveToFolder={(folderPath) => moveVideoToFolder(video.id, folderPath)}
            onPauseVideo={() => videoRef.current?.pause()}
            onBindSongToGroup={async (metadata) => {
              const targets = groupVideos.filter((item) => item.id !== video.id);
              for (const item of targets) {
                await updateVideoSong(item.id, metadata.title, metadata.artist, metadata.bpm);
              }
              showHud(`🎵 已把《${metadata.title}》同步到本组另外 ${targets.length} 个视频`);
            }}
            groupVideoCount={groupVideos.length}
            siblingGroup={siblingGroup}
            onMergeIntoGroup={(path) => {
              const name = path.split('/').filter(Boolean).pop() || path;
              void moveVideoToFolder(video.id, path);
              showHud(`已并到同名分组「${name}」`);
            }}
            folderPath={currentFolderPath}
            folderOptions={folderOptions}
            tagSuggestions={tagSuggestions}
            tagPresetGroups={appPrefs.tagPresets}
            formatTime={formatTime}
          />
        )}

        {/* 兼容保留的独立歌曲弹窗 (备用) */}
        {showSongModal && (
          <SongRecognizeModal
            isOpen={showSongModal}
            video={video}
            videoElement={videoRef.current}
            onClose={() => setShowSongModal(false)}
            onSaveSong={async (metadata) => {
              setCurrentSongTitle(metadata.title);
              setCurrentSongArtist(metadata.artist);
              if (metadata.bpm) setBpm(metadata.bpm);
              await updateVideoSong(video.id, metadata.title, metadata.artist, metadata.bpm);
              showHud(`🎵 已绑定舞曲: 《${metadata.title}》`);
            }}
          />
        )}
      </div>

      {/* 底部悬浮流线型胶囊 HUD (Ultra-thin Floating Streamline Capsule HUD) */}
      <div
        className={`absolute bottom-3 left-1/2 -translate-x-1/2 z-30 w-[min(90%,72rem)] max-w-6xl flex flex-col items-center gap-1.5 transition-opacity duration-300 ${
          isHudVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onMouseEnter={() => setIsHoveringHud(true)}
        onMouseLeave={() => setIsHoveringHud(false)}
        data-testid="player-bottom-controls"
      >
        {/* 8 拍卡点动态指示灯组件 (M1 模块) */}
        {isMetronomeEnabled && (
          <div className="flex justify-center w-full max-md:scale-[0.68] max-md:origin-center">
            <BeatMetronome
              getTime={() => mediaClockRef.current?.currentTime() ?? videoRef.current?.currentTime ?? 0}
              currentTime={currentTime}
              isPlaying={isPlaying}
              playbackRate={playbackRate}
              bpm={bpm}
              offset={beatGrid?.offset ?? beatOffset}
              beats={beatGrid?.beats}
              isAudioTickEnabled={isAudioTickEnabled}
              onBpmChange={(newBpm) => {
                manualBpmRef.current = true;
                setBpm(newBpm);
                void updateVideoBeat(video.id, newBpm, beatOffset, []);
              }}
              onOffsetChange={(newOffset) => {
                manualBpmRef.current = true;
                setBeatOffset(newOffset);
                setBeatGrid((prev) => {
                  const base = prev ?? { bpm, offset: 0, beats: [] };
                  return saveBeatGrid(video.id, { ...base, offset: newOffset });
                });
                void updateVideoBeat(video.id, bpm, newOffset);
              }}
              onToggleAudioTick={() => setIsAudioTickEnabled((prev) => !prev)}
              onResetBeat={handleResetBeat}
              onClose={() => setIsMetronomeEnabled(false)}
            />
          </div>
        )}

        {/* 时间进度条与书签/AB标记点 */}
        <div className="w-full relative flex items-center group px-2">
          {/* AB 点区间高亮条 */}
          {abLoop.pointA !== null && duration > 0 && (
            <div
              className="absolute h-2 bg-emerald-500/40 rounded pointer-events-none z-10"
              style={{
                left: `${(abLoop.pointA / duration) * 100}%`,
                width: `${
                  (((abLoop.pointB ?? duration) - abLoop.pointA) / duration) * 100
                }%`,
              }}
            />
          )}

          {/* 留言位置标记：点一下跳到那个时刻 */}
          {duration > 0 && noteMarks.map((mark) => (
            <button
              key={mark.id}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleSeekAndPause(mark.timestamp);
              }}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 flex h-4 w-4 items-center justify-center cursor-pointer group/nm"
              style={{ left: `${Math.min(100, Math.max(0, (mark.timestamp / duration) * 100))}%` }}
              title={`${formatTime(mark.timestamp)} · ${mark.content}`}
              aria-label={`跳转到留言 ${formatTime(mark.timestamp)}`}
            >
              <span className="h-3.5 w-[3px] rounded-sm bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.7)] transition-transform group-hover/nm:scale-y-125" />
            </button>
          ))}

          {/* 时间回声位置点 */}
          {showTimeEcho && timeEcho?.timestamp !== undefined && duration > 0 && (
            <span
              className="absolute top-1/2 z-10 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-zinc-300/70 ring-2 ring-zinc-950/60 pointer-events-none"
              style={{ left: `${Math.min(100, Math.max(0, (timeEcho.timestamp / duration) * 100))}%` }}
              title={tr('时间回声')}
            />
          )}

          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.05}
            value={currentTime}
            onChange={(e) => handleSeek(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-white/15 rounded-lg appearance-none cursor-pointer accent-cyan-400 group-hover:h-2.5 transition-all"
          />
        </div>

        {/* 超薄悬浮流线型胶囊控制排 */}
        <div className="mx-auto flex w-full flex-wrap items-center justify-between gap-2 max-md:justify-center max-md:rounded-xl bg-space-void/90 border border-hairline backdrop-blur-xl px-3 py-1.5 text-neutral-300 shadow-[0_8px_32px_rgba(0,0,0,0.85)]">
          {/* 左侧：播放、时间、音量 */}
          <div className="flex items-center space-x-3">
            <button
              onClick={(event) => {
                event.stopPropagation();
                void togglePlay();
              }}
              id="btnPlayPause"
              aria-label={isPlaying ? t('player.pause') : t('player.play')}
              className="p-2 rounded-full bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-bold transition shadow-lg shadow-cyan-500/25 cursor-pointer"
              title={isPlaying ? t('player.pause') : t('player.play')}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>

            <button
              onClick={() => handleSeek(0)}
              className="p-1.5 hover:bg-white/10 rounded-lg transition cursor-pointer text-zinc-400 hover:text-white"
              title={t('player.restart')}
                aria-label={t('player.restart')}
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <div className="text-xs font-mono text-zinc-400">
              <span className="text-white font-medium">{formatTime(currentTime)}</span> /{' '}
              {formatTime(duration)}
            </div>

            {/* 时间回声小徽标：只在有旧记录时出现，不遮挡画面 */}
            {showTimeEcho && timeEcho && (
              <button
                type="button"
                id="timeEchoChip"
                onClick={() => {
                  if (timeEcho.timestamp !== undefined) {
                    handleSeekAndPause(timeEcho.timestamp);
                  }
                  setRightDrawerTab('notes');
                  setShowRightDrawer(true);
                  setShowTimeEcho(false);
                }}
                className="group/echo flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-zinc-400 transition hover:border-white/20 hover:text-zinc-200 cursor-pointer max-w-[22rem]"
                title={`${tr('时间回声')} ${timeEcho.timestamp !== undefined ? formatTimeShort(timeEcho.timestamp) : ''}：${timeEcho.content}`}
              >
                <Sparkles className="h-3 w-3 text-zinc-500 group-hover/echo:text-zinc-300" />
                <span className="font-mono text-zinc-500">
                  {timeEcho.timestamp !== undefined ? formatTimeShort(timeEcho.timestamp) : '--'}
                </span>
                <span className="truncate">{timeEcho.content}</span>
              </button>
            )}

            {/* 音量 */}
            <div className="flex items-center space-x-1.5">
              <button
                onClick={() => {
                  if (videoRef.current) {
                    videoRef.current.muted = !isMuted;
                    setIsMuted(!isMuted);
                  }
                }}
                className="hover:text-white cursor-pointer text-zinc-400"
                title={t('player.volume')}
                aria-label={t('player.volume')}
              >
                {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setVolume(val);
                  setIsMuted(val === 0);
                  if (videoRef.current) {
                    videoRef.current.volume = val;
                    videoRef.current.muted = false;
                  }
                }}
                className="w-14 h-1 bg-white/20 rounded accent-cyan-400 cursor-pointer"
              />
            </div>
          </div>

          {/* 中间：舞蹈特色功能区（镜像、AB循环、倍速） */}
          <div className="flex items-center space-x-2 bg-white/5 px-2.5 py-1 rounded-full border border-white/5">
            {/* 1. 镜像翻转按钮 */}
            <button
              onClick={toggleMirror}
              id="btnMirror"
              className={`flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-medium transition cursor-pointer ${
                isMirrored
                  ? 'bg-amber-500 text-neutral-950 font-bold shadow-md shadow-amber-500/20'
                  : 'hover:bg-white/10 text-neutral-300'
              }`}
              title={tr('舞蹈镜面翻转 (快捷键 M)')}
            >
              <FlipHorizontal className="w-3 h-3" />
              <span>{tr('镜像 (M)')}</span>
            </button>

            <div className="w-[1px] h-3.5 bg-white/10" />

            {/* 2. AB 点循环控制 */}
            <div className="flex items-center space-x-1">
              <button
                onClick={handleSetA}
                className={`px-1.5 py-0.5 rounded text-xs font-mono font-bold transition cursor-pointer ${
                  abLoop.pointA !== null
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'hover:bg-white/10 text-zinc-400'
                }`}
                title={tr('设置起点 A (快捷键 [ )')}
              >
                A: {abLoop.pointA !== null ? formatTime(abLoop.pointA) : '--'}
              </button>

              <button
                onClick={handleSetB}
                className={`px-1.5 py-0.5 rounded text-xs font-mono font-bold transition cursor-pointer ${
                  abLoop.pointB !== null
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'hover:bg-white/10 text-zinc-400'
                }`}
                title={tr('设置终点 B (快捷键 ] )')}
              >
                B: {abLoop.pointB !== null ? formatTime(abLoop.pointB) : '--'}
              </button>

              <button
                onClick={toggleABLoop}
                className={`p-1 rounded transition cursor-pointer ${
                  abLoop.enabled
                    ? 'bg-emerald-500 text-neutral-950 font-bold shadow'
                    : 'text-neutral-400 hover:bg-white/10'
                }`}
                title={tr('开关 AB 循环 (快捷键 \\)')}
              >
                <Repeat className="w-3 h-3" />
              </button>

              {(abLoop.pointA !== null || abLoop.pointB !== null) && (
                <button
                  onClick={clearABLoop}
                  className="px-1 py-0.5 text-xs text-neutral-500 hover:text-red-400 cursor-pointer"
                  title={t('player.clearAB')}
                >
                  ✕
                </button>
              )}
            </div>

            <div className="w-[1px] h-3.5 bg-white/10" />

            {/* 3. 0.25x ~ 2.0x 精细慢放 */}
            <div className="flex items-center space-x-1">
              <Gauge className="w-3 h-3 text-neutral-400" />
              <div className="flex space-x-0.5">
                {[0.5, 0.75, 1.0, 1.25, 1.5].map((rate) => (
                  <button
                    key={rate}
                    onClick={() => setPlaybackRate(rate)}
                    className={`px-1.5 py-0.5 rounded text-xs transition cursor-pointer ${
                      playbackRate === rate
                        ? 'bg-cyan-500 text-zinc-950 font-bold'
                        : 'text-neutral-400 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 右侧：全屏 */}
          <div className="flex items-center space-x-1">
            <button
              onClick={toggleFullscreen}
              className="p-1.5 hover:bg-white/10 rounded-lg transition cursor-pointer text-zinc-400 hover:text-white"
              title={t('player.fullscreen')}
              aria-label={t('player.fullscreen')}
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
