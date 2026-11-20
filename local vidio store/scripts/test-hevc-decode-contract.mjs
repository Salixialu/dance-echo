/**
 * HEVC 解码契约回归测试
 *
 * 背景（2026-11-07）：Chromium 播放 HEVC 时不触发 <video> error 事件，
 * 表现为 readyState=4 / duration 正常 / videoWidth=0 / 无画面。
 * 旧测试（playwright-playback.mjs）只断言 readyState 与 currentTime，
 * 因此「进度条走完但黑屏」能长期通过。本脚本专门断言真实解码帧与自动降级。
 *
 * 覆盖：
 *  1. 服务端转码产出可播的 H.264 副本，且任务状态含 error/reason 回传；
 *  2. HEVC 视频（无转码缓存时）打开后自动降级，最终解码出画面；
 *  3. 姿态浮层在画面不可解码时不再永久停留在「骨骼识别中」；
 *  4. 播放器无未捕获异常。
 *
 * 运行：node scripts/test-hevc-decode-contract.mjs
 */
import { chromium } from 'playwright';
import { stat, rm, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = process.env.DE_SERVER_URL || 'http://127.0.0.1:8090';
const WEB = process.env.DE_WEB_URL || 'http://127.0.0.1:5173';
const TRANSCODES = path.resolve(HERE, '../../DanceEcho Server/data/transcodes');
const failures = [];
const check = (ok, label, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures.push(label);
};

// ---------------------------------------------------------------- 契约 1：服务端转码
const library = await (await fetch(`${SERVER}/api/v1/library`)).json();
const candidate = library.videos?.find((v) => v.name === 'mmexport1791871608612.mp4') || library.videos?.[0];
if (!candidate) throw new Error('媒体库为空，无法执行 HEVC 契约测试');
const id = candidate.id;
const outFile = path.join(TRANSCODES, `${id}.mp4`);
// 不删除已有产物：那是用户数据（可再生，但删了会破坏环境）。
// 若已缓存，直接验证「二次请求返回 ready」这条幂等契约。
let preexisting = false;
try { await access(outFile); preexisting = true; } catch { /* 需要现场转码 */ }

const first = await (await fetch(`${SERVER}/api/v1/videos/${encodeURIComponent(id)}/transcode`, { method: 'POST' })).json();
check(first.status === 'running' || first.status === 'ready', '转码接口返回可处理状态', JSON.stringify(first));

let finalStatus = null;
for (let i = 0; i < 60; i += 1) {
  const res = await fetch(`${SERVER}/api/v1/videos/${encodeURIComponent(id)}/transcode`, { method: 'POST' });
  finalStatus = await res.json();
  if (finalStatus.status === 'ready' || finalStatus.status === 'error' || finalStatus.status === 'unavailable') break;
  await new Promise((r) => setTimeout(r, 1000));
}
check(finalStatus?.status === 'ready', '转码任务最终 ready（失败须回传 error 而非静默）', JSON.stringify({ ...finalStatus, preexisting }));
let outStat = null;
try { outStat = await stat(outFile); } catch { /* 不存在 */ }
check(Boolean(outStat && outStat.size > 0), '转码产物落盘且非空', outStat ? `${outStat.size} bytes` : 'missing');
const head = await fetch(`${SERVER}/transcode/${encodeURIComponent(id)}`, { method: 'HEAD' });
check(head.ok || head.status === 206, 'HEAD /transcode/:id 可访问', `HTTP ${head.status}`);

// ---------------------------------------------------------------- 契约 2~4：浏览器自动降级
// 选一个「库里真实存在、HEVC、且当前没有 H.264 缓存」的视频，
// 强制前端走自动降级链路。测试结束把本次生成的缓存清掉，不留下副作用。
// 必须是已确认 codec_name=hevc 的文件：delete.mp4 是 avc1(H.264)，
// 用它测降级会得到「本来就能播」的假阴性。Go1.mp4 = hvc1 / HEVC Main。
const browserVideo = library.videos?.find((v) => v.name === 'Go1.mp4');
if (!browserVideo) {
  check(false, '找到用于浏览器验证的 HEVC 视频（Go1.mp4）');
} else {
  const cache = path.join(TRANSCODES, `${browserVideo.id}.mp4`);
  const hadCacheBefore = await access(cache).then(() => true).catch(() => false);

  // 禁用硬件解码，确定性复现「HEVC 静默零尺寸」：
  // videoWidth=0 / error=null / readyState=1（Chromium 不会派发 onError）。
  // 不带这些参数时本机 Chrome/Edge 都有 HEVC 硬解，测不到降级链路。
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    args: ['--disable-gpu', '--disable-hardware-decoding', '--disable-features=PlatformHEVCDecoderSupport'],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));

    await page.goto(WEB, { waitUntil: 'networkidle' });
    // 不导入（会弹分组对话框）；库里本来就有该视频，用搜索定位即可。
    const search = page.locator('input[placeholder*="搜索"]').first();
    if (await search.count()) {
      await search.fill(browserVideo.name);
      await page.waitForTimeout(700);
    }
    const cardName = browserVideo.name.replace(/\.mp4$/, '');
    const card = page.locator('.video-card').filter({ hasText: cardName }).first();
    await card.waitFor({ state: 'visible', timeout: 10000 });
    // 直接派发 click，避开 hover 遮罩/拖拽手柄的命中区干扰
    await card.evaluate((el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await page.locator('video').first().waitFor({ state: 'attached', timeout: 15000 });

    // 核心断言：HEVC 无画面 → 自动转码 → 换到 /transcode/ 源 → 解码出真实帧。
    const degraded = await page.waitForFunction(
      () => {
        const v = document.querySelector('video');
        return v && (v.currentSrc || '').includes('/transcode/') && v.videoWidth > 0 && v.videoHeight > 0;
      },
      null,
      { timeout: 90000 }
    ).then(() => true).catch(() => false);

    const state = await page.locator('video').first().evaluate((v) => ({
      videoWidth: v.videoWidth,
      videoHeight: v.videoHeight,
      readyState: v.readyState,
      errorCode: v.error?.code ?? null,
      src: (v.currentSrc || '').slice(0, 140),
    }));
    check(degraded, 'HEVC 自动降级并解码出画面（/transcode/ 源且 videoWidth > 0）', JSON.stringify(state));

    const poseText = await page.locator('#poseStatus').innerText().catch(() => '');
    check(degraded || !poseText.includes('骨骼识别中'), '画面不可解码时姿态状态不再停在「骨骼识别中」', JSON.stringify({ poseText, degraded }));
    check(pageErrors.length === 0, '播放器无未捕获异常', pageErrors.slice(0, 3).join(' | '));
    await context.close();
  } finally {
    await browser.close();
    // 只清掉本次测试新生成的缓存；用户原本就有的缓存保持不动。
    if (!hadCacheBefore) {
      try { await rm(cache, { force: true }); } catch { /* ignore */ }
    }
  }
}

console.log(`\n${failures.length ? `FAILED (${failures.length}): ${failures.join(', ')}` : 'ALL PASS'}`);
if (failures.length) process.exitCode = 1;
