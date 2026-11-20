import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { chromium } from 'playwright';

console.log('========================================================================');
console.log(' CHALLENGER M6: ADVERSARIAL COVERAGE HARDENING & EDGE CASE VERIFIER     ');
console.log('========================================================================\n');

const browser = await chromium.launch({
  headless: true,
  executablePath: (process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'),
});

const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => {
  localStorage.setItem('dance_echo_sidebar_collapsed', 'false');
  localStorage.setItem('dance_echo_inspector_open', 'false');
  localStorage.setItem('dance_echo_locale', 'zh');
});

const page = await context.newPage();
const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') {
    consoleErrors.push(msg.text());
  }
});
page.on('pageerror', (err) => {
  consoleErrors.push(err.message);
});

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

// Ensure demo videos exist
let cards = page.locator('.video-card');
if ((await cards.count()) === 0) {
  console.log('[SETUP] Loading demo videos...');
  const dropdownBtn = page.locator('button[aria-label="更多导入选项"]').first();
  await dropdownBtn.click();
  await page.waitForTimeout(300);
  const demoItem = page.getByText(/载入内置演示视频|Load Demo Videos/).first();
  await demoItem.click();
  await page.waitForSelector('.video-card', { timeout: 15000 });
  cards = page.locator('.video-card');
}
const initialCardCount = await cards.count();
console.log(`[SETUP] Initial video card count: ${initialCardCount}`);
assert(initialCardCount > 0, 'No video cards loaded!');

// ============================================================================
// EDGE CASE 1: Dynamic Bilingual Switching During Video Playback & Inspector Open
// ============================================================================
console.log('\n------------------------------------------------------------------------');
console.log('[TEST 1] Dynamic Bilingual Switching During Video Playback & Inspector Open');
console.log('------------------------------------------------------------------------');

// 1.1 Open DancePlayer
console.log('  1.1 Launching DancePlayer...');
await cards.first().click();
await page.waitForTimeout(800);

const videoEl = page.locator('video#videoElement').first();
assert(await videoEl.isVisible(), 'DancePlayer videoElement is not visible!');

// Ensure video is playing
const isPausedInitial = await videoEl.evaluate((v) => v.paused);
if (isPausedInitial) {
  await page.locator('#btnPlayPause').first().click();
  await page.waitForTimeout(400);
}
const isPlayingNow = await videoEl.evaluate((v) => !v.paused);
console.log(`  * Video playback state: playing=${isPlayingNow}`);
const initialTime = await videoEl.evaluate((v) => v.currentTime);

// 1.2 Switch language while playing via dispatchEvent
console.log('  1.2 Switching language ZH -> EN during active video playback...');
const langBtnEn = page.locator('[data-testid="lang-btn-en"]').first();
await langBtnEn.dispatchEvent('click');
await page.waitForTimeout(400);

// Check that video is STILL playing (no interruption, stutter, or teardown)
const isStillPlaying = await videoEl.evaluate((v) => !v.paused);
const timeAfterLangSwitch = await videoEl.evaluate((v) => v.currentTime);
console.log(`  * Playback status after EN switch: playing=${isStillPlaying}, time=${timeAfterLangSwitch.toFixed(2)}s`);
assert(isStillPlaying, 'FAIL: Video playback was interrupted or stopped by language switch!');
assert(timeAfterLangSwitch >= initialTime, 'FAIL: Video playback position reset or rewound on language switch!');

// Verify Player UI updated to English (checking top island tooltips or buttons)
const closeBtn = page.locator('#btnClosePlayer').first();
const closeTitleEn = await closeBtn.getAttribute('title');
console.log(`  * Close button title in EN: "${closeTitleEn}"`);
assert(
  closeTitleEn && closeTitleEn.toLowerCase().includes('close'),
  `FAIL: Close button title was not translated to English: "${closeTitleEn}"`
);

// Switch back to ZH during playback
console.log('  1.3 Switching language EN -> ZH during active video playback...');
const langBtnZh = page.locator('[data-testid="lang-btn-zh"]').first();
await langBtnZh.dispatchEvent('click');
await page.waitForTimeout(400);

