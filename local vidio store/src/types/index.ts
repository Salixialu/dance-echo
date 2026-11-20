// 视频留言 / 练习心得（多条，可关联某个时刻）
export interface VideoObservation {
  id: string;
  videoId: string;
  timestamp?: number; // 关联的视频秒数 (可选，有则可点击跳转该帧)
  content: string; // 舞者的感受文字 (如"重心回收太慢")
  tag?: string; // 归类 (例如"发力感"、"节奏"、"灵感"、"困惑")
  createdAt: number;
  /** 服务端观察记录 id（同步成功后回写，离线时为空） */
  serverId?: string;
}

// 每日练习日志记录 (P2 热力图与统计)
export interface DailyPracticeLog {
  date: string; // YYYY-MM-DD
  durationSeconds: number; // 当天累计练舞/观看时长
  videoCount: number; // 当天练过的视频数
  observationCount: number; // 当天写下的心得数
  lastUpdatedAt: number;
}

// AB 区间循环配置
export interface ABLoopState {
  enabled: boolean;
  pointA: number | null; // 起始秒
  pointB: number | null; // 结束秒
}

// 音乐节拍与 BPM 测算数据 (M1 模块)
export interface BeatInfo {
  bpm: number; // 每分钟节拍数 (如 128)
  offset: number; // 首拍起始偏移秒数 (如 0.35s)
  confidence?: number; // 算法置信度 0~1
  beats?: number[]; // 逐拍时间戳（秒），比 bpm+offset 的等分网格更贴合真实鼓点
}

// 视频元数据与实体
export interface VideoItem {
  id: string; // 唯一哈希或自增标识
  name: string; // 文件名
  /** 用户设置的显示标题；不改磁盘文件名，空值回退到 name */
  title?: string;
  path?: string; // 虚拟路径/相对路径
  size: number;
  lastModified: number;
  duration: number; // 秒
  width: number;
  height: number;
  thumbnailUrl?: string; // Base64 或 Blob URL
  tags: string[];
  category?: string;
  rating?: number; // 1-5 星级
  playCount?: number;
  lastPlayedAt?: number;
  playbackPosition?: number; // 上次播放进度（秒，用于记忆续播）
  // 音乐与歌曲联动字段
  bpm?: number;
  beatOffset?: number;
  beats?: number[];
  songTitle?: string;
  songArtist?: string;
  // 保持与 FileSystemFileHandle 关联或内存 File（仅过渡期目录挂载使用）
  handle?: FileSystemFileHandle;
  file?: File;
  /** DanceEcho Server 侧视频 id（sha1(relPath) 前 16 位）：播放、缩略图与元数据都以它为准 */
  serverId?: string;
}

// 文件夹分组
export interface DirectoryFolder {
  id: string;
  name: string;
  videoCount: number;
}

// 播放模式与快捷键
export interface PlaybackSettings {
  playbackRate: number; // 0.25 - 2.0
  isMirrored: boolean; // 左右镜像翻转
  abLoop: ABLoopState;
  volume: number;
}
