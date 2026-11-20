/**
 * 06 — 双人焦点与骨架叠加
 * 素材：two（白棚双人）
 *
 * 流程：先在设置里打开「多姿态」，再进播放器按 2 开骨骼叠加，
 * 点左边舞者锁定、点右边舞者切换，最后播放看骨架跟随。
 */
import { tap } from '../recorder.mjs';

export const meta = {
  id: '06-focus-pose',
  slug: '06-focus-pose',
  title: '双人焦点与骨架叠加',
  size: { width: 1600, height: 900 },
};

export async function run({ page, hold, caption, step, gotoApp }) {
  await gotoApp();

  // ① 设置里打开多姿态（在库页面才能点侧边栏设置）
  await step('enable multi pose', async () => {
    await caption('① 设置 → 识别性能：打开「多姿态」');
    await tap(page, page.locator('button').filter({ hasText: /^设置$/ }).first());
    await hold(1200);
    const tab = page.getByText(/识别性能/).first();
    if (await tab.count()) {
      await tap(page, tab);
      await hold(1200);
    }
    const toggle = page.locator('[data-testid="multi-pose-toggle"]').first();
    if (await toggle.count()) {
      const box = await toggle.boundingBox();
      if (box) {
        const x = box.x + Math.min(box.width * 0.85, box.width - 6);
        await page.mouse.move(x - 60, box.y + box.height / 2 + 8, { steps: 10 });
        await page.mouse.click(x, box.y + box.height / 2);
      }
      await hold(1000);
    }
    const close = page.locator('[data-testid="settings-close"]');
    if (await close.count()) await tap(page, close.first());
    await hold(900);
  });

  // ② 打开 two
  await step('open two', async () => {
    await caption('② 打开双人练习视频');
    await tap(page, page.locator('[data-testid="video-card"]').filter({ hasText: 'two' }).first());
    await page.waitForSelector('[data-testid="player-video-frame"]', { timeout: 12000 });
    await hold(2600);
  });

  // ③ 开骨骼叠加（快捷键 2）
  await step('overlay on', async () => {
    await caption('③ 开骨骼叠加');
    await page.mouse.click(700, 500);
    await hold(400);
    await page.keyboard.press('2');
    await hold(9000);
  });

  // ④ 锁定左边舞者
  const frame = await page.locator('[data-testid="player-video-frame"]').boundingBox();
  await step('lock left', async () => {
    await caption('④ 点一下锁定这位舞者');
    if (frame) {
      await page.mouse.move(frame.x + frame.width * 0.3, frame.y + frame.height * 0.55, { steps: 14 });
      await page.mouse.click(frame.x + frame.width * 0.4, frame.y + frame.height * 0.55);
    }
    await hold(2600);
  });

  // ⑤ 切换锁定右边舞者
  await step('lock right', async () => {
    await caption('⑤ 换一个舞者，骨架跟过去');
    if (frame) {
      await page.mouse.move(frame.x + frame.width * 0.55, frame.y + frame.height * 0.55, { steps: 12 });
      await page.mouse.click(frame.x + frame.width * 0.63, frame.y + frame.height * 0.57);
    }
    await hold(3000);
  });

  // ⑥ 播放几秒看跟随
  await step('play follow', async () => {
    await caption('⑥ 播放：骨架实时跟随');
    await page.keyboard.press(' ');
    await hold(4200);
  });

  await step('close', async () => {
    await tap(page, '#btnClosePlayer');
    await page.waitForFunction(() => !document.querySelector('[data-testid="player-video-frame"]'), null, { timeout: 8000 });
    await hold(900);
  });

  await caption(null);
  await page.mouse.move(780, 480, { steps: 14 });
  await hold(1000);
}
