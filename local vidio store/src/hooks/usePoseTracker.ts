import { useCallback, useEffect, useRef, useState } from 'react';
import { PoseDetectorService } from '../services/pose/pose-detector';
import { OneEuroFilter3D } from '../services/pose/one-euro-filter';
import { samplePoseTrack, type PoseTrack } from '../services/pose/poseTrackService';
import type { PoseHeadModel } from '../services/settings/appPreferences';

export type PoseTrackerStatus = 'off' | 'loading' | 'ready' | 'error';
export type Landmark = { x: number; y: number; z?: number; visibility?: number };

/**
 * 头部画法（模块级开关）：
 * cross  = 颈根→鼻尖 + 双耳连线，只看朝向，最轻；
 * sphere = 半透明球 + 视线箭头，贴进动捕软件的习惯（能读出俯仰/偏转）。
 * 用模块级变量而不是透传到每个 render 入口，是为了避免三个绘制函数签名同时膨胀。
 */
let headModelMode: PoseHeadModel = 'cross';
export function setHeadModelMode(mode: PoseHeadModel) {
  headModelMode = mode;
}

/**
 * 2D 居中视图的平滑状态：包围盒逐帧跳变会让整个人「一缩一放」，
 * 这里对中心点与缩放分别做指数平滑，并记住上一帧是否已初始化。
 */
const centeredView = { cx: 0, cy: 0, scale: 0, ready: false };

/**
 * 优化后的骨骼拓扑连线数组 (精简面部多余杂线，聚焦核心舞蹈骨架)
 */
// 左右肢体与躯干骨骼连线分类 (生物力学色彩编码)
export const CLASSIFIED_CONNECTIONS: { pair: [number, number]; type: 'left' | 'right' | 'torso' }[] = [
  // 左侧肢体连线 (电光青蓝 Cyber Cyan: 左臂、左手、左腿、左足)
  { pair: [11, 13], type: 'left' },
  { pair: [13, 15], type: 'left' },
  { pair: [15, 19], type: 'left' },
  { pair: [23, 25], type: 'left' },
  { pair: [25, 27], type: 'left' },
  // 足部：踝→跟→趾 的 L 形解剖线（不再闭合三角，观感更干净）
  { pair: [27, 29], type: 'left' },
  { pair: [29, 31], type: 'left' },

  // 右侧肢体连线 (珊瑚暖粉 Coral Rose: 右臂、右手、右腿、右足)
  { pair: [12, 14], type: 'right' },
  { pair: [14, 16], type: 'right' },
  { pair: [16, 20], type: 'right' },
  { pair: [24, 26], type: 'right' },
  { pair: [26, 28], type: 'right' },
  { pair: [28, 30], type: 'right' },
  { pair: [30, 32], type: 'right' },

  // 躯干核心与骨盆外廓 (极光纯白 Arctic White: 双肩横轴、双髋横轴、双侧肋腹)
  { pair: [11, 12], type: 'torso' },
  { pair: [23, 24], type: 'torso' },
  { pair: [11, 23], type: 'torso' },
  { pair: [12, 24], type: 'torso' },
];

export const POSE_CONNECTIONS: [number, number][] = CLASSIFIED_CONNECTIONS.map((c) => c.pair);

export const LEFT_JOINTS = new Set([11, 13, 15, 19, 23, 25, 27, 29, 31]);
export const RIGHT_JOINTS = new Set([12, 14, 16, 20, 24, 26, 28, 30, 32]);
export const ANATOMICAL_JOINTS = new Set([11, 12, 13, 14, 15, 16, 19, 20, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]);
export const MAJOR_JOINTS = new Set([11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]);

export interface MotionTrailPoint {
  x: number;
  y: number;
}

export interface MotionTrails {
  leftWrist: MotionTrailPoint[];
  rightWrist: MotionTrailPoint[];
  leftAnkle: MotionTrailPoint[];
  rightAnkle: MotionTrailPoint[];
}

export interface NormalizedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 动作光轨拖尾：手腕/脚踝的渐隐轨迹，强化"发力弧线"的可读性。
 * 用逐段 alpha 递增的方式绘制，避免一次性大量渐变对象带来的开销。
 */
