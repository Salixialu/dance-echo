/**
 * 节拍网格分析（纯函数，无 DOM / WebAudio 依赖）
 *
 * 为什么单独抽出来：`BeatDetectorService` 里混着 Blob 读取、AudioContext 解码和算法，
 * 算法部分既没法在 Node 里验证，也没法在改参数时做 A/B。这里只收 PCM 与采样率。
 *
 * 三步：
 *  1. 低频能量通量（novelty）——找鼓点瞬态；
 *  2. 自相关解 BPM + 相位搜索解首拍——只用「鼓点最密的一段」做全局估计，避免前奏静音把
 *     BPM 估歪；
 *  3. 逐拍跟踪——从首拍开始，每步在「预测位置的 ±22% 周期」内找 novelty 峰，并用限幅的
 *     相位锁定环更新周期。这样中途变速（±15% 以内逐步变化）也能跟上，而不是被平均周期拖走。
 *
 * 之前的实现只在等分网格附近 ±12% 内吸附，且分析窗口固定 25 秒：曲子播到 25 秒之后
 * 就没有逐拍数据了，节拍器会悄悄退回 bpm+offset 等分网格。
 */

export interface BeatGridAnalysis {
  bpm: number;
  /** 首拍时间（秒），等于 beats[0] */
  offset: number;
  /** 0~1 */
  confidence: number;
  /** 逐拍时间戳（秒，升序），覆盖整个分析窗口 */
  beats: number[];
}

const FRAME_SIZE = 512;
const HOP_SIZE = 256;
const LOWPASS_CUTOFF_HZ = 160;
const MIN_BPM = 75;
const MAX_BPM = 165;
/** 只用这一段做 BPM / 首拍的全局估计 */
const BPM_WINDOW_SECONDS = 90;
/** 逐拍跟踪的最长输入（秒），防止超长视频把主线程卡住 */
const MAX_ANALYZE_SECONDS = 20 * 60;
/** 单步允许的周期变化，防止一个切分音把周期带跑 */
const MAX_PERIOD_STEP = 0.15;
/** 预测点附近搜索半径（相对周期） */
const SEARCH_RATIO = 0.22;

const FALLBACK: BeatGridAnalysis = { bpm: 120, offset: 0, confidence: 0, beats: [] };

/**
 * 逐拍数组里「已经过去的最后一拍」的下标；还没到第一拍时返回 -1。
 *
 * 8 拍指示器要靠它算「第几拍」——用 (time - offset) / beatDuration 的等分近似在变速曲
 * 上会跟 beat 时间戳脱节，指示器亮的那一拍和真正响的鼓点对不上。
 */
