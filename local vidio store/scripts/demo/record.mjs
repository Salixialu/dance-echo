/**
 * record.mjs — Dance Echo 演示录屏 CLI
 *
 * 用法：
 *   node scripts/demo/record.mjs --list
 *   node scripts/demo/record.mjs --scenario=03,04
 *   node scripts/demo/record.mjs --scenario=04 --size=900x1600
 *   node scripts/demo/record.mjs --scenario=03 --reuse      # 复用已在跑的 8090/5173
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readdirSync } from 'node:fs';
import { openRecorder } from './recorder.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCENARIO_DIR = path.join(HERE, 'scenarios');
const FFMPEG = path.resolve(HERE, '..', '..', '..', 'tools', 'ffmpeg', 'bin', 'ffmpeg.exe');

/** 成片同时出一份 H.264 MP4，剪辑软件（剪映/PR/DaVinci）直接吃 */
function toMp4(webmPath) {
  const out = webmPath.replace(/\.webm$/i, '.mp4');
  const res = spawnSync(FFMPEG, [
    '-y', '-hide_banner', '-loglevel', 'error', '-i', webmPath,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', out,
  ], { encoding: 'utf8' });
  if (res.status !== 0) {
    console.warn(`    ⚠ MP4 转换失败：${(res.stderr || '').slice(0, 120)}`);
    return null;
  }
  return out;
}

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

async function loadScenarios() {
  const files = readdirSync(SCENARIO_DIR).filter((f) => /^\d\d-.*\.mjs$/.test(f)).sort();
  const list = [];
  for (const file of files) {
    const mod = await import(pathToFileURL(path.join(SCENARIO_DIR, file)).href);
    list.push({ ...mod.meta, run: mod.run, file });
  }
  return list;
}

async function ensureServers() {
  const targets = [
    { name: 'backend', url: 'http://127.0.0.1:8090/api/v1/health' },
    { name: 'frontend', url: 'http://127.0.0.1:5173/' },
  ];
  const down = [];
  for (const t of targets) {
    try {
      const res = await fetch(t.url, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) down.push(t.name);
    } catch {
      down.push(t.name);
    }
  }
  if (down.length) {
    throw new Error(`服务未就绪：${down.join(', ')}。先跑 启动DanceEcho.bat，或 npm run dev / node server.mjs`);
  }
}

async function main() {
  const scenarios = await loadScenarios();

  if (flag('list') || scenarios.length === 0) {
    console.log('可用场景：');
    for (const s of scenarios) {
      console.log(`  ${s.id.padEnd(20)} ${s.title}  (${s.size.width}x${s.size.height})`);
    }
    return;
  }

  const pick = value('scenario');
  const sizeArg = value('size');
  const selected = pick
    ? scenarios.filter((s) => pick.split(',').map((p) => p.trim()).some((p) => p === s.id || p === s.id.slice(0, 2)))
    : scenarios;

  if (selected.length === 0) throw new Error(`--scenario=${pick} 没匹配到任何场景`);

  await ensureServers();
  const results = [];

  for (const scenario of selected) {
    const [w, h] = (sizeArg ? sizeArg.split('x') : [scenario.size.width, scenario.size.height]).map(Number);
    const recorder = await openRecorder({ width: w, height: h, slug: scenario.slug, profile: scenario.profile ?? null });
    console.log(`\n▶ ${scenario.id} — ${scenario.title}  (${w}x${h})`);
    try {
      await scenario.run(recorder);
      const { out, steps, errors } = await recorder.finish();
      const failed = steps.filter((s) => !s.ok);
      results.push({ id: scenario.id, out, steps, failed, errors });
      console.log(`  ✓ ${path.basename(out)}`);
      if (!flag('no-mp4')) {
        const mp4 = toMp4(out);
        if (mp4) console.log(`  ✓ ${path.basename(mp4)}（剪辑用）`);
      }
      for (const s of steps) console.log(`    ${s.ok ? 'ok  ' : 'skip'} ${s.name} (${s.ms}ms)${s.ok ? '' : ` -> ${s.error}`}`);
      if (errors.length) console.log(`    pageerror: ${errors.slice(0, 3).join(' | ')}`);
    } catch (error) {
      console.error(`  ✗ ${scenario.id} 失败：${error.message}`);
      try { await recorder.finish(); } catch { /* ignore */ }
      results.push({ id: scenario.id, error: error.message });
    }
  }

  const bad = results.filter((r) => r.error || (r.failed && r.failed.length));
  if (bad.length) {
    console.error(`\n⚠ ${bad.length} 条有跳过步骤/报错，检查上面的日志。`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`✗ ${error.message}`);
  process.exitCode = 1;
});
