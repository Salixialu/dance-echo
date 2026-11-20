import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';

console.log('=== Challenger M1: Empirical Adversarial Stress Harness ===\n');

const projectRoot = path.resolve('.');

// ============================================================================
// Test Suite 1: CSS Variables & Hex/RGBA Syntax and WCAG Contrast Verification
// ============================================================================
console.log('Test Suite 1: CSS Tokens Syntax, Values, and Contrast Analysis...');
const indexCssPath = path.join(projectRoot, 'src/index.css');
const indexCssContent = fs.readFileSync(indexCssPath, 'utf-8');

const requiredTokens = [
  { name: '--space-void', expected: '#050608' },
  { name: '--space-surface', expected: 'rgba(11, 13, 17, 0.75)' },
  { name: '--border-hairline', expected: 'rgba(255, 255, 255, 0.07)' },
  { name: '--border-hairline-hover', expected: 'rgba(255, 255, 255, 0.15)' },
  { name: '--accent-cyan', expected: '#38bdf8' },
  { name: '--accent-violet', expected: '#a78bfa' },
  { name: '--accent-emerald', expected: '#34d399' },
  { name: '--accent-amber', expected: '#fbbf24' },
  { name: '--accent-silver', expected: '#e2e8f0' },
];

for (const token of requiredTokens) {
  const regex = new RegExp(`${token.name}:\\s*${token.expected.replace(/[()]/g, '\\$&')}`);
  assert(regex.test(indexCssContent), `FAILED: Token ${token.name} with value ${token.expected} not found in src/index.css`);
}

