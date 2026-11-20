import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: (process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'),
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  
  // 载入真实视频
  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <head><style>body { margin:0; background:#000; overflow:hidden; }</style></head>
    <body>
      <video id="v" src="file:///D:/Dance Echo/vidio/1.mp4" muted playsinline style="width:100vw; height:100vh; object-fit:contain;"></video>
    </body>
    </html>
  `);

  await page.evaluate(async () => {
    const v = document.getElementById('v');
    await new Promise((resolve) => {
      v.onloadedmetadata = resolve;
      v.load();
    });
    v.currentTime = 5.0; // 截取舞者动作张力最大的时刻
    await new Promise((resolve) => {
      v.onseeked = resolve;
    });
  });

  await page.waitForTimeout(600);
  await page.screenshot({ path: 'D:/Dance Echo/local vidio store/scripts/real-frame-dancer.jpg', quality: 95 });
  console.log('Real dancer frame captured successfully!');
  await browser.close();
}

main().catch(console.error);