const closeTitleZh = await closeBtn.getAttribute('title');
console.log(`  * Close button title in ZH: "${closeTitleZh}"`);
assert(
  closeTitleZh && closeTitleZh.includes('关闭'),
  `FAIL: Close button title was not translated back to Chinese: "${closeTitleZh}"`
);

// 1.4 Close Player and test language switching with Inspector Drawer open
console.log('  1.4 Closing player to test Inspector Drawer bilingual oscillation...');
await page.mouse.move(500, 20);
await page.waitForTimeout(200);
const closeBtnEl = page.locator('#btnClosePlayer').first();
if (await closeBtnEl.isVisible()) {
  await closeBtnEl.click();
} else {
  await page.keyboard.press('Escape');
}
await page.waitForTimeout(600);
const playerModalCount = await page.locator('#playerModal').count();
assert.strictEqual(playerModalCount, 0, 'FAIL: Player modal did not close completely!');

const inspectorToggle = page.locator('button[data-testid="toggle-inspector-btn"]').first();
const drawer = page.locator('[data-testid="inspector-drawer"]').first();

// Ensure inspector is open
let isDrawerOpen = await drawer.evaluate((el) => el.classList.contains('w-80'));
if (!isDrawerOpen) {
  await inspectorToggle.click();
  await page.waitForTimeout(400);
}
isDrawerOpen = await drawer.evaluate((el) => el.classList.contains('w-80'));
assert(isDrawerOpen, 'Inspector drawer did not open!');

// Rapid bilingual toggling with drawer open
console.log('  1.5 Rapidly toggling bilingual state 6 times while Inspector is open...');
for (let i = 0; i < 6; i++) {
  const targetLang = i % 2 === 0 ? 'en' : 'zh';
  const btn = page.locator(`[data-testid="lang-btn-${targetLang}"]`).first();
  await btn.click();
  await page.waitForTimeout(100);
}
// Settle on EN
await page.locator('[data-testid="lang-btn-en"]').first().click();
await page.waitForTimeout(300);

const inspectorTextEn = await drawer.innerText();
assert(inspectorTextEn.includes('Practice Insights'), 'Inspector did not render English header');
assert(inspectorTextEn.includes('Practice Streak') || inspectorTextEn.includes('35-Day Trajectory'), 'Inspector did not render Practice Streak/Trajectory in English');
assert(!inspectorTextEn.includes('{'), 'Unresolved interpolation token found in English Inspector!');
assert(!inspectorTextEn.includes('[object Object]'), '[object Object] detected in English Inspector!');

// Settle back to ZH
await page.locator('[data-testid="lang-btn-zh"]').first().click();
await page.waitForTimeout(300);
const inspectorTextZh = await drawer.innerText();
assert(inspectorTextZh.includes('练舞洞察'), 'Inspector did not render Chinese header');
assert(!inspectorTextZh.includes('{'), 'Unresolved interpolation token found in Chinese Inspector!');
assert(!inspectorTextZh.includes('[object Object]'), '[object Object] detected in Chinese Inspector!');

console.log('  ✓ Dynamic bilingual switching during playback & open inspector verified 100% resilient.');

// Close drawer
await inspectorToggle.click();
await page.waitForTimeout(400);

// ============================================================================
// EDGE CASE 2: Extreme Input Conditions in ⌘K Search Capsule
// ============================================================================
console.log('\n------------------------------------------------------------------------');
console.log('[TEST 2] Extreme Input Conditions in ⌘K Search Capsule');
console.log('------------------------------------------------------------------------');

const searchInput = page.locator('input[placeholder*="搜索"], input[placeholder*="Search"]').first();
assert(await searchInput.isVisible(), '⌘K search input not visible!');

// 2.1 Test keyboard shortcut Control+K / Meta+K focus
console.log('  2.1 Testing global keyboard shortcut (Control+K)...');
// Blur first
await page.evaluate(() => {
  if (document.activeElement && typeof document.activeElement.blur === 'function') {
    document.activeElement.blur();
  }
});
await page.waitForTimeout(100);
const isFocusedBefore = await searchInput.evaluate((el) => el === document.activeElement);
assert(!isFocusedBefore, 'Search input should not be focused initially');

