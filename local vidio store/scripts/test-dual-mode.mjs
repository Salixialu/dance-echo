import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  executablePath: (process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'),
});

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (err) => errors.push(err.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});

// Mock pose detector so test runs deterministically
await page.route('**/src/services/pose/pose-detector.ts*', (route) =>
  route.fulfill({
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
        const landmarks = Array.from({ length: 33 }, (_, i) => ({
          x: 0.5 + Math.sin(Date.now() / 500 + i) * 0.15,
          y: 0.5 + Math.cos(Date.now() / 500 + i) * 0.15,
          z: Math.sin(i) * 0.1,
          visibility: 0.99,
        }));
        return { landmarks: [landmarks], worldLandmarks: [landmarks] };
      }
    }`,
  })
);

console.log('1. 打开 Dance Echo 首页...');
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });

console.log('2. 导入测试视频并进入播放器...');
await page.locator('#fileImportInput').setInputFiles('D:/Dance Echo/local vidio store/fixtures/1.mp4');
await page.waitForSelector('.video-card');
await page.locator('.video-card').first().click();
await page.waitForSelector('#btnToggleOverlay');

console.log('3. 测试 [🦴 视频附着] 开启...');
const btnOverlay = page.locator('#btnToggleOverlay');
console.log('初始附着文字:', await btnOverlay.textContent());
await btnOverlay.click();
await page.waitForTimeout(300);
const overlayAfterClick = await btnOverlay.textContent();
console.log('点击开启后附着文字 (应为开):', overlayAfterClick);
if (!overlayAfterClick.includes('开')) throw new Error('点击后附着未开启');

console.log('4. 测试开启分屏时自动关掉附着...');
const btnCycle = page.locator('#btnCycleDisplayMode');
console.log('初始分屏状态:', await btnCycle.textContent());

// 点击开启 2D 纯骨架分屏
await btnCycle.click();
await page.waitForTimeout(500);
console.log('点击 1 次后分屏状态:', await btnCycle.textContent());

const overlayAfterSplit = await btnOverlay.textContent();
console.log('开启分屏后附着文字 (应自动变为关):', overlayAfterSplit);
if (!overlayAfterSplit.includes('关')) {
  throw new Error('开启分屏后未自动关闭视频附着！');
}
console.log('✅ 成功验证：开启分屏时自动关掉了视频附着！');

const has2DCanvas = await page.evaluate(() => {
  const canvas = document.querySelector('canvas.w-full.h-full.block');
  const title = document.body.textContent.includes('2D 纯骨架分屏 (动作剪影)');
  return { hasCanvas: Boolean(canvas), hasTitle: title };
});
console.log('2D 纯骨架画布状态:', has2DCanvas);

// 轮转到 3D 空间骨架
await btnCycle.click();
await page.waitForTimeout(600);
console.log('点击 2 次后分屏状态:', await btnCycle.textContent());
const has3DCanvas = await page.evaluate(() => {
  const canvas = document.querySelector('canvas[data-engine^="three.js"]');
  const title = document.body.textContent.includes('3D 空间可旋转骨架');
  return { hasCanvas: Boolean(canvas), hasTitle: title };
});
console.log('3D 空间骨架状态:', has3DCanvas);

// 轮转关闭 (点击第 3 次回到单屏关)
await btnCycle.click();
await page.waitForTimeout(400);
console.log('点击 3 次后分屏状态 (关闭):', await btnCycle.textContent());

// 测试快捷键 '3' 轮转回 2D 分屏
await page.keyboard.press('3');
await page.waitForTimeout(400);
console.log('按快捷键 3 轮转状态:', await btnCycle.textContent());

await page.screenshot({ path: 'playwright-dual-mode.png' });
console.log('测试完成截图已保存至 playwright-dual-mode.png');

console.log('页面错误数:', errors.length);
if (errors.length > 0) {
  console.error('Errors encountered:', errors);
}

await browser.close();
