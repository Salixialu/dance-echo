/**
 * 媒体主时钟（插值版）
 *
 * 背景：`video.currentTime` 在播放中只在 timeupdate / 帧回调时机刷新，事件间隔内是阶跃的，
 * 直接用它给节拍器排程会抖。理想做法是把音轨接进 AudioContext 用 `ctx.currentTime`，
 * 但 `MediaElementAudioSourceNode` 会接管 <video> 的音频通路（实测会导致 play() 挂起、
 * 播放位置直接跳到结尾），代价太大，因此改成纯插值：
 *
 *   t ≈ anchorVideoTime + (performance.now() - anchorPerf) / 1000 × rate
 *
 * 一旦与真实 `video.currentTime` 偏差超过阈值（seek / 缓冲 / 变速），就重新锚定。
 * 这样时间轴单调、平滑，且完全不碰音频链路。
 */

export interface MediaClock {
  /** 当前播放位置（秒），平滑插值 */
  currentTime(): number;
  /** 播放/跳转/变速后重新锚定 */
  resync(): void;
  /** 释放（无音频资源，仅接口对称） */
  dispose(): void;
  /** 是否使用音频时钟（插值版恒为 false） */
  readonly attached: boolean;
}

interface ClockOptions {
  video: HTMLVideoElement;
}

const MAX_DRIFT_SECONDS = 0.08;

export function createMediaClock({ video }: ClockOptions): MediaClock {
  let anchorVideoTime = video.currentTime;
  let anchorPerf = performance.now();
  let anchorRate = video.playbackRate || 1;

  const resync = () => {
    anchorVideoTime = video.currentTime;
    anchorPerf = performance.now();
    anchorRate = video.playbackRate || 1;
  };

  const currentTime = () => {
    if (video.paused || video.ended) return video.currentTime;

    const elapsed = ((performance.now() - anchorPerf) / 1000) * anchorRate;
    const predicted = anchorVideoTime + elapsed;
    // 真实时间往前走一点就以真实为准（防止插值过冲）
    if (Math.abs(predicted - video.currentTime) > MAX_DRIFT_SECONDS) {
      resync();
      return video.currentTime;
    }
    return predicted;
  };

  return {
    currentTime,
    resync,
    dispose: () => {},
    get attached() {
      return false;
    },
  };
}
