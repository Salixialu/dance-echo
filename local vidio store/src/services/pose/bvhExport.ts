/**
 * 骨骼 → BVH 导出
 * ---------------------------------------------------------------
 * 为什么不导 VRM 而是导 BVH：BVH 是动捕数据的「通用货币」，
 * Blender / MotionBuilder / Maya / Unity 都能直接吃，后续想再转 FBX 只需在
 * DCC 里开一次。VRM 是「角色资产」格式，把动作直接套在那个 20MB 的模型上
 * 等于把数据和角色绑死。
 *
 * 数据来源：离线骨骼索引（poseTrack.world，33 点 × 3 轴，单位米）。
 * 旋转推导：每根骨头用「父关节 → 子关节」的方向向量，配合髋-肩平面法线
 * 作为 up 参考构造完整正交基，得到含 twist 的世界四元数；再相对静止姿态
 * 求差、转到父级坐标系，最后转成 BVH 的 ZXY 欧拉角通道。
 *
 * 为什么不用「最短弧」四元数：quatFromTo(rest, dir) 只锁定骨骼指向，
 * 绕骨骼自身轴的 roll 是欠定的，算法会在等价解之间跳，表现为手臂/腿
 * 突然「转半圈」。这里做两件事把可见翻转消掉：
 *   1. 用髋-肩平面法线当 up，让 180° 反向奇点处的旋转轴连续（原来任意
 *      选正交轴，临界点前后会突然变向）；
 *   2. 对输出欧拉角做帧间 unwrap，消除 ±180° 环绕带来的另一类跳变。
 *
 * 仍然不做 swing-twist 分解去强行造 roll：MediaPipe 没有手掌/手指朝向，
 * 凭空补 twist 只会引入错误。BVH 用于动作参考，连续无跳变比虚构 roll 更重要。
 *
 * 已知局限：只有旋转没有位移（除根节点）；欧拉角在 gimbal lock 附近
 * （俯仰接近 ±90°）仍有耦合，这是 ZXY 约定本身的限制。脚部绝对高度
 * 没有地面参照，脚部吸附交给 DCC（Blender/MotionBuilder 里锁脚即可）。
 */

export interface BvhJoint {
  name: string;
  /** 该骨骼末端/自身对应的 MediaPipe 关键点（0-32），根节点用两端点中点 */
  from: number;
  to: number;
  parent: string | null;
  children: string[];
}

const JOINTS: { name: string; from: number; to: number; parent: string | null }[] = [
  { name: 'Hips', from: 23, to: 24, parent: null },
  { name: 'Spine', from: 23, to: 12, parent: 'Hips' },
  { name: 'Neck', from: 12, to: 0, parent: 'Spine' },
  { name: 'Head', from: 0, to: 0, parent: 'Neck' },
  { name: 'LeftShoulder', from: 12, to: 11, parent: 'Spine' },
  { name: 'LeftArm', from: 11, to: 13, parent: 'LeftShoulder' },
  { name: 'LeftForeArm', from: 13, to: 15, parent: 'LeftArm' },
  { name: 'LeftHand', from: 15, to: 19, parent: 'LeftForeArm' },
  { name: 'RightShoulder', from: 11, to: 12, parent: 'Spine' },
  { name: 'RightArm', from: 12, to: 14, parent: 'RightShoulder' },
  { name: 'RightForeArm', from: 14, to: 16, parent: 'RightArm' },
  { name: 'RightHand', from: 16, to: 20, parent: 'RightForeArm' },
  { name: 'LeftUpLeg', from: 23, to: 25, parent: 'Hips' },
  { name: 'LeftLeg', from: 25, to: 27, parent: 'LeftUpLeg' },
  { name: 'LeftFoot', from: 27, to: 31, parent: 'LeftLeg' },
  { name: 'RightUpLeg', from: 24, to: 26, parent: 'Hips' },
  { name: 'RightLeg', from: 26, to: 28, parent: 'RightUpLeg' },
  { name: 'RightFoot', from: 28, to: 32, parent: 'RightLeg' },
];

