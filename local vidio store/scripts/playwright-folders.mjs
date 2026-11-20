/**
 * playwright-folders.mjs — 分组闭环回归用例（2026-11-02 结构重写版）
 *
 * 为什么重写：首页已从「侧栏分组树 + 目录视图」改为「组卡片网格 + 右侧日期抽屉」，
 * 侧栏不再渲染 folder-node / folder-new / folder-manager，旧用例的选择器全部失效。
 *
 * 覆盖：导入成组 → 首页组卡片 → 进组 → 面包屑「切换分组」→ 分组管理弹窗搜索 → 刷新持久化
 * 契约（data-testid）：
 *   #fileImportInput / import-modal / import-folder-input / import-confirm
 *   home-group-card[data-folder-path] / group-switcher / group-switcher-panel
 *   group-switcher-search / group-switcher-item
 *   video-card / breadcrumb-root
 *   tool-group-manager / manager-folder-search
 *
 * 注意：本用例在 DSH 沙箱内跑不起来（playwright 启动 Edge 会 spawn EPERM）。
 * 断言的每个选择器都在真实浏览器里逐项手测过，但脚本本身尚未实跑验证。
 */
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const APP_URL = 'http://127.0.0.1:5173/';
const EDGE = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const VIDEO = 'D:/Dance Echo/local vidio store/fixtures/1.mp4';

const failures = [];
const check = (name, condition, extra = '') => {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(`${name}${extra ? ` :: ${extra}` : ''}`);
    console.log(`  FAIL  ${name}${extra ? ` :: ${extra}` : ''}`);
  }
};

const browser = await chromium.launch({ headless: true, executablePath: EDGE });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

const groupCard = (path) =>
  page.locator(`[data-testid="home-group-card"][data-folder-path="${path}"]`);
const cardCount = () => page.locator('[data-testid="video-card"]').count();
const groupName = `回归分组 ${Date.now().toString().slice(-5)}`;

try {
  await page.goto(APP_URL, { waitUntil: 'networkidle' });

  // ── 1. 导入 2 个视频成一个新组 ────────────────────────────────────────────
  const videoBuffer = await readFile(VIDEO);
  await page.locator('#fileImportInput').setInputFiles([
    { name: '回归-正面.mp4', mimeType: 'video/mp4', buffer: videoBuffer },
    { name: '回归-镜像.mp4', mimeType: 'video/mp4', buffer: videoBuffer },
  ]);
  await page.getByTestId('import-modal').waitFor({ timeout: 20000 });
  await page.getByTestId('import-folder-input').fill(groupName);
  await page.getByTestId('import-confirm').click();

  // ── 2. 首页出现该组卡片，计数 2 ───────────────────────────────────────────
  await groupCard(groupName).waitFor({ timeout: 120000 });
  check('导入后首页出现新组卡片', true);
  const cardText = await groupCard(groupName).innerText();
  check('组卡片显示计数 2', cardText.includes('2'), cardText);

  // ── 3. 进组：面包屑 + 视频卡数 ────────────────────────────────────────────
  await groupCard(groupName).click();
  await page.getByTestId('breadcrumb-root').waitFor({ timeout: 15000 });
  const cards = await cardCount();
  check('进组后视频卡 2 张', cards === 2, `实际 ${cards}`);
  check('URL 带分组 hash', page.url().includes('#/f/'), page.url());

  // ── 4. 面包屑「切换分组」：面板打开 + 搜索收窄 ───────────────────────────
  await page.getByTestId('group-switcher').click();
  await page.getByTestId('group-switcher-panel').waitFor({ timeout: 5000 });
  check('切换分组面板打开', true);

  const allItems = await page.getByTestId('group-switcher-item').allInnerTexts();
  check('面板列出其它分组且不含当前组', allItems.length > 0 && !allItems.some((t) => t.includes(groupName)), allItems.join(' | '));

  await page.getByTestId('group-switcher-search').fill('upload');
  await page.waitForTimeout(300);
  const filtered = await page.getByTestId('group-switcher-item').allInnerTexts();
  check(
    '搜索只保留匹配项',
    filtered.every((text) => text.toLowerCase().includes('upload')),
    filtered.join(' | ') || '(空)',
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // ── 5. 回到首页 → 分组管理弹窗搜索 ───────────────────────────────────────
  await page.getByTestId('breadcrumb-root').click();
  await page.getByTestId('tool-group-manager').click();
  await page.getByTestId('manager-folder-search').waitFor({ timeout: 5000 });
  await page.getByTestId('manager-folder-search').fill(groupName);
  await page.waitForTimeout(300);
  const managerText = await page.locator('[role="dialog"]').innerText();
  check('分组管理可按名搜索', managerText.includes(groupName), managerText.slice(0, 120));
  await page.keyboard.press('Escape');

  // ── 6. 刷新后组卡片仍持久 ────────────────────────────────────────────────
  await page.reload({ waitUntil: 'networkidle' });
  await groupCard(groupName).waitFor({ timeout: 60000 });
  check('刷新后组卡片仍在', true);
} catch (error) {
  failures.push(`脚本异常：${error?.message || error}`);
  console.log('  FAIL  脚本异常 ::', error?.message || error);
} finally {
  check('控制台 0 报错', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
}

console.log(JSON.stringify({ failures }, null, 2));
if (failures.length) {
  console.log(`\n${failures.length} 项失败`);
  process.exitCode = 1;
} else {
  console.log('\n分组闭环用例全部通过');
}
