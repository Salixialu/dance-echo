import {
  FilesetResolver,
  PoseLandmarker,
  type PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";
import { loadPreferences } from "../settings/appPreferences";

export class PoseDetectorService {
  private static instance: PoseDetectorService | null = null;
  private static initPromise: Promise<void> | null = null;

  public static getInstance(): PoseDetectorService {
    if (!PoseDetectorService.instance) {
      PoseDetectorService.instance = new PoseDetectorService();
    }
    return PoseDetectorService.instance;
  }

  private landmarker: PoseLandmarker | null = null;
  public isReady = false;
  private lastTimestamp = -1;
  private lastVideoTime = -1;
  private syntheticBase = 0;

  async init(onProgress?: (message: string) => void): Promise<void> {
    if (this.isReady) {
      onProgress?.("AI 引擎就绪");
      return;
    }

    if (PoseDetectorService.initPromise) {
      return PoseDetectorService.initPromise;
    }

    PoseDetectorService.initPromise = (async () => {
      try {
        onProgress?.("正在加载 MediaPipe WASM 运行环境...");
        let vision;
        try {
          // 优先尝试本地高性能 WASM 资产
          vision = await FilesetResolver.forVisionTasks("/wasm");
        } catch {
          // 容灾降级至公共 CDN
          vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm",
          );
        }

        const preferences = loadPreferences();
        // 默认用 Lite 模型：单帧推理约为 Full 的一半，骨架跟手性明显更好；
        // 在设置里可以切回 Full 追求精度。多人识别默认关闭（成本翻倍）。
        const modelVariant = preferences.poseQuality === "full" ? "full" : "lite";
        // 识别人数必须跟着「多人识别」开关走：PoseLandmarker 的 numPoses 直接决定
        // 每帧要跑几次 landmark 模型。以前这里写死 2，即使用户关着多人识别，
        // 实时附着也要付出双倍推理时间（实测单帧 ~46ms，30fps 的视频根本追不上），
        // 骨架因此比画面慢 2~3 帧。需要「锁定舞者」时再在设置里打开。
        const numPoses = preferences.allowMultiPose ? 2 : 1;
        onProgress?.(
          modelVariant === "full"
            ? "正在加载高精度 3D 人体姿态模型 (Full)..."
            : "正在加载极速 3D 人体姿态模型 (Lite)...",
        );
        // 优先使用本地模型，免除外部网络超时风险
        const localModelPath = `/models/pose_landmarker_${modelVariant}.task`;
        const cdnModelPath = `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${modelVariant}/float16/1/pose_landmarker_${modelVariant}.task`;

        let landmarkerInstance: PoseLandmarker | null = null;
        try {
          landmarkerInstance = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: localModelPath,
              delegate: "GPU",
            },
            runningMode: "VIDEO",
            numPoses,
            minPoseDetectionConfidence: 0.45,
            minPosePresenceConfidence: 0.45,
            minTrackingConfidence: 0.45,
          });
        } catch (localErr) {
          console.warn("Local model load failed, falling back to CDN:", localErr);
          landmarkerInstance = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: cdnModelPath,
              delegate: "GPU",
            },
            runningMode: "VIDEO",
            numPoses,
            minPoseDetectionConfidence: 0.45,
            minPosePresenceConfidence: 0.45,
            minTrackingConfidence: 0.45,
          });
        }

        this.landmarker = landmarkerInstance;
        this.isReady = true;
        onProgress?.("AI 引擎就绪");
      } catch (err) {
        PoseDetectorService.initPromise = null;
        throw err;
      }
    })();

    return PoseDetectorService.initPromise;
  }

  /**
   * 重置时间序列状态
   * 当视频发生拖拽 (Seek)、循环回跳或暂停切换时调用，消除内部卡尔曼位移漂移与时间戳单调冲突
   */
  public resetTimeline(): void {
    this.lastVideoTime = -1;
  }

  detectVideoFrame(
    source: HTMLVideoElement | HTMLCanvasElement,
    timestampMs?: number,
  ): PoseLandmarkerResult | null {
    if (!this.landmarker || !this.isReady) return null;

    try {
      // 优先采用视频真实解码帧时间戳
      const targetTime =
        typeof timestampMs === 'number' && Number.isFinite(timestampMs)
          ? Math.round(timestampMs)
          : Math.round(performance.now());

      // 处理视频快进/倒退/AB循环跳跃，平滑维护单调时间基线，防止 MediaPipe 报 timestamp must be greater 异常
      if (this.lastVideoTime >= 0) {
        const delta = targetTime - this.lastVideoTime;
        if (delta < -30 || delta > 1200) {
          // 视频发生跳跃或循环，调整虚拟时间基底
          this.syntheticBase += (this.lastTimestamp - targetTime) + 33;
        }
      }
      this.lastVideoTime = targetTime;

      const effectiveTimestamp = Math.max(
        targetTime + this.syntheticBase,
        this.lastTimestamp + 1
      );
      this.lastTimestamp = effectiveTimestamp;

      return this.landmarker.detectForVideo(source as HTMLVideoElement, effectiveTimestamp);
    } catch (error) {
      console.warn("Pose detection error:", error);
      return null;
    }
  }
}
