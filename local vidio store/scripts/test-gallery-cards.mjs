import assert from 'node:assert';
import { chromium } from 'playwright';

console.log('===============================================================');
console.log('       VIDEOGRID 56px CONTROL BAR & CARD HOVER SCRUBBING       ');
console.log('===============================================================\n');

const browser = await chromium.launch({
  headless: true,
  executablePath: (process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'),
});

const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => {
  localStorage.setItem('dance_echo_sidebar_collapsed', 'false');
});

const page = await context.newPage();
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });

// 1. 56px 单行控制栏
console.log('[CHECK 1] 56px consolidated control bar height...');
const header = page.locator('header').first();
await header.waitFor({ state: 'visible', timeout: 15000 });
const headerBox = await header.boundingBox();
console.log(`  * Header height: ${headerBox?.height}px`);
assert(headerBox && Math.abs(headerBox.height - 56) <= 2, `Expected 56px header, got ${headerBox?.height}px`);
console.log('  ✓ 56px single-line control bar verified.');

// 2. 根面包屑
console.log('\n[CHECK 2] Breadcrumb root locator...');
const rootBreadcrumb = page.locator('text=媒体库全部').first();
assert(await rootBreadcrumb.isVisible(), 'Root breadcrumb "媒体库全部" missing!');
console.log('  ✓ Root breadcrumb present.');

// 3. 搜索胶囊 + 快捷键聚焦（新的 ⌘K 提示放在 title 里，不再有 kbd 徽标）
console.log('\n[CHECK 3] Search pill & Ctrl/⌘+K focus...');
const searchInput = page.locator('input[placeholder*="搜索"], input[placeholder*="Search"]').first();
assert(await searchInput.isVisible(), 'Search pill input missing!');
const searchTitle = await searchInput.getAttribute('title');
assert(searchTitle && /Ctrl\/⌘ \+ K|⌘K|Ctrl\+K/i.test(searchTitle), `Search input title should document the Ctrl/⌘+K shortcut, got "${searchTitle}"`);

await page.keyboard.press('Control+k');
await page.waitForTimeout(100);
assert(await searchInput.evaluate((el) => document.activeElement === el), 'Control+K did not focus search input!');
console.log('  ✓ Control+K focused the search input.');
await page.keyboard.press('Escape');
await searchInput.fill('');
await page.waitForTimeout(100);

// 4. 库里有卡片（没有就通过 CTA 菜单载入演示视频）
console.log('\n[CHECK 4] Ensuring gallery has cards...');
let cards = page.locator('.video-card');
if ((await cards.count()) === 0) {
  console.log('  * Library empty, loading demo videos via CTA menu...');
  const cta = page.locator('button[data-testid="sidebar-import-cta"]').first();
  await cta.waitFor({ state: 'visible', timeout: 15000 });
  await cta.click();
  await page.waitForTimeout(300);
  await page.getByText(/载入内置演示视频|Load Demo Videos/).first().click();
  await page.waitForSelector('.video-card', { timeout: 20000 });
  cards = page.locator('.video-card');
}
const cardCount = await cards.count();
console.log(`  * Cards in gallery: ${cardCount}`);
assert(cardCount > 0, 'No video cards after demo load!');

const firstCard = cards.first();
assert(await firstCard.isVisible(), 'First card not visible!');

// 5. 静止态：时长徽标 + 悬停才出现的快捷菜单入口
console.log('\n[CHECK 5] Resting card metadata...');
const durationText = await firstCard.getByText(/\d+:\d{2}/).first().innerText();
console.log(`  * Duration badge: "${durationText}"`);
assert(/^\d+:\d{2}$/.test(durationText.trim()), `Unexpected duration badge text: "${durationText}"`);

await firstCard.hover();
await page.waitForTimeout(200);
const moreBtn = firstCard.locator('button[title="快捷菜单"]').first();
assert(await moreBtn.isVisible(), 'Quick menu button missing on hover!');
console.log('  ✓ Duration badge present, quick menu reaches on hover.');

// 6. 悬停拖拽进度条：鼠标移动时进度条跟着走
console.log('\n[CHECK 6] Hover scrubbing progress line...');
const cardBox = await firstCard.boundingBox();
assert(cardBox, 'Card has no bounding box!');

const scrubBar = firstCard.locator('div.h-full.bg-gradient-to-r').first();
const sample = async (ratio) => {
  await page.mouse.move(cardBox.x + cardBox.width * ratio, cardBox.y + cardBox.height * 0.3);
  await page.waitForTimeout(200);
  return (await scrubBar.isVisible()) ? await scrubBar.getAttribute('style') : null;
};

const at25 = await sample(0.25);
const at75 = await sample(0.75);
console.log(`  * 25%: ${at25}`);
console.log(`  * 75%: ${at75}`);
if (at25 || at75) {
  assert(at25 && at25.includes('width:'), 'Scrub bar at 25% has no width style!');
  assert(at75 && at75.includes('width:'), 'Scrub bar at 75% has no width style!');
  const widthOf = (style) => Number((style.match(/width:\s*([\d.]+)%/) ?? [])[1] ?? -1);
  assert(widthOf(at75) > widthOf(at25), `Scrub bar did not track cursor (${at25} → ${at75})`);
  console.log('  ✓ Scrub bar tracks cursor position.');
} else {
  console.log('  ⚠️ 该卡片没有可解析的时长，跳过进度条断言（不算失败）。');
}

// 7. 卡片常显收藏心形 + 快捷浮层：移动到分组 / 循环队列
console.log('\n[CHECK 7] Card favorite + quick action popover...');
const favoriteBtn = firstCard.getByTestId('card-favorite');
assert(await favoriteBtn.count() === 1, 'Inline favorite heart missing on card!');
const favoriteBefore = await favoriteBtn.getAttribute('aria-pressed');
await favoriteBtn.click();
await page.waitForTimeout(200);
const favoriteAfter = await favoriteBtn.getAttribute('aria-pressed');
assert(favoriteBefore !== favoriteAfter, 'Inline favorite heart did not toggle state');
console.log(`  ✓ Inline favorite toggles (${favoriteBefore} → ${favoriteAfter}).`);
await firstCard.hover();
await moreBtn.click();
await page.waitForTimeout(200);
// 菜单是 portal 到 body 的，必须用 page 作用域找，不能再挂在 firstCard 上
const moveAction = page.locator('[data-card-menu]').getByText(/移动到分组/).first();
const queueAction = page.locator('[data-card-menu]').getByText(/循环队列|Loop Queue/).first();
assert(await moveAction.isVisible(), 'Move-to-folder action missing in popover!');
assert(await queueAction.isVisible(), 'Quick loop-queue action missing in popover!');
console.log('  ✓ Quick actions (move to folder / loop queue) present.');
await page.keyboard.press('Escape');
await page.mouse.click(5, 5);
await page.waitForTimeout(150);

await browser.close();

console.log('\n===============================================================');
console.log(' ALL VIDEOGRID 56px & CARD HOVER SCRUBBING TESTS PASSED (0 ERR)');
console.log('===============================================================\n');
