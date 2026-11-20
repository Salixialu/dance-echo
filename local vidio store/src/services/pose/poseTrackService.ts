import { db, type DBPoseTrackRecord } from '../db';
import { PoseDetectorService } from './pose-detector';

const detector = PoseDetectorService.getInstance();

/**
 * 骨骼索引服务（离线扫描 + 播放期查表）
 *
 * 现状是「播放时逐帧推理」：暂停、拖动进度条、AB 循环跳帧那一瞬间完全依赖推理实时出结果，
 * 推理慢于播放或跳帧时骨架会短暂缺失、与画面错位。这里改成「先扫一遍存成时间序列，播放时查表」：
 * - 扫描：按固定 fps 逐帧 seek + 推理，结果落 IndexedDB
 * - 播放：按 currentTime 二分定位相邻两帧并线性插值，暂停 / 拖动也能立刻画出正确骨架
 * - 没有索引或扫描失败时自动回退实时推理，不影响可用性
 *
 * 坐标统一用 MediaPipe 的归一化坐标（x/y ∈ 0~1，z 以画面宽度为单位），world 为米制。
 */

export const POSE_TRACK_FPS = 24;
export const POSE_TRACK_VERSION = 1;
const LANDMARK_FLOATS = 33 * 4;
const WORLD_FLOATS = 33 * 3;
const FLOATS_PER_FRAME = LANDMARK_FLOATS + WORLD_FLOATS;

export interface PosePoint {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface PoseFrame {
  points: PosePoint[];
  world: { x: number; y: number; z: number }[];
}

export interface PoseTrack {
  videoKey: string;
  fps: number;
  duration: number;
  frameCount: number;
  frames: PoseFrame[];
}

interface ScanOptions {
  videoKey: string;
  video: HTMLVideoElement;
  fps?: number;
  onProgress?: (ratio: number, scanned: number, total: number) => void;
  signal?: { cancelled: boolean };
}

function waitSeeked(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener('seeked', finish);
      resolve();
    };
    video.addEventListener('seeked', finish, { once: true });
    // 已经停在目标时间时不会再派发 seeked，兜底
    window.setTimeout(finish, 600);
  });
}

/** 把整段视频扫成骨骼时间序列（会临时 seek，结束后恢复播放位置与播放状态） */
export async function scanPoseTrack({
  videoKey,
  video,
  fps = POSE_TRACK_FPS,
  onProgress,
  signal,
}: ScanOptions): Promise<PoseTrack | null> {
  if (!video.videoWidth || !video.videoHeight || !Number.isFinite(video.duration)) return null;
  if (!detector.isReady) await detector.init();
  if (!detector.isReady) return null;

  const duration = video.duration;
  const step = 1 / fps;
  const total = Math.max(1, Math.floor(duration * fps));
  const restoreTime = video.currentTime;
  const wasPaused = video.paused;
  video.pause();

  const frames: PoseFrame[] = [];
  let last: PoseFrame | null = null;

  try {
    for (let i = 0; i < total; i++) {
      if (signal?.cancelled) return null;
      const t = Math.min(duration - 0.001, i * step);
      if (Math.abs(video.currentTime - t) > 0.004) {
        video.currentTime = t;
        await waitSeeked(video);
      }
      const result = detector.detectVideoFrame(video, Math.round(t * 1000));
      const landmarks = result?.landmarks?.[0];
      if (landmarks && landmarks.length >= 33) {
        const points: PosePoint[] = landmarks.map((p: { x: number; y: number; z?: number; visibility?: number }) => ({
          x: p.x,
          y: p.y,
          z: p.z ?? 0,
          visibility: p.visibility ?? 1,
        }));
        const world = (result?.worldLandmarks?.[0] || []).map((p: { x: number; y: number; z?: number }) => ({
          x: p.x,
          y: p.y,
          z: p.z ?? 0,
        }));
        last = { points, world };
        frames.push(last);
      } else if (last) {
        // 漏检帧沿用上一帧，避免索引出现空洞让播放期闪断
        frames.push(last);
      } else {
        frames.push({ points: [], world: [] });
      }
      onProgress?.((i + 1) / total, i + 1, total);
    }
  } finally {
    if (wasPaused) {
      video.currentTime = restoreTime;
    } else {
      video.play().catch(() => undefined);
    }
  }

  const filled = frames.filter((frame) => frame.points.length >= 33).length;
  // 绝大多数帧都拿不到人 → 说明这次扫描是无效的（视频未解码 / 模型被别处占用），
  // 宁可返回 null 让上层不落库，也不要覆盖掉已有索引。
  if (!frames.length || filled < frames.length * 0.3) return null;
  return { videoKey, fps, duration, frameCount: frames.length, frames };
}

