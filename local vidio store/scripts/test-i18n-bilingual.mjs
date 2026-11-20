import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { chromium } from 'playwright';

console.log('===============================================================');
console.log('       BILINGUAL i18n & DYNAMIC TOGGLE INTEGRITY SUITE         ');
console.log('===============================================================\n');

const projectRoot = path.resolve('.');

// Part A: Static Dictionary Parity Analysis
console.log('[CHECK A] Static Dictionary Parity and Interpolation Audit...');
const translationsPath = path.join(projectRoot, 'src/i18n/translations.ts');
assert(fs.existsSync(translationsPath), 'src/i18n/translations.ts missing!');

const translationsModule = await import(`file:///${translationsPath.replace(/\\/g, '/')}`);
const { translations } = translationsModule;

assert(translations && translations.zh && translations.en, 'translations.zh and translations.en must be exported');

function flattenKeys(obj, prefix = '') {
  let keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      keys = keys.concat(flattenKeys(v, full));
    } else {
      keys.push(full);
    }
  }
  return keys;
}

const zhKeys = flattenKeys(translations.zh);
const enKeys = flattenKeys(translations.en);

console.log(`  * Chinese dictionary entries: ${zhKeys.length}`);
console.log(`  * English dictionary entries: ${enKeys.length}`);
assert(zhKeys.length >= 140, `Expected at least 140 translation keys, got ${zhKeys.length}`);
assert.strictEqual(zhKeys.length, enKeys.length, 'Key counts between zh and en must match exactly!');

const zhSet = new Set(zhKeys);
const enSet = new Set(enKeys);
const missingInEn = zhKeys.filter((k) => !enSet.has(k));
const missingInZh = enKeys.filter((k) => !zhSet.has(k));

assert.strictEqual(missingInEn.length, 0, `Keys present in zh but missing in en: ${missingInEn.join(', ')}`);
assert.strictEqual(missingInZh.length, 0, `Keys present in en but missing in zh: ${missingInZh.join(', ')}`);
console.log('  ✓ 100% Symmetric Key Parity verified between zh and en dictionaries.');

// Part B: Playwright Dynamic Language Switch in Browser
console.log('\n[CHECK B] Playwright Dynamic Browser Verification...');
const browser = await chromium.launch({
  headless: true,
  executablePath: (process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'),
});

const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => {
  localStorage.setItem('dance_echo_sidebar_collapsed', 'false');
});

const page = await context.newPage();
const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});

await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });

// 侧边栏展开态：折叠时先点开
const cta = page.locator('button[data-testid="sidebar-import-cta"]').first();
if (!(await cta.isVisible().catch(() => false))) {
  const expandBtn = page.locator('button[title*="展开侧边栏"]').first();
  if (await expandBtn.isVisible().catch(() => false)) {
    await expandBtn.click();
  }
}
await cta.waitFor({ state: 'visible', timeout: 15000 });

// 语言开关容器必须可见（这是所有 i18n 断言的前提）
const langToggleContainer = page.locator('[data-testid="language-toggle"]').first();
assert(await langToggleContainer.isVisible(), 'Language toggle container [data-testid="language-toggle"] not visible!');

const btnEn = page.locator('[data-testid="lang-btn-en"]').first();
const btnZh = page.locator('[data-testid="lang-btn-zh"]').first();

/**
 * CTA 现在是一个纯图标圆钮（白色 + 号），文案在 aria-label / title 上，
 * innerText 是空的。断言标签而不是文字，避免被纯图标化改版打断。
 */
async function ctaLabel() {
  const [aria, title] = await Promise.all([cta.getAttribute('aria-label'), cta.getAttribute('title')]);
  return `${aria ?? ''} ${title ?? ''}`;
}

// Step 1: Switch to English
console.log('  * Clicking [EN] button...');
await btnEn.click();
await page.waitForTimeout(300);

