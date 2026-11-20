/**
 * 09 — 3D 视窗与动捕导出（BVH）
 * 素材：bone（白棚单人全身）
 *
 * 骨骼索引要跑整段离线推理（15s 视频 ≈ 77s），所以这里用持久化 profile：
 * 先用 `node scripts/demo/warm-pose.mjs --video=bone` 把索引扫好，
 * 录制时直接命中「382 帧」，扫描不占片长。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tap } from '../recorder.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const meta = {
  id: '09-pose-3d',
  slug: '09-pose-3d',
  title: '3D 视窗与动捕导出',
  size: { width: 1600, height: 900 },
  // 骨骼索引存在 IndexedDB 里，跨运行复用同一个 profile
  profile: path.resolve(HERE, '..', '..', '..', '..', '.tmp-pose-profile'),
};

export async function run({ page, hold, caption, step, gotoApp }) {
  const openViewMenu = async () => {
    const btn = page.locator('#btnCycleDisplayMode');
    for (let i = 0; i < 3; i += 1) {
      const box = await btn.boundingBox();
      if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(600);
      if (await page.getByText('骨骼索引').first().isVisible().catch(() => false)) return true;
    }
    return false;
  };

  await gotoApp();

  await step('open bone', async () => {
    await caption('① 打开一段练习视频');
    await tap(page, page.locator('[data-testid="video-card"]').filter({ hasText: 'bone' }).first());
    await page.waitForSelector('[data-testid="player-video-frame"]', { timeout: 12000 });
    await page
      .waitForFunction(() => {
        const v = document.querySelector('video');
        return !!v && v.videoWidth > 0 && v.currentTime > 0.3;
      }, null, { timeout: 25000 })
      .catch(() => {});
    await hold(1500);
  });

  await step('3d view', async () => {
    await caption('② 视图 → 3D 视窗');
    const opened = await openViewMenu();
    if (!opened) throw new Error('视图菜单没打开');
    const tab = page.getByRole('button', { name: '3D', exact: true }).first();
    if (await tab.count()) {
      await tap(page, tab);
    } else {
      await page.keyboard.press('3');
      await page.keyboard.press('3');
    }
    await hold(9000);
  });

  await step('rotate', async () => {
    await caption('③ 拖一下就能绕着骨架看');
    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox().catch(() => null);
    if (box) {
      await page.mouse.move(box.x + box.width * 0.38, box.y + box.height * 0.5, { steps: 12 });
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.44, { steps: 20 });
      await page.mouse.up();
      await hold(1200);
      await page.mouse.move(box.x + box.width * 0.58, box.y + box.height * 0.56, { steps: 12 });
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.44, box.y + box.height * 0.5, { steps: 18 });
      await page.mouse.up();
    }
    await hold(2200);
  });

  await step('export bvh', async () => {
    await caption('④ 整段已索引 382 帧，导出动捕');
    const opened = await openViewMenu();
    if (!opened) throw new Error('视图菜单没打开');
    await hold(1600);
    const downloadPromise = page.waitForEvent('download', { timeout: 25000 }).catch(() => null);
    await tap(page, page.locator('[data-testid="pose-export-bvh"]').first());
    const download = await downloadPromise;
    if (download) {
      const target = path.resolve(HERE, '..', '..', '..', '..', 'recordings', '09-pose-bvh.bvh');
      await download.saveAs(target).catch(() => {});
    }
    await hold(2800);
  });

  await step('close', async () => {
    await caption('⑤ 导出的是通用 BVH：Blender / Maya 都能吃');
    await tap(page, '#btnClosePlayer');
    await page.waitForFunction(() => !document.querySelector('[data-testid="player-video-frame"]'), null, { timeout: 8000 });
    await hold(1000);
  });

  await caption(null);
  await page.mouse.move(800, 500, { steps: 14 });
  await hold(1100);
}
