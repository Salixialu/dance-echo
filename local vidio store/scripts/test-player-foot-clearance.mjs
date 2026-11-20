import assert from 'node:assert';
import { chromium } from 'playwright';

console.log('===============================================================');
console.log('       DANCEPLAYER VIEWPORT & FEET CLEARANCE E2E SUITE         ');
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
await page.waitForTimeout(500);

// 1. Ensure video card exists
console.log('[STEP 1] Ensuring demo videos are available in library...');
let cards = page.locator('.video-card');
if ((await cards.count()) === 0) {
  const dropdownBtn = page.locator('button[aria-label="更多导入选项"]').first();
  await dropdownBtn.click();
  await page.waitForTimeout(300);
  const demoItem = page.getByText(/载入内置演示视频|Load Demo Videos/).first();
  await demoItem.click();
  await page.waitForSelector('.video-card', { timeout: 15000 });
  cards = page.locator('.video-card');
}
const firstCard = cards.first();
assert(await firstCard.isVisible(), 'No video card available to launch DancePlayer!');

// 2. Open DancePlayer
console.log('\n[STEP 2] Launching DancePlayer by clicking first card...');
await firstCard.click();
await page.waitForTimeout(1000);

// Verify player container and DOM contracts
const videoEl = page.locator('video#videoElement').first();
assert(await videoEl.isVisible(), 'CRITICAL VIOLATION: video#videoElement is not visible in DancePlayer!');

const poseCanvas = page.locator('canvas#poseOverlay').first();
assert((await poseCanvas.count()) > 0, 'CRITICAL VIOLATION: canvas#poseOverlay missing from DOM!');
console.log('  ✓ Preserved DOM Contracts (video#videoElement & canvas#poseOverlay) verified.');

// 3. Ultra-Thin Floating Capsule Bottom HUD & Feet Clearance Verification
console.log('\n[STEP 3] Measuring Viewport Geometry & Dancer Feet Clearance Safe Zone...');
const videoBox = await videoEl.boundingBox();
assert(videoBox && videoBox.height > 0, 'Video element bounding box invalid!');
console.log(`  * Video Element Bounds: x=${videoBox.x.toFixed(1)}, y=${videoBox.y.toFixed(1)}, width=${videoBox.width.toFixed(1)}, height=${videoBox.height.toFixed(1)}`);

const videoBottomY = videoBox.y + videoBox.height;
console.log(`  * Video Frame Bottom Edge: ${videoBottomY.toFixed(1)}px`);

// Locate the bottom control bar / capsule
const bottomControlBar = page.locator('[data-testid="player-bottom-controls"]');
assert(await bottomControlBar.isVisible(), 'Bottom control bar capsule missing!');
const hudBox = await bottomControlBar.boundingBox();
assert(hudBox, 'Could not get bottom HUD bounding box!');
console.log(`  * Bottom HUD Capsule Bounds: y=${hudBox.y.toFixed(1)}, height=${hudBox.height.toFixed(1)}px`);

// GEOMETRIC FEET CLEARANCE ASSERTION:
// In the 3-tier safe layout, the dancer feet and floor force line reside in the lower portion of the video.
// The bottom control bar must either be positioned cleanly below the video frame,
// or provide safe letterbox buffer clearance ensuring 100% floor visibility.
const clearanceMargin = hudBox.y - videoBottomY;
console.log(`  * Feet Clearance Margin: ${clearanceMargin.toFixed(1)}px`);

// Assert that the HUD top edge does not intrude into the active dance video frame
assert(
  hudBox.y >= videoBottomY - 5,
  `FEET CLEARANCE REGRESSION: Bottom HUD (y=${hudBox.y.toFixed(1)}) overlaps video active frame (bottom=${videoBottomY.toFixed(1)}) by ${(videoBottomY - hudBox.y).toFixed(1)}px! Dancer feet are obstructed!`
);
console.log('  ✓ 100% FEET CLEARANCE CONFIRMED: Bottom HUD bounds do NOT intrude into dancer feet or floor line safe zone.');

