/**
 * 逐拍链路端到端验证：真实视频进播放器 → 音轨分析 → 落库的网格必须覆盖整曲
 *
 * 只验证过去会失败的那件事：以前分析窗口固定 25 秒，beats 到 25 秒就断了，
 * 之后节拍器退回 bpm+offset 等分网格。现在要求最后一个拍点落在片尾附近。
 */
import { chromium } from 'playwright';

const VIDEO = 'D:/Dance Echo/local vidio store/fixtures/1.mp4';

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
});

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (err) => errors.push(err.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

console.log('1. 导入视频并进入播放器...');
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.locator('#fileImportInput').setInputFiles(VIDEO);
// 导入会先弹「导入为视频分组」确认框，确认后才真正落库
const confirmImport = page.getByRole('button', { name: /^导入 \d+ 个视频$/ });
await confirmImport.waitFor({ timeout: 15000 });
await confirmImport.click();
await page.waitForSelector('.video-card', { timeout: 30000 });
await page.locator('.video-card').first().click();
await page.waitForSelector('#btnPlayPause', { timeout: 15000 });

const duration = await page.locator('video').first().evaluate(
  (el) =>
    new Promise((resolve) => {
      if (el.duration && Number.isFinite(el.duration)) return resolve(el.duration);
      el.addEventListener('loadedmetadata', () => resolve(el.duration), { once: true });
    }),
);
console.log(`   视频时长 ${duration.toFixed(2)}s`);

console.log('2. 等音轨分析落库（每 500ms 轮询 localStorage）...');
const grid = await page.evaluate(async () => {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const raw = localStorage.getItem('dance_echo_beat_grids_v1');
    if (raw) {
      const map = JSON.parse(raw);
      const first = Object.values(map)[0];
      if (first && Array.isArray(first.beats) && first.beats.length > 4) return first;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
});

if (!grid) {
  console.error('FAIL  没有任何音轨分析结果落库');
  await browser.close();
  process.exit(1);
}

const beats = grid.beats;
console.log(`   bpm=${grid.bpm} 拍数=${beats.length} 首拍=${beats[0]} 末拍=${beats[beats.length - 1]} 置信度=${grid.confidence}`);

check('落库了逐拍时间戳', beats.length > 8, `${beats.length} 拍`);
check('首拍不晚于 2 秒', beats[0] <= 2, `${beats[0]}s`);
check(
  '逐拍覆盖到片尾',
  beats[beats.length - 1] >= duration - Math.max(2, duration * 0.05),
  `末拍 ${beats[beats.length - 1]}s / 时长 ${duration.toFixed(2)}s`,
);
check(
  '拍间隔大致等于 60/bpm',
  (() => {
    const gaps = beats.slice(1).map((t, i) => t - beats[i]);
    const median = gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
    return Math.abs(median - 60 / grid.bpm) <= 60 / grid.bpm / 4;
  })(),
  `中位间隔见上，60/bpm=${(60 / grid.bpm).toFixed(3)}s`,
);

console.log('3. 播放几秒，确认 8 拍指示灯在轮转且无报错...');
const video = page.locator('video').first();
await video.evaluate((el) => {
  el.muted = true;
  el.currentTime = Math.max(0, el.duration * 0.4);
});
await page.waitForSelector('#beatMetronomeContainer', { timeout: 10000 });
await page.locator('#btnPlayPause').click();

const seen = new Set();
for (let i = 0; i < 30; i++) {
  const active = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('#beatMetronomeContainer .beat-indicator'));
    const idx = nodes.findIndex((n) => n.className.includes('scale-115') || n.className.includes('scale-105'));
    return idx;
  });
  if (active >= 0) seen.add(active);
  await page.waitForTimeout(100);
}
await page.locator('#btnPlayPause').click();

check('指示灯在多个拍位之间轮转', seen.size >= 2, `亮过 ${[...seen].sort((a, b) => a - b).join(',')}`);
check('运行期无控制台报错', errors.length === 0, errors.slice(0, 3).join(' | '));

await page.screenshot({ path: 'playwright-beat-fulltrack.png' });
await browser.close();

console.log(failures === 0 ? '\n全部通过' : `\n${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
