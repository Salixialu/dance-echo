import Dexie, { type Table } from 'dexie';
import type { VideoItem, VideoObservation, DailyPracticeLog } from '../types';

export interface DBVideoRecord {
  id: string;
  /** 服务端媒体库 id；有值时视频本体来自服务端 /stream，不存浏览器副本 */
  serverId?: string;
  name: string;
  /** 显示标题；不改磁盘文件名，服务端 meta.title 同步 */
  title?: string;
  path?: string;
  size: number;
  lastModified: number;
  duration: number;
  width: number;
  height: number;
  thumbnailBase64?: string;
  blob?: Blob;
  tags: string[];
  category?: string;
  rating?: number;
  playCount: number;
  lastPlayedAt?: number;
  playbackPosition?: number;
  bpm?: number;
  beatOffset?: number;
  beats?: number[];
  songTitle?: string;
  songArtist?: string;
}

export interface DBFolderRecord {
  id: string;
  name: string;
  path: string;
  parentPath: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * 骨骼索引：把整段视频按固定帧率离线跑一遍姿态识别，存成时间序列。
 * 播放时只需按 currentTime 查表，不再逐帧推理 —— 拖动进度条/暂停也能立刻拿到正确的骨架。
 * data 是扁平化的 Float32 序列，每帧 33 个点 × 4 个数（x, y, z, visibility），单位为视频像素坐标。
 */
export interface DBPoseTrackRecord {
  videoKey: string;
  /** 索引格式版本：扫描参数（fps/坐标口径）变化时自增，旧索引自动判废 */
  version: number;
  fps: number;
  duration: number;
  width: number;
  height: number;
  frameCount: number;
  updatedAt: number;
  data: number[];
}

export class LocalVideoDatabase extends Dexie {
  videos!: Table<DBVideoRecord, string>;
  folders!: Table<DBFolderRecord, string>;
  observations!: Table<VideoObservation, string>;
  practiceLogs!: Table<DailyPracticeLog, string>;
  poseTracks!: Table<DBPoseTrackRecord, string>;

  constructor() {
    super('DanceEcho_VideoStore');
    this.version(1).stores({
      videos: 'id, name, duration, *tags, category, rating, lastModified, lastPlayedAt'
    });
    this.version(2).stores({
      videos: 'id, name, duration, *tags, category, rating, lastModified, lastPlayedAt, path',
      folders: 'id, path, parentPath, updatedAt',
    });
    this.version(3).stores({
      videos: 'id, name, duration, *tags, category, rating, lastModified, lastPlayedAt, path',
      folders: 'id, path, parentPath, updatedAt',
      observations: 'id, videoId, timestamp, createdAt',
      practiceLogs: 'date, durationSeconds, lastUpdatedAt',
    });
    this.version(4).stores({
      videos: 'id, name, duration, *tags, category, rating, lastModified, lastPlayedAt, path',
      folders: 'id, path, parentPath, updatedAt',
      observations: 'id, videoId, timestamp, createdAt',
      practiceLogs: 'date, durationSeconds, lastUpdatedAt',
      poseTracks: 'videoKey, updatedAt',
    });
  }
}

export const db = new LocalVideoDatabase();
