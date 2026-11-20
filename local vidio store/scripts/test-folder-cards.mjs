import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: (process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'),
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });

  // Click load demo videos
  const loadBtn = page.locator('button:has-text("载入演示视频体验"), button:has-text("载入内置演示视频")').first();
  await loadBtn.click();
  console.log('Clicked load demo button, waiting for generation...');

  // Wait for folder or video cards
  await page.waitForSelector('text=内置示范库', { timeout: 20000 });
  await page.waitForTimeout(1000);

  // Take screenshot with folder card visible
  await page.screenshot({ path: 'playwright-folder-cards-demo.png' });
  console.log('Folder card screenshot saved!');

  // Click on the folder card
  const folderCard = page.locator('div:has-text("内置示范库")').first();
  await folderCard.click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'playwright-inside-demo-folder.png' });
  console.log('Inside folder screenshot saved!');

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
