// 演示录屏：Playwright 操控 Dance Echo 并同步录成 webm。
// 用法：node scripts/record-demo-video.mjs      （需要 8090 后端 + 5173 前端在跑）
// 输出：../../recordings/dance-echo-demo.webm
import { chromium } from 'playwright';
import { mkdirSync, rmSync, renameSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VIDEO_DIR = path.join(HERE, '.demo-video');
const OUT_DIR = path.resolve(HERE, '../../recordings');
const OUT_FILE = path.join(OUT_DIR, 'dance-echo-demo.webm');
const BASE = process.env.DEMO_URL || 'http://127.0.0.1:5173/';
const VW = 1600;
const VH = 900;

for (const dir of [VIDEO_DIR, OUT_DIR]) mkdirSync(dir, { recursive: true });
if (existsSync(VIDEO_DIR)) for (const f of readdirSync(VIDEO_DIR)) rmSync(path.join(VIDEO_DIR, f), { recursive: true, force: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: VW, height: VH },
  deviceScaleFactor: 1,
  recordVideo: { dir: VIDEO_DIR, size: { width: VW, height: VH } },
});
const page = await context.newPage();
page.setDefaultTimeout(8000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const log = [];
const step = async (name, fn) => {
  const t = Date.now();
  try {
    await fn();
    log.push(`ok    ${name} (${Date.now() - t}ms)`);
  } catch (e) {
    log.push(`skip  ${name} -> ${e.message.split('\n')[0].slice(0, 90)}`);
  }
};
const hold = (ms) => page.waitForTimeout(ms);

// 页面上叠一个假光标 + 进度角标（Playwright 录制不含系统指针，否则看不出点了哪里）
const decorate = () =>
  page.evaluate(() => {
    if (document.getElementById('__cur')) return;
    const c = document.createElement('div');
    c.id = '__cur';
    Object.assign(c.style, {
      position: 'fixed', left: '0', top: '0', width: '22px', height: '22px', borderRadius: '50%',
      border: '2px solid rgba(255,255,255,.95)', background: 'rgba(56,189,248,.35)',
      boxShadow: '0 0 0 1px rgba(0,0,0,.45), 0 2px 10px rgba(0,0,0,.5)',
      transform: 'translate(-50%,-50%)', transition: 'width .12s, height .12s, left .06s linear, top .06s linear',
      pointerEvents: 'none', zIndex: '2147483600', opacity: '0',
    });
    const cap = document.createElement('div');
    cap.id = '__cap';
    Object.assign(cap.style, {
      position: 'fixed', left: '24px', bottom: '22px', padding: '9px 16px', borderRadius: '999px',
      background: 'rgba(9,12,20,.82)', color: '#e6edf7', font: '600 14px/1.2 system-ui,"Segoe UI",sans-serif',
      letterSpacing: '.3px', border: '1px solid rgba(255,255,255,.14)', pointerEvents: 'none',
      zIndex: '2147483600', backdropFilter: 'blur(6px)', transition: 'opacity .25s',
    });
    document.body.append(c, cap);
    window.__cap = (txt) => { if (txt === null) { cap.style.opacity = '0'; return; } cap.textContent = txt; cap.style.opacity = '1'; };
    const move = (e) => {
      c.style.opacity = '1';
      c.style.left = e.clientX + 'px';
      c.style.top = e.clientY + 'px';
    };
    document.addEventListener('mousemove', move, true);
    document.addEventListener('mousedown', () => { c.style.width = '14px'; c.style.height = '14px'; c.style.background = 'rgba(250,204,21,.75)'; }, true);
    document.addEventListener('mouseup', () => { c.style.width = '22px'; c.style.height = '22px'; c.style.background = 'rgba(56,189,248,.35)'; }, true);
  });

const caption = (txt) => page.evaluate((t) => window.__cap?.(t), txt).catch(() => {});
const glide = async (x, y) => page.mouse.move(x, y, { steps: 22 });

await page.goto(BASE, { waitUntil: 'networkidle' });
await decorate();
await hold(1200);

// ① 媒体库总览
await caption('① 媒体库：分组 + 标签 + 虚拟滚动网格');
await glide(300, 500);
await glide(700, 200);
await glide(500, 500);
await glide(1100, 140);
await hold(1000);

// ② 打开播放器
await step('open player', async () => {
  await caption('② 点开一条视频 → 播放器');
  await page.locator('[data-testid="video-card"]').nth(2).click();
  await page.waitForSelector('[data-testid="player-video-frame"]', { timeout: 8000 });
  await hold(2600);
});

// ③ 舞曲面板（BPM / 节拍器）
await step('song tab', async () => {
  await caption('③ 舞曲面板：BPM、节拍器、镜像');
  await page.locator('[data-testid="drawer-tab-song"]').click();
  await hold(2200);
});

// ④ 留言面板 + 标签
await step('notes tab', async () => {
  await caption('④ 留言按秒挂载 + 快捷标签');
  await page.locator('[data-testid="drawer-tab-notes"]').click();
  await hold(900);
  await page.getByRole('button', { name: '#节奏' }).first().hover().catch(() => {});
  await hold(1500);
});

// ⑤ 变速 / 镜像
await step('speed', async () => {
  await caption('⑤ 变速与镜像');
  await page.getByText('1.5x', { exact: true }).click({ timeout: 4000 });
  await hold(1800);
  await page.getByText('镜像 (M)').click({ timeout: 4000 }).catch(() => {});
  await hold(1600);
});

// ⑥ 回到媒体库（用播放器的关闭按钮；Escape 可能被 focusPoint 吃掉）
await step('back to library', async () => {
  await caption('⑥ 回到媒体库：切换列表视图');
  const closed = async () => !(await page.locator('[data-testid="player-video-frame"]').count());
  await page.locator('#btnClosePlayer').click({ timeout: 5000 }).catch(() => {});
  if (!(await closed())) {
    await page.keyboard.press('Escape');
    await hold(500);
    await page.keyboard.press('Escape');
  }
  for (let i = 0; i < 20 && !(await closed()); i++) await hold(150);
  if (!(await closed())) throw new Error('player still open');
  await hold(600);
});

// ⑦ 列表视图
await step('list view', async () => {
  await page.locator('[data-testid="view-mode-list"]').click();
  await hold(700);
  await glide(760, 300);
  await glide(760, 420);
  await hold(1500);
  await page.locator('[data-testid="view-mode-grid"]').click();
  await hold(1000);
});

// ⑧ 标签筛选
await step('tag filter', async () => {
  await caption('⑦ 标签筛选');
  await page.locator('[data-testid="home-tag-chip"]').first().click();
  await hold(2000);
  await page.locator('[data-testid="home-tag-clear"]').click({ timeout: 4000 }).catch(() => {});
  await hold(900);
});

// ⑨ 分组管理
await step('group manager', async () => {
  await caption('⑧ 分组管理');
  await page.locator('[data-testid="tool-group-manager"]').click();
  await hold(2300);
  await page.keyboard.press('Escape');
  await hold(600);
});

// 收尾
await caption(null);
await glide(800, 520);
await hold(1400);

const video = page.video();
await context.close();
await browser.close();

const src = await video.path();
mkdirSync(OUT_DIR, { recursive: true });
rmSync(OUT_FILE, { force: true });
renameSync(src, OUT_FILE);

console.log(JSON.stringify({ out: OUT_FILE, errors, steps: log }, null, 2));