await page.keyboard.press('Control+KeyK');
await page.waitForTimeout(200);
const isFocusedAfter = await searchInput.evaluate((el) => el === document.activeElement);
assert(isFocusedAfter, 'Control+K did not focus search input!');
console.log('  * Control+K focused search input successfully.');

// 2.2 Clear button absence when empty
console.log('  2.2 Verifying clear button behavior on empty vs non-empty...');
const clearBtn = page.locator('button[title*="清除"], button[title*="Clear"]').first();
assert((await clearBtn.count()) === 0 || !(await clearBtn.isVisible()), 'Clear button should NOT be visible when search is empty');

// 2.3 Non-existent query & special character injection
console.log('  2.3 Testing adversarial search strings...');
const adversarialQueries = [
  '   ',                                     // Whitespace only
  'XYZ_NON_EXISTENT_QUERY_1234567890',      // Non-existent string
  '<script>alert("xss")</script>',          // HTML / XSS attempt
  'SELECT * FROM videos WHERE 1=1;',        // SQL injection attempt
  '.*+?^${}()|[]\\',                        // Regex metacharacters
  '舞蹈'.repeat(50),                         // Extremely long multibyte string (100 chars)
  '★ 5.0',                                 // Unicode star
  '!@#$%^&*()_+~`|}{[]:;?><,./',            // ASCII punctuation deluge
];

for (const q of adversarialQueries) {
  await searchInput.fill(q);
  await page.waitForTimeout(150);

  // When non-empty, clear button should appear (for queries with length > 0)
  if (q.length > 0) {
    const clearBtnVisible = await clearBtn.isVisible();
    assert(clearBtnVisible, `Clear button should be visible for query: "${q.slice(0, 20)}"`);
  }

  // Ensure application did not crash
  const bodyExists = await page.locator('body').isVisible();
  assert(bodyExists, `Application crashed on query: "${q.slice(0, 20)}"`);

  // If query is non-existent, card count should be 0 and empty placeholder or empty gallery displayed
  if (q === 'XYZ_NON_EXISTENT_QUERY_1234567890') {
    const cardCount = await page.locator('.video-card').count();
    console.log(`  * Non-existent query "${q}" returned ${cardCount} cards`);
    assert.strictEqual(cardCount, 0, 'Non-existent query should yield 0 video cards');
  }
}

// 2.4 Test clicking the clear button
console.log('  2.4 Testing clear button click reset...');
await clearBtn.click();
await page.waitForTimeout(200);

const inputValueAfterClear = await searchInput.inputValue();
assert.strictEqual(inputValueAfterClear, '', 'Search input value not cleared after clicking X button');
const restoredCardCount = await page.locator('.video-card').count();
console.log(`  * Card count after clear: ${restoredCardCount} (expected ${initialCardCount})`);
assert.strictEqual(restoredCardCount, initialCardCount, 'Gallery did not restore all cards after clearing search');

console.log('  ✓ ⌘K search capsule handled all extreme inputs, injections, and clear cycles perfectly.');

// ============================================================================
// EDGE CASE 3: Fast Repeated Seeking & Scrubbing on VideoCard Hover Scrub Bar
// ============================================================================
console.log('\n------------------------------------------------------------------------');
console.log('[TEST 3] Fast Repeated Seeking / Scrubbing on VideoCard Hover Scrub Bar');
console.log('------------------------------------------------------------------------');

const testCard = page.locator('.video-card').first();
assert(await testCard.isVisible(), 'Test video card not visible');

const cardBox = await testCard.boundingBox();
assert(cardBox && cardBox.width > 0 && cardBox.height > 0, 'Video card bounding box invalid');
console.log(`  * VideoCard geometry: width=${cardBox.width.toFixed(1)}px, height=${cardBox.height.toFixed(1)}px`);

// 3.1 Hover over card poster container to trigger scrub mode
console.log('  3.1 Hovering over VideoCard poster container...');
await page.mouse.move(cardBox.x + cardBox.width * 0.5, cardBox.y + cardBox.height * 0.3);
await page.waitForTimeout(200);

const scrubBar = testCard.locator('div.h-full.bg-gradient-to-r').first();

