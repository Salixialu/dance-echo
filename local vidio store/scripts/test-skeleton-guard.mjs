import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert';

/**
 * 姿态/3D 渲染的「对外契约」检查。
 *
 * 这里只断言别的东西真的依赖的东西：
 *  - E2E 脚本按 DOM id 找元素（videoElement / poseOverlay / poseStatus）
 *  - 玩家能看到 2D 骨架左右分色、3D 场景能初始化
 *  - MediaPipe 模型文件真的在磁盘上、且从本地路径加载
 *
 * **不**断言文件内容哈希、不冻结具体实现字符串——那是重构的敌人。
 * 文件级 SHA-256 只作为信息输出，方便排查「同一次构建换了产物」。
 */

const projectRoot = path.resolve('.');
const results = [];
let failures = 0;

function check(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures++;
    results.push({ name, ok: false, message: err.message });
    console.log(`  ✗ ${name}`);
    console.log(`      ${err.message}`);
  }
}

function read(relPath) {
  const full = path.join(projectRoot, relPath);
  assert.ok(fs.existsSync(full), `文件不存在：${relPath}`);
  return { full, content: fs.readFileSync(full, 'utf-8') };
}

function fingerprint(relPath) {
  const { full, content } = read(relPath);
  const stat = fs.statSync(full);
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  return `${relPath}  ${stat.size}B  sha256:${hash.slice(0, 16)}…`;
}

console.log('===============================================================');
console.log('       SKELETON & POSE CONTRACT GUARD (behaviour, not files)   ');
console.log('===============================================================\n');

// ── 契约 1：2D 骨架左右分色由单一来源定义，且三色互不相同 ────────────────
console.log('[1] 2D 骨架配色契约');
check('usePoseTracker 导出 usePoseTracker / renderCenteredPoseToCanvas', () => {
  const { content } = read('src/hooks/usePoseTracker.ts');
  for (const name of ['usePoseTracker', 'renderCenteredPoseToCanvas']) {
    assert.ok(
      new RegExp(`export\\s+(function|const)\\s+${name}\\b`).test(content),
      `缺少导出：${name}`
    );
  }
});

check('左右/躯干骨架色为三个不同常量', () => {
  const { content } = read('src/hooks/usePoseTracker.ts');
  const consts = {};
  for (const key of ['SKELETON_LEFT', 'SKELETON_RIGHT', 'SKELETON_TORSO']) {
    const m = content.match(new RegExp(`${key}\\s*=\\s*['"](#[0-9a-fA-F]{6})['"]`));
    assert.ok(m, `找不到常量 ${key} 的十六进制色值`);
    consts[key] = m[1].toLowerCase();
  }
  assert.notStrictEqual(consts.SKELETON_LEFT, consts.SKELETON_RIGHT, '左右两侧颜色不能相同');
  assert.notStrictEqual(consts.SKELETON_LEFT, consts.SKELETON_TORSO, '左肢与躯干颜色不能相同');
  assert.notStrictEqual(consts.SKELETON_RIGHT, consts.SKELETON_TORSO, '右肢与躯干颜色不能相同');
  console.log(
    `      left=${consts.SKELETON_LEFT} right=${consts.SKELETON_RIGHT} torso=${consts.SKELETON_TORSO}`
  );
});

check('骨架连接表仍然可用（CLASSIFIED_CONNECTIONS 或 POSE_CONNECTIONS）', () => {
  const { content } = read('src/hooks/usePoseTracker.ts');
  assert.ok(
    /CLASSIFIED_CONNECTIONS|POSE_CONNECTIONS/.test(content),
    '既没有 CLASSIFIED_CONNECTIONS 也没有 POSE_CONNECTIONS，骨架连接会画不出来'
  );
});

// ── 契约 2：MediaPipe 模型来自本地、文件真的存在 ────────────────────────
console.log('\n[2] MediaPipe 模型加载契约');
check('pose-detector 暴露 PoseDetectorService / detectForVideo', () => {
  const { content } = read('src/services/pose/pose-detector.ts');
  for (const name of ['PoseDetectorService', 'detectForVideo']) {
    assert.ok(content.includes(name), `缺少：${name}`);
  }
});

check('模型优先走本地 /models/pose_landmarker_*.task', () => {
  const { content } = read('src/services/pose/pose-detector.ts');
  assert.ok(
    /\/models\/pose_landmarker_\$\{/.test(content) || content.includes('/models/pose_landmarker_'),
    '没有从本地 /models/ 加载模型的路径'
  );
});

check('模型文件在 public/models 下且体积合理（>1MB）', () => {
  const dir = path.join(projectRoot, 'public', 'models');
  assert.ok(fs.existsSync(dir), 'public/models 不存在');
  const models = fs.readdirSync(dir).filter((f) => f.endsWith('.task'));
  assert.ok(models.length > 0, 'public/models 下没有任何 .task 模型');
  for (const m of models) {
    const size = fs.statSync(path.join(dir, m)).size;
    assert.ok(size > 1024 * 1024, `${m} 只有 ${size}B，可能是残缺下载`);
  }
  console.log(`      models: ${models.join(', ')}`);
});

// ── 契约 3：3D 场景可初始化 ─────────────────────────────────────────────
console.log('\n[3] 3D 场景契约');
check('vrm-controller 暴露 Skeleton3DController', () => {
  const { content } = read('src/scene/vrm-controller.ts');
  assert.ok(/Skeleton3DController/.test(content), '缺少 Skeleton3DController');
});

check('scene-manager 用 WebGLRenderer + PerspectiveCamera', () => {
  const { content } = read('src/scene/scene-manager.ts');
  for (const token of ['WebGLRenderer', 'PerspectiveCamera']) {
    assert.ok(content.includes(token), `缺少：${token}`);
  }
});

// ── 契约 4：播放器 DOM id（E2E 与外部脚本的定位锚点）────────────────────
console.log('\n[4] 播放器 DOM 契约');
check('DancePlayer 保留 videoElement / poseOverlay / poseStatus', () => {
  const { content } = read('src/components/player/DancePlayer.tsx');
  for (const id of ['id="videoElement"', 'id="poseOverlay"', 'id="poseStatus"']) {
    assert.ok(content.includes(id), `DOM 契约被移除：${id}`);
  }
});

check('DancePlayer 仍接入姿态追踪与节拍器', () => {
  const { content } = read('src/components/player/DancePlayer.tsx');
  for (const token of ['usePoseTracker', 'BeatMetronome']) {
    assert.ok(content.includes(token), `缺少：${token}`);
  }
});

// ── 信息输出（不作为失败条件）──────────────────────────────────────────
console.log('\n[audit] 文件指纹（仅记录，不参与判定）');
for (const rel of [
  'src/hooks/usePoseTracker.ts',
  'src/services/pose/pose-detector.ts',
  'src/scene/vrm-controller.ts',
  'src/components/player/DancePlayer.tsx',
]) {
  try {
    console.log(`      ${fingerprint(rel)}`);
  } catch {
    console.log(`      ${rel}  (读取失败，跳过)`);
  }
}

console.log('\n===============================================================');
const passed = results.filter((r) => r.ok).length;
console.log(` RESULT: ${passed}/${results.length} 契约检查通过`);
if (failures > 0) {
  console.log(` 有 ${failures} 项契约被破坏：上面标 ✗ 的地方就是断点。`);
  console.log('===============================================================\n');
  process.exitCode = 1;
} else {
  console.log(' 姿态/3D/播放器的对外契约完好；实现细节可以自由重构。');
  console.log('===============================================================\n');
  process.exitCode = 0;
}
