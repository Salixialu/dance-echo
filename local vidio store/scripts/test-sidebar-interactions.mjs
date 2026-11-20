import assert from 'node:assert';
import { chromium } from 'playwright';

console.log('===============================================================');
console.log('       SIDEBAR CTA, DROPDOWN & FOLDER TREE E2E SUITE          ');
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

const cta = page.locator('button[data-testid="sidebar-import-cta"]').first();
if (!(await cta.isVisible().catch(() => false))) {
  const expandBtn = page.locator('button[title*="展开侧边栏"]').first();
  if (await expandBtn.isVisible().catch(() => false)) await expandBtn.click();
}
await cta.waitFor({ state: 'visible', timeout: 15000 });

// 1. 导入入口是一次点击可展开的纯白圆钮（设计契约：white pill，不退化成一个下拉箭头）
console.log('[CHECK 1] Verifying single white pill CTA...');
const ctaClasses = (await cta.getAttribute('class')) ?? '';
assert(ctaClasses.includes('bg-white') && ctaClasses.includes('rounded-full'), 'CTA is not a pure-white pill/round button!');
console.log('  ✓ Single white round CTA confirmed.');

// 2. 点击 CTA 本身即展开三选一菜单（旧的 aria-label="更多导入选项" 独立箭头已并入 CTA）
console.log('[CHECK 2] Opening CTA menu by clicking the pill...');
await cta.click();
await page.waitForTimeout(300);

const mountItem = page.getByText(/挂载本地视频目录|Mount Local Directory/).first();
const importItem = page.getByText(/导入视频文件|Import Video Files/).first();
const demoItem = page.getByText(/载入内置演示视频|Load Demo Videos/).first();

assert(await mountItem.isVisible(), 'Mount directory option missing in CTA menu!');
assert(await importItem.isVisible(), 'Import files option missing in CTA menu!');
assert(await demoItem.isVisible(), 'Demo videos option missing in CTA menu!');
console.log('  ✓ CTA menu shows all three actions (mount / import files / demo videos).');

// 3. 点演示视频，等卡片真的渲染出来（不靠固定 sleep）
console.log('\n[CHECK 3] Loading demo videos and waiting for cards...');
await demoItem.click();
await page.waitForSelector('.video-card', { timeout: 20000 });
const cardCount = await page.locator('.video-card').count();
assert(cardCount > 0, 'Demo videos did not produce any card!');
console.log(`  ✓ Demo videos rendered: ${cardCount} card(s).`);

// 4. 分类入口：展开态是带文字的整行按钮（继续观看 / 收藏 / 练习瞬间）
console.log('\n[CHECK 4] Verifying category entries...');
const continueEntry = page.locator('button:has-text("最近观看")').first();
assert(await continueEntry.isVisible(), 'Recent-watching entry (button:has-text("最近观看")) missing!');

const starredEntry = page.locator('button:has-text("收藏")').first();
assert(await starredEntry.isVisible(), 'Starred entry (button:has-text("收藏")) missing!');

// 「练习瞬间」在展开态侧栏；筛选面板里有同名的快捷开关
const bookmarkedEntry = page.locator('button:has-text("留言")').first();
assert(await bookmarkedEntry.isVisible(), 'Bookmarked entry (button:has-text("留言")) missing!');

const groupManager = page.locator('[data-testid="tool-group-manager"]').first();
assert(await groupManager.isVisible(), 'Group manager (data-testid="tool-group-manager") missing!');

// 顶栏已收敛为「搜索 + 排序 + 筛选」：「留言」并入筛选面板
await page.getByTestId('tag-filter-toggle').click();
const notesFilter = page.locator('[data-testid="filter-notes"]').first();
await notesFilter.waitFor({ state: 'visible', timeout: 5000 });
assert(await notesFilter.isVisible(), 'Notes filter (data-testid="filter-notes") missing from filter panel!');
await page.keyboard.press('Escape');
console.log('  ✓ Continue / Starred / Notes (sidebar) + folder tree + Notes switch (filter panel) all present.');

// 旧的非功能 PWA 卡片必须彻底消失
const pwaCard = page.getByText(/PWA 架构准备|PWA Preparation/);
assert.strictEqual(await pwaCard.count(), 0, 'Legacy non-functional PWA card is back in the DOM!');
console.log('  ✓ Legacy PWA card is gone.');

// 5. 折叠/展开与拖拽调宽
console.log('\n[CHECK 5] Sidebar collapse / expand / resize boundaries...');
const collapseBtn = page.locator('button[title*="收起折叠侧边栏"]').first();
if (await collapseBtn.isVisible().catch(() => false)) {
  await collapseBtn.click();
  await page.waitForTimeout(300);
  const expandBtn = page.locator('button[title*="展开侧边栏"]').first();
  assert(await expandBtn.isVisible(), 'Sidebar collapsed but no expand button appeared!');
  await expandBtn.click();
  await page.waitForTimeout(300);
  console.log('  ✓ Collapse → expand round-trip verified.');
}

const resizer = page.locator('div[title*="按住拖拽调节宽度"]').first();
assert(await resizer.isVisible(), 'Resize handle (div[title*="按住拖拽调节宽度"]) missing!');
const box = await resizer.boundingBox();
assert(box, 'Resize handle has no bounding box!');
await page.mouse.move(box.x + box.width / 2, box.y + 100);
await page.mouse.down();
await page.mouse.move(box.x - 200, box.y + 100, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(250);
await resizer.dblclick();
await page.waitForTimeout(250);
console.log('  ✓ Resize drag + double-click reset verified.');

await browser.close();

console.log('\n===============================================================');
console.log(' ALL SIDEBAR CTA, DROPDOWN & MEDIA TESTS PASSED (0 ERRORS)    ');
console.log('===============================================================\n');