type Vec3 = { x: number; y: number; z: number };
type Quat = { x: number; y: number; z: number; w: number };

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const norm = (v: Vec3): Vec3 => {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
};

/** 世界坐标（MediaPipe：y 朝下，米）→ BVH（y 朝上） */
const toBvhVec = (p: Vec3): Vec3 => ({ x: p.x, y: -p.y, z: p.z });

/**
 * 最短弧四元数：把 from 方向转到 to 方向。
 * up 仅用于 from 与 to 恰好反向（180°）时挑一根稳定的旋转轴 —— 此时
 * 正交轴有无穷多个，任意选一个会在临界点前后突然变向，造成一次大跳。
 * 用身体平面法线叉乘 to 得到确定且连续的轴，奇点跳变就消失了。
 */
const quatFromTo = (from: Vec3, to: Vec3, up?: Vec3): Quat => {
  const a = norm(from);
  const b = norm(to);
  const dot = a.x * b.x + a.y * b.y + a.z * b.z;
  if (dot > 0.999999) return { x: 0, y: 0, z: 0, w: 1 };
  if (dot < -0.999999) {
    let axis: Vec3;
    if (up) {
      axis = cross(up, a);
      if (Math.hypot(axis.x, axis.y, axis.z) < 1e-6) axis = cross({ x: 0, y: 0, z: 1 }, a);
    } else {
      axis = Math.abs(a.x) > Math.abs(a.z) ? { x: -a.y, y: a.x, z: 0 } : { x: 0, y: -a.z, z: a.y };
    }
    const n = norm(axis);
    return { x: n.x, y: n.y, z: n.z, w: 0 };
  }
  const c = cross(a, b);
  const w = 1 + dot;
  const len = Math.hypot(c.x, c.y, c.z, w) || 1;
  return { x: c.x / len, y: c.y / len, z: c.z / len, w: w / len };
};

const quatMul = (a: Quat, b: Quat): Quat => ({
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
});

const quatConj = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

const quatToEulerZXY = (q: Quat): [number, number, number] => {
  const { x, y, z, w } = q;
  // ZXY: R = Rz * Rx * Ry
  const m11 = 1 - 2 * (y * y + z * z);
  const m12 = 2 * (x * y - z * w);
  const m13 = 2 * (x * z + y * w);
  const m22 = 1 - 2 * (x * x + z * z);
  const m23 = 2 * (y * z - x * w);
  const m32 = 2 * (y * z + x * w);
  const m33 = 1 - 2 * (x * x + y * y);
  const ey = Math.asin(Math.max(-1, Math.min(1, -m13)));
  const ex = Math.atan2(m23, m33);
  const ez = Math.atan2(m12, m11);
  return [ez, ex, ey];
};

const fromFlat = (flat: ArrayLike<number>, index: number): Vec3 => ({
  x: flat[index * 3] ?? 0,
  y: flat[index * 3 + 1] ?? 0,
  z: flat[index * 3 + 2] ?? 0,
});

const jointMid = (flat: ArrayLike<number>, j: { from: number; to: number }): Vec3 => {
  const a = fromFlat(flat, j.from);
  const b = fromFlat(flat, j.to);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
};

export interface BvhBuildInput {
  /** 每帧世界坐标：33 点 × 3 轴，扁平数组 */
  frames: Float32Array[];
  fps: number;
  /** 单位说明，会写进文件头注释 */
  sourceName?: string;
}

