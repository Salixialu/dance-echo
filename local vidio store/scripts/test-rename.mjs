import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert';
import ts from 'typescript';
import { pathToFileURL } from 'node:url';

/**
 * 重命名契约（ticket 02）：
 *   - displayTitle：用户标题优先，空串回退文件名（纯函数）；
 *   - 卡片 / 搜索 / 播放器都走 displayTitle 与 title 匹配；
 *   - 服务端 meta.title 持久化，空串清除；磁盘 relPath / name 不变。
 *
 * 用法：node scripts/test-rename.mjs            （默认 http://127.0.0.1:8090）
 *       DE_BASE=http://127.0.0.1:8092 node scripts/test-rename.mjs
 */

const root = path.resolve('.');
const base = (process.env.DE_BASE || 'http://127.0.0.1:8090').replace(/\/$/, '');
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
}

// ── 1. 纯函数：displayTitle ───────────────────────────────
const utilPath = path.join(root, 'src/utils/displayTitle.ts');
const utilSource = fs.readFileSync(utilPath, 'utf8');
const compiled = ts.transpileModule(utilSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'display-title-'));
const tmpFile = path.join(tmpDir, 'displayTitle.mjs');
fs.writeFileSync(tmpFile, compiled, 'utf8');
const mod = await import(pathToFileURL(tmpFile).href);

check('用户标题优先于文件名', mod.displayTitle({ title: '7月18日 编舞课', name: 'mmexport1754823257015.mp4' }) === '7月18日 编舞课');
check('空标题回退到文件名', mod.displayTitle({ title: '   ', name: 'two.mp4' }) === 'two.mp4');
check('没有 title 字段时回退', mod.displayTitle({ name: 'two.mp4' }) === 'two.mp4');
check('文件名去扩展名', mod.displayFileName({ name: 'two.mp4' }) === 'two');
check('副标题只在有标题时返回', mod.displayFileNameHint({ title: '课', name: 'a.mp4' }) === 'a.mp4');
check('无标题时没有副标题', mod.displayFileNameHint({ name: 'a.mp4' }) === null);

// ── 2. 静态接线检查 ───────────────────────────────────────
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const card = read('src/components/gallery/VideoCard.tsx');
const grid = read('src/components/gallery/VideoGrid.tsx');
const player = read('src/components/player/DancePlayer.tsx');
const drawer = read('src/components/player/DancePlayerRightDrawer.tsx');
const store = read('src/store/useVideoStore.ts');
const serverStore = fs.readFileSync(path.resolve(root, '..', 'DanceEcho Server/lib/store.mjs'), 'utf8');

check('卡片显示标题并保留文件名 tooltip', card.includes('displayTitle(video)') && card.includes('data-testid="card-title"'));
check('搜索同时匹配标题与文件名', grid.includes("`${v.title || ''}\\n${v.name}`"));
check('播放器标题走 displayTitle', player.includes('displayTitle(video)') && player.includes('player-title'));
check('抽屉改名走 onRenameVideo（标题）', drawer.includes('video.title ??') && drawer.includes('onRenameVideo(nextTitle)'));
check('store 的 renameVideo 经 commitMeta 写 title', store.includes('renameVideo:') && store.includes('commitMeta.commit(videoId, { title: cleanTitle })'));
check('服务端 meta 白名单接收 title', serverStore.includes("if ('title' in input)") && serverStore.includes('title: \'\''));

// ── 3. HTTP 契约：meta.title 持久化 / 清空 / 文件名不变 ─────
let probeId = null;
let originalTitle = '';
try {
  const libRes = await fetch(`${base}/api/v1/library`, { signal: AbortSignal.timeout(4000) });
  const lib = await libRes.json();
  const video = (lib.videos || [])[0];
  if (!video) throw new Error('library has no videos');
  probeId = video.id;
  const relPathBefore = video.relPath;
  const nameBefore = video.name;
  originalTitle = video.meta?.title || '';

  const marker = `契约标题-${Date.now()}`;
  const patch1 = await fetch(`${base}/api/v1/videos/${encodeURIComponent(probeId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: marker }),
    signal: AbortSignal.timeout(4000),
  });
  check('PATCH title 返回 200', patch1.ok, `status=${patch1.status}`);
  const after1 = await (await fetch(`${base}/api/v1/library`, { signal: AbortSignal.timeout(4000) })).json();
  const v1 = (after1.videos || []).find((v) => v.id === probeId);
  check('title 持久化到服务端', v1?.meta?.title === marker, `got=${v1?.meta?.title}`);
  check('磁盘 relPath 未被改动', v1?.relPath === relPathBefore);
  check('文件名未被改动', v1?.name === nameBefore);

  // 空串清除
  const patch2 = await fetch(`${base}/api/v1/videos/${encodeURIComponent(probeId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '' }),
    signal: AbortSignal.timeout(4000),
  });
  check('清空 title 返回 200', patch2.ok, `status=${patch2.status}`);
  const after2 = await (await fetch(`${base}/api/v1/library`, { signal: AbortSignal.timeout(4000) })).json();
  const v2 = (after2.videos || []).find((v) => v.id === probeId);
  check('空串清除 title', (v2?.meta?.title ?? '') === '', `got=${v2?.meta?.title}`);
} catch (error) {
  check('HTTP 契约可执行（服务端已重启且支持 title）', false, String(error?.message || error));
} finally {
  // 尽力恢复原值，避免污染真实库
  if (probeId) {
    try {
      await fetch(`${base}/api/v1/videos/${encodeURIComponent(probeId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: originalTitle }),
        signal: AbortSignal.timeout(4000),
      });
    } catch {
      /* cleanup best effort */
    }
  }
}

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
if (failed.length) {
  console.error(`\n${failed.length} check(s) failed`);
  process.exit(1);
}
console.log(`\nALL PASS (${results.length} checks)`);
