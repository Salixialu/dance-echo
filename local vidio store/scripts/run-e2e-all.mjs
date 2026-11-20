import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Dance Echo 端到端总入口。
 *
 * 这个脚本自己负责前置条件：检测/拉起 DanceEcho Server（8090）与 vite dev server（5173），
 * 等端口真正就绪后再跑套件，结束后收掉自己拉起来的进程。
 *
 * 用法：
 *   npm run test:all                  # 缺什么起什么，跑完收掉自己起的
 *   npm run test:all -- --reuse       # 只复用已在跑的服务，不自己拉
 *   npm run test:all -- --keep        # 跑完保留服务（调试用）
 *   npm run test:all -- --only=4,7    # 只跑第 4 与第 7 个套件
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');
const serverRoot = path.resolve(projectRoot, '..', 'DanceEcho Server');
const LOG_DIR = path.join(projectRoot, '.e2e-logs');

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const FRONTEND_PORT = 5173;
const BACKEND_PORT = 8090;
const FRONTEND_URL = `http://127.0.0.1:${FRONTEND_PORT}`;
const BACKEND_HEALTH = `http://127.0.0.1:${BACKEND_PORT}/api/v1/health`;

const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(`--${name}`);
const REUSE_ONLY = hasFlag('reuse');
const KEEP_SERVERS = hasFlag('keep');
const onlyArg = argv.find((a) => a.startsWith('--only='));
const ONLY = onlyArg
  ? new Set(
      onlyArg
        .slice('--only='.length)
        .split(',')
        .map((s) => Number.parseInt(s.trim(), 10))
        .filter((n) => Number.isInteger(n) && n > 0)
    )
  : null;

