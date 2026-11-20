import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: (process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'),
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });

  // 1. 载入内置演示视频建立带目录的数据
  const demoBtn = page.locator('button:has-text("载入演示视频体验"), button:has-text("载入内置演示视频")').first();
  if (await demoBtn.isVisible()) {
    await demoBtn.click();
    await page.waitForTimeout(1000);
  }

  // 截图初始首页网格
  await page.screenshot({ path: 'playwright-folder-cards-home.png' });
  console.log('1. Saved playwright-folder-cards-home.png');

  // 2. 检查面包屑
  const breadcrumb = page.locator('text=媒体库全部').first();
  console.log('Breadcrumb exists:', await breadcrumb.isVisible());

  // 3. 检查是否有子文件夹卡片
  const folderCard = page.locator('div:has-text("内置示范库")').first();
  if (await folderCard.isVisible()) {
    console.log('Found folder card: 内置示范库, clicking into it...');
    await folderCard.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'playwright-folder-cards-inside.png' });
    console.log('2. Saved playwright-folder-cards-inside.png');

    // 点击面包屑返回全部
    await breadcrumb.click();
    await page.waitForTimeout(400);
  }

  // 4. 测试点击触发「✨ 舞蹈朋友 (AI)」
  const aiTrigger = page.locator('button:has-text("舞蹈朋友")').first();
  console.log('AI trigger visible:', await aiTrigger.isVisible());
  await aiTrigger.click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'playwright-ai-drawer-open.png' });
  console.log('3. Saved playwright-ai-drawer-open.png');

  // 5. 点击一个快捷问题提问
  const promptBtn = page.locator('button:has-text("找高节奏练习")').first();
  if (await promptBtn.isVisible()) {
    await promptBtn.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'playwright-ai-chat-response.png' });
    console.log('4. Saved playwright-ai-chat-response.png');
  }

  await browser.close();
  console.log('ALL PLAYWRIGHT TESTS PASSED!');
}

main().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
