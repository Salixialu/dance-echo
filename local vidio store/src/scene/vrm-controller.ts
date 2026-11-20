import * as THREE from "three";
import { OneEuroFilter3D } from "../services/pose/one-euro-filter";

/**
 * 3D 人体解剖学生物力学拓扑连线 (左右分色，剔除面部杂线与三角形帐篷颈)
 */
export const POSE_CONNECTIONS: [number, number][] = [
  // 躯干核心与侧向外廓 (极光纯白 Arctic White: 双肩横轴、双髋横轴、双侧肋腹)
  [11, 12],
  [23, 24],
  [11, 23],
  [12, 24],

  // 左侧肢体连线 (电光青蓝 Cyber Cyan: 左臂、左腕手、左腿、左足)
  [11, 13],
  [13, 15],
  [15, 19],
  [23, 25],
  [25, 27],
  [27, 29],
  [27, 31],
  [29, 31],

  // 右侧肢体连线 (珊瑚暖粉 Coral Rose: 右臂、右腕手、右腿、右足)
  [12, 14],
  [14, 16],
  [16, 20],
  [24, 26],
  [26, 28],
  [28, 30],
  [28, 32],
  [30, 32],
];

const MAJOR_JOINTS = new Set([11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]);
const LEFT_JOINTS = new Set([11, 13, 15, 19, 23, 25, 27, 29, 31]);
const RIGHT_JOINTS = new Set([12, 14, 16, 20, 24, 26, 28, 30, 32]);
const ANATOMICAL_JOINTS = new Set([
  11, 12, 13, 14, 15, 16, 19, 20, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32,
]);

/**
 * 3D 发光线框骨架控制器 (Skeleton3DController)
 * 采用 1€ Filter (OneEuroFilter) 自适应滤波：微动防抖无颤抖，大动作 0 延迟跟随。
 * 只负责骨架可视化；动作数据的落点是 BVH 导出（见 services/pose/bvhExport.ts），
 * 不再承载任何 VRM / 化身模型。
 */
export class Skeleton3DController {
  private readonly scene: THREE.Scene;
  private readonly skeletonGroup = new THREE.Group();
  private readonly jointSpheres: THREE.Mesh[] = [];
  private readonly boneTubes: THREE.Mesh[] = [];
  private readonly upVector = new THREE.Vector3(0, 1, 0);

  // 解剖学中枢与脊柱网格 (中央主脊椎、单轴颈椎、锁骨/骨盆支架、头部立体光球)
  private spineTube: THREE.Mesh | null = null;
  private neckTube: THREE.Mesh | null = null;
  private clavicleLeftTube: THREE.Mesh | null = null;
  private clavicleRightTube: THREE.Mesh | null = null;
  private pelvisLeftTube: THREE.Mesh | null = null;
  private pelvisRightTube: THREE.Mesh | null = null;
  private headMesh: THREE.Mesh | null = null;
  private neckSphere: THREE.Mesh | null = null;
  private pelvisSphere: THREE.Mesh | null = null;

  // 1€ Filter 实例数组，每个关节独立维护时空自适应滤波状态
  private jointFilters: OneEuroFilter3D[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    scene.add(this.skeletonGroup);
    this.init3DSkeletonVisualizer();
  }

