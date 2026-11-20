/**
 * 04 — 播放器基本功：续播、镜像、变速、AB 循环、音量
 * 素材：bone（白棚单人全身，竖屏）
 */
import { tap, tapRange } from '../recorder.mjs';

export const meta = {
  id: '04-player-basics',
  slug: '04-player-basics',
  title: '播放器基本功',
  size: { width: 1600, height: 900 },
};

export async function run({ page, hold, caption, step, gotoApp }) {
  await gotoApp();

  // ① 打开 bone
  await step('open bone', async () => {
    await caption('① 点开一条练习视频');
    await page.mouse.move(830, 430, { steps: 16 });
    const card = page.locator('[data-testid="video-card"]').filter({ hasText: 'bone' }).first();
    await tap(page, card);
    await page.waitForSelector('[data-testid="player-video-frame"]', { timeout: 12000 });
    await hold(2600);
  });

  // ② 镜像
  await step('mirror', async () => {
    await caption('② 镜像：跟着镜面方向练');
    await tap(page, '#btnMirror');
    await hold(2000);
  });

  // ③ 变速
  await step('speed', async () => {
    await caption('③ 变速：0.75x 抠动作，1.5x 过整段');
    await tap(page, page.getByText('0.75x', { exact: true }).first());
    await hold(1900);
    await tap(page, page.getByText('1.5x', { exact: true }).first());
    await hold(1700);
    await tap(page, page.getByText('1x', { exact: true }).first());
    await hold(1000);
  });

  // ④ 拖进度 + 设 A 点
  await step('seek A', async () => {
    await caption('④ AB 循环：卡住最难的一拍');
    await tapRange(page, 0, 0.45);
    await hold(900);
    await tap(page, page.getByText(/^A: /).first());
    await hold(900);
  });

  // ⑤ 拖到后面设 B 点
  await step('seek B', async () => {
    await tapRange(page, 0, 0.72);
    await hold(900);
    await tap(page, page.getByText(/^B: /).first());
    await hold(900);
  });

  // ⑥ 打开 AB 循环
  await step('ab loop on', async () => {
    await tap(page, page.locator('button[title*="AB 循环"]').first());
    await hold(3200);
  });

  // ⑦ 音量
  await step('volume', async () => {
    await caption('⑤ 音量与小窗控制');
    await tapRange(page, 1, 0.55);
    await hold(900);
    await tapRange(page, 1, 0.85);
    await hold(1000);
  });

  // ⑧ 关闭
  await step('close player', async () => {
    await tap(page, '#btnClosePlayer');
    await page.waitForFunction(() => !document.querySelector('[data-testid="player-video-frame"]'), null, { timeout: 8000 });
    await hold(1000);
  });

  await caption(null);
  await page.mouse.move(760, 470, { steps: 14 });
  await hold(1200);
}
