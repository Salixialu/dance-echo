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

// Mock pose detector with 2 separated dancers
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
        // Dancer #1 centered on left side (x around 0.25, y around 0.5)
        const lms1 = Array.from({ length: 33 }, (_, i) => ({
          x: 0.25 + (i % 3 - 1) * 0.04,
          y: 0.35 + Math.floor(i / 3) * 0.04,
          z: 0.01 * i,
          visibility: 0.95,
        }));
        // Dancer #2 centered on right side (x around 0.75, y around 0.5)
        const lms2 = Array.from({ length: 33 }, (_, i) => ({
          x: 0.75 + (i % 3 - 1) * 0.04,
          y: 0.35 + Math.floor(i / 3) * 0.04,
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

console.log('1. 打开 Dance Echo 首页并进入播放器...');
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.locator('#fileImportInput').setInputFiles('D:/Dance Echo/local vidio store/fixtures/1.mp4');
await page.waitForSelector('.video-card');
await page.locator('.video-card').first().click();
await page.waitForSelector('#btnToggleOverlay');

console.log('2. 开启视频附着...');
await page.locator('#btnToggleOverlay').click();
await page.waitForTimeout(600);

console.log('3. 获取视频画布位置...');
const videoWrap = page.locator('#videoElement');
const box = await videoWrap.boundingBox();
if (!box) throw new Error('未找到视频元素位置');

console.log('4. 点击舞者 #2 所在的右侧区域 (x: 75%, y: 45%)...');
await page.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.45);
await page.waitForTimeout(400);

// 检查是否切换到了舞者 #2
const hudMsg = await page.evaluate(() => {
  const el = document.querySelector('.animate-in');
  return el ? el.textContent : '';
});
console.log('点击舞者 #2 后 HUD 提示:', hudMsg);
if (!hudMsg.includes('2')) {
  console.warn('HUD 提示未捕获到目标: #2, 当前内容:', hudMsg);
}

// 检查锁定按钮中 #2 是否呈激活态
const isButton2Active = await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('#dancerSelectorBar button'));
  return btns[1]?.className.includes('bg-cyan-500');
});
console.log('按钮 #2 是否高亮为锁定态:', isButton2Active);
if (!isButton2Active) {
  throw new Error('点击舞者身体后，未成功锁定舞者 #2！');
}
console.log('✅ 成功验证：画布点击直接命中并锁定了舞者 #2！');

console.log('5. 点击舞者 #1 所在的左侧区域 (x: 25%, y: 45%)...');
await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.45);
await page.waitForTimeout(400);

const isButton1Active = await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('#dancerSelectorBar button'));
  return btns[0]?.className.includes('bg-cyan-500');
});
console.log('按钮 #1 是否重新高亮为锁定态:', isButton1Active);
if (!isButton1Active) {
  throw new Error('点击舞者 #1 身体后，未成功切换锁定舞者 #1！');
}
console.log('✅ 成功验证：画布点击直接切回并锁定了舞者 #1！');

await page.screenshot({ path: 'd:/Dance Echo/local vidio store/playwright-click-dancer.png' });
await browser.close();
console.log('测试全部顺利通过！');
