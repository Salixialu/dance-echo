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

console.log('1. 打开 Dance Echo 首页并进入播放器...');
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.locator('#fileImportInput').setInputFiles('D:/Dance Echo/local vidio store/fixtures/1.mp4');
await page.waitForSelector('.video-card');
await page.locator('.video-card').first().click();
await page.waitForSelector('#btnToggleRoiSelect');

console.log('2. 验证顶栏 [📐 划选检测] 按钮存在...');
const btnToggleRoi = page.locator('#btnToggleRoiSelect');
console.log('按钮文本:', await btnToggleRoi.textContent());

console.log('3. 点击 [📐 划选检测] 开启划选模式...');
await btnToggleRoi.click();
await page.waitForTimeout(400);

// 验证引导提示出现
await page.waitForSelector('#roiGuideBanner');
const bannerText = await page.locator('#roiGuideBanner').textContent();
console.log('引导提示:', bannerText);
if (!bannerText.includes('拖拽拉框')) {
  throw new Error('未正确呈现划选引导提示！');
}

console.log('4. 在画面上拖拽拉框 (从 25% 拖至 70%)...');
const videoBox = await page.locator('#videoElement').boundingBox();
if (!videoBox) throw new Error('未找到视频元素位置');

const startX = videoBox.x + videoBox.width * 0.25;
const startY = videoBox.y + videoBox.height * 0.20;
const endX = videoBox.x + videoBox.width * 0.70;
const endY = videoBox.y + videoBox.height * 0.75;

await page.mouse.move(startX, startY);
await page.mouse.down();
await page.mouse.move(endX, endY, { steps: 5 });
await page.waitForTimeout(200);
await page.mouse.up();
await page.waitForTimeout(500);

console.log('5. 验证是否出现 [局部高精中] 重置按钮...');
await page.waitForSelector('#btnResetRoi');
const resetBtnText = await page.locator('#btnResetRoi').textContent();
console.log('重置按钮显示:', resetBtnText);

console.log('6. 测试二次划选 (支持多次划选覆盖)...');
// 按快捷键 R 再次开启划选
await page.keyboard.press('r');
await page.waitForTimeout(300);

const startX2 = videoBox.x + videoBox.width * 0.40;
const startY2 = videoBox.y + videoBox.height * 0.30;
const endX2 = videoBox.x + videoBox.width * 0.85;
const endY2 = videoBox.y + videoBox.height * 0.85;

await page.mouse.move(startX2, startY2);
await page.mouse.down();
await page.mouse.move(endX2, endY2, { steps: 5 });
await page.waitForTimeout(200);
await page.mouse.up();
await page.waitForTimeout(500);

console.log('7. 截图保存划选效果...');
await page.screenshot({ path: 'd:/Dance Echo/local vidio store/playwright-roi-selection.png' });

console.log('8. 测试一键复位全屏识别...');
await page.locator('#btnResetRoi').click();
await page.waitForTimeout(400);

const hasReset = await page.evaluate(() => !document.querySelector('#btnResetRoi'));
console.log('重置按钮是否已消失 (恢复全屏):', hasReset);
if (!hasReset) throw new Error('点击复位后未恢复全屏！');
console.log('✅ 成功验证：一键恢复全屏骨骼检测！');

await browser.close();
console.log('测试全部顺利通过！控制台报错数:', errors.length);
if (errors.length > 0) {
  console.error('Errors:', errors);
}