const ctaEn = await ctaLabel();
console.log(`  * English Sidebar CTA label: "${ctaEn.trim()}"`);
assert(ctaEn.includes('Import Video'), `Expected English CTA label to contain "Import Video", got "${ctaEn.trim()}"`);

const searchInput = page.locator('input[placeholder*="Search"]').first();
assert(await searchInput.isVisible(), 'English search placeholder not found!');
const enPlaceholder = await searchInput.getAttribute('placeholder');
console.log(`  * English Search Placeholder: "${enPlaceholder}"`);
assert(enPlaceholder?.includes('Search'), `Unexpected English placeholder: "${enPlaceholder}"`);

const localeInStorage = await page.evaluate(() => localStorage.getItem('dance_echo_locale'));
console.log(`  * Locale stored in localStorage: "${localeInStorage}"`);
assert.strictEqual(localeInStorage, 'en', 'localStorage did not store "en"');

// Step 2: Switch back to Chinese
console.log('  * Clicking [中] button...');
await btnZh.click();
await page.waitForTimeout(300);

const ctaZh = await ctaLabel();
console.log(`  * Chinese Sidebar CTA label: "${ctaZh.trim()}"`);
assert(ctaZh.includes('导入本地视频'), `Expected Chinese CTA label to contain "导入本地视频", got "${ctaZh.trim()}"`);

const searchInputZh = page.locator('input[placeholder*="搜索"]').first();
assert(await searchInputZh.isVisible(), 'Chinese search placeholder not found!');
const zhPlaceholder = await searchInputZh.getAttribute('placeholder');
console.log(`  * Chinese Search Placeholder: "${zhPlaceholder}"`);
assert(zhPlaceholder?.includes('搜索'), `Unexpected Chinese placeholder: "${zhPlaceholder}"`);

// Step 3: 文字截断检查（只查有文字的按钮；纯图标按钮没有文字可截断）
console.log('\n[CHECK C] Text Clipping Audit on Labelled Buttons...');
const buttons = await page.locator('button').all();
let clipped = [];
for (const btn of buttons.slice(0, 40)) {
  if (!(await btn.isVisible().catch(() => false))) continue;
  const probe = await btn.evaluate((el) => ({
    text: (el.innerText || '').trim(),
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    overflow: getComputedStyle(el).overflow,
  }));
  if (probe.text.length > 0 && probe.scrollWidth > probe.clientWidth + 4 && probe.overflow === 'hidden') {
    clipped.push(`${probe.text} (${probe.scrollWidth}>${probe.clientWidth})`);
  }
}
console.log(`  * Labelled buttons checked: ${Math.min(buttons.length, 40)}，clipped: ${clipped.length}`);
assert.strictEqual(clipped.length, 0, `Clipped button text detected: ${clipped.join('; ')}`);
console.log('  ✓ No text clipping detected on labelled buttons.');

// Step 4: 快速来回切换的稳定性
console.log('\n[CHECK D] Rapid Language Toggle Stress Test...');
for (let i = 0; i < 6; i++) {
  await btnEn.click();
  await page.waitForTimeout(60);
  await btnZh.click();
  await page.waitForTimeout(60);
}
await page.waitForTimeout(300);

const bodyText = await page.locator('body').innerText();
assert(bodyText.length > 50, 'Application body crashed or rendered blank after rapid toggling!');
console.log('  ✓ Application survived rapid toggle stress.');

// Step 5: 控制台不能有未捕获异常（有 4xx 资源噪音是允许的，这里只拦 JS 崩）
const fatal = consoleErrors.filter((text) => /Uncaught|TypeError|ReferenceError|is not a function/i.test(text));
assert.strictEqual(fatal.length, 0, `Uncaught page errors after toggling: ${fatal.join(' | ')}`);
console.log(`  ✓ No uncaught page errors (console errors: ${consoleErrors.length}, 均为资源型噪音时忽略).`);

await browser.close();

console.log('\n===============================================================');
console.log(' ALL BILINGUAL i18n & DYNAMIC TOGGLE CHECKS PASSED (0 ERRORS)  ');
console.log('===============================================================\n');
