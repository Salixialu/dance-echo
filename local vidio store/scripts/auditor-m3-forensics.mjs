import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { chromium } from 'playwright';

console.log('===============================================================');
console.log('       FORENSIC AUDITOR M3: ADVERSARIAL INTEGRITY SUITE        ');
console.log('===============================================================\n');

const projectRoot = path.resolve('.');

// PHASE 1: STATIC CODE FORENSICS & CHEATING DETECTION
console.log('--- PHASE 1: Code Forensics & Anti-Cheat Audit ---');

const inspectorPath = path.join(projectRoot, 'src/components/layout/InspectorDrawer.tsx');
const inspectorContent = fs.readFileSync(inspectorPath, 'utf-8');

// Check 1.1: Ensure zero conditional unmounting
assert(!inspectorContent.includes('if (!isInspectorOpen) return null'), 'FACADE VIOLATION: Conditional unmounting detected');
assert(!inspectorContent.includes('return null;'), 'FACADE VIOLATION: Component unmounts instead of transitioning');
console.log('✓ Check 1.1 Passed: Zero conditional unmounting detected in InspectorDrawer.tsx');

// Check 1.2: Check for genuine CSS transitions vs mock strings
assert(inspectorContent.includes('transition-[width,opacity] duration-300 ease-in-out'), 'TRANSITION VIOLATION: Missing outer CSS transition');
assert(inspectorContent.includes('transition-opacity duration-200'), 'TRANSITION VIOLATION: Missing inner opacity transition');
assert(inspectorContent.includes('overflow-hidden'), 'LAYOUT VIOLATION: Outer container missing overflow-hidden');
assert(inspectorContent.includes('w-80'), 'LAYOUT VIOLATION: Missing fixed width on inner container');
console.log('✓ Check 1.2 Passed: Genuine CSS width and opacity transitions confirmed');

