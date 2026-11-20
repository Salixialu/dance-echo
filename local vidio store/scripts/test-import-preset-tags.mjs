/**
 * Import dialog preset tags contract.
 *
 * Checks that the import dialog surfaces the tag presets configured in
 * Settings → 标签预设, that a chip can be toggled (aria-pressed), and that
 * cancelling closes the dialog without importing anything.
 *
 * Run: node scripts/test-import-preset-tags.mjs
 * Requires the vite dev server on 5173.
 */
import { chromium } from 'playwright';

const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });

const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addInitScript(() => {
  localStorage.setItem(
    'dance_echo_tag_presets',
    JSON.stringify([
      { name: '老师', values: ['Kane'] },
      { name: '舞种', values: ['Jazz', 'Hiphop'] },
      { name: '来源', values: ['舞室', '网络'] },
    ])
  );
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

const mp4 = { name: 'preset-check.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(64) };

try {
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  await page.waitForFunction(
    () => document.querySelector('[data-testid="video-card"]') !== null || document.body.textContent.includes('还没有视频'),
    { timeout: 20000 }
  );

  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(mp4);
  await page.waitForSelector('[data-testid="import-modal"]', { timeout: 10000 });
  check('import modal opens for a picked video', true);

  const presets = page.locator('[data-testid="import-preset-tags"]');
  check('preset tag section renders', (await presets.count()) === 1);

  const teacherChip = page.locator('[data-testid="import-preset-tag-老师-Kane"]');
  const jazzChip = page.locator('[data-testid="import-preset-tag-舞种-Jazz"]');
  check('teacher preset chip renders', (await teacherChip.count()) === 1);
  check('dance-style preset chip renders', (await jazzChip.count()) === 1);

  await jazzChip.click();
  check('chip toggles on', (await jazzChip.getAttribute('aria-pressed')) === 'true');
  const count = page.locator('[data-testid="import-preset-count"]');
  check('selected counter shows 1', (await count.textContent())?.includes('已选 1'));

  await teacherChip.click();
  check('second chip toggles on', (await teacherChip.getAttribute('aria-pressed')) === 'true');
  check('selected counter shows 2', (await count.textContent())?.includes('已选 2'));

  await jazzChip.click();
  check('chip toggles off', (await jazzChip.getAttribute('aria-pressed')) === 'false');
  check('selected counter shows 1 again', (await count.textContent())?.includes('已选 1'));

  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.waitForSelector('[data-testid="import-modal"]', { state: 'detached', timeout: 5000 });
  check('cancel closes the dialog', true);
  check('no page errors', errors.length === 0, errors.join(' | '));
} catch (error) {
  check('run without exception', false, error.message);
} finally {
  await browser.close();
}

for (const item of checks) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}${item.detail ? ` — ${item.detail}` : ''}`);
}
const failed = checks.filter((item) => !item.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exitCode = failed.length ? 1 : 0;