// 4. Verify Integrated 8-Beat Metronome（开关已移入「视图」菜单）
console.log('\n[STEP 4] Verifying Integrated 8-Beat Metronome Pulse Indicators...');
await page.locator('#btnCycleDisplayMode').click();
await page.waitForTimeout(250);
const metronomeBtn = page.locator('#btnToggleBeatMetronome').first();
assert(await metronomeBtn.isVisible(), '8-beat metronome toggle missing in the View menu!');
const stripBefore = await page.locator('#beatMetronomeContainer').count();
await metronomeBtn.click();
await page.waitForTimeout(300);
const stripAfter = await page.locator('#beatMetronomeContainer').count();
assert(stripBefore !== stripAfter, 'Metronome toggle did not show/hide the 8-beat strip');
await metronomeBtn.click();
await page.waitForTimeout(250);
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
console.log(`  ✓ 8-beat strip toggles from the View menu (${stripBefore} → ${stripAfter}).`);

// 5. Test Mirror Flip (快捷键 M / #btnMirror)
console.log('\n[STEP 5] Testing Dancer Mirror Flip (M key / #btnMirror)...');
const mirrorBtn = page.locator('#btnMirror').first();
assert(await mirrorBtn.isVisible(), '#btnMirror button missing!');

// Initial mirror state
let isMirrored = await videoEl.evaluate((el) => el.classList.contains('scale-x-[-1]'));
console.log(`  * Initial mirror state: ${isMirrored}`);

// Click mirror button
await mirrorBtn.click();
await page.waitForTimeout(300);
isMirrored = await videoEl.evaluate((el) => el.classList.contains('scale-x-[-1]'));
assert(isMirrored, 'Mirror button did not apply scale-x-[-1] class to videoElement!');
console.log('  ✓ Mirror flip successfully flipped video scale-x-[-1].');

// Toggle back
await mirrorBtn.click();
await page.waitForTimeout(200);

// 6. Test Play / Pause (#btnPlayPause)
console.log('\n[STEP 6] Testing Play / Pause toggle (#btnPlayPause)...');
const playPauseBtn = page.locator('#btnPlayPause').first();
assert(await playPauseBtn.isVisible(), '#btnPlayPause button missing!');
await playPauseBtn.click();
await page.waitForTimeout(500);

const isPausedAfterClick = await videoEl.evaluate((el) => el.paused);
console.log(`  * Video paused state after toggle: ${isPausedAfterClick}`);

// 7. Test AB Loop Controls
console.log('\n[STEP 7] Testing AB Loop setting...');
const btnA = page.locator('button:has-text("A:")').first();
const btnB = page.locator('button:has-text("B:")').first();
assert(await btnA.isVisible(), 'Button A missing!');
assert(await btnB.isVisible(), 'Button B missing!');
await btnA.click();
await page.waitForTimeout(200);
const textA = await btnA.innerText();
console.log(`  * Point A set to: "${textA}"`);
assert(!textA.includes('--'), 'Point A was not set!');

// 8. Close Player using explicit #btnClosePlayer locator
console.log('\n[STEP 8] Closing DancePlayer to return to gallery via #btnClosePlayer...');
const closeBtn = page.locator('#btnClosePlayer').first();
assert(await closeBtn.isVisible(), '#btnClosePlayer button missing in player top bar!');
await closeBtn.click();
await page.waitForTimeout(500);

assert(!(await videoEl.isVisible()), 'DancePlayer did not close cleanly!');
console.log('  ✓ Player closed, cleanly returned to gallery.');

await browser.close();

console.log('\n===============================================================');
console.log(' ALL DANCEPLAYER & FEET CLEARANCE TESTS PASSED (0 ERRORS)      ');
console.log('===============================================================\n');
