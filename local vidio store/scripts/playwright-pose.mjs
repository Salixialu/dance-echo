import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  executablePath: (process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
await page.route('**/src/services/pose/pose-detector.ts*', (route) => route.fulfill({
  contentType: 'text/javascript',
  body: `export class PoseDetectorService {
    static instance = null;
    static getInstance() {
      if (!this.instance) this.instance = new PoseDetectorService();
      return this.instance;
    }
    isReady = false;
    async init() { this.isReady = true; }
    resetTimeline() {}
    detectVideoFrame() {
      const landmarks = Array.from({ length: 33 }, (_, index) => ({
        x: 0.25 + (index % 5) * 0.1,
        y: 0.15 + Math.floor(index / 5) * 0.1,
        visibility: 0.99,
      }));
      return { landmarks: [landmarks] };
    }
  }`,
}));

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.locator('#fileImportInput').setInputFiles('D:/Dance Echo/local vidio store/fixtures/1.mp4');
await page.waitForFunction(() => document.querySelectorAll('.video-card').length >= 1, null, { timeout: 30000 });
await page.locator('.video-card').first().click();
await page.waitForFunction(() => document.querySelector('video')?.readyState >= 3, null, { timeout: 10000 });

const poseToggle = page.locator('#btnToggleOverlay, #btnTogglePose').first();
if (await poseToggle.count() !== 1) throw new Error('骨骼开关不存在');
const overlay = page.locator('#poseOverlay');
if (await overlay.count() !== 1) throw new Error('骨骼覆盖层不存在');
const status = page.locator('#poseStatus');
if (await status.count() !== 1) throw new Error('骨骼状态提示不存在');

await poseToggle.click();
await page.waitForFunction(() => ['ready', 'error'].includes(document.querySelector('#poseOverlay')?.dataset.state), null, { timeout: 10000 });
const enabled = await poseToggle.evaluate((element) => ({ active: element.classList.contains('active'), state: document.querySelector('#poseOverlay')?.dataset.state, status: document.querySelector('#poseStatus')?.textContent }));
if (enabled.state === 'ready') {
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#poseOverlay');
    if (!canvas?.width || !canvas?.height) return false;
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) return true;
    return false;
  }, null, { timeout: 15000 });
}

await page.locator('#btnMirror').click();
const mirrored = await page.evaluate(() => ({ video: document.querySelector('#videoElement')?.classList.contains('mirrored'), overlay: document.querySelector('#poseOverlay')?.classList.contains('mirrored') }));

await page.locator('#btnClosePlayer').click();
await page.waitForTimeout(300);
const closed = await page.evaluate(() => ({
  modalPresent: Boolean(document.querySelector('#playerModal')),
  overlayPresent: Boolean(document.querySelector('#poseOverlay')),
}));

console.log(JSON.stringify({ enabled, mirrored, closed, errors }, null, 2));
await page.screenshot({ path: 'playwright-pose.png', fullPage: true });
await browser.close();

if (errors.length || !enabled.active || !['ready', 'error'].includes(enabled.state) || !enabled.status || !mirrored.video || !mirrored.overlay || closed.modalPresent || closed.overlayPresent) {
  process.exitCode = 1;
}
