/**
 * 1€ Filter (One Euro Filter)
 * 经典高精度低延迟动作捕捉滤波算法 (Casiez et al., CHI 2012)
 * 在低速/静止时启用低截止频率消除微动颤抖与抖动 (Jitter Reduction)；
 * 在高速舞步移动时根据速度自适应提高截止频率消除延迟 (Zero Lag on Fast Motion)。
 */

class LowPassFilter {
  private y: number | null = null;
  private s: number | null = null;

  public filter(value: number, alpha: number): number {
    if (this.y === null) {
      this.s = value;
      this.y = value;
      return value;
    }
    this.y = alpha * value + (1.0 - alpha) * this.s!;
    this.s = this.y;
    return this.y;
  }

  public reset(): void {
    this.y = null;
    this.s = null;
  }
}

export class OneEuroFilter {
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  private xFilter = new LowPassFilter();
  private dxFilter = new LowPassFilter();
  private lastTime: number | null = null;

  /**
   * @param minCutoff 最小截止频率 (Hz)，越低对静止抖动的过滤越强 (默认 1.0)
   * @param beta 速度敏感系数，越高在大动作/快速位移时延迟越低 (默认 0.05)
   * @param dCutoff 导数截止频率 (默认 1.0)
   */
  constructor(minCutoff = 1.0, beta = 0.05, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  private alpha(rate: number, cutoff: number): number {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    const te = 1.0 / rate;
    return 1.0 / (1.0 + tau / te);
  }

  public filter(value: number, timestampMs: number): number {
    if (this.lastTime === null) {
      this.lastTime = timestampMs;
      return this.xFilter.filter(value, 1.0);
    }

    const dt = Math.max(1e-4, (timestampMs - this.lastTime) / 1000);
    this.lastTime = timestampMs;
    const rate = 1.0 / dt;

    // 估算一阶微分导数
    const prevX = (this.xFilter as any).s ?? value;
    const dx = (value - prevX) * rate;
    const edx = this.dxFilter.filter(dx, this.alpha(rate, this.dCutoff));

    // 自适应截止频率
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.xFilter.filter(value, this.alpha(rate, cutoff));
  }

  public reset(): void {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.lastTime = null;
  }
}

export class OneEuroFilter3D {
  private fx: OneEuroFilter;
  private fy: OneEuroFilter;
  private fz: OneEuroFilter;

  constructor(minCutoff = 1.0, beta = 0.05, dCutoff = 1.0) {
    this.fx = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.fy = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.fz = new OneEuroFilter(minCutoff, beta, dCutoff);
  }

  public filter(x: number, y: number, z: number, timestampMs: number): { x: number; y: number; z: number } {
    return {
      x: this.fx.filter(x, timestampMs),
      y: this.fy.filter(y, timestampMs),
      z: this.fz.filter(z, timestampMs),
    };
  }

  public reset(): void {
    this.fx.reset();
    this.fy.reset();
    this.fz.reset();
  }
}
