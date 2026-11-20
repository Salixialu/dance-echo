import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  executablePath: (process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'),
});
const context = await browser.newContext();
const page = await context.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.locator('#fileImportInput').setInputFiles('D:/Dance Echo/local vidio store/fixtures/1.mp4');
await page.waitForFunction(() => document.querySelectorAll('.video-card').length >= 1, null, { timeout: 30000 });

const cards = page.locator('.video-card');
if (await cards.count() === 0) throw new Error('演示视频卡片没有生成');
await cards.first().click();

const video = page.locator('video').first();
await video.waitFor({ state: 'attached', timeout: 10000 });
await page.waitForFunction(() => document.querySelector('video')?.readyState >= 3, null, { timeout: 10000 });

const before = await video.evaluate((element) => {
  const node = element;
  return { readyState: node.readyState, duration: node.duration, src: node.src };
});
await video.evaluate((element) => { element.muted = true; });
if (await video.evaluate((element) => element.paused)) {
  await page.locator('#btnPlayPause').click();
}
await page.waitForFunction(() => (document.querySelector('video')?.currentTime || 0) > 0, null, { timeout: 5000 }).catch(() => {});
await page.waitForTimeout(600);
const after = await video.evaluate((element) => ({ currentTime: element.currentTime, paused: element.paused }));

await page.locator('#btnClosePlayer').click();
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => document.querySelectorAll('.video-card').length >= 1, null, { timeout: 10000 });
await page.locator('.video-card').first().click();
await page.waitForFunction(() => document.querySelector('video')?.readyState >= 3, null, { timeout: 10000 });
const afterReload = await page.locator('video').first().evaluate((element) => ({ readyState: element.readyState, duration: element.duration }));

console.log(JSON.stringify({ before, after, afterReload, errors }, null, 2));
await page.screenshot({ path: 'playwright-playback.png', fullPage: true });
await browser.close();

if (errors.length || before.readyState < 3 || !Number.isFinite(before.duration) || after.paused || after.currentTime <= 0 || afterReload.readyState < 3) {
  process.exitCode = 1;
}