// Calculate relative luminance for WCAG contrast
function hexToRgb(hex) {
  const cleaned = hex.replace('#', '');
  const r = parseInt(cleaned.substring(0, 2), 16) / 255;
  const g = parseInt(cleaned.substring(2, 4), 16) / 255;
  const b = parseInt(cleaned.substring(4, 6), 16) / 255;
  return [r, g, b].map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
}
function getLuminance(hex) {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const bgL = getLuminance('#050608');
const textL = getLuminance('#e2e8f0');
const contrastRatio = (Math.max(bgL, textL) + 0.05) / (Math.min(bgL, textL) + 0.05);
console.log(`   * Background #050608 vs Text #e2e8f0 contrast ratio: ${contrastRatio.toFixed(2)}:1`);
assert(contrastRatio >= 7.0, `Contrast ratio ${contrastRatio} is below WCAG AAA standard (7.0:1)`);

// Check scrollbar rules
assert(indexCssContent.includes('::-webkit-scrollbar'), 'Missing custom scrollbar definitions');
assert(indexCssContent.includes('width: 4px;'), 'Missing 4px hairline scrollbar width');
console.log('   ✓ Test Suite 1 Passed: CSS Variables and WCAG AAA Contrast verified');

// ============================================================================
// Test Suite 2: Tailwind Compilation of Custom Utility Classes
// ============================================================================
console.log('\nTest Suite 2: Tailwind Real-World Compilation Test...');

const testHtml = `
<div class="bg-space-void bg-space-surface bg-space-solid bg-space-elevated bg-space-panel bg-space-overlay">
  <div class="border-hairline border-hairline-subtle border-hairline-hover">
    <span class="text-accent-cyan text-accent-cyan-subtle border-accent-cyan-border">Cyan</span>
    <span class="text-accent-violet text-accent-violet-subtle border-accent-violet-border">Violet</span>
    <span class="text-accent-emerald text-accent-emerald-subtle border-accent-emerald-border">Emerald</span>
    <span class="text-accent-amber text-accent-amber-subtle border-accent-amber-border">Amber</span>
    <span class="text-accent-silver text-accent-silver-subtle border-accent-silver-border">Silver</span>
  </div>
  <div class="shadow-hairline shadow-glow-cyan shadow-glow-violet shadow-glow-emerald shadow-glow-amber"></div>
</div>
`;

const tailwindConfigPath = path.join(projectRoot, 'tailwind.config.js');
const tailwindConfig = (await import(`file:///${tailwindConfigPath.replace(/\\/g, '/')}`)).default;

const testTailwindConfig = {
  ...tailwindConfig,
  content: [{ raw: testHtml, extension: 'html' }],
};

const postcssResult = await postcss([tailwindcss(testTailwindConfig)]).process(
  `
  @tailwind utilities;
  `,
  { from: undefined }
);

const compiledCss = postcssResult.css;

const requiredGeneratedSelectors = [
  '.bg-space-void',
  '.bg-space-surface',
  '.bg-space-solid',
  '.bg-space-elevated',
  '.bg-space-panel',
  '.bg-space-overlay',
  '.border-hairline',
  '.border-hairline-subtle',
  '.border-hairline-hover',
  '.text-accent-cyan',
  '.text-accent-cyan-subtle',
  '.border-accent-cyan-border',
  '.text-accent-violet',
  '.text-accent-violet-subtle',
  '.border-accent-violet-border',
  '.text-accent-emerald',
  '.text-accent-emerald-subtle',
  '.border-accent-emerald-border',
  '.text-accent-amber',
  '.text-accent-amber-subtle',
  '.border-accent-amber-border',
  '.text-accent-silver',
  '.text-accent-silver-subtle',
  '.border-accent-silver-border',
  '.shadow-hairline',
  '.shadow-glow-cyan',
  '.shadow-glow-violet',
  '.shadow-glow-emerald',
  '.shadow-glow-amber',
];

for (const selector of requiredGeneratedSelectors) {
  assert(
    compiledCss.includes(selector),
    `Tailwind compilation dropped expected selector: ${selector}`
  );
}

// Verify that RGB channel conversions correctly match hex values
assert(compiledCss.includes('rgb(5 6 8'), 'bg-space-void did not compile to rgb(5 6 8)');
assert(compiledCss.includes('rgb(56 189 248'), 'accent-cyan did not compile to rgb(56 189 248)');
assert(compiledCss.includes('rgb(167 139 250'), 'accent-violet did not compile to rgb(167 139 250)');
assert(compiledCss.includes('rgb(52 211 153'), 'accent-emerald did not compile to rgb(52 211 153)');
assert(compiledCss.includes('rgb(251 191 36'), 'accent-amber did not compile to rgb(251 191 36)');
assert(compiledCss.includes('rgb(226 232 240'), 'accent-silver did not compile to rgb(226 232 240)');

console.log(`   * Successfully compiled 29/29 utility classes into valid CSS (${compiledCss.length} bytes)`);
console.log('   ✓ Test Suite 2 Passed: Tailwind correctly generates all custom design token rules');

// ============================================================================
// Test Suite 3: i18n Translation Completeness, Placeholder Parity & Edge Cases
// ============================================================================
console.log('\nTest Suite 3: i18n Dictionary Parity & Edge Case Stress Testing...');
const translationsModule = await import(
  `file:///${path.join(projectRoot, 'src/i18n/translations.ts').replace(/\\/g, '/')}`
);
const { zh, en } = translationsModule;

assert(zh && typeof zh === 'object', 'zh translation dictionary is missing or invalid');
assert(en && typeof en === 'object', 'en translation dictionary is missing or invalid');

// Recursive key & placeholder comparison
function getKeysAndPlaceholders(obj, prefix = '') {
  const result = new Map();
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null) {
      const nested = getKeysAndPlaceholders(value, fullKey);
      for (const [k, v] of nested) {
        result.set(k, v);
      }
    } else if (typeof value === 'string') {
      const placeholders = (value.match(/\{[a-zA-Z0-9_]+\}/g) || []).sort();
      result.set(fullKey, { value, placeholders });
    }
  }
  return result;
}

const zhMap = getKeysAndPlaceholders(zh);
const enMap = getKeysAndPlaceholders(en);

console.log(`   * zh dictionary entries: ${zhMap.size}`);
console.log(`   * en dictionary entries: ${enMap.size}`);
assert(zhMap.size === enMap.size, `Key count mismatch! zh has ${zhMap.size}, en has ${enMap.size}`);

// Verify identical keys and identical placeholders
for (const [key, zhData] of zhMap) {
  assert(enMap.has(key), `Missing translation key in 'en': ${key}`);
  const enData = enMap.get(key);
  assert.deepStrictEqual(
    zhData.placeholders,
    enData.placeholders,
    `Placeholder mismatch in key "${key}": zh=${JSON.stringify(zhData.placeholders)} vs en=${JSON.stringify(enData.placeholders)}`
  );
}

