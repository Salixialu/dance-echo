import { chromium } from 'playwright';
import path from 'path';

async function crop() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: (process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'),
  });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.setContent(`
    <!DOCTYPE html>
    <html><body style="margin:0;overflow:hidden;background:#000;">
      <img id="src" src="file:///D:/Dance Echo/local vidio store/playwright-click-dancer.png" style="position:absolute;left:-160px;top:-90px;width:1280px;height:720px;object-fit:cover;">
    </body></html>
  `);
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'D:/Dance Echo/local vidio store/scripts/stage-dancer-card.jpg', quality: 95 });
  await browser.close();
  console.log('Cropped real stage dancer image saved!');
}
crop().catch(console.error);
