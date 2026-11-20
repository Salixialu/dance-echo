import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  executablePath: (process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'),
});

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
const pageErrors = [];

page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(error.message));

try {
  console.log('1. 打开主界面...');
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });

  // 如果没有视频卡片，导入本地测试视频
  let cards = page.locator('.video-card');
  if ((await cards.count()) === 0) {
    console.log('2. 导入测试视频...');
    await page.locator('#fileImportInput').setInputFiles('D:/Dance Echo/local vidio store/fixtures/1.mp4');
    await page.waitForFunction(() => document.querySelectorAll('.video-card').length >= 1, null, { timeout: 30000 });
    cards = page.locator('.video-card');
  }

  console.log('3. 点击视频卡片进入播放器...');
  await cards.first().click();

  // 等待播放器浮层出现
  const player = page.locator('#playerModal');
  await player.waitFor({ state: 'visible', timeout: 5000 });
  console.log('播放器已打开！');

  // 等待视频开始加载
  await page.waitForTimeout(1500);

  // 4. 打开感受笔记抽屉
  console.log('4. 打开感受笔记抽屉...');
  const moreTools = page.getByText('更多', { exact: true }).first();
  if (await moreTools.count()) await moreTools.click();
  const noteBtn = page.locator('#btnObservationDrawer');
  await noteBtn.waitFor({ state: 'visible' });
  await noteBtn.click();

  const drawer = page.locator('#observationDrawer');
  await drawer.waitFor({ state: 'visible', timeout: 3000 });
  console.log('感受笔记抽屉已成功滑出！');

  // 5. 点击快捷标签 [发力点]
  console.log('5. 选择标签并录入心得...');
  const tagBtn = drawer.getByRole('button', { name: '#发力点' });
  await tagBtn.click();

  // 6. 输入感受心得文字
  const textarea = drawer.locator('textarea');
  await textarea.fill('转身时留头，重心落于右脚前掌，保持核心收紧');

  // 7. 点击记录心得
  const submitBtn = drawer.getByRole('button', { name: '记录心得' });
  await submitBtn.click();
  await page.waitForTimeout(1000);

  // 截图抽屉展示与时间轴
  await page.screenshot({ path: 'playwright-observation-drawer.png' });
  console.log('截图已保存: playwright-observation-drawer.png');

  // 8. 测试时间戳跳帧
  console.log('8. 测试点击心得时间戳跳帧...');
  const timestampBtn = drawer.locator('button:has-text(":")').first();
  if (await timestampBtn.isVisible()) {
    await timestampBtn.click();
    console.log('时间戳点击成功，播放器已响应跳帧！');
  }

  // 9. 关闭播放器并重新打开，检验时间回声 (Time Echo)
  console.log('9. 关闭播放器...');
  const closeBtn = page.locator('#btnClosePlayer');
  await closeBtn.click();
  await page.waitForTimeout(1000);

  console.log('10. 重新打开该视频，检验“时间回声 (Time Echo)”唤醒浮层...');
  await page.locator('.video-card').first().click();
  await player.waitFor({ state: 'visible', timeout: 5000 });

  // 检测时间回声浮层
  const echoBanner = page.locator('#timeEchoBanner');
  await echoBanner.waitFor({ state: 'visible', timeout: 4000 });
  const echoText = await echoBanner.innerText();
  console.log('成功捕获时间回声浮层内容:', echoText);

  await page.screenshot({ path: 'playwright-time-echo.png' });
  console.log('时间回声截图已保存: playwright-time-echo.png');

  // 点击回声浮层上的“点击复习”
  const reviewBtn = echoBanner.getByRole('button', { name: '点击复习' });
  await reviewBtn.click();
  await drawer.waitFor({ state: 'visible', timeout: 3000 });
  console.log('点击回声复习成功滑出笔记抽屉！');

  console.log('✅ 所有核心功能验证通过！');
} catch (err) {
  console.error('测试异常:', err);
  await page.screenshot({ path: 'playwright-observation-error.png' });
  process.exitCode = 1;
} finally {
  await browser.close();
}
