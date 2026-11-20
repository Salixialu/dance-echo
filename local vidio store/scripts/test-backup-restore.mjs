/**
 * test-backup-restore.mjs — 备份恢复契约回归（ticket 02）
 *
 * 验证：
 *   1. 服务端备份包含 meta / folders / trash / observations / practiceLogs
 *   2. 恢复写回服务端：先用 PATCH 改一条元数据，再用备份恢复，元数据回到备份状态
 *   3. 恢复是合并而不是清空：备份里没有的分组仍然保留
 *   4. 版本不符与非法 JSON 有明确错误码
 *
 * 结束时再恢复一次快照，并删掉测试分组，保证不污染真实数据。
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
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { res, data };
}

const getJson = async (path) => {
  const { res, data } = await requestJson(path);
  if (!res.ok) throw new Error(`${path} 返回 ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  return data;
};

let snapshot = null;
let markerVideoId = null;
let markerFolderId = null;

try {
  snapshot = await getJson('/api/v1/backup');
  check('备份含 schemaVersion=2', snapshot.schemaVersion === 2, `schemaVersion=${snapshot.schemaVersion}`);
  check('备份含元数据表', Boolean(snapshot.meta && typeof snapshot.meta === 'object'));
  check('备份含分组表', Array.isArray(snapshot.folders));
  check('备份含回收区', Boolean(snapshot.trash && typeof snapshot.trash === 'object'));
  check('备份含观察记录', Boolean(snapshot.observations && typeof snapshot.observations === 'object'));
  check('备份含练习日志', Boolean(snapshot.practiceLogs && typeof snapshot.practiceLogs === 'object'));

  const library = await getJson('/api/v1/library');
  const video = library.videos.find((item) => (item.meta?.trashedAt ?? 0) === 0);
  if (!video) throw new Error('媒体库为空，无法执行备份恢复契约测试');
  markerVideoId = video.id;
  const originalTags = Array.isArray(video.meta?.tags) ? video.meta.tags : [];

  const patch = await requestJson(`/api/v1/videos/${encodeURIComponent(video.id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags: [...originalTags, '__e2e_backup__'] }),
  });
  check('测试标记写入成功', patch.res.ok && (patch.data.meta?.tags ?? []).includes('__e2e_backup__'));

  const restore = await requestJson('/api/v1/backup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(snapshot),
  });
  check('恢复接口返回成功', restore.res.ok && restore.data.ok === true, JSON.stringify(restore.data).slice(0, 200));
  check('恢复计数包含元数据', (restore.data.result?.meta ?? 0) >= 1, JSON.stringify(restore.data.result ?? {}));

  const after = await getJson(`/api/v1/videos/${encodeURIComponent(video.id)}`);
  check(
    '恢复后元数据回到备份状态',
    !(after.meta?.tags ?? []).includes('__e2e_backup__'),
    JSON.stringify(after.meta?.tags ?? [])
  );

  const folder = await requestJson('/api/v1/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `__e2e_backup_folder_${Date.now()}` }),
  });
  markerFolderId = folder.data.folder?.id ?? null;
  check('测试分组创建成功', folder.res.ok && Boolean(markerFolderId));

  const restoreAgain = await requestJson('/api/v1/backup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(snapshot),
  });
  check('再次恢复成功', restoreAgain.res.ok);
  const foldersAfter = await getJson('/api/v1/folders');
  check(
    '恢复不会清空备份里没有的分组',
    markersContains(foldersAfter.folders, markerFolderId),
    `folderId=${markerFolderId}`
  );

  const badVersion = await requestJson('/api/v1/backup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ schemaVersion: 99 }),
  });
  check(
    '版本不符返回 400 与明确错误码',
    badVersion.res.status === 400 && badVersion.data?.error?.code === 'BACKUP_VERSION_UNSUPPORTED',
    JSON.stringify(badVersion.data).slice(0, 200)
  );

  const badJson = await requestJson('/api/v1/backup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"schemaVersion":',
  });
  check(
    '非法 JSON 返回 400',
    badJson.res.status === 400,
    JSON.stringify(badJson.data).slice(0, 200)
  );
} catch (error) {
  failures.push(`执行异常：${error instanceof Error ? error.message : String(error)}`);
  console.log(`  FAIL  执行异常：${error instanceof Error ? error.message : String(error)}`);
} finally {
  if (snapshot) {
    try {
      await requestJson('/api/v1/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      });
    } catch {
      // 清理失败不掩盖主断言
    }
  }
  if (markerFolderId) {
    try {
      await requestJson(`/api/v1/folders/${encodeURIComponent(markerFolderId)}`, { method: 'DELETE' });
    } catch {
      // 忽略清理失败
    }
  }
  if (markerVideoId) {
    try {
      const current = await getJson(`/api/v1/videos/${encodeURIComponent(markerVideoId)}`);
      const tags = (current.meta?.tags ?? []).filter((tag) => tag !== '__e2e_backup__');
      if (tags.length !== (current.meta?.tags ?? []).length) {
        await requestJson(`/api/v1/videos/${encodeURIComponent(markerVideoId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tags }),
        });
      }
    } catch {
      // 忽略清理失败
    }
  }
}

function markersContains(folders, id) {
  return Array.isArray(folders) && folders.some((folder) => folder.id === id);
}

if (failures.length > 0) {
  console.error(`\n❌ 备份恢复契约测试失败：${failures.length} 项`);
  process.exitCode = 1;
} else {
  console.log('\n✅ 备份恢复契约测试通过');
}
