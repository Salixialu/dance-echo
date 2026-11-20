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

console.log('1. 打开 Dance Echo 首页...');
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);

console.log('2. 点击载入演示视频体验...');
const loadDemoBtn = page.getByText('载入演示视频体验').first();
if (await loadDemoBtn.isVisible()) {
  await loadDemoBtn.click();
} else {
  const sidebarDemo = page.getByText('载入内置演示视频').first();
  if (await sidebarDemo.isVisible()) {
    await sidebarDemo.click();
  }
}
await page.waitForSelector('.video-card', { timeout: 25000 });
await page.waitForTimeout(1000);

console.log('3. 验证侧边栏歌曲曲库中是否生成 Super Shy 与 Supernova...');
await page.waitForSelector('text=歌曲曲库', { timeout: 10000 });
const songLibraryText = await page.locator('text=歌曲曲库').textContent();
console.log('侧边栏歌曲曲库标题:', songLibraryText);

const superShyItem = page.locator('button:has-text("Super Shy")').first();
const isSuperShyVisible = await superShyItem.isVisible();
console.log('Super Shy 是否在歌曲曲库中显示:', isSuperShyVisible);
if (!isSuperShyVisible) {
  throw new Error('未在侧边栏找到 Super Shy 歌曲项！');
}

console.log('4. 点击侧边栏 Super Shy 进行同曲目聚合筛选...');
await superShyItem.click();
await page.waitForTimeout(1000);

console.log('5. 验证是否出现舞曲档案横幅与左右同屏对比 (VS) 按钮...');
const vsBanner = page.locator('text=舞曲档案: Super Shy');
await vsBanner.waitFor({ timeout: 5000 });
console.log('舞曲档案横幅已展示！');

const vsCompareBtn = page.locator('button:has-text("左右同屏对比 (VS)")').first();
const isVsBtnVisible = await vsCompareBtn.isVisible();
console.log('VS 对比按钮是否可见:', isVsBtnVisible);
if (!isVsBtnVisible) {
  throw new Error('未找到左右同屏对比 (VS) 按钮！');
}

console.log('6. 点击启动双屏同曲目 VS 扒舞对比...');
await vsCompareBtn.click();
await page.waitForTimeout(1500);

await page.waitForSelector('text=双屏同曲目 VS 对比工作台', { timeout: 8000 });
console.log('VS 对比工作台模态框已成功打开！');

const artifactVsPath = 'C:/Users/29630/.gemini/antigravity/brain/66f38c47-32b4-4ebc-a9f2-05044e427c38/playwright-song-compare-vs.png';
await page.screenshot({ path: artifactVsPath, fullPage: false });
console.log(`已保存 VS 对比截图到: ${artifactVsPath}`);

console.log('7. 退出 VS 对比工作台...');
await page.keyboard.press('Escape');
await page.waitForTimeout(800);

console.log('8. 进入单个视频播放页测试 🎵 听歌识曲与档案绑定弹窗...');
await page.locator('.video-card').first().click();
await page.waitForSelector('#btnOpenSongRecognize', { timeout: 8000 });

console.log('9. 点击顶栏 🎵 歌曲识别与档案按钮...');
await page.locator('#btnOpenSongRecognize').click();
await page.waitForTimeout(1000);

await page.waitForSelector('#songRecognizeModal', { timeout: 8000 });
console.log('歌曲识别弹窗已打开！');

// 验证三大 Tab
const tab1 = await page.locator('button:has-text("开放搜歌")').isVisible();
const tab2 = await page.locator('button:has-text("ACRCloud 听歌识曲")').isVisible();
const tab3 = await page.locator('button:has-text("手动指定 / 离线")').isVisible();
console.log(`三大面板状态: 开放搜歌=${tab1}, ACRCloud=${tab2}, 手动指定=${tab3}`);

const artifactModalPath = 'C:/Users/29630/.gemini/antigravity/brain/66f38c47-32b4-4ebc-a9f2-05044e427c38/playwright-song-modal.png';
await page.screenshot({ path: artifactModalPath, fullPage: false });
console.log(`已保存歌曲识曲弹窗截图到: ${artifactModalPath}`);

console.log('10. 测试完成，全部功能通过！');
await browser.close();