function drawMotionTrails(
  ctx: CanvasRenderingContext2D,
  trails: MotionTrails | undefined,
  mapPoint: (point: { x: number; y: number }) => { x: number; y: number },
) {
  if (!trails) return;
  const groups: { points?: MotionTrailPoint[]; rgb: string }[] = [
    { points: trails.leftWrist, rgb: '34, 211, 238' },
    { points: trails.rightWrist, rgb: '251, 113, 133' },
    { points: trails.leftAnkle, rgb: '34, 211, 238' },
    { points: trails.rightAnkle, rgb: '251, 113, 133' },
  ];

  ctx.save();
  ctx.lineCap = 'round';
  for (const group of groups) {
    const points = group.points;
    if (!points || points.length < 2) continue;
    for (let i = 1; i < points.length; i += 1) {
      const progress = i / points.length;
      const prev = points[i - 1];
      const next = points[i];
      // 跳变保护：跟丢/切换主体时会产生超长线段，直接跳过避免出现"穿过屏幕的长条"
      if (Math.abs(next.x - prev.x) > 0.35 || Math.abs(next.y - prev.y) > 0.35) continue;
      const from = mapPoint(prev);
      const to = mapPoint(next);
      ctx.beginPath();
      ctx.strokeStyle = `rgba(${group.rgb}, ${(progress * 0.5).toFixed(3)})`;
      ctx.lineWidth = 1 + progress * 3.5;
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export interface PoseItem {
  id: number;
  landmarks: Landmark[];
  worldLandmarks: any[];
}

export interface PoseRenderItem {
  id: number;
  landmarks: Landmark[];
  isActive: boolean;
  isHovered?: boolean;
}

/**
/**
 * 解剖学手部延长：将腕部至指尖自然延展 (约 1.32 倍)
 * MediaPipe: 15(左腕)->19(左食指指根), 16(右腕)->20(右食指指根)
 * 将骨骼连线与端点延伸至真实舞者指尖，消除断手感并还原完整手势动作
 */
export function extendHandLandmarks(landmarks: Landmark[]): Landmark[] {
  if (!landmarks || landmarks.length !== 33) return landmarks;
  const p15 = landmarks[15];
  const p19 = landmarks[19];
  const p16 = landmarks[16];
  const p20 = landmarks[20];

  let ext19 = p19;
  if (p15 && p19 && (p15.visibility ?? 1) > 0.15 && (p19.visibility ?? 1) > 0.15) {
    ext19 = {
      ...p19,
      x: p15.x + (p19.x - p15.x) * 1.32,
      y: p15.y + (p19.y - p15.y) * 1.32,
      z: p19.z !== undefined && p15.z !== undefined ? p15.z + (p19.z - p15.z) * 1.32 : p19.z,
    };
  }

  let ext20 = p20;
  if (p16 && p20 && (p16.visibility ?? 1) > 0.15 && (p20.visibility ?? 1) > 0.15) {
    ext20 = {
      ...p20,
      x: p16.x + (p20.x - p16.x) * 1.32,
      y: p16.y + (p20.y - p16.y) * 1.32,
      z: p20.z !== undefined && p16.z !== undefined ? p16.z + (p20.z - p16.z) * 1.32 : p20.z,
    };
  }

  if (ext19 === p19 && ext20 === p20) return landmarks;
  const copy = [...landmarks];
  copy[19] = ext19;
  copy[20] = ext20;
  return copy;
}

/**
 * ===== 骨骼渲染：FreeMoCap 风格「清晰描边 + 实心关节」 =====
 * 旧实现用 shadowBlur 8~10 做发光，线条会向外晕染、视觉上"虚"，看起来像没贴准。
 * 新样式改为：深色描边打底 + 亮色芯线 + 实心关节（外暗环 + 内亮芯 + 高光点），
 * 边缘锐利、对位更准；同时对低置信度关节做透明度衰减/隐藏，避免遮挡时抽线。
 */
const SKELETON_TORSO = '#e2e8f0';
const SKELETON_LEFT = '#22d3ee';
const SKELETON_RIGHT = '#fb7185';
const SKELETON_OUTLINE = 'rgba(2, 6, 23, 0.62)';

/**
 * 每个关键点处的肢体半径（× lineWidth）：肩/胯最粗，向指尖与脚尖递减。
 * 相邻两点半径不同 → 骨头画成锥形，比等宽直管更像身体。
 */
const LIMB_RADIUS: Record<number, number> = {
  11: 0.5,
  12: 0.5,
  13: 0.42,
  14: 0.42,
  15: 0.32,
  16: 0.32,
  19: 0.24,
  20: 0.24,
  23: 0.52,
  24: 0.52,
  25: 0.46,
  26: 0.46,
  27: 0.34,
  28: 0.34,
  29: 0.26,
  30: 0.26,
  31: 0.2,
  32: 0.2,
};

/** 肋腹线：不参与骨架观感，直接跳过 */
const TORSO_SIDE_PAIRS = new Set(['11-23', '12-24']);
/** 脊柱相对骨线宽度 */
const SPINE_WIDTH = 0.92;

/** 关节芯色：按左右分组，比骨线更亮一档，便于读出关节点 */
const SKELETON_JOINT_LEFT = '#67e8f9';
const SKELETON_JOINT_RIGHT = '#fda4af';
const SKELETON_JOINT_CORE = '#cbd5e1';

/** 肩/胯是躯干枢纽，比肘膝再大一档；指/趾最小 */
const PIVOT_JOINTS = new Set([11, 12, 23, 24]);
const MID_JOINTS = new Set([13, 14, 25, 26, 27, 28]);

/** 可见度 → 透明度；低于 0.3 直接不画（遮挡/出画时的假关节） */
function visibilityAlpha(a?: number, b?: number): number {
  const vis = Math.min(a ?? 1, b ?? 1);
  if (vis < 0.3) return 0;
  return Math.min(1, 0.5 + (vis - 0.3) * 1.2);
}

interface SkeletonGeometry {
  mapPoint: (point: { x: number; y: number }) => { x: number; y: number };
  lineWidth: number;
  majorRadius: number;
  minorRadius: number;
}

type SkeletonPoint = { x: number; y: number; vis: number };

function strokeBone(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: string,
  alpha: number,
  lineWidth: number,
) {
  if (alpha <= 0.01) return;
  ctx.globalAlpha = alpha;
  // 深色描边：让骨骼在亮背景（白墙/地板）上依然清晰可读
  // 描边随芯线一起收：固定 +1.4 会让细骨（手/脚）也被撑成一根粗管
  ctx.strokeStyle = SKELETON_OUTLINE;
  ctx.lineWidth = lineWidth + Math.max(1.1, lineWidth * 0.42);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  // 荧光绿芯线
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/**
 * 变径肢体：两端半径不同，画成一个带圆头的锥形（四边形 + 两端半圆）。
 * 等宽直管无论多细都像"铁丝"，锥形才能读出上臂粗、前臂细、手脚收尖的体感。
 */
function strokeLimb(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: string,
  alpha: number,
  wFrom: number,
  wTo: number,
) {
  if (alpha <= 0.01) return;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return;
  const nx = -dy / len;
  const ny = dx / len;

  const shape = (a: number, b: number) => {
    ctx.beginPath();
    ctx.moveTo(from.x + nx * a, from.y + ny * a);
    ctx.lineTo(to.x + nx * b, to.y + ny * b);
    ctx.lineTo(to.x - nx * b, to.y - ny * b);
    ctx.lineTo(from.x - nx * a, from.y - ny * a);
    ctx.closePath();
    ctx.fill();
    // 圆头，避免关节处出现折角
    ctx.beginPath();
    ctx.arc(from.x, from.y, a, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(to.x, to.y, b, 0, Math.PI * 2);
    ctx.fill();
  };

  ctx.globalAlpha = alpha;
  const halo = Math.max(0.9, Math.min(wFrom, wTo) * 0.35);
  ctx.fillStyle = SKELETON_OUTLINE;
  shape(wFrom + halo, wTo + halo);
  ctx.fillStyle = color;
  shape(wFrom, wTo);
  ctx.globalAlpha = 1;
}

function fillJoint(
  ctx: CanvasRenderingContext2D,
  point: { x: number; y: number },
  radius: number,
  color: string,
  alpha: number,
  isMajor: boolean,
) {
  if (alpha <= 0.01 || radius <= 0) return;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius + 0.7, 0, Math.PI * 2);
  ctx.fillStyle = SKELETON_OUTLINE;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = isMajor ? color : SKELETON_JOINT_CORE;
  ctx.fill();
  ctx.globalAlpha = 1;
}

/**
 * 单人骨架绘制核心（2D 附着视图与 2D 分屏视图共用）
 * 坐标系由 geometry.mapPoint 提供，两处渲染保持完全一致的视觉与语义。
 */
function drawSkeletonFigure(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  geometry: SkeletonGeometry,
) {
  const { mapPoint, lineWidth, majorRadius, minorRadius } = geometry;

  const readPoint = (index: number): SkeletonPoint | null => {
    const raw = landmarks[index];
    if (!raw) return null;
    const vis = raw.visibility ?? 1;
    if (vis < 0.3) return null;
    const mapped = mapPoint(raw);
    return { x: mapped.x, y: mapped.y, vis };
  };

  const mid = (a: SkeletonPoint | null, b: SkeletonPoint | null): SkeletonPoint | null =>
    a && b
      ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, vis: Math.min(a.vis, b.vis) }
      : null;

  const p11 = readPoint(11);
  const p12 = readPoint(12);
  const p23 = readPoint(23);
  const p24 = readPoint(24);
  const p7 = readPoint(7);
  const p8 = readPoint(8);
  const p0 = readPoint(0);
  const leftAnkle = readPoint(27);
  const rightAnkle = readPoint(28);

  const neck = mid(p11, p12);
  const pelvis = mid(p23, p24);
  const head = mid(p7, p8) ?? p0;

  // 以肩宽为人体尺度基准
  const shoulderSpan =
    p11 && p12 ? Math.hypot(p11.x - p12.x, p11.y - p12.y) : Math.max(lineWidth * 8, 40);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 1. 躯干：脊柱 + 肩线 + 胯线（中性灰白，不抢左右肢的颜色）
  if (neck && pelvis) {
    strokeBone(ctx, neck, pelvis, SKELETON_TORSO, visibilityAlpha(neck.vis, pelvis.vis), lineWidth * SPINE_WIDTH);
  }
  for (const { pair, type } of CLASSIFIED_CONNECTIONS) {
    if (TORSO_SIDE_PAIRS.has(`${pair[0]}-${pair[1]}`)) continue;
    const a = readPoint(pair[0]);
    const b = readPoint(pair[1]);
    if (!a || !b) continue;
    const color =
      type === 'left' ? SKELETON_LEFT : type === 'right' ? SKELETON_RIGHT : SKELETON_TORSO;
    const rFrom = lineWidth * (LIMB_RADIUS[pair[0]] ?? 0.3);
    const rTo = lineWidth * (LIMB_RADIUS[pair[1]] ?? 0.3);
    strokeLimb(ctx, a, b, color, visibilityAlpha(a.vis, b.vis), rFrom, rTo);
  }

  // 2. 头部：两种画法
  //    cross  —— 颈根→鼻尖 + 左右耳连线，只表达朝向（最轻）
  //    sphere —— 半透明球（半径按两耳距推算）+ 视线箭头，动捕软件习惯
  const nose = readPoint(0);
  if (headModelMode === 'sphere' && p7 && p8) {
    const earSpan = Math.hypot(p7.x - p8.x, p7.y - p8.y);
    const center = { x: (p7.x + p8.x) / 2, y: (p7.y + p8.y) / 2 };
    // 半径跟着耳距走，但收得比头小一圈：球是"头的位置与体积"提示，不是头盔
    const radius = Math.max(lineWidth * 2.6, earSpan * 0.52);
    const alpha = visibilityAlpha(p7.vis, p8.vis);
    // 只留一层极淡的填充 + 一圈很细的边，避免出现"实心圆头"
    ctx.globalAlpha = alpha * 0.12;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = SKELETON_TORSO;
    ctx.fill();
    ctx.globalAlpha = alpha * 0.45;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = SKELETON_TORSO;
    ctx.lineWidth = Math.max(1, lineWidth * 0.35);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // 视线：从球心指向鼻尖，短箭头即可，长了像天线
    if (nose) {
      const dx = nose.x - center.x;
      const dy = nose.y - center.y;
      const len = Math.hypot(dx, dy) || 1;
      const tipX = center.x + (dx / len) * radius * 1.18;
      const tipY = center.y + (dy / len) * radius * 1.18;
      strokeBone(ctx, center, { x: tipX, y: tipY }, SKELETON_TORSO, alpha * 0.8, lineWidth * 0.6);
      fillJoint(ctx, { x: tipX, y: tipY }, lineWidth * 0.7, SKELETON_TORSO, alpha * 0.85, false);
    }
  } else {
    if (neck && nose) {
      strokeBone(ctx, neck, nose, SKELETON_TORSO, visibilityAlpha(neck.vis, nose.vis), lineWidth * 0.8);
    }
    if (p7 && p8) {
      strokeBone(ctx, p7, p8, SKELETON_TORSO, visibilityAlpha(p7.vis, p8.vis), lineWidth * 0.9);
    }
  }

  // 3. 关节：肩/胯 > 肘/膝/踝 > 指/趾 三档，颜色跟随所属肢体
  const jointColor = (index: number) =>
    LEFT_JOINTS.has(index)
      ? SKELETON_JOINT_LEFT
      : RIGHT_JOINTS.has(index)
        ? SKELETON_JOINT_RIGHT
        : SKELETON_TORSO;

  ANATOMICAL_JOINTS.forEach((index) => {
    const joint = readPoint(index);
    if (!joint) return;
    const base = PIVOT_JOINTS.has(index)
      ? majorRadius * 0.55
      : MID_JOINTS.has(index)
        ? majorRadius * 0.4
        : minorRadius * 0.45;
    const scale = 0.55 + joint.vis * 0.45;
    fillJoint(
      ctx,
      joint,
      base * scale,
      jointColor(index),
      Math.min(1, 0.55 + joint.vis * 0.45),
      PIVOT_JOINTS.has(index),
    );
  });

  // 足跟 / 脚尖：最小一档，只用来表达脚的朝向
  [29, 30, 31, 32].forEach((index) => {
    const joint = readPoint(index);
    if (!joint) return;
    fillJoint(
      ctx,
      joint,
      minorRadius * 0.42 * (0.6 + joint.vis * 0.4),
      jointColor(index),
      0.75,
      false,
    );
  });

  // 4. 颈根与骨盆中心
  if (neck) fillJoint(ctx, neck, majorRadius * 0.55, SKELETON_TORSO, 1, false);
  if (pelvis) fillJoint(ctx, pelvis, majorRadius * 0.62, SKELETON_TORSO, 1, false);
}

/**
 * 单人 2D 骨骼附着渲染（画在视频内容矩形上，与视频 1:1 对齐）
 */
export function renderPoseToCanvas(
  ctx: CanvasRenderingContext2D,
  rawLandmarks: Landmark[],
  width: number,
  height: number,
  isMirrored = false,
  trails?: MotionTrails,
) {
  ctx.clearRect(0, 0, width, height);
  if (!rawLandmarks || rawLandmarks.length !== 33) return;

  const landmarks = extendHandLandmarks(rawLandmarks);
  ctx.save();

  drawMotionTrails(ctx, trails, (point) => ({ x: point.x * width, y: point.y * height }));

  const ls = landmarks[11];
  const rs = landmarks[12];
  const shoulderSpanPx =
    ls && rs && (ls.visibility ?? 1) > 0.2 && (rs.visibility ?? 1) > 0.2
      ? Math.hypot((ls.x - rs.x) * width, (ls.y - rs.y) * height)
      : Math.min(width, height) * 0.18;
  const bodyScale = Math.max(48, Math.min(shoulderSpanPx * 2.6, Math.max(width, height)));

  drawSkeletonFigure(ctx, landmarks, {
    mapPoint: (point) => ({ x: point.x * width, y: point.y * height }),
    lineWidth: Math.max(2.2, Math.min(6, bodyScale * 0.024)),
    majorRadius: Math.max(2.8, Math.min(6.4, bodyScale * 0.014)),
    minorRadius: Math.max(1.6, Math.min(4, bodyScale * 0.009)),
  });

  void isMirrored;
  ctx.restore();
}

/**
 * 兼容多目标入参，只渲染当前被聚焦的单人主体骨骼
 */
export function renderMultiPoseToCanvas(
  ctx: CanvasRenderingContext2D,
  poseItems: PoseRenderItem[],
  width: number,
  height: number,
  isMirrored = false,
) {
  if (!poseItems || poseItems.length === 0) {
    ctx.clearRect(0, 0, width, height);
    return;
  }
  // 优先选取标记为激活的主体，若无则取第一人
  const target = poseItems.find((p) => p.isActive) || poseItems[0];
  renderPoseToCanvas(ctx, target.landmarks, width, height, isMirrored);
}

/**
 * 2D 独立分屏骨骼渲染：自动按包围盒居中放大，去除原视频背景干扰
 */
export function renderCenteredPoseToCanvas(
  ctx: CanvasRenderingContext2D,
  rawLandmarks: Landmark[],
  canvasWidth: number,
  canvasHeight: number,
  isMirrored = false,
  trails?: MotionTrails,
) {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  if (!rawLandmarks || rawLandmarks.length !== 33) return;

  const landmarks = extendHandLandmarks(rawLandmarks);

  // 只有零星几个点（模型刚启动 / 人还没进画面）时就别画 —— 4 个点算出的包围盒
  // 会被放大到整屏，看起来像一条被拉长的怪线。
  const valid = landmarks.filter((p) => (p.visibility ?? 1) > 0.4);
  if (valid.length < 12) {
    centeredView.ready = false;
    return;
  }

  const xs = valid.map((p) => p.x);
  const ys = valid.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const boxW = Math.max(0.12, maxX - minX);
  const boxH = Math.max(0.25, maxY - minY);
  const rawCenterX = (minX + maxX) / 2;
  const rawCenterY = (minY + maxY) / 2;

  // 画面里人物一旦伸手/踢腿，包围盒就会瞬间变大变小 —— 直接拿它算缩放，
  // 整个人会跟着「一缩一放」地抖。这里做三件事：
  // 1) 目标尺寸按 0.5W / 0.62H 留白（不再撑满画布，看着不憋）；
  // 2) 对 center / scale 做指数平滑，抹掉逐帧跳变；
  // 3) 平滑后的缩放再做一次钳制，避免突然贴近镜头时人被放得过大。
  const rawScale = Math.min(
    (canvasWidth * 0.56) / boxW,
    (canvasHeight * 0.74) / boxH,
    // 上限用「归一化单位 → 像素」的换算上限：蹲下时 boxH 只有 0.5，
    // 若这里卡在 0.74*min(W,H)，人只会占到画布的 40%，看起来偏小。
    Math.min(canvasWidth, canvasHeight) * 1.2,
  );
  if (!centeredView.ready) {
    centeredView.cx = rawCenterX;
    centeredView.cy = rawCenterY;
    centeredView.scale = rawScale;
    centeredView.ready = true;
  } else if (
    // 平滑值离目标太远（例如刚从缩放过渡里恢复、或暂停后只画一两帧）就直接对齐，
    // 否则会停在某个中间尺寸上，看起来「一会儿大一会儿小」。
    Math.abs(Math.log(rawScale / Math.max(1e-6, centeredView.scale))) > 0.45
  ) {
    centeredView.cx = rawCenterX;
    centeredView.cy = rawCenterY;
    centeredView.scale = rawScale;
  } else {
    centeredView.cx += (rawCenterX - centeredView.cx) * 0.16;
    centeredView.cy += (rawCenterY - centeredView.cy) * 0.16;
    centeredView.scale += (rawScale - centeredView.scale) * 0.1;
  }
  const centerX = centeredView.cx;
  const centerY = centeredView.cy;
  const targetScale = centeredView.scale;

  ctx.save();
  ctx.translate(canvasWidth / 2, canvasHeight / 2);
  if (isMirrored) ctx.scale(-1, 1);

  // 暗黑工坊极简十字参考线
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.045)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-canvasWidth / 2, 0);
  ctx.lineTo(canvasWidth / 2, 0);
  ctx.moveTo(0, -canvasHeight / 2);
  ctx.lineTo(0, canvasHeight / 2);
  ctx.stroke();
  ctx.restore();

  const mapPoint = (p: { x: number; y: number }) => ({
    x: (p.x - centerX) * targetScale,
    y: (p.y - centerY) * targetScale,
  });

  drawMotionTrails(ctx, trails, mapPoint);

  const shoulderL = landmarks[11];
  const shoulderR = landmarks[12];
  const shoulderSpanPx =
    shoulderL && shoulderR
      ? Math.hypot(shoulderL.x - shoulderR.x, shoulderL.y - shoulderR.y) * targetScale
      : canvasWidth * 0.18;
  const bodyScale = Math.max(48, shoulderSpanPx * 2.6);

  drawSkeletonFigure(ctx, landmarks, {
    mapPoint,
    lineWidth: Math.max(2, Math.min(5.4, bodyScale * 0.021)),
    majorRadius: Math.max(2.6, Math.min(6.2, bodyScale * 0.0125)),
    minorRadius: Math.max(1.4, Math.min(4, bodyScale * 0.008)),
  });

  ctx.restore();
}

/**
 * 「贴合视频」渲染：把归一化关键点按视频原始画幅（letterbox）映射到画布上。
 * 与 renderCenteredPoseToCanvas（把人物居中归一化、只当"动作参考图"）不同，
 * 这个函数保留人物在画面里的真实位置与比例，因此骨架会**正好叠在画面里那个人身上**，
 * 适合 2D 分屏"左视频 / 右骨架"的对照场景，以及需要"跟得上"的演示。
 */
export function renderFittedPoseToCanvas(
  ctx: CanvasRenderingContext2D,
  rawLandmarks: Landmark[],
  canvasWidth: number,
  canvasHeight: number,
  videoAspect: number,
  isMirrored = false,
  trails?: MotionTrails,
) {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  if (!rawLandmarks || rawLandmarks.length !== 33) return;

  const landmarks = extendHandLandmarks(rawLandmarks);
  const safeAspect = Number.isFinite(videoAspect) && videoAspect > 0 ? videoAspect : 16 / 9;
  const canvasAspect = canvasWidth / Math.max(1, canvasHeight);

  // object-contain：在画布里留出与视频同比例的画幅
  const drawW = safeAspect > canvasAspect ? canvasWidth : canvasHeight * safeAspect;
  const drawH = safeAspect > canvasAspect ? canvasWidth / safeAspect : canvasHeight;
  const offsetX = (canvasWidth - drawW) / 2;
  const offsetY = (canvasHeight - drawH) / 2;

  const mapPoint = (point: { x: number; y: number }) => ({
    x: offsetX + (isMirrored ? 1 - point.x : point.x) * drawW,
    y: offsetY + point.y * drawH,
  });

  drawMotionTrails(ctx, trails, mapPoint);

  const ls = landmarks[11];
  const rs = landmarks[12];
  const shoulderSpanPx =
    ls && rs && (ls.visibility ?? 1) > 0.2 && (rs.visibility ?? 1) > 0.2
      ? Math.hypot((ls.x - rs.x) * drawW, (ls.y - rs.y) * drawH)
      : Math.min(drawW, drawH) * 0.18;
  const bodyScale = Math.max(48, Math.min(shoulderSpanPx * 2.6, Math.max(canvasWidth, canvasHeight)));

  drawSkeletonFigure(ctx, landmarks, {
    mapPoint,
    lineWidth: Math.max(1.6, Math.min(4.4, bodyScale * 0.016)),
    majorRadius: Math.max(2.2, Math.min(5, bodyScale * 0.010)),
    minorRadius: Math.max(1.3, Math.min(3.2, bodyScale * 0.007)),
  });
}

export interface UsePoseTrackerOptions {
  draw2D?: boolean;
  isMirrored?: boolean;
  /** 手动选择聚焦的单人主体坐标 (归一化 0~1)；当画面有多人时锁定距该点最近的舞者 */
  focusPoint?: { x: number; y: number } | null;
  onPoseDetected?: (
    activeLandmarks: Landmark[],
    activeWorldLandmarks: any[],
    allPoses: PoseItem[],
    trails?: MotionTrails,
  ) => void;
  onPoseCountChange?: (count: number) => void;
  /** 是否绘制手腕/脚踝的动作光轨拖尾（默认开启） */
  trailsEnabled?: boolean;
  /**
   * 离线骨骼索引。传入后播放期不再逐帧推理，而是按 currentTime 查表 ——
   * 拖动进度条、暂停、AB 循环跳帧都能立刻拿到与画面同一时刻的骨架。
   */
  poseTrack?: PoseTrack | null;
  /** 头部画法：cross（默认）或 sphere（半透明球 + 视线） */
  headModel?: PoseHeadModel;
}

export function usePoseTracker(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  enabled: boolean,
  options?: UsePoseTrackerOptions,
) {
  const detectorRef = useRef<PoseDetectorService | null>(null);
  const frameRef = useRef<number | null>(null);
  const rvfcIdRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const lastDetectionTimeRef = useRef(0);
  const [status, setStatus] = useState<PoseTrackerStatus>('off');
  const [message, setMessage] = useState('');

  const onPoseDetectedRef = useRef(options?.onPoseDetected);
  onPoseDetectedRef.current = options?.onPoseDetected;
  const onPoseCountChangeRef = useRef(options?.onPoseCountChange);
  onPoseCountChangeRef.current = options?.onPoseCountChange;
  const draw2DRef = useRef(options?.draw2D ?? true);
  draw2DRef.current = options?.draw2D ?? true;
  const focusPointRef = useRef(options?.focusPoint);
  focusPointRef.current = options?.focusPoint;
  const poseTrackRef = useRef<PoseTrack | null>(options?.poseTrack ?? null);
  poseTrackRef.current = options?.poseTrack ?? null;
  // 头部画法是全局渲染样式，切换后下一帧即生效
  setHeadModelMode(options?.headModel ?? 'cross');

  // 动作发光光轨历史记忆 (手腕、脚踝)
  const motionTrailsRef = useRef<MotionTrails>({
    leftWrist: [],
    rightWrist: [],
    leftAnkle: [],
    rightAnkle: [],
  });

  // 锁定目标的平滑轨迹与质心记录
  const lastTargetCentroidRef = useRef<{ x: number; y: number } | null>(null);
  // 上一帧实际选中的候选序号：切换锁定目标时用它判断"换了个人"，从而重置滤波与光轨
  const lastChosenIndexRef = useRef<number | null>(null);
  const lastSmoothedLandmarksRef = useRef<Landmark[] | null>(null);
  const lastSmoothedWorldRef = useRef<any[] | null>(null);
  const lastPosesRef = useRef<PoseItem[]>([]);
  const oneEuroFiltersRef = useRef<OneEuroFilter3D[]>([]);

  // 当 draw2D 关闭时立即清空画布
  useEffect(() => {
    if (!options?.draw2D) {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [options?.draw2D, canvasRef]);

  const clear = useCallback(() => {
    lastTargetCentroidRef.current = null;
    lastSmoothedLandmarksRef.current = null;
    lastSmoothedWorldRef.current = null;
    lastPosesRef.current = [];
    oneEuroFiltersRef.current.forEach((f) => f.reset());
    motionTrailsRef.current = {
      leftWrist: [],
      rightWrist: [],
      leftAnkle: [],
      rightAnkle: [],
    };
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [canvasRef]);

  // 核心姿态推理处理函数
  const processFrame = useCallback(
    (timestampMs?: number) => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const detector = detectorRef.current;
      if (!video || !detector?.isReady || !video.videoWidth || busyRef.current) return;

      busyRef.current = true;
      try {
        if (canvas && draw2DRef.current) {
          // 画布后备尺寸跟随"实际显示尺寸"，保证与视频内容矩形 1:1 对齐（DPR 感知）
          const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
          const cssWidth = canvas.clientWidth || video.videoWidth;
          const cssHeight = canvas.clientHeight || video.videoHeight;
          const targetWidth = Math.max(1, Math.round(cssWidth * dpr));
          const targetHeight = Math.max(1, Math.round(cssHeight * dpr));
          if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
            canvas.width = targetWidth;
            canvas.height = targetHeight;
          }
        }

        // 送检精准时间戳（毫秒）
        const effectiveTime =
          typeof timestampMs === 'number' && Number.isFinite(timestampMs)
            ? timestampMs
            : Math.round(video.currentTime * 1000);

        // —— 命中离线骨骼索引：直接按时间查表，不再逐帧推理 ——
        const cachedTrack = poseTrackRef.current;
        if (cachedTrack) {
          const frame = samplePoseTrack(cachedTrack, video.currentTime);
          if (!frame || !frame.points.length) {
            lastSmoothedLandmarksRef.current = null;
            lastPosesRef.current = [];
            onPoseCountChangeRef.current?.(0);
            if (draw2DRef.current) clear();
            return;
          }
          const cachedLandmarks = frame.points as unknown as Landmark[];
          lastSmoothedLandmarksRef.current = cachedLandmarks;
          const cachedPoses: PoseItem[] = [
            { id: 0, landmarks: cachedLandmarks, worldLandmarks: frame.world },
          ];
          lastPosesRef.current = cachedPoses;
          onPoseCountChangeRef.current?.(1);

          const pushCachedTrail = (list: MotionTrailPoint[], p?: Landmark) => {
            if (p && (p.visibility ?? 1) > 0.45) {
              list.push({ x: p.x, y: p.y });
              if (list.length > 12) list.shift();
            } else if (list.length > 0) {
              list.shift();
            }
          };
          pushCachedTrail(motionTrailsRef.current.leftWrist, cachedLandmarks[15]);
          pushCachedTrail(motionTrailsRef.current.rightWrist, cachedLandmarks[16]);
          pushCachedTrail(motionTrailsRef.current.leftAnkle, cachedLandmarks[27]);
          pushCachedTrail(motionTrailsRef.current.rightAnkle, cachedLandmarks[28]);

          if (canvas && draw2DRef.current) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
              renderPoseToCanvas(
                ctx,
                cachedLandmarks,
                canvas.width,
                canvas.height,
                options?.isMirrored,
                options?.trailsEnabled === false ? undefined : motionTrailsRef.current,
              );
            }
          }
          onPoseDetectedRef.current?.(
            cachedLandmarks,
            frame.world,
            cachedPoses,
            options?.trailsEnabled === false ? undefined : motionTrailsRef.current,
          );
          return;
        }

        const result = detector.detectVideoFrame(video, effectiveTime);
        const rawLandmarksList = (result?.landmarks || []) as Landmark[][];
        const rawWorldList = (result?.worldLandmarks || []) as any[][];

        if (rawLandmarksList.length > 0) {
          // 计算各候选人的质心
          const candidates = rawLandmarksList.map((lms, idx) => {
            const valid = lms.filter((p) => (p.visibility ?? 1) > 0.35);
            const cx = valid.reduce((s, p) => s + p.x, 0) / (valid.length || 1);
            const cy = valid.reduce((s, p) => s + p.y, 0) / (valid.length || 1);
            return {
              index: idx,
              cx,
              cy,
              landmarks: lms,
              worldLandmarks: rawWorldList[idx] || [],
              validCount: valid.length,
            };
          });

          // 核心逻辑：选定单一聚焦主体
          let chosen = candidates[0];

          // 1. 若用户手动在画面上点击选择了聚焦主体 (focusPoint)
          if (focusPointRef.current) {
            const fp = focusPointRef.current;
            let minDist = Infinity;
            candidates.forEach((cand) => {
              const dist = Math.hypot(cand.cx - fp.x, cand.cy - fp.y);
              if (dist < minDist) {
                minDist = dist;
                chosen = cand;
              }
            });
            // 更新该选定主体的连续质心记忆
            lastTargetCentroidRef.current = { x: chosen.cx, y: chosen.cy };
          } else if (lastTargetCentroidRef.current && candidates.length > 1) {
            // 2. 连续平滑跟随历史目标质心
            const prevCentroid = lastTargetCentroidRef.current;
            let minDist = Infinity;
            candidates.forEach((cand) => {
              const dist = Math.hypot(cand.cx - prevCentroid.x, cand.cy - prevCentroid.y);
              if (dist < minDist) {
                minDist = dist;
                chosen = cand;
              }
            });
            lastTargetCentroidRef.current = { x: chosen.cx, y: chosen.cy };
          } else {
            // 3. 默认选取点数最多/最居中的主体
            lastTargetCentroidRef.current = { x: chosen.cx, y: chosen.cy };
          }

          // 切换了锁定目标（例如点击选人 / 选择器切换）：清掉上一个人的滤波状态与光轨，
          // 否则骨架会从上一个人位置"飞"过来，光轨还会画出一条跨越整个画面的假轨迹。
          if (lastChosenIndexRef.current !== null && lastChosenIndexRef.current !== chosen.index) {
            oneEuroFiltersRef.current.forEach((f) => f.reset());
            motionTrailsRef.current = {
              leftWrist: [],
              rightWrist: [],
              leftAnkle: [],
              rightAnkle: [],
            };
          }
          lastChosenIndexRef.current = chosen.index;

          // 自适应平滑滤波 (1€ Filter Casiez et al.)：
          // 静止微动时用低截止频率压掉颤抖，动起来后靠速度项把截止频率顶上去。
          // 参数取舍（30fps 匀速输入下的稳态跟随滞后实测）：
          //   1.8Hz/β0.45 ≈ 慢速 72ms(2.1帧)、中速 54ms(1.6帧) —— 视觉上就是「骨架慢半拍」；
          //   2.5Hz/β2.5  ≈ 慢速 39ms(1.2帧)、中速 24ms(0.7帧)，静止抖动只多约 14%。
          // 跟手性优先取后者：动作跟练时 1 帧内的偏差看不出来，两帧以上就会被当成不同步。
          if (oneEuroFiltersRef.current.length !== 33) {
            oneEuroFiltersRef.current = Array.from(
              { length: 33 },
              () => new OneEuroFilter3D(2.5, 2.5, 1.0)
            );
          }

          let finalLandmarks = chosen.landmarks;
          if (!video.paused) {
            finalLandmarks = chosen.landmarks.map((curr, i) => {
              const filter = oneEuroFiltersRef.current[i];
              if (!filter) return curr;
              const f = filter.filter(curr.x, curr.y, curr.z ?? 0, effectiveTime);
              return {
                x: f.x,
                y: f.y,
                z: f.z,
                visibility: curr.visibility,
              };
            });
          } else {
            oneEuroFiltersRef.current.forEach((f) => f.reset());
          }

          lastSmoothedLandmarksRef.current = finalLandmarks;
          lastSmoothedWorldRef.current = chosen.worldLandmarks;

          const allPoseItems: PoseItem[] = candidates.map((cand, idx) => ({
            id: idx,
            landmarks: cand.index === chosen.index ? finalLandmarks : cand.landmarks,
            worldLandmarks: cand.worldLandmarks,
          }));
          lastPosesRef.current = allPoseItems;
          onPoseCountChangeRef.current?.(rawLandmarksList.length);

          // 记录手腕与脚踝的空间运动光轨 (Motion Trails)
          const pushTrail = (list: MotionTrailPoint[], p?: Landmark) => {
            if (p && (p.visibility ?? 1) > 0.45) {
              list.push({ x: p.x, y: p.y });
              if (list.length > 12) list.shift();
            } else if (list.length > 0) {
              list.shift();
            }
          };
          pushTrail(motionTrailsRef.current.leftWrist, finalLandmarks[15]);
          pushTrail(motionTrailsRef.current.rightWrist, finalLandmarks[16]);
          pushTrail(motionTrailsRef.current.leftAnkle, finalLandmarks[27]);
          pushTrail(motionTrailsRef.current.rightAnkle, finalLandmarks[28]);

          // 绘制到 2D 视频覆层 (包含电光光轨与左右肢色彩编码)
          if (canvas && draw2DRef.current) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
              renderPoseToCanvas(
                ctx,
                finalLandmarks,
                canvas.width,
                canvas.height,
                options?.isMirrored,
                options?.trailsEnabled === false ? undefined : motionTrailsRef.current,
              );
            }
          }

          // 向外广播姿态数据与动作光轨 (供 3D 骨架视口即时驱动及 2D 分屏)
          onPoseDetectedRef.current?.(
            finalLandmarks,
            chosen.worldLandmarks,
            allPoseItems,
            options?.trailsEnabled === false ? undefined : motionTrailsRef.current,
          );
        } else {
          lastSmoothedLandmarksRef.current = null;
          lastSmoothedWorldRef.current = null;
          lastPosesRef.current = [];
          onPoseCountChangeRef.current?.(0);
          if (draw2DRef.current) {
            clear();
          }
        }
      } finally {
        busyRef.current = false;
      }
    },
    [canvasRef, clear, options?.isMirrored, videoRef],
  );

  const detect = useCallback(() => {
    processFrame();
  }, [processFrame]);

  useEffect(() => {
    const video = videoRef.current;
    if (!enabled || !video) {
      setStatus('off');
      setMessage('');
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      if (video && rvfcIdRef.current !== null && 'cancelVideoFrameCallback' in video) {
        (video as any).cancelVideoFrameCallback(rvfcIdRef.current);
        rvfcIdRef.current = null;
      }
      clear();
      return;
    }

    let cancelled = false;
    const detector =
      typeof PoseDetectorService.getInstance === 'function'
        ? PoseDetectorService.getInstance()
        : new PoseDetectorService();
    detectorRef.current = detector;

    if (lastPosesRef.current.length > 0 && onPoseDetectedRef.current) {
      const active = lastPosesRef.current[0];
      onPoseDetectedRef.current(active.landmarks, active.worldLandmarks, lastPosesRef.current);
    }

    if (detector.isReady) {
      setStatus('ready');
      setMessage('骨骼识别中');
      detect();
    } else {
      setStatus('loading');
      setMessage('正在加载轻量骨骼识别模型...');
      void detector
        .init((nextMessage) => {
          if (!cancelled) setMessage(nextMessage);
        })
        .then(() => {
          if (cancelled) return;
          setStatus('ready');
          setMessage('骨骼识别中');
          detect();
        })
        .catch(() => {
          if (!cancelled) {
            setStatus('error');
            setMessage('骨骼模型加载失败，请检查网络');
          }
        });
    }

    // 关键优化：当视频发生 seek、循环回跳或暂停时，立即重置 detector 时间戳基线与平滑历史
    const handleResetTimeline = () => {
      detector.resetTimeline?.();
      lastTargetCentroidRef.current = null;
      lastSmoothedLandmarksRef.current = null;
      lastSmoothedWorldRef.current = null;
      oneEuroFiltersRef.current.forEach((f) => f.reset());
      motionTrailsRef.current = {
        leftWrist: [],
        rightWrist: [],
        leftAnkle: [],
        rightAnkle: [],
      };
      detect();
    };

    video.addEventListener('pause', handleResetTimeline);
    video.addEventListener('seeking', handleResetTimeline);
    video.addEventListener('seeked', handleResetTimeline);
    video.addEventListener('loadedmetadata', handleResetTimeline);
    video.addEventListener('play', handleResetTimeline);

    // 核心优化：优先使用现代浏览器的 requestVideoFrameCallback 实现逐帧物理同步
    const supportsRvfc = typeof (video as any).requestVideoFrameCallback === 'function';

    if (supportsRvfc) {
      const onVideoFrame = (_now: number, metadata: { mediaTime: number }) => {
        if (cancelled) return;
        // 关键：在进入本帧运算前立即向浏览器注册下一帧视频刷新回调，杜绝因当前帧渲染耗时错过刷新窗口导致的掉帧与延迟
        if (video && 'requestVideoFrameCallback' in video) {
          rvfcIdRef.current = (video as any).requestVideoFrameCallback(onVideoFrame);
        }
        const mediaTimeMs = Math.round(metadata.mediaTime * 1000);
        processFrame(mediaTimeMs);
      };
      rvfcIdRef.current = (video as any).requestVideoFrameCallback(onVideoFrame);
    } else {
      // 兼容回退方案：高精度节流 requestAnimationFrame
      const tick = (now: number) => {
        if (cancelled) return;
        if (now - lastDetectionTimeRef.current >= 28) {
          lastDetectionTimeRef.current = now;
          if (video.readyState >= 2) processFrame();
        }
        frameRef.current = requestAnimationFrame(tick);
      };
      frameRef.current = requestAnimationFrame(tick);
    }

    return () => {
      cancelled = true;
      video.removeEventListener('pause', handleResetTimeline);
      video.removeEventListener('seeking', handleResetTimeline);
      video.removeEventListener('seeked', handleResetTimeline);
      video.removeEventListener('loadedmetadata', handleResetTimeline);
      video.removeEventListener('play', handleResetTimeline);

      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      if (rvfcIdRef.current !== null && video && 'cancelVideoFrameCallback' in video) {
        (video as any).cancelVideoFrameCallback(rvfcIdRef.current);
        rvfcIdRef.current = null;
      }
      clear();
    };
  }, [clear, detect, enabled, processFrame, videoRef]);

  return { status, message, detect, lastPoses: lastPosesRef };
}
