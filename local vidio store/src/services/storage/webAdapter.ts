import type { VideoItem } from '../../types';
import { extractVideoMetaAndThumbnail } from '../thumbnail';
import { db } from '../db';
import { songService } from '../music/songService';
import { api } from '../api/client';
import { videoThumbUrl } from '../api/serverUrl';

/**
 * 必须与 DanceEcho Server 的 VIDEO_EXTENSIONS_UPLOAD 保持一致：
 * 服务端接受的格式，客户端不能静默过滤掉，否则用户选中后没有任何反馈。
 */
export const SUPPORTED_VIDEO_EXTENSIONS = ['.mp4', '.m4v', '.mov', '.mkv', '.webm', '.ogg', '.avi'];

export class WebStorageAdapter {
  static isSupportedVideo(name: string): boolean {
    const lowerName = name.toLowerCase();
    return SUPPORTED_VIDEO_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
  }
  /**
   * 检查浏览器是否原生支持 File System Access API
   */
  static isFileSystemAccessSupported(): boolean {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  }

  /**
   * 扫描指定目录句柄下的所有视频文件
   */
  static async scanDirectory(
    dirHandle: FileSystemDirectoryHandle,
    onProgress?: (scanned: number, currentName: string) => void
  ): Promise<VideoItem[]> {
    const videoFiles: { handle: FileSystemFileHandle; file: File; path: string }[] = [];

    async function traverse(currentDir: FileSystemDirectoryHandle, currentPath: string = '') {
      for await (const entry of (currentDir as any).values()) {
        if (entry.kind === 'file') {
          if (WebStorageAdapter.isSupportedVideo(entry.name)) {
            const file = await entry.getFile();
            videoFiles.push({
              handle: entry,
              file,
              path: currentPath ? `${currentPath}/${entry.name}` : entry.name,
            });
          }
        } else if (entry.kind === 'directory') {
          await traverse(entry, currentPath ? `${currentPath}/${entry.name}` : entry.name);
        }
      }
    }

    await traverse(dirHandle);

    const results: VideoItem[] = [];
    let count = 0;

    for (const item of videoFiles) {
      count++;
      if (onProgress) {
        onProgress(count, item.file.name);
      }

      // 生成确定性 ID (根据文件名 + 大小 + 修改时间)
      const id = `${item.file.name}-${item.file.size}-${item.file.lastModified}`;

      // 先查本地 DB 是否已有元数据缓存，有的话秒级复用
      const cached = await db.videos.get(id);

      // 目录挂载改为登记到服务端：只有服务端有索引的视频才能 Range 播放
      let serverId: string | undefined;
      try {
        const uploaded = await api.upload(item.file);
        serverId = uploaded.uploaded.id;
      } catch (uploadError) {
        console.warn('[DanceEcho] 目录挂载上传失败:', item.file.name, uploadError);
        continue;
      }

      if (cached) {
        results.push({
          id,
          serverId,
          name: cached.name,
          path: item.path,
          size: item.file.size,
          lastModified: item.file.lastModified,
          duration: cached.duration,
          width: cached.width,
          height: cached.height,
          thumbnailUrl: videoThumbUrl(serverId),
          tags: cached.tags || [],
          category: cached.category || '全部视频',
          rating: cached.rating || 0,
          playCount: cached.playCount || 0,
          bpm: cached.bpm,
          beatOffset: cached.beatOffset,
          songTitle: cached.songTitle,
          songArtist: cached.songArtist,
          handle: item.handle,
        });
        // 历史版本可能存过 Blob：清理掉，避免浏览器继续占用双份空间
        if (cached.blob) {
          await db.videos.update(id, { blob: undefined });
        }
      } else {
        // 首次导入：自动分析曲目与意图，Canvas 离线截帧生成封面与时长
        try {
          const meta = await extractVideoMetaAndThumbnail(item.file);

          // 默认不自动打标签、不自动识别歌曲：标签与曲目由用户手动填写
          let songTitle: string | undefined = undefined;
          let songArtist: string | undefined = undefined;
          let bpm: number | undefined = undefined;
          const inferredTags: string[] = [];

          if (serverId && meta.thumbnailBase64) {
            api.uploadThumb(serverId, meta.thumbnailBase64).catch((err) => {
              console.warn('[DanceEcho] 封面上传失败:', item.file.name, err);
            });
          }

          const newItem: VideoItem = {
            id,
            serverId,
            name: item.file.name,
            path: item.path,
            size: item.file.size,
            lastModified: item.file.lastModified,
            duration: meta.duration,
            width: meta.width,
            height: meta.height,
            thumbnailUrl: videoThumbUrl(serverId),
            tags: inferredTags,
            category: '本地文件夹',
            rating: 0,
            playCount: 0,
            bpm,
            songTitle,
            songArtist,
            handle: item.handle,
            file: item.file,
          };

          // 写入本地数据库：只存元数据，视频本体留在服务端媒体目录
          await db.videos.put({
            id: newItem.id,
            name: newItem.name,
            path: newItem.path,
            size: newItem.size,
            lastModified: newItem.lastModified,
            duration: newItem.duration,
            width: newItem.width,
            height: newItem.height,
            tags: newItem.tags,
            category: newItem.category,
            rating: newItem.rating,
            playCount: 0,
            bpm,
            songTitle,
            songArtist,
          });

          results.push(newItem);
        } catch (err) {
          console.warn('提取缩略图失败，使用默认信息:', item.file.name, err);
          results.push({
            id,
            name: item.file.name,
            path: item.path,
            size: item.file.size,
            lastModified: item.file.lastModified,
            duration: 0,
            width: 1920,
            height: 1080,
            tags: ['未分类'],
            handle: item.handle,
            file: item.file,
          });
        }
      }
    }

    return results;
  }
}