export function buildBvh({ frames, fps, sourceName }: BvhBuildInput): string {
  if (!frames.length) throw new Error('没有可导出的骨骼帧');

  const rootJoint = JOINTS.find((j) => j.parent === null)!;
  const childrenMap = new Map<string, string[]>();
  JOINTS.forEach((j) => {
    if (j.parent) {
      const list = childrenMap.get(j.parent) ?? [];
      list.push(j.name);
      childrenMap.set(j.parent, list);
    }
  });

  // 静止姿态（第一帧）的每根骨头方向与长度，作为 OFF SET 与旋转基准
  const first = frames[0];
  const restDir = new Map<string, Vec3>();
  const offset = new Map<string, Vec3>();
  const jointPos = new Map<string, Vec3>();
  for (const j of JOINTS) {
    const pos = toBvhVec(jointMid(first, j));
    jointPos.set(j.name, pos);
  }
  for (const j of JOINTS) {
    const p = jointPos.get(j.name)!;
    const parentPos = j.parent ? jointPos.get(j.parent)! : null;
    if (j.parent && parentPos) {
      const off = sub(p, parentPos);
      // BVH 子关节 offset 是相对父关节的局部坐标；这里用世界偏移近似（静止帧无旋转）
      offset.set(j.name, off);
      restDir.set(j.name, norm(off));
    } else {
      restDir.set(j.name, { x: 0, y: 1, z: 0 });
    }
  }

  const fmt = (n: number) => n.toFixed(6);
  const lines: string[] = [];
  lines.push('HIERARCHY');

  const writeJoint = (name: string, indent: string, isRoot = false) => {
    const j = JOINTS.find((x) => x.name === name)!;
    const off = offset.get(name) ?? { x: 0, y: 0, z: 0 };
    lines.push(`${indent}${isRoot ? 'ROOT' : 'JOINT'} ${name}`);
    lines.push(`${indent}{`);
    lines.push(`${indent}  OFFSET ${fmt(off.x)} ${fmt(off.y)} ${fmt(off.z)}`);
    if (isRoot) {
      // 根节点保留位移通道，方便在 DCC 里看到水平移动
      lines.push(`${indent}  CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation`);
    } else {
      lines.push(`${indent}  CHANNELS 3 Zrotation Xrotation Yrotation`);
    }
    const kids = childrenMap.get(name) ?? [];
    if (!kids.length) {
      lines.push(`${indent}  End Site`);
      lines.push(`${indent}  {`);
      lines.push(`${indent}    OFFSET 0 0.05 0`);
      lines.push(`${indent}  }`);
    } else {
      for (const k of kids) writeJoint(k, indent + '  ');
    }
    lines.push(`${indent}}`);
  };
  writeJoint(rootJoint.name, '', true);

  lines.push('MOTION');
  lines.push(`Frames: ${frames.length}`);
  lines.push(`Frame Time: ${fmt(1 / Math.max(1, fps))}`);

  const restRoot = jointPos.get(rootJoint.name)!;
  const orderedJoints = JOINTS;

  // 上一帧的欧拉角（度）与局部四元数，用于消除两类数值跳变：
  //  1. 四元数 q 与 -q 表示同一姿态，解算器在分支点会切换符号，
  //     quatToEulerZXY 随之给出相差 180° 的结果 —— 先把符号对齐上一帧。
  //  2. 欧拉角在 ±180 处环绕，数值从 +179 跳到 -179 —— unwrap 展开。
  const prevEuler = new Map<string, [number, number, number]>();
  const prevQuat = new Map<string, Quat>();
  /** 把四元数符号对齐上一帧（点积为负则取反），保证数值连续 */
  const alignQuat = (key: string, q: Quat): Quat => {
    const prev = prevQuat.get(key);
    if (!prev) { prevQuat.set(key, q); return q; }
    const dot = q.x * prev.x + q.y * prev.y + q.z * prev.z + q.w * prev.w;
    const out = dot < 0 ? { x: -q.x, y: -q.y, z: -q.z, w: -q.w } : q;
    prevQuat.set(key, out);
    return out;
  };

  /**
   * 选出与上一帧最接近的等价欧拉角。
   * ZXY 分解有两组解：正常解，以及 gimbal 奇点附近的互补解
   * (z+180, x+180, 180-y)。逐通道 unwrap 只能消 ±180 环绕，消不掉
   * 后者在 Y≈±90° 时 Z/X 同时翻 180° 的跳变。
   * 这里把两组解都按 ±360 环绕展开，取欧氏距离最小的一组，不依赖推导。
   */
  const unwrap = (key: string, angles: [number, number, number]): [number, number, number] => {
    const prev = prevEuler.get(key);
    if (!prev) { prevEuler.set(key, angles); return angles; }
    const [z, x, y] = angles;
    const candidates: [number, number, number][] = [];
    for (const base of [[z, x, y], [z + 180, x + 180, 180 - y]] as [number, number, number][]) {
      for (const dz of [-360, 0, 360]) {
        for (const dx of [-360, 0, 360]) {
          for (const dy of [-360, 0, 360]) {
            candidates.push([base[0] + dz, base[1] + dx, base[2] + dy]);
          }
        }
      }
    }
    let best = candidates[0];
    let bestD = Infinity;
    for (const c of candidates) {
      const d = (c[0] - prev[0]) ** 2 + (c[1] - prev[1]) ** 2 + (c[2] - prev[2]) ** 2;
      if (d < bestD) { bestD = d; best = c; }
    }
    prevEuler.set(key, best);
    return best;
  };

  for (const frame of frames) {
    const pos = new Map<string, Vec3>();
    for (const j of orderedJoints) pos.set(j.name, toBvhVec(jointMid(frame, j)));

    // 身体平面法线：由左右髋 (23,24) 与左右肩 (11,12) 的横轴叉乘得到，
    // 作为 180° 反向奇点处选旋转轴的稳定参考（躯干朝向，随身体一起转）。
    const hipL = toBvhVec(fromFlat(frame, 23));
    const hipR = toBvhVec(fromFlat(frame, 24));
    const shoL = toBvhVec(fromFlat(frame, 11));
    const shoR = toBvhVec(fromFlat(frame, 12));
    const bodyUp = norm(cross(sub(shoR, shoL), sub(hipR, hipL)));
    const hasBodyUp = Math.hypot(bodyUp.x, bodyUp.y, bodyUp.z) > 1e-6;
    const up = hasBodyUp ? bodyUp : undefined;

    // 自顶向下累乘父级旋转
    const worldRot = new Map<string, Quat>();

    // 不做高度烘焙：BlazePose 世界坐标以胯部为原点，脚的绝对高度没有地面参照，
    // 强行抬升会整体飘移。脚部吸附交给 DCC（Blender/MotionBuilder 里锁脚即可）。
    const groundLift = 0;

    const row: number[] = [];
    const rootPos = pos.get(rootJoint.name)!;
    row.push(
      rootPos.x - restRoot.x,
      rootPos.y - restRoot.y + groundLift,
      rootPos.z - restRoot.z,
    );

    for (const j of orderedJoints) {
      let local: Quat = { x: 0, y: 0, z: 0, w: 1 };
      if (j.parent) {
        const childPos = pos.get(j.name)!;
        const parentPos = pos.get(j.parent)!;
        const dir = norm(sub(childPos, parentPos));
        const rest = restDir.get(j.name) ?? { x: 0, y: 1, z: 0 };
        const worldDelta = quatFromTo(rest, dir, up);
        const parentWorld = worldRot.get(j.parent) ?? { x: 0, y: 0, z: 0, w: 1 };
        local = quatMul(quatConj(parentWorld), worldDelta);
        worldRot.set(j.name, quatMul(parentWorld, local));
      } else {
        const parentPos = pos.get(j.parent ?? j.name)!;
        const childPos = pos.get(j.name)!;
        const dir = norm(sub(childPos, parentPos));
        const rest = restDir.get(j.name) ?? { x: 0, y: 1, z: 0 };
        worldRot.set(j.name, quatFromTo(rest, dir, up));
      }
      const [rz, rx, ry] = quatToEulerZXY(alignQuat(j.name, local));
      const [az, ax, ay] = unwrap(j.name, [
        (rz * 180) / Math.PI,
        (rx * 180) / Math.PI,
        (ry * 180) / Math.PI,
      ]);
      row.push(az, ax, ay);
    }

    lines.push(row.map(fmt).join(' '));
  }

  void sourceName;
  // BVH 规范不支持注释，源信息由文件名承载
  return lines.join('\n');
}
