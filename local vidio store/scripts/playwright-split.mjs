import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, executablePath: (process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe') });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
await page.route('**/src/services/pose/pose-detector.ts*', (route) => route.fulfill({
  contentType: 'text/javascript',
  body: `export class PoseDetectorService {
    isReady = false;
    async init() { this.isReady = true; }
    resetTimeline() {}
    detectVideoFrame() {
      const landmarks = Array.from({ length: 33 }, (_, index) => ({ x: 0.3 + (index % 5) * 0.08, y: 0.12 + Math.floor(index / 5) * 0.1, visibility: 0.99 }));
      return { landmarks: [landmarks] };
    }
  }`,
}));

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.locator('#fileImportInput').setInputFiles('D:/Dance Echo/local vidio store/fixtures/1.mp4');
await page.waitForFunction(() => document.querySelectorAll('.video-card').length >= 1, null, { timeout: 30000 });
await page.locator('.video-card').first().click();
await page.waitForFunction(() => document.querySelector('video')?.readyState >= 3, null, { timeout: 10000 });

const toggle = page.locator('#btnCycleDisplayMode');
if (await toggle.count() !== 1) throw new Error('分屏开关不存在');
await toggle.click();
await page.waitForSelector('#split2DCanvas', { timeout: 10000 });
const split = await page.evaluate(() => ({
  mode: document.querySelector('#split2DCanvas') !== null,
  canvas: document.querySelector('#split2DCanvas')?.getBoundingClientRect().toJSON(),
  overlayVisible: document.querySelector('#split2DCanvas')?.clientWidth > 0,
  poseState: document.querySelector('#poseOverlay')?.dataset.state,
}));
await page.waitForFunction(() => {
  const canvas = document.querySelector('#split2DCanvas');
  if (document.querySelector('#poseOverlay')?.dataset.state !== 'ready' || !canvas?.width || !canvas.height) return false;
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < data.length; i += 4) if (data[i]) return true;
  return false;
}, null, { timeout: 10000 });

await page.locator('#videoElement').evaluate((video) => { video.muted = true; });
if (await page.locator('#videoElement').evaluate((video) => video.paused)) await page.locator('#btnPlayPause').click();
await page.waitForTimeout(800);
const sync = await page.evaluate(() => ({
  leftPaused: document.querySelector('#videoElement')?.paused,
  canvasWidth: document.querySelector('#split2DCanvas')?.clientWidth ?? 0,
  time: document.querySelector('#videoElement')?.currentTime ?? 0,
}));

console.log(JSON.stringify({ split, sync, errors }, null, 2));
await browser.close();
if (errors.length || !split.mode || !split.overlayVisible || !sync.canvasWidth) process.exitCode = 1;
