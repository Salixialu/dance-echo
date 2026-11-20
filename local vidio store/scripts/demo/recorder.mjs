/**
 * recorder — Dance Echo 演示录屏的浏览器外壳
 *
 * 职责：起 chromium、开 recordVideo context、往页面里注入"假光标 + 左下角字幕"，
 * 提供 step/hold/glide/click 等编排用的原语，最后把 webm 挪到 recordings/。
 *
 * 为什么自己注入光标：Playwright 录的是页面帧，不含系统指针，
 * 不叠一个假光标观众就不知道点在哪儿。
 */
import { chromium } from 'playwright';
import { mkdirSync, rmSync, renameSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(HERE, '..', '..');
export const WORKSPACE_ROOT = path.resolve(PROJECT_ROOT, '..');
export const RECORDINGS_DIR = path.join(WORKSPACE_ROOT, 'recordings');
const RAW_VIDEO_DIR = path.join(PROJECT_ROOT, 'scripts', '.demo-video');

const OVERLAY = () => {
  if (document.getElementById('__de_cursor')) return;
  const cursor = document.createElement('div');
  cursor.id = '__de_cursor';
  Object.assign(cursor.style, {
    position: 'fixed', left: '0', top: '0', width: '20px', height: '20px', borderRadius: '50%',
    border: '2px solid rgba(255,255,255,.95)', background: 'rgba(56,189,248,.32)',
    boxShadow: '0 0 0 1px rgba(0,0,0,.5), 0 2px 10px rgba(0,0,0,.55)',
    transform: 'translate(-50%,-50%)', transition: 'width .1s, height .1s, background .1s, left .05s linear, top .05s linear',
    pointerEvents: 'none', zIndex: '2147483000', opacity: '0',
  });
  const caption = document.createElement('div');
  caption.id = '__de_caption';
  Object.assign(caption.style, {
    position: 'fixed', left: '26px', bottom: '24px', padding: '10px 18px', borderRadius: '999px',
    background: 'rgba(8,11,18,.84)', color: '#e8eef8', font: '600 15px/1.25 system-ui,"Microsoft YaHei",sans-serif',
    letterSpacing: '.3px', border: '1px solid rgba(255,255,255,.16)', pointerEvents: 'none',
    zIndex: '2147483000', backdropFilter: 'blur(6px)', opacity: '0', transition: 'opacity .25s',
  });
  document.body.append(cursor, caption);
  window.__deCap = (text) => {
    if (text === null) { caption.style.opacity = '0'; return; }
    caption.textContent = text; caption.style.opacity = '1';
  };
  document.addEventListener('mousemove', (e) => {
    cursor.style.opacity = '1';
    cursor.style.left = `${e.clientX}px`;
    cursor.style.top = `${e.clientY}px`;
  }, true);
  document.addEventListener('mousedown', () => {
    cursor.style.width = '13px'; cursor.style.height = '13px';
    cursor.style.background = 'rgba(250,204,21,.8)';
  }, true);
  document.addEventListener('mouseup', () => {
    cursor.style.width = '20px'; cursor.style.height = '20px';
    cursor.style.background = 'rgba(56,189,248,.32)';
  }, true);
};

export async function openRecorder({ base = 'http://127.0.0.1:5173/', width = 1600, height = 900, slug, profile = null }) {
  const runId = `${Date.now()}`;
  const rawDir = path.join(RAW_VIDEO_DIR, runId);
  mkdirSync(rawDir, { recursive: true });
  mkdirSync(RECORDINGS_DIR, { recursive: true });

  // profile 给了就用持久化上下文：IndexedDB（骨骼索引等）能跨多次运行复用
  let browser = null;
  let context;
  if (profile) {
    mkdirSync(profile, { recursive: true });
    context = await chromium.launchPersistentContext(profile, {
      headless: true,
      viewport: { width, height },
      deviceScaleFactor: 1,
      acceptDownloads: true,
      recordVideo: { dir: rawDir, size: { width, height } },
    });
  } else {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
      acceptDownloads: true,
      recordVideo: { dir: rawDir, size: { width, height } },
    });
  }
  const page = context.pages()[0] ?? (await context.newPage());
  page.setDefaultTimeout(8000);

  const errors = [];
  const steps = [];
  page.on('pageerror', (e) => errors.push(e.message));

  const hold = (ms) => page.waitForTimeout(ms);
  const caption = (text) => page.evaluate((t) => window.__deCap?.(t), text).catch(() => {});
  const decorate = () => page.evaluate(OVERLAY);

  const step = async (name, fn) => {
    const started = Date.now();
    try {
      await fn();
      steps.push({ name, ok: true, ms: Date.now() - started });
    } catch (error) {
      steps.push({ name, ok: false, ms: Date.now() - started, error: error.message.split('\n')[0].slice(0, 120) });
    }
  };

  const gotoApp = async () => {
    await page.goto(base, { waitUntil: 'networkidle' });
    await decorate();
    await hold(900);
  };

  const finish = async () => {
    await caption(null).catch(() => {});
    const video = page.video();
    await context.close();
    if (browser) await browser.close();
    const produced = await video.path();
    const out = path.join(RECORDINGS_DIR, `${slug}.webm`);
    rmSync(out, { force: true });
    renameSync(produced, out);
    rmSync(rawDir, { recursive: true, force: true });
    return { out, steps, errors };
  };

  return { page, context, browser, hold, caption, step, gotoApp, finish, errors, steps };
}

/**
 * tap — 用真实鼠标点元素中心，不走 Playwright 的 actionability 稳定性检查。
 *
 * 录制时 Chromium 开着 screencast，元素偶发被判"unstable"，
 * locator.click() 会一直等到超时；直接算坐标点下去既稳又天然带动假光标。
 */
export async function tap(page, target, { pause = 0 } = {}) {
  const loc = typeof target === 'string' ? page.locator(target).first() : target;
  await loc.waitFor({ state: 'visible', timeout: 10000 });
  const box = await loc.boundingBox();
  if (!box) throw new Error('元素不可见，拿不到坐标');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x - 46, y - 12, { steps: 8 });
  await page.mouse.move(x, y, { steps: 6 });
  await page.mouse.click(x, y);
  if (pause) await page.waitForTimeout(pause);
  return { x, y };
}

/** 按比例点某个 range 控件（进度条 / 音量条） */
export async function tapRange(page, index, fraction) {
  const input = page.locator('input[type="range"]').nth(index);
  const box = await input.boundingBox();
  if (!box) throw new Error(`range #${index} 不可见`);
  const x = box.x + Math.min(Math.max(fraction, 0.02), 0.98) * box.width;
  const y = box.y + box.height / 2;
  await page.mouse.move(x - 90, y + 12, { steps: 10 });
  await page.mouse.move(x, y, { steps: 8 });
  await page.mouse.click(x, y);
  return { x, y };
}

export function exists(file) {
  return existsSync(file);
}
