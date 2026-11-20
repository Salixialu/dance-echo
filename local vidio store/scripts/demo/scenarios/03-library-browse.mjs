/**
 * 03 — 媒体库浏览：搜索、标签筛选、日期抽屉、网格/列表、多选批量
 * 目标：35s 左右，展示"找片"这条主路径。
 */
import { tap } from '../recorder.mjs';

export const meta = {
  id: '03-library-browse',
  slug: '03-library-browse',
  title: '媒体库浏览与筛选',
  size: { width: 1600, height: 900 },
};

export async function run({ page, hold, caption, step, gotoApp }) {
  const searchInput = page.locator('input[aria-label*="搜索"]').first();

  await gotoApp();

  // ① 库总览
  await caption('① 媒体库：分组卡片 + 未分组 + 标签');
  await page.mouse.move(700, 260, { steps: 20 });
  await page.mouse.move(420, 470, { steps: 18 });
  await page.mouse.move(900, 470, { steps: 18 });
  await hold(900);

  // ② 搜索
  await step('search', async () => {
    await caption('② 搜名称 / 标签 / 分组');
    await tap(page, searchInput);
    await page.keyboard.type('Go', { delay: 320 });
    await hold(2600);
  });

  // ③ 清空搜索
  await step('clear search', async () => {
    const clear = page.locator('button[aria-label*="清除"]').first();
    if (await clear.count()) {
      await tap(page, clear);
    } else {
      await tap(page, searchInput);
      await page.keyboard.press('Control+a');
      await page.keyboard.press('Backspace');
    }
    await hold(1000);
  });

  // ④ 标签筛选
  await step('tag filter', async () => {
    await caption('③ 点标签直接筛：#舞室');
    await tap(page, '[data-testid="home-tag-chip"]');
    await hold(1900);
  });

  // ⑤ 清除标签
  await step('tag clear', async () => {
    await tap(page, '[data-testid="home-tag-clear"]');
    await hold(1000);
  });

  // ⑥ 日期抽屉（遮罩层挡着 toggle，必须用面板自己的关闭键）
  await step('date drawer', async () => {
    await caption('④ 按日期筛选');
    await tap(page, '[data-testid="date-drawer-toggle"]');
    await hold(1400);
    await page.mouse.move(1380, 320, { steps: 16 });
    await page.mouse.move(1420, 420, { steps: 12 });
    await hold(1600);
    await tap(page, page.locator('[data-testid="date-drawer"] button[aria-label="关闭"]').first());
    await hold(1000);
  });

  // ⑦ 列表视图
  await step('list view', async () => {
    await caption('⑤ 网格 / 列表两种密度');
    await tap(page, '[data-testid="view-mode-list"]');
    await hold(700);
    await page.mouse.move(760, 330, { steps: 14 });
    await page.mouse.move(760, 430, { steps: 14 });
    await hold(1500);
  });

  // ⑧ 回网格
  await step('grid view', async () => {
    await tap(page, '[data-testid="view-mode-grid"]');
    await hold(1300);
  });

  // ⑨ 多选批量
  await step('batch mode', async () => {
    await caption('⑥ 多选：批量移动 / 批量删除');
    await tap(page, '[data-testid="enter-batch-mode"]');
    await hold(900);
    const boxes = page.locator('[data-testid="card-select"]');
    const count = await boxes.count();
    for (let i = 0; i < Math.min(2, count); i += 1) {
      await tap(page, boxes.nth(i));
      await hold(650);
    }
    await hold(900);
    const exit = page.locator('[data-testid="batch-exit"]');
    if (await exit.count()) await tap(page, exit.first());
    await hold(800);
  });

  await caption(null);
  await page.mouse.move(800, 520, { steps: 16 });
  await hold(1200);
}
