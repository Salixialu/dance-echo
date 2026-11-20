import { promises as fs } from 'node:fs';
import path from 'node:path';

const BASE = process.env.DE_BASE || 'http://127.0.0.1:8090';
const mediaRoot = 'D:\\Dance Echo\\vidio';
const uploadsDir = path.join(mediaRoot, 'uploads');
const fileName = `tmp-upload-${Date.now()}.mp4`;
const abs = path.join(uploadsDir, fileName);
const mtime = new Date('2024-01-02T03:04:05Z').getTime();
let failed = 0;
function check(name, cond, detail = '') {
  if (cond) console.log(`PASS ${name}`);
  else { console.error(`FAIL ${name} ${detail}`); failed += 1; }
}

// 清掉以前失败跑留下的 tmp 上传
for (const name of await fs.readdir(uploadsDir).catch(() => [])) {
  if (name.startsWith('tmp-upload-')) await fs.unlink(path.join(uploadsDir, name)).catch(() => {});
}
await fs.writeFile(abs, Buffer.alloc(2048, 7));
let uploadedAbs = abs;
try {
  const form = new FormData();
  form.append('file', new Blob([await fs.readFile(abs)], { type: 'video/mp4' }), fileName);
  const res = await fetch(`${BASE}/api/v1/upload?mtime=${mtime}`, { method: 'POST', body: form });
  const body = await res.json();
  check('upload 201', res.status === 201, `status=${res.status} body=${JSON.stringify(body).slice(0, 200)}`);
  const id = body?.uploaded?.id;
  const relPath = body?.uploaded?.relPath;
  check('upload returns id', typeof id === 'string' && id.length > 0);
  check('upload returns relPath under uploads/', typeof relPath === 'string' && relPath.startsWith('uploads/'), String(relPath));
  uploadedAbs = path.join(mediaRoot, ...String(relPath).split('/'));

  const stat = await fs.stat(uploadedAbs);
  check('mtime preserved', Math.abs(stat.mtimeMs - mtime) < 2000, `mtime=${stat.mtimeMs} want=${mtime}`);

  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const up = await fetch(`${BASE}/thumb/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg' },
    body: jpeg,
  });
  check('thumb POST 200 before rescan', up.status === 200, `status=${up.status}`);
  const get = await fetch(`${BASE}/thumb/${encodeURIComponent(id)}`);
  check('thumb GET 200 before rescan', get.status === 200, `status=${get.status}`);

  await new Promise((r) => setTimeout(r, 2200));
  const lib = await (await fetch(`${BASE}/api/v1/library?includeTrashed=1`)).json();
  const found = lib.videos.find((v) => v.id === id);
  check('debounced rescan indexed upload', !!found, `count=${lib.videos.length}`);
  if (found) {
    check('indexed date from mtime', found.dateKey === '2024-01-02', String(found.dateKey));
    check('indexed dateSource mtime', found.dateSource === 'mtime', String(found.dateSource));
  }
} finally {
  await fs.unlink(uploadedAbs).catch(() => {});
  await fs.unlink(abs).catch(() => {});
}
console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
