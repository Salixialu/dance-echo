#!/usr/bin/env node
/**
 * 回收区「清空」契约（suite 17）。
 *
 * 验证：
 * 1) POST /api/v1/trash/clear 返回 cleared 数量；
 * 2) 清空后 includeTrashed 里没有任何 trashedAt > 0 的视频；
 * 3) 默认媒体库数量恢复到清空前（清空只解除隐藏，不删视频）；
 * 4) 被清空的那条视频重新出现在默认媒体库里。
 *
 * 用法：node scripts/test-trash-clear.mjs
 * 环境变量 DE_BASE 可指向临时服务端（默认 http://127.0.0.1:8090）。
 */
const BASE = process.env.DE_BASE || 'http://127.0.0.1:8090';

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function json(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

const at = (v) => {
  const value = v?.meta?.trashedAt;
  return typeof value === 'number' ? value : 0;
};

let trashedId = null;

try {
  const before = await json(`${BASE}/api/v1/library?includeTrashed=1`);
  check('includeTrashed 200', before.status === 200, `status=${before.status}`);
  const videos = Array.isArray(before.body?.videos) ? before.body.videos : [];
  check('includeTrashed 有视频', videos.length > 0, `n=${videos.length}`);
  if (!videos.length) throw new Error('没有可测试的视频');

  const defaultBefore = await json(`${BASE}/api/v1/library`);
  check('默认媒体库 200', defaultBefore.status === 200, `status=${defaultBefore.status}`);
  const defaultCount = defaultBefore.body?.count ?? 0;

  // 选一个当前可见的视频，移入回收区，制造一条可清空记录。
  const target = videos.find((v) => at(v) === 0) ?? videos[0];
  trashedId = target.id;
  const trashRes = await json(`${BASE}/api/v1/videos/${encodeURIComponent(trashedId)}/trash`, { method: 'POST' });
  check('移入回收区 200', trashRes.status === 200, `status=${trashRes.status}`);

  const hidden = await json(`${BASE}/api/v1/library`);
  const hiddenIds = new Set((hidden.body?.videos ?? []).map((v) => v.id));
  check('默认媒体库隐藏该视频', !hiddenIds.has(trashedId));
  check('默认媒体库数量 -1', (hidden.body?.count ?? 0) === defaultCount - 1, `count=${hidden.body?.count} expect=${defaultCount - 1}`);

  const clearRes = await json(`${BASE}/api/v1/trash/clear`, { method: 'POST' });
  check('清空回收区 200', clearRes.status === 200, `status=${clearRes.status}`);
  check('返回 cleared >= 1', (clearRes.body?.cleared ?? 0) >= 1, `cleared=${clearRes.body?.cleared}`);

  const all = await json(`${BASE}/api/v1/library?includeTrashed=1`);
  const remaining = (all.body?.videos ?? []).filter((v) => at(v) > 0);
  check('清空后没有 trashedAt > 0', remaining.length === 0, `remaining=${remaining.length}`);

  const after = await json(`${BASE}/api/v1/library`);
  check('默认媒体库恢复到原数量', (after.body?.count ?? 0) === defaultCount, `count=${after.body?.count} expect=${defaultCount}`);
  check('被清空的视频重新可见', (after.body?.videos ?? []).some((v) => v.id === trashedId));
} catch (err) {
  failed += 1;
  console.log(`  ✗ 运行中断 — ${err?.message ?? err}`);
} finally {
  if (trashedId) {
    try {
      await json(`${BASE}/api/v1/videos/${encodeURIComponent(trashedId)}/trash`, { method: 'POST' });
      await json(`${BASE}/api/v1/trash/${encodeURIComponent(trashedId)}/restore`, { method: 'POST' });
    } catch {
      /* 清理失败不影响契约结论 */
    }
  }
}

console.log(`\n结果：${passed} 通过，${failed} 失败（${BASE}）`);
process.exit(failed === 0 ? 0 : 1);
