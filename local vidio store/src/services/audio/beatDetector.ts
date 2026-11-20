import type { BeatInfo } from '../../types';
import { analyzeBeatGrid } from './beatAnalysis';

/**
 * 纯前端原生 Web Audio 离线音乐节拍与 BPM 测算服务
 * 100% 离线无服务端依赖，利用能量通量差分与自相关算法秒级计算
 *
 * 分析窗口默认是「整条音轨」：只算前 25 秒时，播到 25 秒之后节拍器会退回 bpm+offset
 * 等分网格，那正是「不跟音乐」的来源。算法本体在 `beatAnalysis.ts`（纯函数）。
 */
export class BeatDetectorService {
  private static instance: BeatDetectorService | null = null;
  private cache = new Map<string, BeatInfo>();

  static getInstance(): BeatDetectorService {
    if (!this.instance) {
      this.instance = new BeatDetectorService();
    }
    return this.instance;
  }

  private static windowKey(durationSec: number): string {
    return durationSec > 0 ? String(durationSec) : 'full';
  }

  /**
   * 从音频/视频 Blob 或 File 测算 BPM 与逐拍时间戳
   * @param durationSec 分析时长（秒）；0 表示整条音轨
   */
  async detectBpmFromBlob(blob: Blob, durationSec: number = 0): Promise<BeatInfo> {
    const cacheKey = `blob_${blob.size}_${blob.type}_${BeatDetectorService.windowKey(durationSec)}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    try {
      // 提取整轨（或指定时长）对应的 ArrayBuffer
      const arrayBuffer = await blob.arrayBuffer();
      const result = await this.detectFromArrayBuffer(arrayBuffer, durationSec);
      this.cache.set(cacheKey, result);
      return result;
    } catch (err) {
      console.warn('[BeatDetector] 离线解算失败，回退到默认 120 BPM:', err);
      const fallback: BeatInfo = { bpm: 120, offset: 0, confidence: 0, beats: [] };
      this.cache.set(cacheKey, fallback);
      return fallback;
    }
  }

  /**
   * 从视频或音频 URL 测算 BPM 与逐拍时间戳
   * @param durationSec 分析时长（秒）；0 表示整条音轨
   */
  async detectBpmFromUrl(url: string, durationSec: number = 0): Promise<BeatInfo> {
    const cacheKey = `url_${url}_${BeatDetectorService.windowKey(durationSec)}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const result = await this.detectFromArrayBuffer(arrayBuffer, durationSec);
      this.cache.set(cacheKey, result);
      return result;
    } catch (err) {
      console.warn('[BeatDetector] 无法从 URL 解码音频，回退默认 120 BPM:', err);
      const fallback: BeatInfo = { bpm: 120, offset: 0, confidence: 0, beats: [] };
      this.cache.set(cacheKey, fallback);
      return fallback;
    }
  }

  /**
   * 核心解码与解算逻辑
   */
  private async detectFromArrayBuffer(
    arrayBuffer: ArrayBuffer,
    durationSec: number
  ): Promise<BeatInfo> {
    // 兼容各浏览器 AudioContext
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) {
      return { bpm: 120, offset: 0, confidence: 0, beats: [] };
    }

    const audioCtx = new AudioContextClass();
    let audioBuffer: AudioBuffer;

    try {
      audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    } finally {
      await audioCtx.close();
    }

    return this.analyzeAudioBuffer(audioBuffer, durationSec);
  }

  /**
   * 对 AudioBuffer 做全曲节拍分析（算法在 beatAnalysis.ts，纯函数）
   */
  analyzeAudioBuffer(audioBuffer: AudioBuffer, durationSec: number = 0): BeatInfo {
    const channels: Float32Array[] = [];
    for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
      channels.push(audioBuffer.getChannelData(c));
    }
    const result = analyzeBeatGrid(channels, audioBuffer.sampleRate, durationSec);
    return {
      bpm: result.bpm,
      offset: result.offset,
      confidence: result.confidence,
      beats: result.beats,
    };
  }
}

export const beatDetector = BeatDetectorService.getInstance();
