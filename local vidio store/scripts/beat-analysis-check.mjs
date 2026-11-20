/**
 * 节拍分析算法的离线自检（Node 直接跑，不需要浏览器）
 *
 * 用法：node scripts/beat-analysis-check.mjs
 *
 * 合成音轨用「60Hz 指数衰减脉冲」冒充底鼓；160Hz 低通后仍保留足够瞬态，
 * 足以验证三件事：
 *  1. 固定 120 BPM 能解对，且逐拍时间戳对齐真实拍点；
 *  2. 中途变速（120→132）时逐拍跟踪能跟上，而 bpm+offset 等分网格会漂；
 *  3. 静音输入给出低置信度，不假装有节拍。
 */
import { analyzeBeatGrid, beatIndexAt } from '../src/services/audio/beatAnalysis.ts';

const SR = 44100;

function makeKick(samples, atSecond, amp = 0.9) {
  const start = Math.floor(atSecond * SR);
  const len = Math.floor(0.09 * SR);
  for (let i = 0; i < len; i++) {
    const idx = start + i;
    if (idx < 0 || idx >= samples.length) continue;
    const t = i / SR;
    samples[idx] += amp * Math.exp(-t * 38) * Math.sin(2 * Math.PI * 60 * t);
  }
}

function stereo(samples) {
  return [samples, samples.slice()];
}

/** 匀速节拍的真实拍点 */
function steadyBeats(bpm, durationSeconds, offset = 0.25) {
  const period = 60 / bpm;
  const beats = [];
  for (let t = offset; t < durationSeconds; t += period) beats.push(Number(t.toFixed(4)));
  return beats;
}

/** 分段变速：segs = [{ bpm, seconds }]，拍点连续累计 */
function variableBeats(segs, offset = 0.25) {
  const beats = [];
  let t = offset;
  for (const seg of segs) {
    const period = 60 / seg.bpm;
    const end = t + seg.seconds;
    while (t < end) {
      beats.push(Number(t.toFixed(4)));
      t += period;
    }
  }
  return beats;
}

/**
 * 每个真实拍点到最近的检测拍点的最大距离。
 *
 * 只统计「最后一个检测拍点之前」的真实拍点：音轨尾部被截断时，最后一拍可能根本没有底鼓，
 * 硬比会把「没有音符」误算成「跟丢了」。
 */
function maxErrorSeconds(expected, actual) {
  if (!actual.length) return Infinity;
  const last = actual[actual.length - 1];
  let worst = 0;
  for (const t of expected) {
    if (t > last) continue;
    let best = Infinity;
    for (const b of actual) best = Math.min(best, Math.abs(b - t));
    worst = Math.max(worst, best);
  }
  return worst;
}

function buildTrack(durationSeconds, trueBeats, amp = 0.9) {
  const samples = new Float32Array(Math.floor(durationSeconds * SR));
  for (const t of trueBeats) makeKick(samples, t, amp);
  return samples;
}

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

// 1) 固定 120 BPM
{
  const truth = steadyBeats(120, 20);
  const track = buildTrack(20, truth);
  const t0 = performance.now();
  const result = analyzeBeatGrid(stereo(track), SR);
  const ms = Math.round(performance.now() - t0);

  check('120 BPM 解算', Math.abs(result.bpm - 120) <= 1, `bpm=${result.bpm}`);
  check('逐拍覆盖全曲', result.beats.length >= truth.length - 2, `beats=${result.beats.length}, truth=${truth.length}`);
  const err = maxErrorSeconds(truth, result.beats);
  check('逐拍对齐 ±30ms', err <= 0.03, `maxErr=${(err * 1000).toFixed(1)}ms, ${ms}ms 内算完`);
}

// 1b) 超过旧 25 秒窗口的长曲：逐拍必须一路铺到片尾
{
  const truth = steadyBeats(128, 40);
  const track = buildTrack(41, truth);
  const result = analyzeBeatGrid(stereo(track), SR);

  check('长曲 BPM 解算', Math.abs(result.bpm - 128) <= 1, `bpm=${result.bpm}`);
  check(
    '逐拍越过 25 秒仍在续',
    result.beats.some((b) => b > 30),
    `末拍=${result.beats[result.beats.length - 1]?.toFixed(2)}s, 共 ${result.beats.length} 拍`,
  );
  const late = truth.filter((t) => t >= 30);
  const lateErr = maxErrorSeconds(late, result.beats);
  check('30 秒之后仍对齐 ±40ms', lateErr <= 0.04, `maxErr=${(lateErr * 1000).toFixed(1)}ms`);
}

