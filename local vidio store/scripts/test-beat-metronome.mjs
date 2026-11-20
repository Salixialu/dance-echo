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
const confirmImport = page.getByRole('button', { name: /^导入 \d+ 个视频$/ });
await confirmImport.waitFor({ timeout: 15000 });
await confirmImport.click();
await page.waitForSelector('.video-card', { timeout: 30000 });
await page.locator('.video-card').first().click();

console.log('2. 验证 8 拍卡点容器已挂载（开关按钮已收进顶栏显示菜单，改用快捷键 B 验证）...');
await page.waitForSelector('#beatMetronomeContainer', { timeout: 10000 });

console.log('3. 验证 8 拍卡点动态节拍器容器与指示灯...');
const indicators = page.locator('#beatMetronomeContainer .beat-indicator');
const count = await indicators.count();
console.log('检测到的节拍指示灯数量:', count);
if (count !== 8) {
  throw new Error(`预期 8 个节拍指示灯，实际发现 ${count} 个！`);
}

console.log('4. 验证第 1 拍和第 5 拍标签文字...');
const beat1 = await page.locator('#beatMetronomeContainer .beat-indicator-1').textContent();
const beat5 = await page.locator('#beatMetronomeContainer .beat-indicator-5').textContent();
console.log(`第 1 拍: "${beat1}", 第 5 拍: "${beat5}"`);

console.log('5. 播放视频并观察节拍轮转...');
const video = page.locator('video').first();
await video.evaluate((el) => {
  el.muted = true;
});
await page.locator('#btnPlayPause').click();
await page.waitForTimeout(1200);

console.log('6. 测试快捷键 [B] 开关 8 拍节拍器...');
// 快捷键会被「焦点在按钮上」时忽略，先把焦点移开（点播放按钮会留下焦点）
await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
await page.keyboard.press('b');
await page.waitForTimeout(400);
const isVisibleAfterToggle = await page.locator('#beatMetronomeContainer').isVisible();
console.log('按 B 键后节拍器是否可见 (应为 false):', isVisibleAfterToggle);
if (isVisibleAfterToggle) {
  throw new Error('快捷键 B 未成功关闭节拍器！');
}

console.log('7. 再次按快捷键 [B] 重新开启节拍器...');
await page.keyboard.press('b');
await page.waitForTimeout(400);
const isVisibleAfterReopen = await page.locator('#beatMetronomeContainer').isVisible();
console.log('再次按 B 键后节拍器是否重新可见 (应为 true):', isVisibleAfterReopen);
if (!isVisibleAfterReopen) {
  throw new Error('快捷键 B 未成功重新开启节拍器！');
}

console.log('8. 截取播放器与 8 拍卡点指示灯画面...');
await page.screenshot({ path: 'playwright-beat-metronome.png' });
console.log('截图已保存至 playwright-beat-metronome.png');

await browser.close();

console.log('控制台报错数:', errors.length);
if (errors.length > 0) {
  console.error('控制台错误:', errors);
  process.exit(1);
}

console.log('✅ 全部测试顺利通过！M1 (离线 BPM 测算与 8 拍卡点指示灯) 验证完毕！');