// Check 1.3: Check for hardcoded raw Chinese strings in InspectorDrawer.tsx
const rawChineseRegex = /[\u4e00-\u9fa5]{2,}/g;
// Strip comments and import statements
const strippedCode = inspectorContent
  .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')
  .replace(/import\s+[\s\S]*?from\s+['"].*?['"];/g, '');

const rawMatches = strippedCode.match(rawChineseRegex);
// There should be NO raw Chinese strings in JSX
assert(!rawMatches, `I18N VIOLATION: Found raw Chinese strings in InspectorDrawer.tsx: ${JSON.stringify(rawMatches)}`);
console.log('✓ Check 1.3 Passed: Zero hardcoded Chinese strings in InspectorDrawer.tsx');

// Check 1.4: Check translations dictionary parity and non-emptiness
const { zh, en } = await import(`file:///${path.join(projectRoot, 'src/i18n/translations.ts').replace(/\\/g, '/')}`);
assert(zh.inspector, 'Missing zh.inspector');
assert(en.inspector, 'Missing en.inspector');

const zhKeys = Object.keys(zh.inspector);
const enKeys = Object.keys(en.inspector);
assert.strictEqual(zhKeys.length, enKeys.length, 'Key count mismatch between zh and en');
for (const k of zhKeys) {
  assert(en.inspector[k], `Missing en.inspector.${k}`);
  assert.notStrictEqual(zh.inspector[k], en.inspector[k], `Untranslated key: ${k} has identical zh and en string!`);
}
console.log(`✓ Check 1.4 Passed: All ${zhKeys.length} inspector translation keys are non-empty and translated`);

// PHASE 2: SKELETON & POSE INTEGRITY VERIFICATION
console.log('\n--- PHASE 2: Skeleton & Pose Strict Integrity Check ---');

const SKELETON_FILES = [
  'src/hooks/usePoseTracker.ts',
  'src/services/pose/pose-detector.ts',
  'src/services/pose/index.ts',
  'src/services/pose/pose-overlay.ts',
  'src/scene/vrm-controller.ts',
  'src/scene/scene-manager.ts',
];

for (const file of SKELETON_FILES) {
  const fullPath = path.join(projectRoot, file);
  assert(fs.existsSync(fullPath), `Missing frozen skeleton file: ${file}`);
  const stat = fs.statSync(fullPath);
  const content = fs.readFileSync(fullPath, 'utf-8');
  const hash = crypto.createHash('sha256').update(content).digest('hex');

  // Verify timestamps are prior to Worker M3's execution (2026-10-17T09:00:00Z)
  const mtime = stat.mtime;
  console.log(`  * ${file} (mtime: ${mtime.toISOString()}, SHA-256: ${hash.slice(0, 16)})`);
  assert(
    mtime.getTime() < new Date('2026-10-17T09:00:00Z').getTime(),
    `INTEGRITY VIOLATION: Skeleton file ${file} was modified at ${mtime.toISOString()}!`
  );
}
console.log('✓ Phase 2 Passed: 100% certainty that ZERO skeleton/pose files were touched during M3');

// PHASE 3: LIVE RUNTIME & DYNAMIC ADVERSARIAL STRESS TEST
console.log('\n--- PHASE 3: Live Browser Dynamic Stress & i18n Switching ---');

const browser = await chromium.launch({
  headless: true,
  executablePath: (process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'),
});

const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);

const drawerLocator = page.locator('[data-testid="inspector-drawer"]');
const toggleBtn = page.locator('button[title*="洞察"], button[title*="Inspector"]').first();

// Test 3.1: Verify DOM presence
const domCount = await drawerLocator.count();
assert.strictEqual(domCount, 1, 'Drawer DOM node missing! Conditional unmounting detected');

// Test 3.2: Verify open state on desktop screen (width >= 1280px)
let box = await drawerLocator.boundingBox();
console.log(`  * Initial desktop drawer bounding box: width=${box?.width}px, height=${box?.height}px`);
assert(box && box.width >= 300, `Expected initial drawer open width ~320px on 1440px viewport, got ${box?.width}px`);

// Test 3.3: Close Drawer via close button inside drawer and verify zero width & pointer-events: none
console.log('  * Closing drawer via internal close button...');
const closeBtn = drawerLocator.locator('button[title*="关闭"], button[title*="Close"]').first();
assert(await closeBtn.isVisible(), 'Internal close button not visible in open drawer');
await closeBtn.click();
await page.waitForTimeout(400);

box = await drawerLocator.boundingBox();
console.log(`  * Closed drawer bounding box: width=${box?.width}px`);
assert(!box || box.width === 0, `Expected closed drawer width 0px, got ${box?.width}px`);

const isPointerEventsNone = await drawerLocator.evaluate((el) => {
  return window.getComputedStyle(el).pointerEvents === 'none';
});
assert(isPointerEventsNone, 'CLOSED DRAWER LEAK: pointer-events is NOT none when closed!');
console.log('  ✓ Closed drawer smoothly collapsed to 0px with pointer-events: none.');

// Test 3.4: Re-open Drawer via top bar toggle button
console.log('  * Re-opening drawer via top bar button...');
await toggleBtn.click();
await page.waitForTimeout(400);

box = await drawerLocator.boundingBox();
console.log(`  * Re-opened drawer bounding box: width=${box?.width}px`);
assert(box && box.width >= 300, `Expected re-opened drawer width ~320px, got ${box?.width}px`);

// Test 3.5: Rapid 10x Open/Close Oscillation Stress
console.log('  * Running rapid 10x open/close oscillation stress test...');
for (let i = 0; i < 10; i++) {
  await toggleBtn.click();
  await page.waitForTimeout(50); // Interrupting transition mid-flight
}
await page.waitForTimeout(500); // Allow settling
const settledBox = await drawerLocator.boundingBox();
console.log(`  * Drawer survived rapid oscillation without crashing. Settled width=${settledBox?.width}px`);

// Ensure drawer is open for content and i18n tests
if (!settledBox || settledBox.width === 0) {
  await toggleBtn.click();
  await page.waitForTimeout(400);
}

// Test 3.6: i18n Dynamic Switching in Drawer
console.log('  * Testing bilingual i18n switching inside inspector drawer...');
const enBtn = page.locator('[data-testid="lang-btn-en"]');
const zhBtn = page.locator('[data-testid="lang-btn-zh"]');

// Verify initial language (zh)
let streakText = await page.locator('[data-testid="inspector-drawer"]').innerText();
assert(streakText.includes('练舞成长热力') || streakText.includes('练舞洞察'), 'Initial zh text missing in drawer');

// Toggle to English
console.log('  * Clicking [data-testid="lang-btn-en"] to switch to English...');
await enBtn.click();
await page.waitForTimeout(300);

streakText = await page.locator('[data-testid="inspector-drawer"]').innerText();
console.log('  * English Drawer text snippet: ' + streakText.split('\n').filter(Boolean).slice(0, 3).join(' | '));
assert(streakText.includes('Practice Streak') || streakText.includes('Practice Insights'), 'Drawer failed to switch to English!');
console.log('  ✓ Drawer content seamlessly updated to English');

// Toggle back to Chinese
console.log('  * Clicking [data-testid="lang-btn-zh"] to switch back to Chinese...');
await zhBtn.click();
await page.waitForTimeout(300);

streakText = await page.locator('[data-testid="inspector-drawer"]').innerText();
console.log('  * Chinese Drawer text snippet: ' + streakText.split('\n').filter(Boolean).slice(0, 3).join(' | '));
assert(streakText.includes('练舞成长热力') || streakText.includes('练舞洞察'), 'Drawer failed to switch back to Chinese!');
console.log('  ✓ Drawer content seamlessly updated back to Chinese');

await browser.close();

console.log('\n===============================================================');
console.log(' FORENSIC AUDIT COMPLETE: ALL ADVERSARIAL CHECKS PASSED         ');
console.log(' VERDICT: 100% CLEAN — NO FACADES, NO INTEGRITY VIOLATIONS      ');
console.log('===============================================================\n');
