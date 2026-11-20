/**
 * 07 — 播放器基本功 + 侧栏三面板（素材：bone / dongbu.mp4）
 *
 * 一条片子把播放器和抽屉三块串起来：
 *   续播 → 镜像 → 变速 → AB 循环 → 音量
 *   → 信息（收藏/评分/标签/改名）→ 留言（钉秒数/标签/写/跳回）→ 舞曲（搜索）
 *
 * 两个必须遵守的坑：
 * 1. 每次写元数据都会重建 <video>，画面会黑；靠 ensurePicture() 等真的呈现一帧。
 * 2. 播放器的快捷键在焦点落 button 时失效；按键前先点画面空白处。
 */
import { tap, tapRange } from '../recorder.mjs';

export const meta = {
  id: '07-player-and-panels',
  slug: '07-player-and-panels',
  title: '播放器基本功 + 侧栏三面板',
  size: { width: 1600, height: 900 },
};

export async function run({ page, hold, caption, step, gotoApp }) {
  const tabInfo = page.locator('[data-testid="drawer-tab-info"]');
  const tabNotes = page.locator('[data-testid="drawer-tab-notes"]');
  const tabSong = page.locator('[data-testid="drawer-tab-song"]');

  const ensurePicture = async (at = 6) => {
    await page
      .waitForFunction(() => {
        const v = document.querySelector('video');
        return !!v && v.videoWidth > 0;
      }, null, { timeout: 15000 })
      .catch(() => {});
    await page
      .evaluate(async (target) => {
        const v = document.querySelector('video');
        if (!v) return;
        if (typeof target === 'number' && Number.isFinite(target)) v.currentTime = target;
        if (typeof v.requestVideoFrameCallback === 'function') {
          await Promise.race([
            new Promise((resolve) => v.requestVideoFrameCallback(() => resolve())),
            new Promise((resolve) => setTimeout(resolve, 2500)),
          ]);
        } else {
          await new Promise((resolve) => setTimeout(resolve, 900));
        }
      }, at)
      .catch(() => {});
    await hold(600);
  };
  const resetFocus = async () => {
    await page.mouse.click(150, 760);
    await hold(180);
  };

  await gotoApp();

  // ① 打开 bone，续播
  await step('open bone', async () => {
    await caption('① 打开练习视频：自动接着上次的位置');
    await tap(page, page.locator('[data-testid="video-card"]').filter({ hasText: 'dongbu' }).first());
    await page.waitForSelector('[data-testid="player-video-frame"]', { timeout: 12000 });
    await ensurePicture();
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
    await hold(1800);
    await tap(page, page.getByText('1.5x', { exact: true }).first());
    await hold(1600);
    await tap(page, page.getByText('1x', { exact: true }).first());
    await hold(900);
  });

  // ④ AB 循环
  await step('ab loop', async () => {
    await caption('④ AB 循环：卡住最难的一拍');
    await tapRange(page, 0, 0.42);
    await hold(800);
    await tap(page, page.getByText(/^A: /).first());
    await hold(700);
    await tapRange(page, 0, 0.68);
    await hold(800);
    await tap(page, page.getByText(/^B: /).first());
    await hold(700);
    await tap(page, page.locator('button[title*="AB 循环"]').first());
    await hold(3000);
  });

  // ⑤ 音量
  await step('volume', async () => {
    await caption('⑤ 音量：音量条左右拖');
    await tapRange(page, 1, 0.55);
    await hold(900);
    await tapRange(page, 1, 0.85);
    await hold(1000);
    // 关掉循环，免得后面看面板时画面还在跳
    await tap(page, page.locator('button[title*="AB 循环"]').first());
    await hold(600);
  });

  // ⑥ 信息面板：收藏 + 评分
  await step('info: favorite + rating', async () => {
    await caption('⑥ 信息面板：收藏与评分');
    if (await tabInfo.count()) await tap(page, tabInfo.first());
    await hold(1200);
    await tap(page, page.locator('[data-testid="info-favorite"]').first());
    await hold(1200);
    const heart4 = page.locator('[data-testid="info-rating-heart"][data-level="4"]').first();
    if (await heart4.count()) await tap(page, heart4);
    await hold(1400);
    await ensurePicture(6);
  });

  // ⑦ 信息面板：标签
  await step('info: tag', async () => {
    await caption('⑦ 加标签：分类与舞种');
    await tap(page, page.locator('[data-testid="info-tag-input"]').first());
    await page.keyboard.type('待复盘', { delay: 120 });
    await hold(600);
    await page.keyboard.press('Enter');
    await hold(1500);
    await ensurePicture(6);
  });

  // ⑧ 信息面板：改名
  await step('info: rename', async () => {
    await caption('⑧ 改名：只改显示标题，不动磁盘文件');
    await tap(page, page.locator('[data-testid="info-rename-title"]').first());
    await hold(600);
    await tap(page, page.locator('input[aria-label="显示标题"]').first());
    await page.keyboard.press('Control+a');
    await page.keyboard.type('bone · 白棚单人', { delay: 100 });
    await hold(800);
    await page.keyboard.press('Enter');
    await hold(1200);
    await ensurePicture(6);
    await hold(700);
  });

  // ⑨ 留言：钉住秒数
  await step('notes: pin', async () => {
    await caption('⑨ 留言面板：把秒数钉在这一拍');
    await page
      .waitForFunction(() => (document.querySelector('video')?.currentTime ?? 0) > 4.4, null, { timeout: 20000 })
      .catch(() => {});
    await tap(page, '#btnPlayPause');
    await hold(600);
    if (await tabNotes.count()) await tap(page, tabNotes.first());
    await hold(1100);
    const regrab = page.getByText('重新抓取').first();
    if (await regrab.count()) await tap(page, regrab);
    await hold(800);
    const chip = page.getByRole('button', { name: '#节奏' }).first();
    if (await chip.count()) await tap(page, chip);
    await hold(800);
  });

  // ⑩ 留言：写 + 跳回
  await step('notes: write + jump', async () => {
    await caption('⑩ 写一条挂在秒数上的留言');
    await tap(page, page.locator('textarea').first());
    await page.keyboard.type('肩膀先沉下去，再把手送出去', { delay: 80 });
    await hold(900);
    await tap(page, page.getByRole('button', { name: /留下留言/ }).first());
    await hold(2000);
    await ensurePicture(5);
    await caption('⑪ 点留言，直接跳回那一秒');
    await hold(400);
    const noteText = page.getByText('肩膀先沉下去').first();
    if (await noteText.count()) await tap(page, noteText);
    await hold(2000);
  });

  // ⑫ 舞曲面板
  await step('song: search', async () => {
    await caption('⑫ 舞曲面板：按曲名搜索绑定');
    if (await tabSong.count()) await tap(page, tabSong.first());
    await hold(1200);
    const search = page.locator('input[placeholder*="歌曲名"]').first();
    if (await search.count()) {
      await tap(page, search);
      await page.keyboard.type('dance', { delay: 110 });
      await hold(2400);
    }
  });

  // ⑬ 收尾
  await step('close', async () => {
    await caption(null);
    await tap(page, '#btnClosePlayer');
    await page.waitForFunction(() => !document.querySelector('[data-testid="player-video-frame"]'), null, { timeout: 8000 });
    await hold(1500);
  });

  await page.mouse.move(800, 500, { steps: 14 });
  await hold(1000);
}
