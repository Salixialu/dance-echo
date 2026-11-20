import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 元数据写入接缝的静态契约（seam lint）。
 *
 * 这是文本级契约，不是行为测试：断言映射表存在、store 只剩一条写入路径、
 * beats 不在可提交字段里。行为由实机 e2e 覆盖（收藏/标签/练习瞬间同步）。
 *
 * 用法：node scripts/test-meta-commit.mjs
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const seam = read('src/services/library/videoMeta.ts');
const store = read('src/store/useVideoStore.ts');
const metaSync = read('src/services/api/metaSync.ts');

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });

check('接缝导出纯规划函数', seam.includes('export function planMetaCommit'));
check(
  '强类型映射表覆盖 playbackPosition → progress',
  /playbackPosition:\s*'progress'/.test(seam) && seam.includes('Record<LocalMetaField, keyof MetaPatch>'),
);
check('bookmarks 走唯一转换器', seam.includes('planMetaCommit') && !store.includes('toServerBookmarks'));
check(
  'beats 被排除在可提交字段之外',
  !/LocalMetaField\s*=([\s\S]*?)'beats'/.test(seam) && !store.includes('commitMeta.commit(videoId, { bpm, beatOffset, ...(beats'),
);
check('pushMeta 只接受 serverId + patch', metaSync.includes('export function pushMeta(serverId: string | undefined, patch: MetaPatch)'));

const pushMetaCalls = (store.match(/pushMeta\(/g) ?? []).length;
check('store 里的 pushMeta 只剩接缝内一处', pushMetaCalls === 1, `found ${pushMetaCalls}`);

const commitCalls = (store.match(/commitMeta\.commit(Many)?\(/g) ?? []).length;
check('store 的元数据写入都走 commitMeta', commitCalls >= 10, `found ${commitCalls} calls`);

const directWrites = [...store.matchAll(/db\.videos\.update\([^,]+,\s*\{([^}]*)\}/g)].map((m) => m[1].trim());
const allowed = directWrites.every((fields) => /^(path|name)\b/.test(fields));
check('store 里剩余直写 Dexie 只限 path/name', allowed, directWrites.join(' | '));

check(
  'commitMany 返回失败清单而不是中断批次',
  seam.includes('failed: string[]') && seam.includes('return { failed }'),
);

const passed = results.filter((r) => r.ok).length;
const failed = results.length - passed;
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok || !r.detail ? '' : `\n      ${r.detail}`}`);
}
console.log(`\n${passed}/${results.length} PASS${failed ? `, ${failed} FAIL` : ''}`);
process.exit(failed === 0 ? 0 : 1);
