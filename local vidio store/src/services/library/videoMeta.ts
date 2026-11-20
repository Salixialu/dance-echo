/**
 * videoMeta — 视频元数据写入的唯一接缝。
 *
 * 背景：过去每个动作都手写「改 store → db.videos.update → pushMeta」，
 * 字段改名（playbackPosition ↔ progress）、bookmark 结构转换、服务端失败提示
 * 各写一遍，新增字段容易只写本地忘了服务端。
 *
 * 现在：调用方先做乐观 set，再把**本地字段**交给 commit；
 * 本模块用一张强类型映射表推导服务端 patch。
 *
 * 注意：`beats` 不在 LocalMetaField 里——它属于 beatGridStore 的本地网格，
 * 服务端没有对应字段，故意从类型层面挡在接缝之外。
 */
import type { DBVideoRecord } from '../db';
import type { MetaPatch } from '../api/metaSync';

export type LocalMetaField =
  | 'tags'
  | 'title'
  | 'rating'
  | 'playbackPosition'
  | 'bpm'
  | 'beatOffset'
  | 'songTitle'
  | 'songArtist'
  | 'playCount'
  | 'lastPlayedAt'
  | 'category';

export type LocalMetaPatch = Partial<Pick<DBVideoRecord, LocalMetaField>>;

/**
 * 本地字段 → 服务端字段。Record<LocalMetaField, …> 保证新增本地字段时
 * 这里编译失败，而不是在运行时被静默丢掉。
 */
const FIELD_TO_SERVER: Record<LocalMetaField, keyof MetaPatch> = {
  tags: 'tags',
  title: 'title',
  rating: 'rating',
  playbackPosition: 'progress',
  bpm: 'bpm',
  beatOffset: 'beatOffset',
  songTitle: 'songTitle',
  songArtist: 'songArtist',
  playCount: 'playCount',
  lastPlayedAt: 'lastPlayedAt',
  category: 'category',
};

/** 纯函数：把本地字段 patch 翻译成服务端 patch；空 patch 返回 null。 */
export function planMetaCommit(patch: LocalMetaPatch): MetaPatch | null {
  const server: Partial<Record<keyof MetaPatch, unknown>> = {};
  for (const [field, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const key = FIELD_TO_SERVER[field as LocalMetaField];
    if (!key) continue; // 类型不允许，只有外部强转才会到这里
    server[key] = value;
  }
  return Object.keys(server).length > 0 ? (server as MetaPatch) : null;
}

/** 直接推送服务端 patch 的副作用端口（store 注入，测试可替换）。 */
export interface MetaCommitPorts {
  writeLocal(videoId: string, patch: LocalMetaPatch): Promise<unknown>;
  serverIdOf(videoId: string): string | undefined;
  pushServer(serverId: string, patch: MetaPatch): void;
}

export interface MetaCommitResult {
  /** 本地写入或推送抛错的 videoId；空数组表示全部成功 */
  failed: string[];
}

export interface MetaCommitter {
  /** 写本地缓存，并在有 serverId 时把映射后的 patch 推给服务端。 */
  commit(videoId: string, patch: LocalMetaPatch): Promise<void>;
  /**
   * 批量提交（同一 patch，或按 id 计算）。
   *
   * 尽力而为：单条失败不会中断其余视频，也不会让调用方的乐观 set 被跳过；
   * 失败 id 通过返回值交给调用方决定是否提示。
   */
  commitMany(
    videoIds: string[],
    patchFor: LocalMetaPatch | ((videoId: string) => LocalMetaPatch),
  ): Promise<MetaCommitResult>;
}

export function createMetaCommitter(ports: MetaCommitPorts): MetaCommitter {
  const commit = async (videoId: string, patch: LocalMetaPatch): Promise<void> => {
    await ports.writeLocal(videoId, patch);
    const server = planMetaCommit(patch);
    if (!server) return;
    const serverId = ports.serverIdOf(videoId);
    if (!serverId) return;
    ports.pushServer(serverId, server);
  };

  return {
    commit,
    async commitMany(videoIds, patchFor) {
      const failed: string[] = [];
      for (const videoId of videoIds) {
        const patch = typeof patchFor === 'function' ? patchFor(videoId) : patchFor;
        try {
          await commit(videoId, patch);
        } catch (error) {
          failed.push(videoId);
          console.warn('[DanceEcho] 元数据写入失败（已跳过该视频）:', videoId, error);
        }
      }
      return { failed };
    },
  };
}
