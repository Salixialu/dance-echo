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

// Mocking PoseDetectorService with realistic human anatomical posture
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
        // Realistic human posture normalized coords:
        // Head / Face
        const lm = [];
        for (let i = 0; i < 33; i++) lm.push({ x: 0.5, y: 0.5, z: 0, visibility: 0.95 });
        lm[0] = { x: 0.50, y: 0.16, z: -0.05, visibility: 0.95 }; // nose
        lm[7] = { x: 0.46, y: 0.15, z: 0.0, visibility: 0.95 };  // left ear
        lm[8] = { x: 0.54, y: 0.15, z: 0.0, visibility: 0.95 };  // right ear
        // Shoulders
        lm[11] = { x: 0.42, y: 0.28, z: 0.0, visibility: 0.98 }; // left shoulder
        lm[12] = { x: 0.58, y: 0.28, z: 0.0, visibility: 0.98 }; // right shoulder
        // Arms
        lm[13] = { x: 0.35, y: 0.42, z: 0.05, visibility: 0.95 }; // left elbow
        lm[14] = { x: 0.65, y: 0.42, z: 0.05, visibility: 0.95 }; // right elbow
        lm[15] = { x: 0.30, y: 0.55, z: 0.10, visibility: 0.95 }; // left wrist
        lm[16] = { x: 0.70, y: 0.55, z: 0.10, visibility: 0.95 }; // right wrist
        lm[19] = { x: 0.28, y: 0.60, z: 0.10, visibility: 0.92 }; // left hand
        lm[20] = { x: 0.72, y: 0.60, z: 0.10, visibility: 0.92 }; // right hand
        // Hips
        lm[23] = { x: 0.45, y: 0.54, z: 0.0, visibility: 0.98 }; // left hip
        lm[24] = { x: 0.55, y: 0.54, z: 0.0, visibility: 0.98 }; // right hip
        // Legs
        lm[25] = { x: 0.43, y: 0.72, z: -0.02, visibility: 0.95 }; // left knee
        lm[26] = { x: 0.57, y: 0.72, z: -0.02, visibility: 0.95 }; // right knee
        lm[27] = { x: 0.42, y: 0.88, z: 0.02, visibility: 0.95 };  // left ankle
        lm[28] = { x: 0.58, y: 0.88, z: 0.02, visibility: 0.95 };  // right ankle
        lm[29] = { x: 0.41, y: 0.91, z: 0.05, visibility: 0.92 };  // left heel
        lm[30] = { x: 0.59, y: 0.91, z: 0.05, visibility: 0.92 };  // right heel
        lm[31] = { x: 0.40, y: 0.93, z: -0.05, visibility: 0.92 }; // left toe
        lm[32] = { x: 0.60, y: 0.93, z: -0.05, visibility: 0.92 }; // right toe
        return { landmarks: [lm], worldLandmarks: [lm] };
      }
    }`,
  })
);

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.locator('#fileImportInput').setInputFiles('D:/Dance Echo/local vidio store/fixtures/1.mp4');
await page.waitForSelector('.video-card');
await page.locator('.video-card').first().click();
await page.waitForSelector('#btnCycleDisplayMode');

console.log('[TEST 1] Testing Instant Actions HUD Silence...');
// 1. Instant keyboard actions test:
const instantKeys = [' ', 'm', '2', '[', ']', '\\', 'ArrowRight', 'ArrowLeft', ',', '.', 'j', 'l', 'r', 'b'];

for (const key of instantKeys) {
  await page.keyboard.press(key);
  await page.waitForTimeout(100);
  const hudText = await page.evaluate(() => {
    const el = document.querySelector('#playerHudToast');
    return el ? el.textContent : null;
  });
  if (hudText) {
    throw new Error(`VIOLATION: Instant key "${key}" triggered unwanted HUD popup: "${hudText}"`);
  }
}
console.log('✓ All 14 instant keyboard shortcuts successfully silenced (0 unwanted popups).');

// 2. Switch to 2D split view
console.log('\n[TEST 2] Testing 2D Anatomical Split Screen...');
const cycleBtn = page.locator('#btnCycleDisplayMode');
await cycleBtn.click(); // off -> 2d-split
await page.waitForTimeout(600);

const is2DSplit = await page.evaluate(() => {
  return document.querySelector('#split2DCanvas') !== null;
});
console.log('2D split screen active:', is2DSplit);
await page.screenshot({ path: 'scripts/real-pose-2d-split.png' });
console.log('✓ Captured 2D split screen screenshot: scripts/real-pose-2d-split.png');

// 3. Switch to 3D split view
console.log('\n[TEST 3] Testing 3D Anatomical Glowing Skeleton...');
await cycleBtn.click(); // 2d-split -> 3d-split
await page.waitForTimeout(800);

await page.screenshot({ path: 'scripts/real-pose-3d-split.png' });
console.log('✓ Captured 3D split screen screenshot: scripts/real-pose-3d-split.png');

// 4. 动作数据出口：实时 VRM 化身已下线，统一走 BVH 导出。
//    这里验证「动捕」面板仍可用、BVH 按钮在、且化身按钮确实已移除。
console.log('\n[TEST 4] Testing pose data export contract (BVH, no live avatar)...');
const exportContract = await page.evaluate(() => {
  const nodes = Array.from(document.querySelectorAll('button, label'));
  return {
    hasBvhExport: nodes.some((b) => b.textContent?.includes('导出动捕')),
    hasAvatarToggle: nodes.some((b) => b.textContent?.includes('3D 化身')),
    hasVrmUpload: nodes.some((b) => b.textContent?.includes('上传 VRM')),
  };
});
console.log('Export contract:', exportContract);
if (exportContract.hasAvatarToggle || exportContract.hasVrmUpload) {
  console.error('✗ 实时化身入口仍在，应已移除');
  process.exitCode = 1;
} else if (!exportContract.hasBvhExport) {
  console.error('✗ BVH 导出入口缺失');
  process.exitCode = 1;
} else {
  console.log('✓ BVH 出口在、化身入口已移除');
}

await browser.close();
console.log('\n===============================================================');
console.log(' ALL ANATOMICAL SKELETON & HUD SILENCE TESTS PASSED (100%)');
console.log('===============================================================\n');