export function beatIndexAt(beats: readonly number[], time: number): number {
  const n = beats.length;
  if (n === 0 || time < beats[0]) return -1;

  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (beats[mid] <= time) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function analyzeBeatGrid(
  channels: Float32Array[],
  sampleRate: number,
  maxSeconds = MAX_ANALYZE_SECONDS,
): BeatGridAnalysis {
  if (!channels.length || !(sampleRate > 0)) return FALLBACK;

  const available = channels[0].length;
  if (available <= 0) return FALLBACK;

  const limitSeconds = maxSeconds > 0 ? Math.min(maxSeconds, MAX_ANALYZE_SECONDS) : MAX_ANALYZE_SECONDS;
  const totalSamples = Math.min(available, Math.floor(sampleRate * limitSeconds));
  if (totalSamples < sampleRate) return FALLBACK;

  const fps = sampleRate / HOP_SIZE;

  // 1. 合并声道 + 一阶 RC 低通，提取底鼓 / bass 的包络
  const mono = new Float32Array(totalSamples);
  if (channels.length === 1) {
    mono.set(channels[0].subarray(0, totalSamples));
  } else {
    const ch0 = channels[0];
    const ch1 = channels[1];
    for (let i = 0; i < totalSamples; i++) {
      mono[i] = (ch0[i] + ch1[i]) * 0.5;
    }
  }

  const rc = 1.0 / (2.0 * Math.PI * LOWPASS_CUTOFF_HZ);
  const dt = 1.0 / sampleRate;
  const alpha = dt / (rc + dt);

  const filtered = new Float32Array(totalSamples);
  let lastVal = 0;
  for (let i = 0; i < totalSamples; i++) {
    lastVal += alpha * (mono[i] - lastVal);
    filtered[i] = lastVal;
  }

  // 2. 短时能量包络
  const numFrames = Math.floor((totalSamples - FRAME_SIZE) / HOP_SIZE);
  if (numFrames < 64) return FALLBACK;

  const energy = new Float32Array(numFrames);
  for (let f = 0; f < numFrames; f++) {
    const start = f * HOP_SIZE;
    let sum = 0;
    for (let j = 0; j < FRAME_SIZE; j++) {
      const val = filtered[start + j];
      sum += val * val;
    }
    energy[f] = Math.sqrt(sum / FRAME_SIZE);
  }

  // 3. novelty：能量一阶前向差分的正向部分，再去局部均值
  const novelty = new Float32Array(numFrames);
  for (let f = 1; f < numFrames; f++) {
    const diff = energy[f] - energy[f - 1];
    novelty[f] = diff > 0 ? diff : 0;
  }

  const cleanedNovelty = new Float32Array(numFrames);
  const avgWindow = 12;
  for (let f = 0; f < numFrames; f++) {
    let localSum = 0;
    let count = 0;
    for (let w = -avgWindow; w <= avgWindow; w++) {
      const idx = f + w;
      if (idx >= 0 && idx < numFrames) {
        localSum += novelty[idx];
        count++;
      }
    }
    cleanedNovelty[f] = Math.max(0, novelty[f] - localSum / count);
  }

  // 4. 选「鼓点最密」的窗口做全局估计：前奏可能是静音或纯人声
  const windowFrames = Math.min(numFrames, Math.max(64, Math.round(BPM_WINDOW_SECONDS * fps)));
  const { windowStart, windowSum } = densestWindow(cleanedNovelty, windowFrames);
  if (windowSum <= 0) return FALLBACK;

  // 5. 自相关解 BPM
  const correlationAt = (bpm: number): number => {
    const periodFrames = Math.round((60 / bpm) * fps);
    if (periodFrames <= 0 || periodFrames * 2 >= windowFrames) return 0;
    const span = windowFrames - periodFrames * 2;
    let dot = 0;
    let energyA = 0;
    let energyB = 0;
    for (let i = 0; i < span; i++) {
      const a = cleanedNovelty[windowStart + i];
      const b = cleanedNovelty[windowStart + i + periodFrames];
      dot += a * b;
      energyA += a * a;
      energyB += b * b;
    }
    const denom = Math.sqrt(energyA * energyB);
    if (denom <= 1e-9) return 0;

    // 跨两拍的二阶自相关，帮钢琴 / 人声这类弱鼓点素材
    let dot2 = 0;
    let energyA2 = 0;
    let energyB2 = 0;
    const span2 = windowFrames - periodFrames * 3;
    for (let i = 0; i < span2; i++) {
      const a = cleanedNovelty[windowStart + i];
      const b = cleanedNovelty[windowStart + i + periodFrames * 2];
      dot2 += a * b;
      energyA2 += a * a;
      energyB2 += b * b;
    }
    const denom2 = Math.sqrt(energyA2 * energyB2);
    const acf2 = denom2 > 1e-9 ? dot2 / denom2 : 0;
    return (dot / denom) * 0.75 + acf2 * 0.25;
  };

  const corrByBpm = new Map<number, number>();
  let bestBpm = 120;
  let maxCorr = -1;
  for (let bpm = MIN_BPM; bpm <= MAX_BPM; bpm += 1) {
    const corr = correlationAt(bpm);
    corrByBpm.set(bpm, corr);
    if (corr > maxCorr) {
      maxCorr = corr;
      bestBpm = bpm;
    }
  }
  if (maxCorr <= 0) return FALLBACK;

  // 倍频 / 半频消歧：舞曲常见 127 被判成 63.5 或 254
  {
    const intoComfort = (b: number) => b >= 80 && b <= 160;
    const candidates = [bestBpm / 2, bestBpm * 2, bestBpm / 3, bestBpm * 3].filter(
      (b) => b >= MIN_BPM && b <= MAX_BPM && Math.abs(b - Math.round(b)) < 0.01,
    );
    for (const candidate of candidates) {
      const rounded = Math.round(candidate);
      const corr = corrByBpm.get(rounded) ?? 0;
      const closeEnough = corr >= maxCorr * 0.9;
      const betterZone = intoComfort(rounded) && !intoComfort(bestBpm);
      const sameZoneButStronger = intoComfort(rounded) === intoComfort(bestBpm) && corr > maxCorr;
      if (closeEnough && (betterZone || sameZoneButStronger)) {
        bestBpm = rounded;
        maxCorr = corr;
      }
    }
  }

  // 6. 相位搜索：在窗口内找「落在拍点上的 novelty 总和」最大的相位
  const periodFrames = (60 / bestBpm) * fps;
  const periodInt = Math.max(1, Math.round(periodFrames));
  let bestPhase = 0;
  let maxPhaseScore = -1;
  for (let phase = 0; phase < periodInt; phase++) {
    let score = 0;
    for (let k = windowStart + phase; k < windowStart + windowFrames; k += periodInt) {
      score += cleanedNovelty[k];
    }
    if (score > maxPhaseScore) {
      maxPhaseScore = score;
      bestPhase = phase;
    }
  }

  // 相位是「相对窗口起点」的，换算回轨道绝对位置的第一个拍点
  const firstBeatFrame = (((windowStart + bestPhase) % periodInt) + periodInt) % periodInt;

  // 7. 全曲逐拍跟踪（相位锁定环）
  const beatsFrames = trackBeats(cleanedNovelty, numFrames, firstBeatFrame, periodFrames);

  // 8. 置信度：峰值自相关相对全体候选均值的突出程度
  const allCorr = Array.from(corrByBpm.values()).filter((v) => v > 0);
  const meanCorr = allCorr.length > 0 ? allCorr.reduce((s, v) => s + v, 0) / allCorr.length : 0;
  const prominence = meanCorr > 0 ? maxCorr / meanCorr : 0;
  const confidence = Math.max(0, Math.min(1, Math.round(((prominence - 1.15) / 0.9) * 100) / 100));

  const beats = beatsFrames.map((f) => Math.round((f / fps) * 1000) / 1000);

  return {
    bpm: bestBpm,
    offset: beats.length > 0 ? beats[0] : 0,
    confidence,
    beats,
  };
}

/** novelty 总和最大的滑动窗口（O(n) 前缀和） */
function densestWindow(
  novelty: Float32Array,
  windowFrames: number,
): { windowStart: number; windowSum: number } {
  let running = 0;
  let bestStart = 0;
  let bestSum = -1;
  for (let i = 0; i < novelty.length; i++) {
    running += novelty[i];
    if (i >= windowFrames) running -= novelty[i - windowFrames];
    if (i >= windowFrames - 1 && running > bestSum) {
      bestSum = running;
      bestStart = i - windowFrames + 1;
    }
  }
  return { windowStart: bestStart, windowSum: bestSum };
}

/**
 * 逐拍跟踪：预测下一拍 → 在 ±SEARCH_RATIO 周期内按「novelty 强度 × 离预测点的距离」取峰
 * → 用限幅的差值平滑更新周期。中途变速时周期会在一两拍内跟上，而不是整段漂移。
 */
function trackBeats(
  novelty: Float32Array,
  numFrames: number,
  startFrame: number,
  initialPeriod: number,
): number[] {
  const beats: number[] = [];
  if (startFrame >= numFrames) return beats;

  let period = Math.max(2, initialPeriod);
  let cursor = startFrame;

  while (cursor < numFrames) {
    beats.push(cursor);

    const search = Math.max(3, Math.round(period * SEARCH_RATIO));
    const predicted = cursor + period;
    const from = Math.max(cursor + 1, Math.round(predicted - search));
    const to = Math.min(numFrames - 1, Math.round(predicted + search));

    let bestFrame = Math.round(predicted);
    let bestScore = 0;
    for (let k = from; k <= to; k++) {
      const dist = Math.abs(k - predicted) / search;
      const score = novelty[k] * Math.exp(-2.5 * dist * dist);
      if (score > bestScore) {
        bestScore = score;
        bestFrame = k;
      }
    }

    // 限幅：单拍周期变化不超过 ±15%，避免切分音把它带跑
    const delta = bestFrame - cursor;
    const lo = period * (1 - MAX_PERIOD_STEP);
    const hi = period * (1 + MAX_PERIOD_STEP);
    period = period * 0.7 + Math.min(hi, Math.max(lo, delta)) * 0.3;
    period = Math.max(2, period);

    const next = Math.max(cursor + 1, bestFrame);
    if (next >= numFrames) break;
    cursor = next;
  }

  return beats;
}
