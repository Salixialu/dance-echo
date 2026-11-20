/**
 * 基于 Canvas 和 HTML5 Video 在浏览器内离线提取视频封面与真实元数据
 */
export interface VideoMetadataResult {
  duration: number;
  width: number;
  height: number;
  thumbnailBase64: string;
}

export async function extractVideoMetaAndThumbnail(
  fileOrBlob: Blob | File,
  seekTimeSec: number = 2.0
): Promise<VideoMetadataResult> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(fileOrBlob);
    video.src = url;

    let duration = 0;
    let width = 0;
    let height = 0;

    video.onloadedmetadata = () => {
      duration = video.duration || 0;
      width = video.videoWidth || 640;
      height = video.videoHeight || 360;

      // 选择安全的截帧时间点 (防止视频小于2秒时黑屏)
      const targetTime = duration > 0 ? Math.min(seekTimeSec, duration * 0.25) : 0;
      video.currentTime = targetTime;
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        // 等比例压缩缩略图宽度为 400px，既清晰又节省 IndexedDB 体积
        const targetWidth = 400;
        const targetHeight = Math.round((height / width) * targetWidth) || 225;

        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
          const thumbnailBase64 = canvas.toDataURL('image/jpeg', 0.82);
          URL.revokeObjectURL(url);
          resolve({
            duration,
            width,
            height,
            thumbnailBase64,
          });
        } else {
          URL.revokeObjectURL(url);
          reject(new Error('Canvas context not available'));
        }
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };

    video.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load video file for thumbnail: ' + e));
    };
  });
}
