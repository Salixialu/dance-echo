/**
 * to-mp4 — 把 recordings/ 里的 webm 成片转成剪辑友好的 MP4（H.264 / yuv420p / faststart）
 *
 * 用法：
 *   node scripts/demo/to-mp4.mjs              # 转全部，已是最新的跳过
 *   node scripts/demo/to-mp4.mjs --force      # 强制重转
 *   node scripts/demo/to-mp4.mjs --file=xxx.webm
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.resolve(HERE, '..', '..', '..');
const RECORDINGS = path.join(WORKSPACE, 'recordings');
const FFMPEG = path.join(WORKSPACE, 'tools', 'ffmpeg', 'bin', 'ffmpeg.exe');

const argv = process.argv.slice(2);
const force = argv.includes('--force');
const only = argv.find((a) => a.startsWith('--file='))?.slice('--file='.length);

if (!existsSync(FFMPEG)) throw new Error(`ffmpeg 不存在：${FFMPEG}`);

const targets = readdirSync(RECORDINGS)
  .filter((f) => f.toLowerCase().endsWith('.webm'))
  .filter((f) => !only || f === only);

if (targets.length === 0) {
  console.log('没有需要转换的 webm');
  process.exit(0);
}

for (const name of targets) {
  const src = path.join(RECORDINGS, name);
  const out = path.join(RECORDINGS, `${path.basename(name, '.webm')}.mp4`);
  if (!force && existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs) {
    console.log(`skip ${path.basename(out)}（已是最新）`);
    continue;
  }
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', src,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', out];
  const res = spawnSync(FFMPEG, args, { encoding: 'utf8' });
  if (res.status !== 0) {
    console.error(`✗ ${name}: ${(res.stderr || '').slice(0, 200)}`);
    process.exitCode = 1;
    continue;
  }
  console.log(`✓ ${path.basename(out)}  ${(statSync(out).size / 1024 / 1024).toFixed(2)} MB`);
}
