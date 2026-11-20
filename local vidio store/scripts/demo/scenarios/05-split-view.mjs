/**
 * 05 — 视图模式：视频 / 2D 骨架分屏 / 3D 视窗 / 纯骨架
 * 素材：Go1（舞台单人，横屏；HEVC 已预热转码）
 *
 * 说明：应用里的「左右同屏双机位 VS 对比」入口在当前版本不可达
 * （横幅依赖 selectedTag，而全项目没有把它设成 🎵 标签的代码），
 * 所以这一条演示播放器内真实可用的「视频 ↔ 骨架」对照。
 *
 * 关键坑：播放器的快捷键在焦点落在 button 上时会被忽略，
 * 每次按键前先点一下画面空白处把焦点交还给 body。
 */
import { tap } from '../recorder.mjs';

export const meta = {
  id: '05-split-view',
  slug: '05-split-view',
  title: '视图模式与骨架分屏',
  size: { width: 1600, height: 900 },
};

const MODE_STATES = ['2d-split', '3d-split', 'skeleton', 'off'];

export async function run({ page, hold, caption, step, gotoApp }) {
  await gotoApp();

  const resetFocus = async () => {
    await page.mouse.click(150, 700);
    await page.waitForTimeout(180);
  };
  const currentMode = () =>
    page.evaluate(() => document.querySelector('[data-state]')?.getAttribute('data-state') ?? 'none');
  const cycleTo = async (target) => {
    for (let i = 0; i < 4; i += 1) {
      await resetFocus();
      await page.keyboard.press('3');
      await page.waitForTimeout(650);
      if ((await currentMode()) === target) return true;
    }
    return false;
  };

  await step('open Go1', async () => {
    await caption('① 进入「Go Crazy」分组');
    await tap(page, page.locator('[data-testid="home-group-card"]').filter({ hasText: 'Go Crazy' }).first());
    await hold(1400);
    await caption('② 打开第一条练习视频');
    await tap(page, page.locator('[data-testid="video-card"]').first());
    await page.waitForSelector('[data-testid="player-video-frame"]', { timeout: 12000 });
    // 等真实画面出来（HEVC 走转码副本，开头会有几秒黑）
    await page
      .waitForFunction(() => {
        const v = document.querySelector('video');
        return !!v && v.videoWidth > 0 && v.currentTime > 0.3;
      }, null, { timeout: 25000 })
      .catch(() => {});
    await hold(1600);
  });

  await step('2d split', async () => {
    await caption('③ 2D 纯骨架分屏：左边视频，右边动作剪影');
    await cycleTo('2d-split');
    await hold(6500);
    const centered = page.locator('[data-testid="split-view-centered"]');
    if (await centered.count()) {
      await tap(page, centered.first());
      await hold(2000);
    }
    const fitted = page.locator('[data-testid="split-view-fitted"]');
    if (await fitted.count()) {
      await tap(page, fitted.first());
      await hold(2000);
    }
  });

  await step('3d view', async () => {
    await caption('④ 3D 视窗：可拖动的骨架空间');
    await cycleTo('3d-split');
    await hold(4200);
    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox().catch(() => null);
    if (box) {
      await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.5, { steps: 12 });
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.42, { steps: 18 });
      await page.mouse.up();
    }
    await hold(2200);
  });

  await step('skeleton only', async () => {
    await caption('⑤ 纯骨架：只看剪影，不看视频');
    await cycleTo('skeleton');
    await hold(3600);
  });

  await step('back to video', async () => {
    await caption('⑥ 回到视频视图');
    await cycleTo('off');
    await hold(2000);
    await tap(page, '#btnClosePlayer');
    await page.waitForFunction(() => !document.querySelector('[data-testid="player-video-frame"]'), null, { timeout: 8000 });
    await hold(900);
  });

  await caption(null);
  await page.mouse.move(800, 500, { steps: 14 });
  await hold(1000);
}
