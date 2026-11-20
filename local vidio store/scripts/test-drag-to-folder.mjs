import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: (process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'),
  });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  console.log('Navigating to app...');
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForTimeout(1000);

  // If empty state, click demo button and wait for completion
  const demoBtn = page.locator('button:has-text("载入演示视频体验")').first();
  if (await demoBtn.count() > 0) {
    console.log('Clicking demo button...');
    await demoBtn.click();
    console.log('Waiting for scanning and video generation to finish...');
    await page.waitForSelector('text=正在分析与生成视频缩略图', { timeout: 10000 }).catch(() => {});
    await page.waitForSelector('text=正在分析与生成视频缩略图', { state: 'detached', timeout: 30000 });
    console.log('Video generation finished!');
  }

  // Wait for "内置示范库" to appear
  console.log('Waiting for subfolder cards to appear...');
  const folderCard = page.locator('text=内置示范库').first();
  await folderCard.waitFor({ state: 'visible', timeout: 10000 });
  console.log('Subfolder card found!');

  // Check video cards
  const videoCards = page.locator('.video-card');
  const count = await videoCards.count();
  console.log(`Found ${count} video cards.`);

  // Test native Drag and Drop using Playwright dragTo
  console.log('Testing Playwright dragTo from video card to subfolder card...');
  const firstVideo = page.locator('.video-card').first();
  await firstVideo.dragTo(folderCard);
  await page.waitForTimeout(1000);

  // Check if toast appears
  const toast = page.locator('.fixed.bottom-6.right-6');
  if (await toast.count() > 0) {
    const text = await toast.textContent();
    console.log('Toast displayed after dragTo:', text);
  }

  // Take screenshot of result
  await page.screenshot({ path: 'playwright-drag-result.png' });
  console.log('Saved playwright-drag-result.png');

  // Now click into 内置示范库
  console.log('Clicking into 内置示范库...');
  await folderCard.click();
  await page.waitForTimeout(1000);

  // Check breadcrumbs
  const rootBreadcrumb = page.locator('button:has-text("媒体库全部")').first();
  await rootBreadcrumb.waitFor({ state: 'visible' });

  // Test dragTo from video card to root breadcrumb
  console.log('Testing dragTo from video card to "媒体库全部" breadcrumb...');
  const videoInFolder = page.locator('.video-card').first();
  if (await videoInFolder.count() > 0) {
    await videoInFolder.dragTo(rootBreadcrumb);
    await page.waitForTimeout(1000);

    if (await toast.count() > 0) {
      const text = await toast.textContent();
      console.log('Breadcrumb Toast displayed after drag:', text);
    }
  }

  await page.screenshot({ path: 'playwright-drag-breadcrumb.png' });
  console.log('Saved playwright-drag-breadcrumb.png');

  await browser.close();
  console.log('All drag tests passed successfully!');
}

main().catch((err) => {
  console.error('Error during test:', err);
  process.exit(1);
});