const SUITES = [
  {
    name: 'Skeleton & Pose Integrity Guard',
    tier: 'Tier 1 & Security Guard',
    script: 'scripts/test-skeleton-guard.mjs',
    desc: 'Automated check ensuring MediaPipe and Three.js pose files are 100% untouched',
    needsBrowser: false,
  },
  {
    name: 'Design Tokens & CSS Compilation Integrity',
    tier: 'Tier 1 (F1, F2) & Tier 2',
    script: 'scripts/test-tokens-css-integrity.mjs',
    desc: 'Deep space void, 1px hairline, 5 low-sat accents, WCAG AAA contrast, Tailwind compilation',
    needsBrowser: false,
  },
  {
    name: 'Bilingual i18n & Dynamic Language Toggle',
    tier: 'Tier 1 (F3, F4) & Tier 2',
    script: 'scripts/test-i18n-bilingual.mjs',
    desc: 'Symmetric zh/en dictionary parity, live [ 中 | EN ] toggle, clipping & placeholder check',
    needsBrowser: true,
  },
  {
    name: 'Sidebar CTA, Dropdown & Media Hierarchy',
    tier: 'Tier 1 (F5, F6) & Tier 2',
    script: 'scripts/test-sidebar-interactions.mjs',
    desc: 'Single white CTA pill, action dropdown, folder tree, resizing bounds, PWA card removal',
    needsBrowser: true,
  },
  {
    name: 'VideoGrid 56px Bar & Card Hover Scrubbing',
    tier: 'Tier 1 (F8, F9) & Tier 3',
    script: 'scripts/test-gallery-cards.mjs',
    desc: '56px single-line bar, ⌘K search pill, resting card simplification, hover scrubbing',
    needsBrowser: true,
  },
  {
    name: 'DancePlayer Viewport & Feet Clearance',
    tier: 'Tier 1 (F10), Tier 3 & Tier 4',
    script: 'scripts/test-player-foot-clearance.mjs',
    desc: 'Ultra-thin floating HUD, dancer feet clearance verification, 8-beat metronome, mirror flip',
    needsBrowser: true,
  },
  {
    name: 'Trash Filtering Contract',
    tier: 'Tier 1 (P0) & 回收站',
    script: 'scripts/test-trash-filtering.mjs',
    desc: 'Deleted videos leave the default library/groups, stay visible with includeTrashed, and come back on restore',
    needsBrowser: false,
  },
  {
    name: 'Backup Restore Contract',
    tier: 'Tier 1 (P0) & 备份恢复',
    script: 'scripts/test-backup-restore.mjs',
    desc: 'Server backup carries meta/folders/trash/observations/practiceLogs; restore writes back to the server, merges instead of clearing, rejects bad versions',
    needsBrowser: false,
  },
  {
    name: 'Continue-Watching Badge & Filter Contract',
    tier: 'Tier 1 (P0) & 最近观看',
    script: 'scripts/test-continue-watching.mjs',
    desc: 'Sidebar badge and grid filter share one predicate; badge number equals rendered card count',
    needsBrowser: true,
  },
  {
    name: 'Cover Contain Contract',
    tier: 'Tier 1 (P0) & 封面',
    script: 'scripts/test-cover-contract.mjs',
    desc: '16:9 card container, object-contain main image, decorative blurred backdrop, no aspect-ratio branching',
    needsBrowser: false,
  },
  {
    name: 'Terminology Contract (收藏 / 分组 / 练习瞬间)',
    tier: 'Tier 1 (P1) & 术语统一',
    script: 'scripts/test-terminology.mjs',
    desc: 'No legacy 收藏集 / 标星 / 打点书签 strings in visible copy; new terms present; 打点 kept as the action verb',
    needsBrowser: false,
  },
  {
    name: 'Meta Commit Seam Contract (library-truth)',
    tier: 'Tier 1 (P0) & 元数据一致',
    script: 'scripts/test-meta-commit.mjs',
    desc: 'One commit seam for local+server metadata: playbackPosition→progress, beats local-only, unmapped fields surface, store no longer hand-writes pushes',
    needsBrowser: false,
  },
  {
    name: 'Upload & Thumb Contract (mtime + id + cover)',
    tier: 'Tier 1 (P1) & 海量导入',
    script: 'scripts/test-upload-contract.mjs',
    desc: 'Upload keeps file mtime, returns stable server id, accepts thumb before rescan, and dates come from mtime not copy time',
    needsBrowser: false,
  },
  {
    name: 'Virtual Scroll & Collapse Contract (gallery)',
    tier: 'Tier 1 (P1) & 首页性能',
    script: 'scripts/test-virtual-scroll.mjs',
    desc: 'Timeline rows are windowed by column count, date groups collapse with persisted state, card info row height keeps row math stable',
    needsBrowser: false,
  },
  {
    name: 'Rename Contract (display title)',
    tier: 'Tier 1 (P1) & 可读性',
    script: 'scripts/test-rename.mjs',
    desc: 'displayTitle prefers meta.title and falls back to file name; server persists and clears meta.title without touching relPath',
    needsBrowser: false,
  },
  {
    name: 'Import Preset Tags (teacher / style / source)',
    tier: 'Tier 1 (P1) & 导入标签',
    script: 'scripts/test-import-preset-tags.mjs',
    desc: 'Import dialog lists configured tag presets, chips toggle with aria-pressed and a live 已选 counter, cancel closes without importing',
    needsBrowser: true,
  },
  {
    name: 'Trash Clear Contract (回收区清空)',
    tier: 'Tier 1 (P1) & 回收站',
    script: 'scripts/test-trash-clear.mjs',
    desc: 'Clearing the trash unhides records, empties the trash table, and never deletes disk files',
    needsBrowser: false,
  },
];

const children = [];
let shuttingDown = false;

function log(msg) {
  console.log(msg);
}

function isPortOpen(port, host = '127.0.0.1', timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const done = (value) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

async function waitForHttp(url, { timeoutMs = 60_000, intervalMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) return true;
    } catch {
      // 服务还没起来
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

function spawnTracked(label, command, args, options) {
  const child = spawn(command, args, {
    ...options,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0' },
  });
  const tail = [];
  const capture = (chunk) => {
    const text = chunk.toString();
    tail.push(text);
    if (tail.length > 40) tail.shift();
  };
  child.stdout?.on('data', capture);
  child.stderr?.on('data', capture);
  child.on('exit', (code, signal) => {
    if (!shuttingDown) {
      log(`⚠️  ${label} 提前退出（code=${code} signal=${signal}），最后输出：`);
      log(tail.join('').trim() || '(无输出)');
    }
  });
  children.push({ label, child });
  return child;
}

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      return;
    } catch {
      // 落到下面的 fallback
    }
  }
  try {
    child.kill('SIGTERM');
  } catch {
    // 已经没了
  }
}

