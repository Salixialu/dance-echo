/**
 * test-trash-filtering.mjs — 回收站契约回归（ticket 01）
 *
 * 验证：
 *   1. 默认媒体库不再返回已进回收站的视频，count/totalBytes 同步减少
 *   2. includeTrashed=1 才看得到回收视频，且带 trashedAt
 *   3. 分组接口与默认库计数一致
 *   4. 恢复后视频回到默认媒体库
 *
 * 只操作一条视频，结束时无论成败都恢复，避免污染真实媒体库。
 */
const BASE = process.env.DE_BASE || 'http://127.0.0.1:8090';

const failures = [];
const check = (name, condition, extra = '') => {
  if (condition) console.log(`  PASS  ${name}`);
  else {
    failures.push(`${name}${extra ? ` :: ${extra}` : ''}`);
    console.log(`  FAIL  ${name}${extra ? ` :: ${extra}` : ''}`);
  }
};

async function requestJson(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, init);
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`${path} 返回 ${res.status}: ${text.slice(0, 200)}`);
  return data;
}

const post = (path) => requestJson(path, { method: 'POST' });

let victimId = null;

try {
  const before = await requestJson('/api/v1/library');
  check('媒体库有可测视频', before.videos.length > 0, `count=${before.count}`);
  if (before.videos.length === 0) throw new Error('媒体库为空，无法执行回收站契约测试');

  const victim = before.videos.find((video) => (video.meta?.trashedAt ?? 0) === 0) ?? before.videos[0];
  victimId = victim.id;
  const beforeCount = before.count;
  const beforeBytes = before.totalBytes;

  await post(`/api/v1/videos/${encodeURIComponent(victim.id)}/trash`);

  const after = await requestJson('/api/v1/library');
  check('默认库不再返回已删视频', !after.videos.some((video) => video.id === victim.id));
  check('默认库计数减一', after.count === beforeCount - 1, `${beforeCount} -> ${after.count}`);
  check(
    '默认库总大小去掉该视频',
    after.totalBytes === beforeBytes - victim.size,
    `${beforeBytes} -> ${after.totalBytes}`
  );

  const withTrash = await requestJson('/api/v1/library?includeTrashed=1');
  const recycled = withTrash.videos.find((video) => video.id === victim.id);
  check('includeTrashed 能看到回收视频', Boolean(recycled));
  check('回收视频带 trashedAt', (recycled?.meta?.trashedAt ?? 0) > 0);

  const groups = await requestJson('/api/v1/groups');
  const groupedCount = groups.groups.reduce((sum, group) => sum + (group.videos?.length ?? 0), 0);
  check('分组接口与默认库计数一致', groupedCount === after.count, `${groupedCount} vs ${after.count}`);
} catch (error) {
  failures.push(`执行异常：${error instanceof Error ? error.message : String(error)}`);
  console.log(`  FAIL  执行异常：${error instanceof Error ? error.message : String(error)}`);
} finally {
  if (victimId) {
    try {
      await post(`/api/v1/trash/${encodeURIComponent(victimId)}/restore`);
      const restored = await requestJson('/api/v1/library');
      check('恢复后视频回到默认媒体库', restored.videos.some((video) => video.id === victimId));
    } catch (error) {
      check('恢复后视频回到默认媒体库', false, error instanceof Error ? error.message : String(error));
    }
  }
}

if (failures.length > 0) {
  console.error(`\n❌ 回收站契约测试失败：${failures.length} 项`);
  process.exitCode = 1;
} else {
  console.log('\n✅ 回收站契约测试通过');
}