// 2) 中途变速 120 → 132 BPM
{
  const segs = [
    { bpm: 120, seconds: 10 },
    { bpm: 132, seconds: 10 },
  ];
  const truth = variableBeats(segs);
  const track = buildTrack(truth[truth.length - 1] + 0.6, truth);
  const result = analyzeBeatGrid(stereo(track), SR);

  check('变速曲仍解出主 BPM', result.bpm >= 100 && result.bpm <= 150, `bpm=${result.bpm}`);

  // 只比较第 11 秒之后：给相位锁定环 1 秒适应期
  const lateTruth = truth.filter((t) => t >= 11);
  const lateErr = maxErrorSeconds(lateTruth, result.beats.filter((b) => b >= 11));

  // 等分网格（用同一个 bpm 外推）在变速后的误差，作为对照
  const period = 60 / result.bpm;
  const grid = [];
  for (let i = 0; i < 400; i++) grid.push(result.offset + i * period);
  const gridErr = maxErrorSeconds(lateTruth, grid.filter((b) => b >= 11));

  check('变速后逐拍仍对齐 ±40ms', lateErr <= 0.04, `maxErr=${(lateErr * 1000).toFixed(1)}ms`);
  check('优于等分网格', lateErr < gridErr / 2, `tracking=${(lateErr * 1000).toFixed(1)}ms, grid=${(gridErr * 1000).toFixed(1)}ms`);
}

// 3) 静音
{
  const silence = new Float32Array(SR * 10);
  const result = analyzeBeatGrid(stereo(silence), SR);
  check('静音不误报节拍', result.confidence < 0.4, `confidence=${result.confidence}, beats=${result.beats.length}`);
}

// 4) 8 拍指示器的落点：给定逐拍数组，任意时刻的「当前拍」必须是正在响的那一拍
{
  const beats = [0.25, 0.75, 1.25, 1.7, 2.15, 2.6];
  check('第一拍之前没有拍号', beatIndexAt(beats, 0.1) === -1, `idx=${beatIndexAt(beats, 0.1)}`);
  check('拍点当刻算这一拍', beatIndexAt(beats, 1.25) === 2, `idx=${beatIndexAt(beats, 1.25)}`);
  check('两拍之间算前一拍', beatIndexAt(beats, 1.4) === 2, `idx=${beatIndexAt(beats, 1.4)}`);
  check('下一拍前一瞬仍是前一拍', beatIndexAt(beats, 2.149) === 3, `idx=${beatIndexAt(beats, 2.149)}`);
  check('最后一拍之后停在最后一拍', beatIndexAt(beats, 99) === beats.length - 1, `idx=${beatIndexAt(beats, 99)}`);
  check('空网格不崩', beatIndexAt([], 5) === -1, `idx=${beatIndexAt([], 5)}`);

  // 变速曲：等分近似到后面会跟鼓点错开（拍号错位），逐拍索引不会
  const segs = [
    { bpm: 120, seconds: 10 },
    { bpm: 132, seconds: 10 },
  ];
  const truth = variableBeats(segs);
  const track = buildTrack(truth[truth.length - 1] + 0.6, truth);
  const { beats: tracked } = analyzeBeatGrid(stereo(track), SR);

  const probe = truth[truth.length - 1] - 0.01;
  const truthIndex = truth.length - 2; // 倒数第二拍（probe 落在它之后、最后一拍之前）
  const trackedIndex = beatIndexAt(tracked, probe);
  const approxIndex = Math.floor(probe / 0.5); // 按 120 BPM 等分数拍

  check('逐拍索引与真实拍序一致', Math.abs(trackedIndex - truthIndex) <= 1, `tracked=${trackedIndex}, truth=${truthIndex}`);
  check('等分近似在变速后拍号错位', approxIndex !== truthIndex, `approx=${approxIndex}, truth=${truthIndex}`);
}

console.log(failures === 0 ? '\n全部通过' : `\n${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