// 3.2 Rapid scrub oscillation (50 simulated high-frequency mouse moves)
console.log('  3.2 Simulating 50 rapid cursor sweeps across hover scrub timeline...');
const percentages = [
  0.05, 0.95, 0.25, 0.75, 0.1, 0.9, 0.5, 0.02, 0.98, 0.33,
  0.66, 0.15, 0.85, 0.4, 0.6, 0.08, 0.92, 0.45, 0.55, 0.12,
  0.88, 0.22, 0.78, 0.01, 0.99, 0.5, 0.3, 0.7, 0.18, 0.82,
  0.28, 0.72, 0.38, 0.62, 0.48, 0.52, 0.03, 0.97, 0.14, 0.86,
  0.24, 0.76, 0.34, 0.64, 0.44, 0.56, 0.06, 0.94, 0.5, 0.5
];

const scrubY = cardBox.y + cardBox.height * 0.3; // Inside aspect-video container
for (let i = 0; i < percentages.length; i++) {
  const pct = percentages[i];
  const targetX = cardBox.x + cardBox.width * pct;
  await page.mouse.move(targetX, scrubY);
  // 12ms micro-step simulating high-frequency cursor tracking
  await page.waitForTimeout(12);
}

await page.waitForTimeout(100);

// Verify scrub bar width is clamped safely within [0%, 100%]
assert(await scrubBar.isVisible(), 'Scrub bar should be visible during hover');
const finalWidthStyle = await scrubBar.getAttribute('style');
console.log(`  * Scrub bar style after rapid scrub sweeps: "${finalWidthStyle}"`);
assert(finalWidthStyle && finalWidthStyle.includes('width:'), 'Scrub bar width style missing');
const widthPct = parseFloat(finalWidthStyle.match(/width:\s*([\d.]+)%/)[1]);
console.log(`  * Parsed scrub bar width percentage: ${widthPct.toFixed(2)}%`);
assert(widthPct >= 0 && widthPct <= 100, `Scrub bar width ${widthPct}% out of [0, 100] bounds!`);

// 3.3 Rapid Enter / Leave Oscillation (20 rapid cycles)
console.log('  3.3 Rapid Enter / Leave hover oscillation (20 cycles)...');
for (let i = 0; i < 20; i++) {
  // Move inside card
  await page.mouse.move(cardBox.x + cardBox.width * 0.4, cardBox.y + cardBox.height * 0.4);
  await page.waitForTimeout(25);
  // Move outside card
  await page.mouse.move(10, 10);
  await page.waitForTimeout(25);
}

// Settle cursor outside card
await page.mouse.move(5, 5);
await page.waitForTimeout(300);

// Verify resting state intact
const restingDurationBadge = testCard.locator('div:has-text(":")').first();
assert(await restingDurationBadge.isVisible(), 'Resting duration badge missing after hover storm');
const singleStar = testCard.locator('button:has(svg.lucide-star)').first();
assert(await singleStar.isVisible(), 'Single star rating button missing after hover storm');
const starScore = (await singleStar.innerText()).trim();
assert(starScore.length > 0, 'Star score text is empty');

console.log('  ✓ VideoCard hover scrub bar survived 50 rapid scrubs & 20 hover cycles with zero leaks or crashes.');

// ============================================================================
// SUMMARY & VERIFICATION
// ============================================================================
console.log('\n------------------------------------------------------------------------');
console.log('Console and Runtime Error Audit');
console.log('------------------------------------------------------------------------');
const filteredErrors = consoleErrors.filter(
  (e) => !e.includes('favicon') && !e.includes('MediaStream') && !e.includes('WebGL')
);
if (filteredErrors.length > 0) {
  console.warn('  ⚠️ Console errors detected:', filteredErrors);
  assert.fail(`Test encountered critical console errors: ${JSON.stringify(filteredErrors)}`);
} else {
  console.log('  ✓ 0 critical console or unhandled page errors detected.');
}

await browser.close();

console.log('\n========================================================================');
console.log(' ALL CHALLENGER M6 ADVERSARIAL EDGE CASE STRESS TESTS PASSED (0 ERRORS) ');
console.log('========================================================================\n');
