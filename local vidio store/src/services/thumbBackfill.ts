/**
 * 封面补全：服务端没装 ffmpeg 时，/thumb 会 404。
 * 这里用浏览器对可见卡片做抽帧，POST /thumb/:id 回服务端，
 * 之后任意设备都能直接拿到封面；并发 2，避免一次性拖垮 1400 个文件的网格。
 */
import { api } from './api/client';
import { DANCE_ECHO_SERVER_ORIGIN, videoThumbUrl } from './api/serverUrl';

const MAX_CONCURRENT = 2;
const TIMEOUT_MS = 15000;

const queue: string[] = [];
const queued = new Set<string>();
const listeners = new Map<string, Set<(url: string) => void>>();
let active = 0;

function notify(id: string, url: string) {
  const set = listeners.get(id);
  if (!set) return;
  for (const fn of set) {
    try {
      fn(url);
    } catch {
      /* 单个卡片失败不影响其他卡片 */
    }
  }
}

async function hasServerThumb(id: string): Promise<boolean> {
  try {
    const res = await fetch(videoThumbUrl(id), { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

function waitForEvent(video: HTMLVideoElement, event: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(`timeout waiting ${event}`));
    }, timeoutMs);
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error(`video error while waiting ${event}`));
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener(event, onOk);
      video.removeEventListener('error', onErr);
    };
    video.addEventListener(event, onOk, { once: true });
    video.addEventListener('error', onErr, { once: true });
  });
}

/**
 * 生成一张 480x270 的封面并在服务端落盘。
 * 视频本身来自本地 Range 流，不产生额外拷贝。
 */
async function captureThumb(id: string): Promise<string | null> {
  if (!(await hasServerThumb(id))) {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = `${DANCE_ECHO_SERVER_ORIGIN}/stream/${encodeURIComponent(id)}`;
    try {
      await waitForEvent(video, 'loadeddata', TIMEOUT_MS);
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const width = video.videoWidth || 480;
      const height = video.videoHeight || 270;
      const canvas = document.createElement('canvas');
      canvas.width = 480;
      canvas.height = 270;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      /**
       * 抽帧最容易踩的坑：seek 完成（seeked）不等于这一帧已经可以画，
       * 画出来是一张纯黑图，再 POST 上去就成了永久黑封面（播放器暂停时看着就是黑屏）。
       * 所以每个候选时间点画完都要量一次亮度，全黑就换下一个时间点，都黑就放弃。
       */
      const sampleBrightness = () => {
        const probe = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let sum = 0;
        let count = 0;
        for (let i = 0; i < probe.length; i += 4 * 17) {
          sum += probe[i] + probe[i + 1] + probe[i + 2];
          count += 3;
        }
        return count > 0 ? sum / count : 0;
      };

      const candidates = duration > 1
        ? Array.from(
            new Set(
              [0.1, 0.35, 0.6, 0.85, 0.25, 0.5]
                .map((fraction) => Math.min(Math.max(duration * fraction, 0.05), duration - 0.1))
                .map((t) => Math.round(t * 100) / 100),
            ),
          )
        : [0];
      // 和服务端 ffmpeg 那条链路保持同一个构图：整帧模糊铺满 + 原画面等比居中。
      // 以前这里是纯黑垫底，竖屏视频在卡片上就是中间一条细带，看着像空卡。
      const coverScale = Math.max(canvas.width / width, canvas.height / height);
      const coverW = width * coverScale;
      const coverH = height * coverScale;
      const containScale = Math.min(canvas.width / width, canvas.height / height);
      const w = width * containScale;
      const h = height * containScale;

      let drawn = false;
      for (const seekTo of candidates) {
        if (seekTo > 0) {
          video.currentTime = seekTo;
          await waitForEvent(video, 'seeked', TIMEOUT_MS);
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.filter = 'blur(14px) brightness(0.75)';
        ctx.drawImage(video, (canvas.width - coverW) / 2, (canvas.height - coverH) / 2, coverW, coverH);
        ctx.restore();
        ctx.drawImage(video, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
        if (sampleBrightness() > 6) {
          drawn = true;
          break;
        }
      }
      if (!drawn) {
        console.warn('[DanceEcho] 封面抽帧全黑，跳过:', id);
        return null;
      }
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      await api.uploadThumb(id, dataUrl);
    } catch (err) {
      console.warn('[DanceEcho] 封面抽帧失败:', id, err);
      return null;
    } finally {
      video.removeAttribute('src');
      video.load();
    }
  }
  return `${videoThumbUrl(id)}?v=${Date.now()}`;
}

function pump() {
  while (active < MAX_CONCURRENT && queue.length) {
    const id = queue.shift()!;
    active += 1;
    captureThumb(id)
      .then((url) => {
        if (url) notify(id, url);
      })
      .finally(() => {
        active -= 1;
        queued.delete(id);
        pump();
      });
  }
}

/**
 * 为指定视频申请封面（幂等）。返回取消订阅函数。
 * 生成成功后通过回调拿到带版本号的新 URL，用来强刷 <img>。
 */
export function requestThumbBackfill(id: string, onReady: (url: string) => void): () => void {
  if (!id) return () => {};
  let set = listeners.get(id);
  if (!set) {
    set = new Set();
    listeners.set(id, set);
  }
  set.add(onReady);
  if (!queued.has(id)) {
    queued.add(id);
    queue.push(id);
    pump();
  }
  return () => {
    set?.delete(onReady);
    if (set && set.size === 0) listeners.delete(id);
  };
}