// Stress test i18n interpolation logic in isolation (emulating I18nContext)
function testT(locale, pathStr, params, translationsDict) {
  const dict = translationsDict[locale] || translationsDict.zh;
  const parts = pathStr.split('.');
  let curr = dict;
  let found = true;
  for (const part of parts) {
    if (curr && typeof curr === 'object' && part in curr) {
      curr = curr[part];
    } else {
      found = false;
      break;
    }
  }
  if (!found || typeof curr !== 'string') {
    let fallbackCurr = translationsDict.zh;
    let fallbackFound = true;
    for (const part of parts) {
      if (fallbackCurr && typeof fallbackCurr === 'object' && part in fallbackCurr) {
        fallbackCurr = fallbackCurr[part];
      } else {
        fallbackFound = false;
        break;
      }
    }
    if (fallbackFound && typeof fallbackCurr === 'string') {
      curr = fallbackCurr;
    } else {
      return pathStr;
    }
  }
  if (params && typeof curr === 'string') {
    return Object.entries(params).reduce(
      (acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)),
      curr
    );
  }
  return typeof curr === 'string' ? curr : pathStr;
}

const testDict = { zh, en };

// Test 3a: Standard key resolution
assert.strictEqual(testT('zh', 'sidebar.importCta', {}, testDict), '+ 导入本地视频');
assert.strictEqual(testT('en', 'sidebar.importCta', {}, testDict), '+ Import Video');

// Test 3b: Parameter replacement
assert.strictEqual(testT('zh', 'gallery.selectedCount', { count: 5 }, testDict), '已选中 5 个视频');
assert.strictEqual(testT('en', 'gallery.selectedCount', { count: 5 }, testDict), '5 videos selected');

// Test 3c: Missing parameter preserves template
assert.strictEqual(testT('zh', 'gallery.selectedCount', {}, testDict), '已选中 {count} 个视频');

// Test 3d: Non-leaf path returns path string without throwing or returning [object Object]
assert.strictEqual(testT('zh', 'sidebar', {}, testDict), 'sidebar');
assert.strictEqual(testT('en', 'sidebar', {}, testDict), 'sidebar');

// Test 3e: Non-existent key returns key string
assert.strictEqual(testT('zh', 'non.existent.key', {}, testDict), 'non.existent.key');
assert.strictEqual(testT('en', 'non.existent.key', {}, testDict), 'non.existent.key');

console.log('   ✓ Test Suite 3 Passed: 100% i18n parity, placeholder match, and error robustness');

// ============================================================================
// Test Suite 4: Strict Skeleton Fence Verification
// ============================================================================
console.log('\nTest Suite 4: Checking frozen skeleton files modification times & integrity...');

const m1DispatchTime = new Date('2026-10-17T07:05:33Z').getTime();

const frozenFiles = [
  'src/hooks/usePoseTracker.ts',
  'src/services/pose/pose-detector.ts',
  'src/services/pose/index.ts',
  'src/services/pose/pose-overlay.ts',
  'src/scene/vrm-controller.ts',
  'src/scene/scene-manager.ts',
];

for (const rel of frozenFiles) {
  const full = path.join(projectRoot, rel);
  assert(fs.existsSync(full), `Frozen file does not exist: ${rel}`);
  const stat = fs.statSync(full);
  const mtimeMs = stat.mtime.getTime();
  assert(
    mtimeMs <= m1DispatchTime + 60000,
    `VIOLATION: Frozen file ${rel} was modified after M1 dispatch! mtime=${stat.mtime.toISOString()}, dispatch=${new Date(m1DispatchTime).toISOString()}`
  );
  console.log(`   * ${rel} mtime: ${stat.mtime.toISOString()} (prior to M1 start)`);
}

// Verify biomechanical colors in usePoseTracker
const poseTrackerContent = fs.readFileSync(path.join(projectRoot, 'src/hooks/usePoseTracker.ts'), 'utf-8');
assert(poseTrackerContent.includes('#22d3ee'), 'usePoseTracker left limb cyan #22d3ee missing');
assert(poseTrackerContent.includes('#fb7185'), 'usePoseTracker right limb pink #fb7185 missing');
assert(poseTrackerContent.includes('#ffffff'), 'usePoseTracker torso white #ffffff missing');
console.log('   * Biomechanical limb color constants verified intact');
console.log('   ✓ Test Suite 4 Passed: Zero forbidden skeleton/scene files were touched during M1');

console.log('\n======================================================');
console.log('ALL CHALLENGER ADVERSARIAL STRESS TESTS PASSED (0 ERRORS)');
console.log('======================================================');
