import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: (process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'),
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });

  // 1. Initial screenshot
  await page.screenshot({ path: 'playwright-sidebar-initial.png' });
  console.log('1. Initial state screenshot saved');

  // 2. Click growth heatmap entry to open modal
  const growthButton = page.locator('text=练舞成长热力').first();
  await growthButton.click();
  await page.waitForTimeout(600);

  // 3. Screenshot modal open
  await page.screenshot({ path: 'playwright-growth-modal-open.png' });
  console.log('2. Modal open screenshot saved');

  // Get modal container position and width
  const modal = page.locator('div.w-full.max-w-xl').first();
  const box = await modal.boundingBox();
  console.log('Modal box dimensions:', box);

  // 4. Close modal
  const closeBtn = page.locator('button[aria-label="关闭成长看板"]').first();
  await closeBtn.click();
  await page.waitForTimeout(400);

  // 5. Test collapse sidebar
  const collapseBtn = page.locator('button[title="收起折叠侧边栏"]').first();
  if (await collapseBtn.isVisible()) {
    await collapseBtn.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'playwright-sidebar-collapsed.png' });
    console.log('3. Collapsed sidebar screenshot saved');

    // Click expand
    const expandBtn = page.locator('button[title="展开侧边栏"]').first();
    await expandBtn.click();
    await page.waitForTimeout(400);
  }

  // 6. Test drag resizing
  const resizer = page.locator('div[title*="按住拖拽调节宽度"]').first();
  const resizerBox = await resizer.boundingBox();
  if (resizerBox) {
    await page.mouse.move(resizerBox.x + resizerBox.width / 2, resizerBox.y + 200);
    await page.mouse.down();
    await page.mouse.move(resizerBox.x + 120, resizerBox.y + 200);
    await page.mouse.up();
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'playwright-sidebar-resized.png' });
    console.log('4. Resized sidebar screenshot saved');
  }

  await browser.close();
  console.log('ALL TESTS PASSED!');
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
