import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: (process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'),
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', msg => console.log('BROWSER LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERR:', err));

  await page.goto('http://127.0.0.1:5173/');
  await page.waitForTimeout(1000);

  const loadBtn = page.locator('button:has-text("载入演示视频体验")').first();
  console.log('Button count:', await loadBtn.count());
  if (await loadBtn.count() > 0) {
    await loadBtn.click();
    console.log('Clicked, waiting 5s...');
    await page.waitForTimeout(5000);
  }

  await page.screenshot({ path: 'debug-page-view.png' });
  const text = await page.evaluate(() => document.body.innerText);
  console.log('Body text:\n', text);
  await browser.close();
}

main().catch(console.error);
