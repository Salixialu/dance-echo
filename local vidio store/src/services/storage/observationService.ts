import { db } from '../db';
import type { VideoObservation } from '../../types';
import { api } from '../api/client';
import { resolveServerId } from '../api/idMap';

/**
 * 舞者感受留言与观察笔记服务层 (P1 模块)
 * 负责单视频下带时间戳心得的 IndexedDB 增删查改及回声检索
 */
export const observationService = {
  /**
   * 新增一条观察心得
   * @param videoId 视频 ID
   * @param content 舞者心得感受文字
   * @param timestamp 关联的视频秒数 (可选)
   * @param tag 心得标签分类 (如 发力点 / 节奏 / 重心 / 待攻克 等)
   */
  async addObservation(
    videoId: string,
    content: string,
    timestamp?: number,
    tag?: string
  ): Promise<VideoObservation> {
    const trimmedContent = content.trim();
    if (!trimmedContent) {
      throw new Error('心得内容不能为空');
    }

    const observation: VideoObservation = {
      id: `obs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      videoId,
      content: trimmedContent,
      timestamp:
        typeof timestamp === 'number' && !isNaN(timestamp)
          ? Math.max(0, parseFloat(timestamp.toFixed(2)))
          : undefined,
      tag: tag?.trim() || undefined,
      createdAt: Date.now(),
    };

    await db.observations.put(observation);

    // 同步到 DanceEcho Server（服务端为权威副本）；本地 id 保持不变，
    // 只回写 serverId，避免 delete+put 触发 Dexie creating hook 导致计数翻倍。
    const serverVideoId = resolveServerId(videoId);
    if (serverVideoId) {
      try {
        const saved = await api.addObservation(serverVideoId, {
          time: observation.timestamp ?? 0,
          text: observation.content,
          kind: observation.tag ?? 'note',
        });
        observation.serverId = saved.observation.id;
        await db.observations.update(observation.id, { serverId: saved.observation.id });
      } catch (error) {
        console.warn('[DanceEcho] 观察记录同步失败（本地已保存）:', error);
      }
    }

    return observation;
  },

  /**
   * 获取指定视频下的所有观察心得
   * 优先按时间轴秒数 (timestamp) 升序排列，未指定时间戳的置于后部按创建时间倒序
   * @param videoId 视频 ID
   */
  async getObservationsByVideo(videoId: string): Promise<VideoObservation[]> {
    const items = await db.observations.where('videoId').equals(videoId).toArray();
    
    return items.sort((a, b) => {
      // 若两者都有时间戳，按时间戳升序
      if (a.timestamp !== undefined && b.timestamp !== undefined) {
        return a.timestamp - b.timestamp;
      }
      // 有时间戳的排在前面
      if (a.timestamp !== undefined) return -1;
      if (b.timestamp !== undefined) return 1;
      // 都没有时间戳的按创建时间倒序
      return b.createdAt - a.createdAt;
    });
  },

  /**
   * 删除一条心得
   * @param id 心得 ID
   */
  async deleteObservation(id: string): Promise<void> {
    const local = await db.observations.get(id);
    await db.observations.delete(id);
    const serverVideoId = local ? resolveServerId(local.videoId) : undefined;
    if (serverVideoId) {
      try {
        await api.deleteObservation(serverVideoId, local?.serverId ?? id);
      } catch (error) {
        console.warn('[DanceEcho] 删除观察记录未同步到服务端:', error);
      }
    }
  },

  /**
   * 更新一条心得
   */
  async updateObservation(
    id: string,
    updates: Partial<Pick<VideoObservation, 'content' | 'timestamp' | 'tag'>>
  ): Promise<void> {
    await db.observations.update(id, updates);
    const local = await db.observations.get(id);
    const serverVideoId = local ? resolveServerId(local.videoId) : undefined;
    if (serverVideoId && local) {
      try {
        await api.updateObservation(serverVideoId, local.serverId ?? id, {
          ...(updates.content !== undefined ? { text: updates.content } : {}),
          ...(updates.timestamp !== undefined ? { time: updates.timestamp } : {}),
          ...(updates.tag !== undefined ? { kind: updates.tag } : {}),
        });
      } catch (error) {
        console.warn('[DanceEcho] 更新观察记录未同步到服务端:', error);
      }
    }
  },

  /**
   * 获取某个视频最近留下的那条“时间回声 (Time Echo)”
   * 用于重新打开视频时在顶部轻量唤醒复习
   * @param videoId 视频 ID
   */
  async getLatestEcho(videoId: string): Promise<VideoObservation | null> {
    const items = await db.observations.where('videoId').equals(videoId).toArray();
    if (!items || items.length === 0) {
      return null;
    }
    // 按创建时间倒序排第一条
    items.sort((a, b) => b.createdAt - a.createdAt);
    return items[0];
  },

  /**
   * 获取指定视频的心得总数
   */
  async getObservationCount(videoId: string): Promise<number> {
    return await db.observations.where('videoId').equals(videoId).count();
  },

  /**
   * 获取所有观察心得 (可用于全局回声漫游)
   */
  async getAllObservations(): Promise<VideoObservation[]> {
    return await db.observations.orderBy('createdAt').reverse().toArray();
  },

  /**
   * 按视频统计留言条数（列表与侧栏只读这份计数，避免逐条查询）
   */
  async getNoteCounts(): Promise<Record<string, number>> {
    const items = await db.observations.toArray();
    const counts: Record<string, number> = {};
    for (const item of items) {
      counts[item.videoId] = (counts[item.videoId] ?? 0) + 1;
    }
    return counts;
  },
};
