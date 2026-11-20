import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { chromium } from 'playwright';

/**
 * 最近观看一致性契约：
 *   1. 侧边栏角标与网格过滤共用同一份谓词（静态防回归）
 *   2. 角标数字与点进去看到的卡片数量一致
 */
console.log('===============================================================');
console.log('         CONTINUE-WATCHING BADGE / FILTER CONTRACT            ');
console.log('===============================================================\n');

const projectRoot = path.resolve('.');

console.log('[CHECK A] Both surfaces share one predicate implementation...');
const helperPath = path.join(projectRoot, 'src/utils/continueWatching.ts');
assert(fs.existsSync(helperPath), 'src/utils/continueWatching.ts missing!');
const sidebarSource = fs.readFileSync(path.join(projectRoot, 'src/components/sidebar/Sidebar.tsx'), 'utf8');
const gridSource = fs.readFileSync(path.join(projectRoot, 'src/components/gallery/VideoGrid.tsx'), 'utf8');
assert(sidebarSource.includes('countContinueWatching'), 'Sidebar must use countContinueWatching');
assert(gridSource.includes('isContinueWatching'), 'VideoGrid must use isContinueWatching');
assert(
  !sidebarSource.includes('playbackPosition || 0') || !sidebarSource.includes('p > 1'),
  'Sidebar still carries its own progress heuristic',
);
console.log('  ✓ Sidebar badge and VideoGrid filter go through the same helper.');

console.log('\n[CHECK B] Badge count equals rendered card count...');
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
});
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    localStorage.setItem('dance_echo_sidebar_collapsed', 'false');
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });

  const expandBtn = page.locator('button[title*="展开侧边栏"]').first();
  if (await expandBtn.isVisible().catch(() => false)) await expandBtn.click();

  const continueButton = page
    .locator('button')
    .filter({ hasText: /最近观看|Continue/ })
    .first();
  await continueButton.waitFor({ state: 'visible', timeout: 15000 });
  const badgeText = (await continueButton.locator('span').last().innerText()).trim();
  const badgeCount = Number.parseInt(badgeText, 10);
  assert(Number.isInteger(badgeCount), `Badge is not a number: "${badgeText}"`);
  console.log(`  * Sidebar badge = ${badgeCount}`);

  // data-category 只是按钮的固定标识，是否已选中要看 aria-pressed。
  if ((await continueButton.getAttribute('aria-pressed')) !== 'true') {
    await continueButton.click();
  }
  await page.waitForTimeout(900);

  const cardCount = await page.locator('[data-testid="card-enter-batch"]').count();
  console.log(`  * Rendered cards = ${cardCount}`);
  if (badgeCount > 0) {
    assert.strictEqual(cardCount, badgeCount, `Badge ${badgeCount} ≠ cards ${cardCount}`);
    const emptyVisible = await page
      .getByText(/没有未看完的视频|没有找到符合条件的视频|No videos match/)
      .isVisible()
      .catch(() => false);
    assert(!emptyVisible, 'Non-zero badge but empty state shown');
  } else {
    assert.strictEqual(cardCount, 0, `Badge 0 but ${cardCount} cards rendered`);
    const emptyVisible = await page
      .getByText(/没有未看完的视频|没有找到符合条件的视频|No videos match/)
      .isVisible()
      .catch(() => false);
    assert(emptyVisible, 'Badge 0 but empty state is not shown');
  }
  console.log('  ✓ Badge and list agree.');
} finally {
  await browser.close();
}

console.log('\n✅ Continue-watching contract passed');
