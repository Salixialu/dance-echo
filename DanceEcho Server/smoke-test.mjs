// 冒烟测试：验证 P0 新端点。node smoke-test.mjs
const B = 'http://127.0.0.1:8090';
let fails = 0;
const check = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' :: ' + extra : ''}`); if (!cond) fails++; };

const lib = await (await fetch(`${B}/api/v1/library`)).json();
check('library', Array.isArray(lib.videos) && lib.videos.length > 0, `count=${lib.count}`);
const id = lib.videos[0].id;

let r = await fetch(`${B}/api/v1/videos/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bpm: 128.5, beatOffset: 0.3, songTitle: 'Test Song', songArtist: 'Tester', category: 'K-pop' }) });
check('PATCH extended meta', r.status === 200);
const vid = await (await fetch(`${B}/api/video/${id}`)).json();
check('meta persisted bpm', vid.meta.bpm === 128.5, JSON.stringify(vid.meta).slice(0, 200));
check('meta songTitle', vid.meta.songTitle === 'Test Song');

r = await fetch(`${B}/api/v1/videos/${id}/observations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ time: 12.5, text: '手臂动作不齐', kind: 'issue', tags: ['arm'] }) });
const obs = await r.json();
check('POST observation', r.status === 201 && obs.observation?.id, JSON.stringify(obs).slice(0, 150));
r = await fetch(`${B}/api/v1/videos/${obs.observation.videoId}/observations`);
const obsList = await r.json();
check('GET observations', r.status === 200 && obsList.observations.length === 1);
r = await fetch(`${B}/api/v1/videos/${obs.observation.videoId}/observations/${obs.observation.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '手臂动作不齐（已改善）' }) });
check('PATCH observation', r.status === 200);

r = await fetch(`${B}/api/v1/practice-logs/2026-10-23`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ durationMinutes: 45, songs: 'Test Song', notes: '练了半场' }) });
const log = await r.json();
check('PUT practice-log', r.status === 200 && log.log?.durationMinutes === 45, JSON.stringify(log).slice(0, 150));
r = await fetch(`${B}/api/v1/practice-logs`);
const logs = await r.json();
check('GET practice-logs', r.status === 200 && logs.logs['2026-10-23']);
r = await fetch(`${B}/api/v1/practice-logs/2026-10-23`);
check('GET practice-log by date', r.status === 200);

r = await fetch(`${B}/api/v1/backup`);
const backup = await r.json();
check('backup', r.status === 200 && backup.meta && backup.observations && backup.practiceLogs, Object.keys(backup).join(','));

r = await fetch(`${B}/api/v1/videos/${id}/bookmarks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ time: 5, label: '副歌' }) });
check('POST bookmark (old API)', r.status === 201);

r = await fetch(`${B}/thumb/${id}`);
console.log(`INFO thumb HTTP ${r.status} (ffmpeg 未装时 404 属预期)`);

// 清理测试数据
await fetch(`${B}/api/v1/videos/${obs.observation.videoId}/observations/${obs.observation.id}`, { method: 'DELETE' });
await fetch(`${B}/api/v1/videos/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bpm: 0, beatOffset: 0, songTitle: '', songArtist: '', category: '' }) });
console.log(fails === 0 ? 'ALL PASS' : `${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
