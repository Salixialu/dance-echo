/**
 * warm-pose — 预热骨骼索引（离线扫描很慢，15s 的视频要 70s+）
 *
 * 骨骼索引存在浏览器 IndexedDB 里，所以录制脚本用一个持久化的 profile：
 * 先跑一次这个脚本把索引扫好，录制时直接命中「382 帧」，不用把 70 秒扫描录进片子。
 *
 * 用法：node scripts/demo/warm-pose.mjs --video=bone
 */
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// 注意：profile 不能放在 vite 的 watch 根（local vidio store）里，
// 否则 Chrome 锁住的 Cookies 文件会让 vite 的 fs.watch 报 EBUSY 直接崩掉。
const PROFILE = path.resolve(HERE, '..', '..', '..', '..', '.tmp-pose-profile');

const arg = process.argv.slice(2).find((a) => a.startsWith('--video='));
const needle = arg ? arg.slice('--video='.length) : 'bone';

const context = await chromium.launchPersistentContext(PROFILE, { headless: true, viewport: { width: 1600, height: 900 } });
const page = context.pages()[0] ?? (await context.newPage());
page.setDefaultTimeout(15000);

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.locator('[data-testid="video-card"]').filter({ hasText: needle }).first().click();
await page.waitForTimeout(3000);

const openMenu = async () => {
  const btn = page.locator('#btnCycleDisplayMode');
  const box = await btn.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(600);
  return page.getByText('骨骼索引').first().isVisible().catch(() => false);
};

if (!(await openMenu())) throw new Error('视图菜单没打开');
const scan = page.locator('[data-testid="pose-track-scan"]');
console.log('开始扫描…', (await scan.innerText()).replace(/\n/g, ' '));
const t0 = Date.now();
await scan.click({ force: true });
for (let i = 0; i < 200; i += 1) {
  await page.waitForTimeout(1000);
  const txt = (await scan.innerText().catch(() => '')).replace(/\n/g, ' ');
  if (/帧/.test(txt) && !/%/.test(txt)) {
    console.log(`扫描完成：${txt}（${Math.round((Date.now() - t0) / 1000)}s）`);
    break;
  }
  if (i % 10 === 0) console.log('  ', txt);
}
await context.close();
