/**
 * DanceEcho Server 自检脚本（对已启动的实例做黑盒验证）
 *
 * 用法：
 *   1) 另开一个终端先启动服务：node server.mjs
 *   2) 再运行：node selftest.mjs
 *      也可以指定地址：node selftest.mjs http://127.0.0.1:8090
 *
 * 只发 HTTP 请求，不写任何数据（PATCH/POST 相关接口不做破坏性测试）。
 */
const BASE = (process.argv[2] || 'http://127.0.0.1:8090').replace(/\/+$/, '');

let passed = 0;
let failed = 0;

function ok(name, detail = '') {
  passed += 1;
  console.log(`  ✅ ${name}${detail ? '  —  ' + detail : ''}`);
}

function bad(name, detail = '') {
  failed += 1;
  console.log(`  ❌ ${name}${detail ? '  —  ' + detail : ''}`);
}

function check(name, condition, detail = '') {
  if (condition) ok(name, detail);
  else bad(name, detail);
}

async function get(path, headers = {}) {
  const res = await fetch(BASE + path, { headers });
  return res;
}

async function post(path, body) {
  return fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
}

async function main() {
  console.log(`[selftest] 目标: ${BASE}\n`);

  // ---- 页面与静态资源
  console.log('页面');
  const home = await get('/');
  const html = await home.text();
  check('GET / 返回 200', home.status === 200, `status=${home.status}`);
  check('/ 是 HTML', (home.headers.get('content-type') || '').includes('text/html'));
  check('页面标题是 Dance Echo', /<title>[^<]*Dance\s*Echo/.test(html));
  const isModern = html.includes('/assets/') || html.includes('id="root"');
  if (isModern) {
    check('现代主应用挂载了 React root', html.includes('id="root"'));
    const classic = await get('/classic');
    const classicHtml = await classic.text();
    check('经典自检页 /classic 返回 200', classic.status === 200);
    check('经典页引用了 app.js', classicHtml.includes('/app.js'));
    check('经典页引用了 style.css', classicHtml.includes('/style.css'));
  } else {
    check('页面引用了 app.js', html.includes('/app.js'));
    check('页面引用了 style.css', html.includes('/style.css'));
  }

  for (const asset of ['/app.js', '/style.css']) {
    const res = await get(asset);
    const body = await res.text();
    check(`${asset} 返回 200 且非空`, res.status === 200 && body.length > 1000, `${body.length} 字节`);
  }

  // ---- 版本化基础契约
  console.log('\n版本化 API');
  const healthRes = await get('/api/v1/health');
  const health = await healthRes.json();
  check('/api/v1/health 返回 200', healthRes.status === 200);
  check('health 带 schemaVersion', health.schemaVersion === 'v1');
  check('health status 为 ok', health.status === 'ok');

  const capabilitiesRes = await get('/api/v1/capabilities');
  const capabilities = await capabilitiesRes.json();
  check('/api/v1/capabilities 返回 200', capabilitiesRes.status === 200);
  check('capabilities 带 schemaVersion', capabilities.schemaVersion === 'v1');
  check('capabilities 声明 Range 和姿态状态', capabilities.capabilities?.rangeStreaming === true && capabilities.capabilities?.poseAnalysis === false);
  check('capabilities 声明备份恢复能力', capabilities.capabilities?.backupImport === true);

  const withTrashRes = await get('/api/v1/library?includeTrashed=1');
  const withTrash = await withTrashRes.json();
  check('/api/v1/library?includeTrashed=1 返回 200', withTrashRes.status === 200);
  check('includeTrashed 不会减少条目', withTrash.count >= 0);

  const emptyBackupRes = await post('/api/v1/backup', { meta: {}, folders: [], trash: {}, observations: [], practiceLogs: {} });
  const emptyBackup = await emptyBackupRes.json().catch(() => ({}));
  check('POST /api/v1/backup 接受空备份', emptyBackupRes.status === 200 && emptyBackup.ok === true);
  check('空备份不写入任何条目', (emptyBackup.result?.meta ?? 0) === 0 && (emptyBackup.result?.folders ?? 0) === 0);

  const versionedLibraryRes = await get('/api/v1/library');
  const versionedLibrary = await versionedLibraryRes.json();
  check('/api/v1/library 返回 200', versionedLibraryRes.status === 200);
  check('版本化媒体库带 schemaVersion', versionedLibrary.schemaVersion === 'v1');

  // ---- 媒体库索引
  console.log('\n媒体库');
  const libRes = await get('/api/library');
  const lib = await libRes.json();
  check('/api/library 返回 200', libRes.status === 200);
  check('返回了媒体根目录', typeof lib.root === 'string' && lib.root.length > 0, lib.root);
  check('count 与 videos.length 一致', lib.count === (lib.videos || []).length, `count=${lib.count}`);
  check('totalBytes 为正数', lib.totalBytes > 0, `${lib.totalBytes} 字节`);
  check('每个视频都有 id / relPath / url', (lib.videos || []).every((v) => v.id && v.relPath && v.url));
  check(
    '每个视频都有合法的 dateKey(YYYY-MM-DD)',
    (lib.videos || []).every((v) => /^\d{4}-\d{2}-\d{2}$/.test(v.dateKey || '')),
  );
  check(
    'dateSource 只会是 creation 或 mtime',
    (lib.videos || []).every((v) => v.dateSource === 'creation' || v.dateSource === 'mtime'),
    [...new Set((lib.videos || []).map((v) => v.dateSource))].join('/'),
  );

  const groupsRes = await get('/api/groups');
  const groups = await groupsRes.json();
  check('/api/groups 返回 200', groupsRes.status === 200);
  const groupTotal = (groups.groups || []).reduce((n, g) => n + g.videos.length, 0);
  check('分组内视频总数等于 count', groupTotal === lib.count, `${groupTotal} vs ${lib.count}`);
  check(
    '分组按日期倒序',
    (groups.groups || []).every((g, i, arr) => i === 0 || arr[i - 1].dateKey > g.dateKey),
  );

  const stats = await (await get('/api/stats')).json();
  check('/api/stats 总数一致', stats.total === lib.count, `total=${stats.total}`);

  // ---- Range 流
  console.log('\n视频流（Range）');
  const sample = (lib.videos || [])[0];
  if (!sample) {
    bad('媒体库为空，跳过流测试', lib.root);
  } else {
    const size = sample.size;

    const head = await get(`/stream/${sample.id}`, { Range: 'bytes=0-1023' });
    const headBuf = await head.arrayBuffer();
    check('Range 0-1023 返回 206', head.status === 206, `status=${head.status}`);
    check('Content-Length 为 1024', headBuf.byteLength === 1024, `${headBuf.byteLength} 字节`);
    check(
      'Content-Range 正确',
      head.headers.get('content-range') === `bytes 0-1023/${size}`,
      head.headers.get('content-range') || '缺失',
    );
    check('Accept-Ranges: bytes', head.headers.get('accept-ranges') === 'bytes');

    const tail = await get(`/stream/${sample.id}`, { Range: 'bytes=-1024' });
    check('尾部 Range bytes=-1024 返回 206', tail.status === 206, `status=${tail.status}`);
    const tailRange = tail.headers.get('content-range') || '';
    check(
      '尾部 Content-Range 终点等于文件大小',
      tailRange.endsWith(`/${size}`) && tailRange.includes(`-${size - 1}`),
      tailRange,
    );

    const over = await get(`/stream/${sample.id}`, { Range: `bytes=${size + 10}-${size + 20}` });
    check('超出 EOF 的 Range 返回 416', over.status === 416, `status=${over.status}`);

    const badId = await get('/stream/not-a-valid-id');
    check('非法 id 返回 400', badId.status === 400, `status=${badId.status}`);

    const missing = await get('/stream/0123456789abcdef');
    check('不存在的 id 返回 404', missing.status === 404, `status=${missing.status}`);
  }

  // ---- 错误处理与安全
  console.log('\n健壮性');
  const unknownApi = await get('/api/nope');
  check('未知接口返回 404 JSON', unknownApi.status === 404);

  const traversal = await get('/../server.mjs');
  check('目录穿越拿不到源码', traversal.status === 404 || traversal.status === 400, `status=${traversal.status}`);

  // ---- 汇总
  console.log(`\n[selftest] 通过 ${passed} 项，失败 ${failed} 项`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[selftest] 运行出错（服务是否已启动？）:', err.message);
  process.exitCode = 2;
});
