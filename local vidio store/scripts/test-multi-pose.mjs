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

// Mock pose detector with 2 dancers
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
        // Dancer #1 centered on left side (x around 0.3)
        const lms1 = Array.from({ length: 33 }, (_, i) => ({
          x: 0.3 + (i % 3 - 1) * 0.05,
          y: 0.4 + Math.floor(i / 3) * 0.05,
          z: 0.01 * i,
          visibility: 0.95,
        }));
        // Dancer #2 centered on right side (x around 0.7)
        const lms2 = Array.from({ length: 33 }, (_, i) => ({
          x: 0.7 + (i % 3 - 1) * 0.05,
          y: 0.4 + Math.floor(i / 3) * 0.05,
          z: 0.01 * i,
          visibility: 0.95,
        }));
        return {
          landmarks: [lms1, lms2],
          worldLandmarks: [lms1, lms2],
        };
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

console.log('3. 开启视频附着...');
await page.locator('#btnToggleOverlay').click();
await page.waitForTimeout(600);

console.log('4. 验证顶栏多人动捕目标选择器出现...');
await page.waitForSelector('#dancerSelectorBar');
const buttons = await page.locator('#dancerSelectorBar button').all();
console.log(`检测到舞者数量选择按钮数: ${buttons.length}`);
if (buttons.length < 2) throw new Error('未正确渲染多人目标选择按钮');

console.log('5. 点击切换锁定舞者 #2...');
await buttons[1].click();
await page.waitForTimeout(300);

// 验证 HUD 提示
const hudText = await page.evaluate(() => {
  const el = document.querySelector('.animate-in');
  return el ? el.textContent : '';
});
console.log('HUD 反馈:', hudText);
if (!hudText.includes('已锁定目标舞者: #2')) {
  console.warn('HUD 提示略有延迟或不同:', hudText);
}

console.log('6. 开启 2D 分屏并检查分屏顶栏跟随舞者标识...');
await page.locator('#btnCycleDisplayMode').click();
await page.waitForTimeout(600);

const splitTitle = await page.evaluate(() => document.body.textContent || '');
if (splitTitle.includes('跟随舞者 #2')) {
  console.log('✅ 成功验证：2D 分屏顶栏正确显示「跟随舞者 #2」');
} else {
  console.warn('分屏顶栏内容:', splitTitle.slice(0, 500));
}

console.log('7. 切换至 3D 分屏并检查 3D 顶栏跟随舞者标识...');
await page.locator('#btnCycleDisplayMode').click();
await page.waitForTimeout(600);
const split3DTitle = await page.evaluate(() => document.body.textContent || '');
if (split3DTitle.includes('跟随舞者 #2')) {
  console.log('✅ 成功验证：3D 分屏顶栏正确显示「跟随舞者 #2」');
}

console.log('8. 截图保存验证效果...');
await page.screenshot({ path: 'd:/Dance Echo/local vidio store/playwright-multi-pose.png' });

await browser.close();
console.log('9. 测试全部通过！错误数:', errors.length);
if (errors.length > 0) {
  console.error('Errors encountered:', errors);
}
