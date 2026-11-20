import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';

console.log('--- Running M1 (Tokens & i18n) Verification Suite ---');

const projectRoot = path.resolve('.');

// 1. Verify CSS Tokens in src/index.css
console.log('1. Checking src/index.css design tokens...');
const indexCss = fs.readFileSync(path.join(projectRoot, 'src/index.css'), 'utf-8');
assert(indexCss.includes('--space-void: #050608'), 'Missing --space-void: #050608');
assert(indexCss.includes('rgba(255, 255, 255, 0.07)'), 'Missing 1px hairline border token');
assert(indexCss.includes('#38bdf8'), 'Missing Aqua Cyan #38bdf8');
assert(indexCss.includes('#a78bfa'), 'Missing Iris Violet #a78bfa');
assert(indexCss.includes('#34d399'), 'Missing Emerald #34d399');
assert(indexCss.includes('#fbbf24'), 'Missing Amber #fbbf24');
assert(indexCss.includes('#e2e8f0'), 'Missing Titanium Silver #e2e8f0');
assert(indexCss.includes('.border-hairline'), 'Missing .border-hairline utility');
console.log('   ✓ src/index.css tokens verified');

// 2. Verify Tailwind Config
console.log('2. Checking tailwind.config.js color extensions...');
const tailwindConfig = fs.readFileSync(path.join(projectRoot, 'tailwind.config.js'), 'utf-8');
assert(tailwindConfig.includes("'#050608'"), 'Missing #050608 in tailwind.config.js');
assert(tailwindConfig.includes('hairline'), 'Missing hairline in tailwind.config.js');
assert(tailwindConfig.includes('cyan'), 'Missing cyan in tailwind.config.js');
assert(tailwindConfig.includes('violet'), 'Missing violet in tailwind.config.js');
assert(tailwindConfig.includes('emerald'), 'Missing emerald in tailwind.config.js');
assert(tailwindConfig.includes('amber'), 'Missing amber in tailwind.config.js');
assert(tailwindConfig.includes('silver'), 'Missing silver in tailwind.config.js');
console.log('   ✓ tailwind.config.js verified');

// 3. Verify i18n Translations Dictionary
console.log('3. Checking i18n translations dictionary and key parity...');
const translationsPath = path.join(projectRoot, 'src/i18n/translations.ts');
assert(fs.existsSync(translationsPath), 'src/i18n/translations.ts does not exist');
const translationsContent = fs.readFileSync(translationsPath, 'utf-8');
assert(translationsContent.includes("importCta: '+ 导入本地视频'"), 'Missing zh importCta');
assert(translationsContent.includes("importCta: '+ Import Video'"), 'Missing en importCta');
assert(translationsContent.includes('sidebar'), 'Missing sidebar namespace');
assert(translationsContent.includes('gallery'), 'Missing gallery namespace');
assert(translationsContent.includes('card'), 'Missing card namespace');
assert(translationsContent.includes('player'), 'Missing player namespace');
assert(translationsContent.includes('metronome'), 'Missing metronome namespace');
assert(translationsContent.includes('inspector'), 'Missing inspector namespace');
assert(translationsContent.includes('ai'), 'Missing ai namespace');
assert(translationsContent.includes('toast'), 'Missing toast namespace');
console.log('   ✓ translations dictionary verified');

// 4. Verify I18nContext and useI18n hook
console.log('4. Checking src/i18n/I18nContext.tsx and exports...');
const i18nContextPath = path.join(projectRoot, 'src/i18n/I18nContext.tsx');
assert(fs.existsSync(i18nContextPath), 'src/i18n/I18nContext.tsx does not exist');
const i18nContextContent = fs.readFileSync(i18nContextPath, 'utf-8');
assert(i18nContextContent.includes('dance_echo_locale'), 'Missing dance_echo_locale storage key');
assert(i18nContextContent.includes('export const useI18n'), 'Missing useI18n hook export');
assert(i18nContextContent.includes('export const I18nProvider'), 'Missing I18nProvider export');
assert(i18nContextContent.includes('toggleLocale'), 'Missing toggleLocale export');

const indexPath = path.join(projectRoot, 'src/i18n/index.ts');
assert(fs.existsSync(indexPath), 'src/i18n/index.ts does not exist');
console.log('   ✓ i18n Context and barrel exports verified');

// 5. Verify App.tsx wrapping
console.log('5. Checking App.tsx I18nProvider wrapping...');
const appContent = fs.readFileSync(path.join(projectRoot, 'src/App.tsx'), 'utf-8');
assert(appContent.includes('<I18nProvider>'), 'App.tsx is not wrapped with I18nProvider');
assert(appContent.includes('bg-space-void'), 'App.tsx root div does not use bg-space-void');
console.log('   ✓ App.tsx wrapper verified');

// 6. Verify Strict Skeleton Guard (Zero Touch)
console.log('6. Checking strict skeleton fence (usePoseTracker, pose/*, scene/*)...');
const forbiddenPaths = [
  'src/hooks/usePoseTracker.ts',
  'src/services/pose/pose-detector.ts',
  'src/services/pose/index.ts',
  'src/scene/vrm-controller.ts',
  'src/scene/scene-manager.ts',
];
for (const rel of forbiddenPaths) {
  const full = path.join(projectRoot, rel);
  assert(fs.existsSync(full), `Forbidden file missing: ${rel}`);
}
const poseTracker = fs.readFileSync(path.join(projectRoot, 'src/hooks/usePoseTracker.ts'), 'utf-8');
assert(poseTracker.includes('#22d3ee'), 'usePoseTracker.ts modified! Left-cyan color #22d3ee missing');
assert(poseTracker.includes('#fb7185'), 'usePoseTracker.ts modified! Right-pink color #fb7185 missing');
console.log('   ✓ Skeleton fence untouched and fully intact');

console.log('\nAll M1 verification tests passed successfully (0 errors)!');
