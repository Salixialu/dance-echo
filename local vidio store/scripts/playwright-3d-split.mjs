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
          x: 0.5 + Math.sin(Date.now() / 500 + i) * 0.1,
          y: 0.5 + Math.cos(Date.now() / 500 + i) * 0.1,
          visibility: 0.99,
        }));
        return { landmarks: [landmarks], worldLandmarks: [landmarks] };
      }
    }`,
  })
);

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.locator('#fileImportInput').setInputFiles('D:/Dance Echo/local vidio store/fixtures/1.mp4');
await page.waitForSelector('.video-card');
await page.locator('.video-card').first().click();
await page.waitForSelector('#btnCycleDisplayMode, #btnToggle3D');

// 1. 切换至 3D 空间分屏 (通过循环切换: off -> 2d-split -> 3d-split)
const cycleBtn = page.locator('#btnCycleDisplayMode, #btnToggle3D');
await cycleBtn.click();
await page.waitForTimeout(300);
await cycleBtn.click();
await page.waitForTimeout(600);

const initial3DState = await page.evaluate(() => {
  const isSplit = document.querySelectorAll('.flex-1.h-full.rounded-2xl').length > 0;
  const badgeText = document.querySelector('.truncate.max-w-\\[170px\\]')?.textContent?.trim();
  const has3DCanvas = !!Array.from(document.querySelectorAll('canvas')).find(
    (c) => c.clientWidth > 0 && c.clientHeight > 0
  );
  return { isSplit, badgeText, has3DCanvas };
});
console.log('初始进入 3D 状态 (应为纯骨架):', initial3DState);

// 2. 实时 VRM 化身已下线：菜单里不应再有「载入 3D 化身 / 上传 VRM」，
//    动作数据的出口统一为 BVH 导出。
const avatarState = await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button, label'));
  return {
    hasAvatarToggle: btns.some((b) => b.textContent?.includes('3D 化身')),
    hasVrmUpload: btns.some((b) => b.textContent?.includes('上传 VRM')),
    hasBvhExport: btns.some((b) => b.textContent?.includes('导出动捕')),
  };
});
console.log('化身 / BVH 出口状态:', avatarState);

await page.screenshot({ path: 'playwright-3d-split.png', fullPage: true });

console.log('Console Errors:', errors);
await browser.close();

if (
  errors.length ||
  !initial3DState.isSplit ||
  !initial3DState.has3DCanvas ||
  avatarState.hasAvatarToggle ||
  avatarState.hasVrmUpload ||
  !avatarState.hasBvhExport
) {
  process.exitCode = 1;
}