  public init3DSkeletonVisualizer() {
    // 材质 1: 左侧肢体电光青蓝 (Motion Cyan)
    const matLeft = new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      emissive: 0x0891b2,
      emissiveIntensity: 0.9,
      roughness: 0.2,
      metalness: 0.2,
    });

    // 材质 2: 右侧肢体珊瑚暖粉 (Coral Rose)
    const matRight = new THREE.MeshStandardMaterial({
      color: 0xfb7185,
      emissive: 0xe11d48,
      emissiveIntensity: 0.9,
      roughness: 0.2,
      metalness: 0.2,
    });

    // 材质 3: 躯干中轴极光纯白 (Arctic White)
    const matTorso = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x64748b,
      emissiveIntensity: 0.8,
      roughness: 0.2,
      metalness: 0.1,
    });

    // 头部材质: 高透柔和未来感光球
    const matHead = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.55,
      roughness: 0.25,
      metalness: 0.15,
    });

    // 1. 33 个空间发光关节球 (严格屏蔽面部 0..10 杂点)
    const sphereGeoMajor = new THREE.SphereGeometry(0.024, 16, 16);
    const sphereGeoMinor = new THREE.SphereGeometry(0.016, 12, 12);

    for (let i = 0; i < 33; i++) {
      const geo = MAJOR_JOINTS.has(i) ? sphereGeoMajor : sphereGeoMinor;
      const mat = LEFT_JOINTS.has(i) ? matLeft : RIGHT_JOINTS.has(i) ? matRight : matTorso;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.jointSpheres.push(mesh);
      this.skeletonGroup.add(mesh);
      this.jointFilters.push(new OneEuroFilter3D(1.8, 0.45, 1.0));
    }

    // 2. 解剖学中枢主脊柱与单轴颈椎网格
    const spineTubeGeo = new THREE.CylinderGeometry(0.016, 0.016, 1, 10);
    const neckTubeGeo = new THREE.CylinderGeometry(0.013, 0.013, 1, 8);
    const clavicleTubeGeo = new THREE.CylinderGeometry(0.011, 0.011, 1, 8);

    this.spineTube = new THREE.Mesh(spineTubeGeo, matTorso);
    this.neckTube = new THREE.Mesh(neckTubeGeo, matTorso);
    this.clavicleLeftTube = new THREE.Mesh(clavicleTubeGeo, matTorso);
    this.clavicleRightTube = new THREE.Mesh(clavicleTubeGeo, matTorso);
    this.pelvisLeftTube = new THREE.Mesh(clavicleTubeGeo, matTorso);
    this.pelvisRightTube = new THREE.Mesh(clavicleTubeGeo, matTorso);

    this.neckSphere = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 16), matTorso);
    this.pelvisSphere = new THREE.Mesh(new THREE.SphereGeometry(0.024, 16, 16), matTorso);
    this.headMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 20), matHead);

    [
      this.spineTube,
      this.neckTube,
      this.clavicleLeftTube,
      this.clavicleRightTube,
      this.pelvisLeftTube,
      this.pelvisRightTube,
      this.neckSphere,
      this.pelvisSphere,
      this.headMesh,
    ].forEach((m) => {
      m.visible = false;
      this.skeletonGroup.add(m);
    });

    // 3. 四肢四段发光连线管 (按左右中肢体分别着色)
    const tubeGeo = new THREE.CylinderGeometry(0.011, 0.011, 1, 8);

    for (let i = 0; i < POSE_CONNECTIONS.length; i++) {
      const [from, to] = POSE_CONNECTIONS[i];
      let tubeMat = matTorso;
      if (LEFT_JOINTS.has(from) && LEFT_JOINTS.has(to)) {
        tubeMat = matLeft;
      } else if (RIGHT_JOINTS.has(from) && RIGHT_JOINTS.has(to)) {
        tubeMat = matRight;
      }
      const tube = new THREE.Mesh(tubeGeo, tubeMat);
      tube.visible = false;
      this.boneTubes.push(tube);
      this.skeletonGroup.add(tube);
    }
  }

  public resetSmoothing(): void {
    this.jointFilters.forEach((f) => f.reset());
  }

  /**
   * 统一驱动姿态更新：渲染 3D 发光线框骨骼。
   * 动作数据的出口是 BVH 导出，骨架本身只做可视化，不驱动任何角色模型。
   */
  public updatePose(
    poseLandmarks: any[],
    worldLandmarks: any[],
    isMirrored = false,
    timestampMs = performance.now()
  ): void {
    if (!poseLandmarks && !worldLandmarks) return;

    if (worldLandmarks && worldLandmarks.length > 0) {
      this.update3DSkeleton(worldLandmarks, isMirrored, true, timestampMs);
    } else if (poseLandmarks && poseLandmarks.length > 0) {
      this.update3DSkeleton(poseLandmarks, isMirrored, false, timestampMs);
    }
  }

  private updateTube(mesh: THREE.Mesh, p1: THREE.Vector3, p2: THREE.Vector3): void {
    const dist = p1.distanceTo(p2);
    if (dist < 0.005) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    mesh.position.copy(p1).add(p2).multiplyScalar(0.5);
    mesh.scale.set(1, dist, 1);
    const dir = new THREE.Vector3().subVectors(p2, p1).normalize();
    mesh.quaternion.setFromUnitVectors(this.upVector, dir);
  }

  /**
   * 3D 发光线框骨骼渲染与 1€ Filter 平滑
   */
  private update3DSkeleton(
    landmarks: any[],
    isMirrored = false,
    isWorld = true,
    timestampMs = performance.now()
  ): void {
    // 宽容置信度门限：0.15，防止舞步旋转或肢体交叠时连线忽明忽暗闪烁
    const active = landmarks.filter((lm) => (lm.visibility ?? 1) > 0.15);
    if (active.length < 4) {
      this.skeletonGroup.visible = false;
      return;
    }
    this.skeletonGroup.visible = true;

    const xs = active.map((lm) => lm.x);
    const ys = active.map((lm) => lm.y);
    const cx = xs.length ? xs.reduce((sum, value) => sum + value, 0) / xs.length : 0;
    const cy = ys.length ? ys.reduce((sum, value) => sum + value, 0) / ys.length : 0.5;

    const scale = isWorld ? 1.6 : 1.8;
    const xSign = isMirrored ? scale : -scale;

    const rawPoints = landmarks.map((lm) => {
      const rawX = isWorld ? lm.x - cx : lm.x - 0.5;
      const rawY = isWorld ? lm.y - cy : lm.y - 0.5;
      const rawZ = isWorld ? lm.z : lm.z || 0;

      return new THREE.Vector3(
        rawX * xSign,
        -rawY * scale + 0.95,
        -rawZ * scale
      );
    });

    // 采用 1€ Filter 进行时空自适应滤波 (微动防抖，大动作无延迟)
    const points = rawPoints.map((pt, idx) => {
      if (!this.jointFilters[idx]) {
        this.jointFilters[idx] = new OneEuroFilter3D(1.8, 0.45, 1.0);
      }
      const filtered = this.jointFilters[idx].filter(pt.x, pt.y, pt.z, timestampMs);
      return new THREE.Vector3(filtered.x, filtered.y, filtered.z);
    });

    // 解剖学手部延长：将腕部(15, 16)至指尖(19, 20)自然延展 1.32 倍，真实对齐舞者手掌与指尖
    if (points[15] && points[19]) {
      const dirLeft = new THREE.Vector3().subVectors(points[19], points[15]);
      points[19].addScaledVector(dirLeft, 0.32);
    }
    if (points[16] && points[20]) {
      const dirRight = new THREE.Vector3().subVectors(points[20], points[16]);
      points[20].addScaledVector(dirRight, 0.32);
    }

    // 更新关节球 (仅显示人体四肢及躯干核心关节，严格屏蔽面部 0..10 杂点)
    points.forEach((point, index) => {
      if (!this.jointSpheres[index]) return;
      this.jointSpheres[index].position.copy(point);
      const lm = landmarks[index];
      this.jointSpheres[index].visible =
        ANATOMICAL_JOINTS.has(index) && (lm?.visibility ?? 1) > 0.15;
    });

    // 计算解剖学中枢关键点 (颈椎 Neck, 头部 Head, 主脊柱 Spine)
    const p11 = points[11];
    const p12 = points[12];
    const p23 = points[23];
    const p24 = points[24];
    const p0 = points[0];
    const p7 = points[7];
    const p8 = points[8];

    const hasShoulders = p11 && p12 && (landmarks[11]?.visibility ?? 1) > 0.15 && (landmarks[12]?.visibility ?? 1) > 0.15;
    const hasHips = p23 && p24 && (landmarks[23]?.visibility ?? 1) > 0.15 && (landmarks[24]?.visibility ?? 1) > 0.15;

    const neckPt = hasShoulders
      ? new THREE.Vector3().addVectors(p11, p12).multiplyScalar(0.5)
      : null;

    const pelvisPt = hasHips
      ? new THREE.Vector3().addVectors(p23, p24).multiplyScalar(0.5)
      : null;

    let headPt: THREE.Vector3 | null = null;
    if (p7 && p8 && (landmarks[7]?.visibility ?? 1) > 0.15 && (landmarks[8]?.visibility ?? 1) > 0.15) {
      headPt = new THREE.Vector3().addVectors(p7, p8).multiplyScalar(0.5);
    } else if (p0 && (landmarks[0]?.visibility ?? 1) > 0.15) {
      headPt = p0.clone();
    }

    // 1. 更新主脊柱与锁骨骨盆横跨架 (中央纵梁与横向桥接)
    if (neckPt && pelvisPt) {
      if (this.spineTube) this.updateTube(this.spineTube, neckPt, pelvisPt);
      if (this.clavicleLeftTube && p11) this.updateTube(this.clavicleLeftTube, neckPt, p11);
      if (this.clavicleRightTube && p12) this.updateTube(this.clavicleRightTube, neckPt, p12);
      if (this.pelvisLeftTube && p23) this.updateTube(this.pelvisLeftTube, pelvisPt, p23);
      if (this.pelvisRightTube && p24) this.updateTube(this.pelvisRightTube, pelvisPt, p24);
      if (this.neckSphere) {
        this.neckSphere.position.copy(neckPt);
        this.neckSphere.visible = true;
      }
      if (this.pelvisSphere) {
        this.pelvisSphere.position.copy(pelvisPt);
        this.pelvisSphere.visible = true;
      }
    } else {
      if (this.spineTube) this.spineTube.visible = false;
      if (this.clavicleLeftTube) this.clavicleLeftTube.visible = false;
      if (this.clavicleRightTube) this.clavicleRightTube.visible = false;
      if (this.pelvisLeftTube) this.pelvisLeftTube.visible = false;
      if (this.pelvisRightTube) this.pelvisRightTube.visible = false;
      if (this.neckSphere) this.neckSphere.visible = false;
      if (this.pelvisSphere) this.pelvisSphere.visible = false;
    }

    // 2. 更新单轴颈椎与头部发光体 (消除帐篷形三角颈)
    if (neckPt && headPt) {
      if (this.neckTube) this.updateTube(this.neckTube, neckPt, headPt);
      if (this.headMesh) {
        this.headMesh.position.copy(headPt);
        const shoulderSpan = (p11 && p12) ? p11.distanceTo(p12) : 0.35;
        const hr = Math.max(0.05, Math.min(0.085, shoulderSpan * 0.19));
        this.headMesh.scale.set(hr, hr * 1.15, hr);
        this.headMesh.visible = true;
      }
    } else {
      if (this.neckTube) this.neckTube.visible = false;
      if (this.headMesh) this.headMesh.visible = false;
    }

    // 更新 3D 发光骨骼连线管
    POSE_CONNECTIONS.forEach(([start, end], index) => {
      const tube = this.boneTubes[index];
      if (!tube) return;
      const p1 = points[start];
      const p2 = points[end];
      const lm1 = landmarks[start];
      const lm2 = landmarks[end];
      if (!p1 || !p2 || (lm1?.visibility ?? 1) <= 0.15 || (lm2?.visibility ?? 1) <= 0.15) {
        tube.visible = false;
        return;
      }
      this.updateTube(tube, p1, p2);
    });
  }

  public dispose(): void {
    this.scene.remove(this.skeletonGroup);
    this.jointSpheres.forEach((m) => {
      m.geometry.dispose();
      if (Array.isArray(m.material)) m.material.forEach((mat) => mat.dispose());
      else m.material.dispose();
    });
    this.boneTubes.forEach((m) => {
      m.geometry.dispose();
      if (Array.isArray(m.material)) m.material.forEach((mat) => mat.dispose());
      else m.material.dispose();
    });

    const extraMeshes = [
      this.spineTube,
      this.neckTube,
      this.clavicleLeftTube,
      this.clavicleRightTube,
      this.pelvisLeftTube,
      this.pelvisRightTube,
      this.neckSphere,
      this.pelvisSphere,
      this.headMesh,
    ];
    extraMeshes.forEach((m) => {
      if (!m) return;
      m.geometry.dispose();
      if (Array.isArray(m.material)) m.material.forEach((mat) => mat.dispose());
      else m.material.dispose();
    });

    this.jointSpheres.length = 0;
    this.boneTubes.length = 0;
    this.jointFilters = [];
  }
}

// 别名导出兼容历史与通用引用
export { Skeleton3DController as VRMController };