function shutdownServers() {
  if (KEEP_SERVERS) return;
  for (const { child } of children) killTree(child);
}

function resolveBrowserPath() {
  if (process.env.EDGE_PATH && fs.existsSync(process.env.EDGE_PATH)) return;
  const candidates = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (found) {
    process.env.EDGE_PATH = found;
    log(`🧭 浏览器：${found}`);
  } else {
    log('⚠️  没找到 Edge/Chrome，请设置 EDGE_PATH 后重试。');
  }
}

async function ensureBackend() {
  if (await isPortOpen(BACKEND_PORT)) {
    log(`✓ 复用已在运行的 DanceEcho Server（:${BACKEND_PORT}）`);
    return false;
  }
  if (REUSE_ONLY) {
    throw new Error(`--reuse 模式下 ${BACKEND_PORT} 没有服务在跑`);
  }
  if (!fs.existsSync(path.join(serverRoot, 'server.mjs'))) {
    throw new Error(`找不到服务端：${serverRoot}\\server.mjs`);
  }
  log(`▶ 启动 DanceEcho Server（:${BACKEND_PORT}）…`);
  spawnTracked('DanceEcho Server', process.execPath, ['server.mjs'], { cwd: serverRoot });
  const ready = await waitForHttp(BACKEND_HEALTH, { timeoutMs: 45_000 });
  if (!ready) throw new Error(`服务端 45s 内没有就绪（${BACKEND_HEALTH}）`);
  log('✓ DanceEcho Server 就绪');
  return true;
}

async function ensureFrontend() {
  if (await isPortOpen(FRONTEND_PORT)) {
    log(`✓ 复用已在运行的 vite dev server（:${FRONTEND_PORT}）`);
    return false;
  }
  if (REUSE_ONLY) {
    throw new Error(`--reuse 模式下 ${FRONTEND_PORT} 没有服务在跑`);
  }
  log(`▶ 启动 vite dev server（:${FRONTEND_PORT}）…`);
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  spawnTracked('vite', npm, ['run', 'dev', '--', '--port', String(FRONTEND_PORT), '--strictPort'], {
    cwd: projectRoot,
    shell: process.platform === 'win32',
  });
  const ready = await waitForHttp(FRONTEND_URL, { timeoutMs: 90_000 });
  if (!ready) throw new Error(`前端 90s 内没有就绪（${FRONTEND_URL}）`);
  log('✓ vite dev server 就绪');
  return true;
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function runScript(suite, index) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const logName = `${String(index + 1).padStart(2, '0')}-${slugify(suite.name) || 'suite'}.log`;
    const logPath = path.join(LOG_DIR, logName);

    log(`▶ Running [${suite.tier}] ${suite.name}...`);
    log(`  Script: ${suite.script}`);
    log(`  Scope:  ${suite.desc}\n`);

    // 用文件描述符而不是管道接子进程输出：管道在受限环境里会 spawn EPERM，
    // 而且套件输出本来就更适合整段落盘（失败时再回放尾部）。
    let fd;
    try {
      fd = fs.openSync(logPath, 'w');
    } catch (err) {
      log(`  ⚠️ 无法写日志 ${logPath}：${err.message}，改为直接输出`);
    }

    const child = spawn(process.execPath, [suite.script], {
      stdio: fd === undefined ? 'inherit' : ['ignore', fd, fd],
      cwd: projectRoot,
      env: process.env,
    });

    if (fd !== undefined) {
      child.on('exit', () => {
        try {
          fs.closeSync(fd);
        } catch {
          // 已关闭
        }
      });
    }

    const finish = (result) => {
      let tail = [];
      try {
        tail = fs
          .readFileSync(logPath, 'utf-8')
          .split(/\r?\n/)
          .filter((line) => line.trim())
          .slice(-30);
      } catch {
        // 没有日志就读不到
      }
      resolve({ ...result, logPath, tail });
      log('────────────────────────────────────────────────────────────────────────\n');
    };

    child.on('close', (code) => {
      finish({
        name: suite.name,
        tier: suite.tier,
        script: suite.script,
        passed: code === 0,
        durationMs: Date.now() - startTime,
        code,
      });
    });

    child.on('error', (err) => {
      finish({
        name: suite.name,
        tier: suite.tier,
        script: suite.script,
        passed: false,
        durationMs: Date.now() - startTime,
        error: err.message,
      });
    });
  });
}

