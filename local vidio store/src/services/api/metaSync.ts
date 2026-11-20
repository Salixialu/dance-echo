/**
 * metaSync — 把本地 UI 操作同步到 DanceEcho Server
 *
 * 过渡策略（批次 B）：Dexie 仍作为本地缓存与离线兜底，服务端作为权威副本。
 * 每次写本地记录后调用 pushMeta，失败只记录日志，不打断交互。
 */
import { api, type ServerMeta } from './client';

export type MetaPatch = Partial<
  Pick<
    ServerMeta,
    | 'tags'
    | 'rating'
    | 'progress'
    | 'playCount'
    | 'lastPlayedAt'
    | 'note'
    | 'bpm'
    | 'beatOffset'
    | 'songTitle'
    | 'songArtist'
    | 'category'
    | 'title'
  >
>;

const warnings = new Set<string>();

export function pushMeta(serverId: string | undefined, patch: MetaPatch): void {
  if (!serverId) return; // 未登记到服务端的旧条目跳过
  void api
    .patchVideo(serverId, patch)
    .then(() => {
      // 同步恢复后清掉告警标记，下次失败仍会提示
      warnings.delete(serverId);
    })
    .catch((error: unknown) => {
      if (!warnings.has(serverId)) {
        warnings.add(serverId);
        console.warn('[DanceEcho] 元数据同步到服务端失败（本地已保存）:', serverId, error);
      }
    });
}