export async function persistPoseTrack(track: PoseTrack): Promise<void> {
  const data = new Array(track.frameCount * FLOATS_PER_FRAME).fill(0);
  for (let f = 0; f < track.frameCount; f++) {
    const frame = track.frames[f];
    if (!frame) continue;
    for (let p = 0; p < 33; p++) {
      const base = f * FLOATS_PER_FRAME + p * 4;
      const point = frame.points[p];
      if (point) {
        data[base] = point.x;
        data[base + 1] = point.y;
        data[base + 2] = point.z;
        data[base + 3] = point.visibility;
      }
      const wBase = f * FLOATS_PER_FRAME + LANDMARK_FLOATS + p * 3;
      const world = frame.world[p];
      if (world) {
        data[wBase] = world.x;
        data[wBase + 1] = world.y;
        data[wBase + 2] = world.z;
      }
    }
  }
  const record: DBPoseTrackRecord = {
    videoKey: track.videoKey,
    version: POSE_TRACK_VERSION,
    fps: track.fps,
    duration: track.duration,
    width: 0,
    height: 0,
    frameCount: track.frameCount,
    updatedAt: Date.now(),
    data,
  };
  await db.poseTracks.put(record);
}

export async function loadPoseTrack(videoKey: string): Promise<PoseTrack | null> {
  const record = await db.poseTracks.get(videoKey);
  // 旧版本索引（例如 12fps 时代扫的）直接判废，让用户重新扫描
  if (!record || record.version !== POSE_TRACK_VERSION) return null;
  const frames: PoseFrame[] = [];
  for (let f = 0; f < record.frameCount; f++) {
    const points: PosePoint[] = [];
    const world: { x: number; y: number; z: number }[] = [];
    for (let p = 0; p < 33; p++) {
      const base = f * FLOATS_PER_FRAME + p * 4;
      points.push({
        x: record.data[base] ?? 0,
        y: record.data[base + 1] ?? 0,
        z: record.data[base + 2] ?? 0,
        visibility: record.data[base + 3] ?? 0,
      });
      const wBase = f * FLOATS_PER_FRAME + LANDMARK_FLOATS + p * 3;
      world.push({
        x: record.data[wBase] ?? 0,
        y: record.data[wBase + 1] ?? 0,
        z: record.data[wBase + 2] ?? 0,
      });
    }
    frames.push({ points, world });
  }
  return {
    videoKey: record.videoKey,
    fps: record.fps,
    duration: record.duration,
    frameCount: record.frameCount,
    frames,
  };
}

export async function deletePoseTrack(videoKey: string): Promise<void> {
  await db.poseTracks.delete(videoKey);
}

/** 按时间取帧（相邻帧线性插值），越界时钳制到首/尾帧 */
export function samplePoseTrack(track: PoseTrack, timeSec: number): PoseFrame | null {
  if (!track.frames.length) return null;
  const pos = Math.max(0, Math.min(track.frameCount - 1, timeSec * track.fps));
  const i = Math.floor(pos);
  const frac = pos - i;
  const a = track.frames[i];
  const b = track.frames[Math.min(track.frameCount - 1, i + 1)] ?? a;
  if (!a || !a.points.length) return b && b.points.length ? b : null;
  if (!b || frac < 0.001) return a;
  const points: PosePoint[] = a.points.map((pa, idx) => {
    const pb = b.points[idx] ?? pa;
    return {
      x: pa.x + (pb.x - pa.x) * frac,
      y: pa.y + (pb.y - pa.y) * frac,
      z: pa.z + (pb.z - pa.z) * frac,
      visibility: pa.visibility + (pb.visibility - pa.visibility) * frac,
    };
  });
  const world = a.world.map((wa, idx) => {
    const wb = b.world[idx] ?? wa;
    return {
      x: wa.x + (wb.x - wa.x) * frac,
      y: wa.y + (wb.y - wa.y) * frac,
      z: wa.z + (wb.z - wa.z) * frac,
    };
  });
  return { points, world };
}
