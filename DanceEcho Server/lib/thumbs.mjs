/**
 * thumbs.mjs — 服务端缩略图生成（零依赖，调用系统 ffmpeg 子进程）
 *
 * 优先级：config.thumbFfmpegPath（显式配置）→ PATH 中的 ffmpeg。
 * 参数一律走数组（禁 shell 拼接），ffmpeg 不可用时静默降级——
 * 客户端 POST /thumb/:id 上传抓帧的旧链路仍然可用。
 */
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const THUMB_WIDTH = 480;
const THUMB_HEIGHT = 270;
/** 缓存文件版本：滤镜或尺寸变了就换一个后缀，旧文件保留但不再优先使用。 */
export const THUMB_FILE_VERSION = 'v2';
const TIMEOUT_MS = 20000;

function runFfmpeg(bin, args, timeoutMs = TIMEOUT_MS) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(bin, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    } catch {
      resolve(false);
      return;
    }
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) { settled = true; try { child.kill('kill'); } catch { /* ignore */ } resolve(false); }
    }, timeoutMs);
    child.stderr?.on('data', (chunk) => { if (stderr.length < 4000) stderr += String(chunk); });
    child.on('error', () => { if (!settled) { settled = true; clearTimeout(timer); resolve(false); } });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(code === 0 || (code === null && stderr === ''));
    });
  });
}

/**
 * 探测 ffmpeg 是否可用。
 *
 * 显式配置路径优先：只要文件存在且可执行就采信，不再用 spawn -version 复核。
 * 原因：服务以受限账户/服务账户运行时 spawn 可能被系统策略拒绝，
 * 若把「spawn 失败」当成「ffmpeg 未安装」，会把明明存在的 ffmpeg 误判成不可用，
 * 转码与缩略图一起被静默降级。PATH 中的候选仍走 -version 实跑验证。
 */
export async function probeFfmpeg(explicitPath = '') {
  if (explicitPath) {
    try {
      const st = await fs.stat(explicitPath);
      if (st.isFile() && st.size > 0) return explicitPath;
    } catch {
      // 显式路径不存在，继续尝试 PATH 候选
    }
  }
  const candidates = process.platform === 'win32' ? ['ffmpeg.exe'] : ['ffmpeg'];
  for (const bin of candidates) {
    if (await runFfmpeg(bin, ['-version'], 5000)) return bin;
  }
  return null;
}

/**
 * 从视频文件生成缩略图：取第 3 秒（不足则取 10% 时长，再不足取 0 秒）。
 * @returns {Promise<boolean>} 是否成功写出 thumbPath
 */
export async function generateThumb(ffmpegBin, absVideoPath, thumbPath, durationSec = null) {
  let at = 3;
  if (Number.isFinite(durationSec) && durationSec > 0) {
    at = durationSec >= 30 ? 3 : durationSec * 0.1;
  }
  await fs.mkdir(path.dirname(thumbPath), { recursive: true });
  const tmp = `${thumbPath}.tmp.jpg`;
  // 竖屏视频如果只做等比缩小，竖着的那条细带会让卡片看起来是黑的。
  // 这里统一输出 480x270：整帧做模糊底铺满画面，原始画面等比居中叠上去。
  const filter = [
    '[0:v]split=2[a][b]',
    `[a]scale=${THUMB_WIDTH}:${THUMB_HEIGHT}:force_original_aspect_ratio=increase,`,
    `crop=${THUMB_WIDTH}:${THUMB_HEIGHT},gblur=sigma=18,eq=brightness=-0.12[bg]`,
    `[b]scale=${THUMB_WIDTH}:${THUMB_HEIGHT}:force_original_aspect_ratio=decrease[fg]`,
    '[bg][fg]overlay=(W-w)/2:(H-h)/2',
  ].join(';');
  const ok = await runFfmpeg(ffmpegBin, [
    '-hide_banner', '-loglevel', 'error',
    '-ss', String(at), '-i', absVideoPath,
    '-frames:v', '1', '-filter_complex', filter,
    '-y', tmp,
  ]);
  if (!ok) {
    try { await fs.rm(tmp, { force: true }); } catch { /* ignore */ }
    return false;
  }
  try {
    await fs.rename(tmp, thumbPath);
    return true;
  } catch {
    try { await fs.rm(tmp, { force: true }); } catch { /* ignore */ }
    return false;
  }
}
