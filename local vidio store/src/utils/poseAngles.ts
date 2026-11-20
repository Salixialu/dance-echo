/**
 * 关节角度实时读数
 * ---------------------------------------------------------------
 * 用姿态关键点计算膝/肘/髋的夹角（单位：度），供播放器「2D 纯骨架 / 纯骨架」
 * 视图展示。优先使用 worldLandmarks（三维米制坐标），它在不同视频画幅下
 * 得到的角度才是一致的；没有三维坐标时退回收到的二维归一化坐标。
 *
 * MediaPipe Pose 关键点索引：
 *   11/12 左右肩  13/14 左右肘  15/16 左右腕
 *   23/24 左右髋  25/26 左右膝  27/28 左右踝
 */

export interface PosePoint {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface JointAngles {
  leftElbow: number | null;
  rightElbow: number | null;
  leftKnee: number | null;
  rightKnee: number | null;
  leftHip: number | null;
  rightHip: number | null;
}

/** 关键点可见度低于该值时视为被遮挡，不输出角度（避免"假读数"） */
const MIN_VISIBILITY = 0.35;

export const EMPTY_JOINT_ANGLES: JointAngles = {
  leftElbow: null,
  rightElbow: null,
  leftKnee: null,
  rightKnee: null,
  leftHip: null,
  rightHip: null,
};

function isUsable(point?: PosePoint | null): point is PosePoint {
  if (!point) return false;
  const visibility = point.visibility ?? 1;
  return visibility >= MIN_VISIBILITY;
}

/** 计算 ∠ABC（以 B 为顶点），返回 0~180 度；点不可用或退化时返回 null */
function angleAt(a?: PosePoint | null, b?: PosePoint | null, c?: PosePoint | null): number | null {
  if (!isUsable(a) || !isUsable(b) || !isUsable(c)) return null;

  const bax = a.x - b.x;
  const bay = a.y - b.y;
  const baz = (a.z ?? 0) - (b.z ?? 0);
  const bcx = c.x - b.x;
  const bcy = c.y - b.y;
  const bcz = (c.z ?? 0) - (b.z ?? 0);

  const lenBa = Math.hypot(bax, bay, baz);
  const lenBc = Math.hypot(bcx, bcy, bcz);
  if (lenBa < 1e-6 || lenBc < 1e-6) return null;

  const cos = (bax * bcx + bay * bcy + baz * bcz) / (lenBa * lenBc);
  const clamped = Math.max(-1, Math.min(1, cos));
  return Number.isNaN(clamped) ? null : (Math.acos(clamped) * 180) / Math.PI;
}

/**
 * 计算一组关节角度。
 * @param landmarks 二维归一化关键点
 * @param worldLandmarks 三维世界坐标关键点（优先使用）
 */
export function computeJointAngles(
  landmarks?: PosePoint[] | null,
  worldLandmarks?: PosePoint[] | null
): JointAngles {
  const source = worldLandmarks && worldLandmarks.length >= 33 ? worldLandmarks : landmarks;
  if (!source || source.length < 33) return EMPTY_JOINT_ANGLES;

  return {
    leftElbow: angleAt(source[11], source[13], source[15]),
    rightElbow: angleAt(source[12], source[14], source[16]),
    leftKnee: angleAt(source[23], source[25], source[27]),
    rightKnee: angleAt(source[24], source[26], source[28]),
    leftHip: angleAt(source[11], source[23], source[25]),
    rightHip: angleAt(source[12], source[24], source[26]),
  };
}

/** 角度格式化：保留整数度，空值显示 —— */
export function formatAngle(value: number | null): string {
  return value === null ? '——' : `${Math.round(value)}°`;
}