async function main() {
  log('╔═══════════════════════════════════════════════════════════════════════╗');
  log('║        DANCE ECHO (舞韵回响) - CENTRALIZED E2E TEST RUNNER            ║');
  log('║               4-Tier Test Architecture Verification                   ║');
  log('╚═══════════════════════════════════════════════════════════════════════╝\n');

  resolveBrowserPath();

  const selected = ONLY ? SUITES.filter((_, i) => ONLY.has(i + 1)) : SUITES;
  if (selected.length === 0) throw new Error('--only 没匹配到任何套件');
  const needsBrowser = selected.some((s) => s.needsBrowser);

  let startedFrontend = false;
  let startedBackend = false;

  if (needsBrowser) {
    startedBackend = await ensureBackend();
    startedFrontend = await ensureFrontend();
    log('');
  } else {
    log('ℹ️  本次只跑不需要浏览器的套件，跳过服务探测。\n');
  }
  void startedFrontend;
  void startedBackend;

  const overallStart = Date.now();
  const results = [];
  for (const [index, suite] of selected.entries()) {
    results.push(await runScript(suite, index));
  }

  const totalTime = ((Date.now() - overallStart) / 1000).toFixed(2);
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;

  log('════════════════════════════════════════════════════════════════════════');
  log('                       E2E TEST EXECUTION SUMMARY                       ');
  log('════════════════════════════════════════════════════════════════════════');
  log(
    `Total Suites: ${results.length} | Passed: ${passedCount} | Failed: ${failedCount} | Total Duration: ${totalTime}s\n`
  );

  log('| Suite Name                               | Tier                   | Status | Duration |');
  log('|------------------------------------------|------------------------|--------|----------|');
  for (const r of results) {
    const statusStr = r.passed ? '✓ PASS' : '✗ FAIL';
    const durationStr = `${(r.durationMs / 1000).toFixed(2)}s`;
    log(`| ${r.name.padEnd(40)} | ${r.tier.padEnd(22)} | ${statusStr.padEnd(6)} | ${durationStr.padStart(8)} |`);
  }
  log('════════════════════════════════════════════════════════════════════════\n');

  if (failedCount > 0) {
    log('失败套件详情（每个套件最后 20 行；完整日志在 .e2e-logs/）\n');
    for (const r of results.filter((x) => !x.passed)) {
      log(`── ✗ ${r.name} ──`);
      log(`   日志：${path.relative(projectRoot, r.logPath)}`);
      if (r.error) log(`   进程错误：${r.error}`);
      for (const line of (r.tail ?? []).slice(-20)) log(`   | ${line}`);
      log('');
    }
  }

  const summaryPath = path.join(LOG_DIR, 'summary.json');
  try {
    fs.writeFileSync(
      summaryPath,
      JSON.stringify(
        {
          finishedAt: new Date().toISOString(),
          total: results.length,
          passed: passedCount,
          failed: failedCount,
          durationS: Number(totalTime),
          results: results.map((r) => ({
            name: r.name,
            tier: r.tier,
            passed: r.passed,
            code: r.code ?? null,
            durationS: Number((r.durationMs / 1000).toFixed(2)),
            log: path.relative(projectRoot, r.logPath),
          })),
        },
        null,
        2
      )
    );
    log(`完整日志目录：.e2e-logs/（汇总：.e2e-logs/summary.json）\n`);
  } catch (err) {
    log(`⚠️ 写汇总失败：${err.message}\n`);
  }

  if (KEEP_SERVERS && children.length > 0) {
    log('🟡 --keep：服务保持运行，用完自己关。');
  }

  if (failedCount > 0) {
    console.error(`❌ ${failedCount} 个套件失败。`);
    process.exitCode = 1;
  } else {
    log(`✅ ${passedCount}/${results.length} 个套件通过。`);
    process.exitCode = 0;
  }
}

for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    shuttingDown = true;
    shutdownServers();
    process.exit(130);
  });
}

main()
  .catch((err) => {
    console.error(`❌ 运行失败：${err?.message ?? err}`);
    process.exitCode = 1;
  })
  .finally(() => {
    shuttingDown = true;
    shutdownServers();
  });
