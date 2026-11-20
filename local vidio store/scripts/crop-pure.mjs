import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dancerImgPath = path.join(__dirname, '..', 'playwright-click-dancer.png');
const dancerBase64 = 'data:image/png;base64,' + fs.readFileSync(dancerImgPath).toString('base64');

async function cropPureVideo() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: (process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'),
  });
  // 裁切尺寸：去除原截图外围的顶栏与底栏
  const page = await browser.newPage({ viewport: { width: 920, height: 500 } });
  
  await page.setContent(`
    <!DOCTYPE html>
    <html><body style="margin:0;overflow:hidden;background:#000;">
      <img src="${dancerBase64}" 
           style="position:absolute; left:-180px; top:-100px; width:1280px; height:720px; object-fit:cover;">
    </body></html>
  `);

  await page.waitForTimeout(400);
  const outPath = path.join(__dirname, 'pure-dancer-stage.jpg');
  await page.screenshot({ path: outPath, quality: 95 });
  console.log('Pure stage video cropped successfully to:', outPath);
  await browser.close();
}

cropPureVideo().catch(console.error);
