const configuredOrigin = (import.meta.env.VITE_DANCE_ECHO_SERVER_URL as string | undefined)?.trim();

/** DanceEcho Server origin. Keep this overrideable for LAN/packaged deployments. */
export const DANCE_ECHO_SERVER_ORIGIN = (configuredOrigin || 'http://127.0.0.1:8090').replace(/\/$/, '');

export function videoStreamUrl(videoId: string): string {
  return `${DANCE_ECHO_SERVER_ORIGIN}/stream/${encodeURIComponent(videoId)}`;
}

export function videoThumbUrl(videoId: string): string {
  return `${DANCE_ECHO_SERVER_ORIGIN}/thumb/${encodeURIComponent(videoId)}`;
}

/** 服务端按需转好的 H.264 副本（浏览器不支持 HEVC 时使用）。 */
export function videoTranscodeUrl(videoId: string): string {
  return `${DANCE_ECHO_SERVER_ORIGIN}/transcode/${encodeURIComponent(videoId)}`;
}

/**
 * 解析播放地址：优先使用服务端 id（导入时由 /api/v1/upload 返回），
 * 其次回退到本地记录 id —— 目录挂载等旧数据因此仍可播放。
 */
export function resolveVideoStreamUrl(video: { id: string; serverId?: string }): string {
  return videoStreamUrl(video.serverId ?? video.id);
}
