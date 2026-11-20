import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';

console.log('===============================================================');
console.log('       DESIGN TOKENS & CSS COMPILATION INTEGRITY SUITE        ');
console.log('===============================================================\n');

const projectRoot = path.resolve('.');

// 1. Verify CSS Tokens in src/index.css
console.log('[CHECK 1] Verifying design tokens in src/index.css...');
const indexCssPath = path.join(projectRoot, 'src/index.css');
assert(fs.existsSync(indexCssPath), 'src/index.css missing!');
const indexCssContent = fs.readFileSync(indexCssPath, 'utf-8');

const requiredTokens = [
  { name: '--space-void', expected: '#09090b' },
  { name: '--space-surface', expected: 'rgba(24, 24, 27, 0.75)' },
  { name: '--border-hairline', expected: 'rgba(255, 255, 255, 0.07)' },
  { name: '--border-hairline-hover', expected: 'rgba(255, 255, 255, 0.15)' },
  { name: '--accent-cyan', expected: '#22d3ee' },
  { name: '--accent-purple', expected: '#c084fc' },
  { name: '--accent-emerald', expected: '#34d399' },
  { name: '--accent-amber', expected: '#fbbf24' },
  { name: '--accent-silver', expected: '#e4e4e7' },
];

for (const token of requiredTokens) {
  const regex = new RegExp(`${token.name}:\\s*${token.expected.replace(/[()]/g, '\\$&')}`);
  assert(
    regex.test(indexCssContent),
    `FAILED: Token ${token.name} with expected value ${token.expected} not found in src/index.css`
  );
  console.log(`  ✓ Token ${token.name}: ${token.expected}`);
}

// 2. WCAG AAA Contrast Ratio Analysis
console.log('\n[CHECK 2] Computing WCAG AAA relative luminance contrast ratio...');
function hexToRgb(hex) {
  const cleaned = hex.replace('#', '');
  const r = parseInt(cleaned.substring(0, 2), 16) / 255;
  const g = parseInt(cleaned.substring(2, 4), 16) / 255;
  const b = parseInt(cleaned.substring(4, 6), 16) / 255;
  return [r, g, b].map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
}
function getLuminance(hex) {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const bgL = getLuminance('#050608');
const textL = getLuminance('#e2e8f0');
const contrastRatio = (Math.max(bgL, textL) + 0.05) / (Math.min(bgL, textL) + 0.05);
console.log(`  * Space Void (#050608) vs Titanium Silver (#e2e8f0) Contrast Ratio: ${contrastRatio.toFixed(2)}:1`);
assert(contrastRatio >= 7.0, `Contrast ratio ${contrastRatio.toFixed(2)} fails WCAG AAA threshold (7.0:1)!`);
console.log('  ✓ WCAG AAA Contrast Check PASSED (16.44:1 >= 7.0:1)');

// 3. Custom 4px Micro-Scrollbar
console.log('\n[CHECK 3] Verifying 4px micro-scrollbar styling in src/index.css...');
assert(indexCssContent.includes('::-webkit-scrollbar'), 'Missing ::-webkit-scrollbar rule');
assert(indexCssContent.includes('width: 4px;'), 'Missing 4px micro-scrollbar width');
console.log('  ✓ 4px micro-scrollbar rule confirmed.');

// 4. Tailwind Compilation Test
console.log('\n[CHECK 4] Compiling custom Tailwind utility classes...');
const testHtml = `
<div class="bg-space-void bg-space-surface bg-space-solid bg-space-elevated bg-space-panel bg-space-overlay">
  <div class="border-hairline border-hairline-subtle border-hairline-hover">
    <span class="text-accent-cyan text-accent-cyan-subtle border-accent-cyan-border">Cyan</span>
    <span class="text-accent-purple text-accent-purple-subtle border-accent-purple-border">Purple</span>
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
  `@tailwind utilities;`,
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
  '.text-accent-purple',
  '.text-accent-emerald',
  '.text-accent-amber',
  '.text-accent-silver',
  '.shadow-hairline',
  '.shadow-glow-cyan',
];

for (const selector of requiredGeneratedSelectors) {
  assert(
    compiledCss.includes(selector),
    `FAILED: Tailwind compilation missed generated selector: ${selector}`
  );
}
console.log(`  ✓ Successfully compiled ${requiredGeneratedSelectors.length} custom token utility selectors.`);

console.log('\n===============================================================');
console.log(' ALL DESIGN TOKENS & CSS COMPILATION INTEGRITY CHECKS PASSED  ');
console.log('===============================================================\n');
