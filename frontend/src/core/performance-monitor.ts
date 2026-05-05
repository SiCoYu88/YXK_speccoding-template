/**
 * 性能监控与优化
 *
 * 任务 11.5: 确保10人同屏+音画同步的帧率稳定在60fps
 *
 * 策略：
 * 1. 帧率监控与自适应渲染质量
 * 2. 对象池复用（减少 GC 压力）
 * 3. 渲染分级（帧率低时降低视觉效果复杂度）
 * 4. 异步任务分帧（避免单帧卡顿）
 */

// ===== 帧率监控 =====

export class PerformanceMonitor {
  private frameTimes: number[] = [];
  private lastFrameTime: number = 0;
  private fps: number = 60;
  private frameCount: number = 0;
  private fpsUpdateInterval: number = 500; // 每 500ms 更新一次 FPS
  private lastFpsUpdate: number = 0;
  private readonly HISTORY_SIZE = 60;

  /** 质量等级 */
  private qualityLevel: QualityLevel = 'high';

  /** 帧开始 */
  beginFrame(timestamp: number): number {
    const dt = this.lastFrameTime > 0 ? timestamp - this.lastFrameTime : 16.67;
    this.lastFrameTime = timestamp;
    this.frameCount++;

    // 更新 FPS
    if (timestamp - this.lastFpsUpdate >= this.fpsUpdateInterval) {
      this.fps = (this.frameCount * 1000) / (timestamp - this.lastFpsUpdate);
      this.frameCount = 0;
      this.lastFpsUpdate = timestamp;

      // 记录帧时间历史
      this.frameTimes.push(dt);
      if (this.frameTimes.length > this.HISTORY_SIZE) {
        this.frameTimes.shift();
      }

      // 自适应质量调整
      this.adjustQuality();
    }

    return dt;
  }

  /** 获取当前 FPS */
  getFPS(): number {
    return Math.round(this.fps);
  }

  /** 获取平均帧时间 */
  getAverageFrameTime(): number {
    if (this.frameTimes.length === 0) return 16.67;
    return this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
  }

  /** 获取当前质量等级 */
  getQualityLevel(): QualityLevel {
    return this.qualityLevel;
  }

  /** 自适应质量调整 */
  private adjustQuality(): void {
    if (this.fps >= 55) {
      // 帧率良好，可以提升质量
      if (this.qualityLevel === 'low') this.qualityLevel = 'medium';
      else if (this.qualityLevel === 'medium') this.qualityLevel = 'high';
    } else if (this.fps < 45) {
      // 帧率不足，降低质量
      if (this.qualityLevel === 'high') this.qualityLevel = 'medium';
      else if (this.qualityLevel === 'medium') this.qualityLevel = 'low';
    }
  }

  /** 渲染性能覆盖层（调试用） */
  renderDebugOverlay(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.save();
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = this.fps >= 55 ? '#4ade80' : this.fps >= 30 ? '#facc15' : '#ef4444';
    ctx.fillText(`FPS: ${this.getFPS()}`, x, y);
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`Quality: ${this.qualityLevel}`, x, y + 15);
    ctx.fillText(`Frame: ${this.getAverageFrameTime().toFixed(1)}ms`, x, y + 30);
    ctx.restore();
  }
}

// ===== 质量分级 =====

export type QualityLevel = 'high' | 'medium' | 'low';

/** 各质量等级的渲染配置 */
export const QUALITY_CONFIGS: Record<QualityLevel, QualityConfig> = {
  high: {
    particleCount: 1.0,       // 粒子数量倍率
    shadowEnabled: true,      // 阴影/发光效果
    animSmoothing: true,      // 动画平滑插值
    waterEffects: true,       // 水面特效
    trailEffects: true,       // 轨迹特效
    maxVisibleNotes: 20,      // 同屏最大音符数
  },
  medium: {
    particleCount: 0.5,
    shadowEnabled: false,
    animSmoothing: true,
    waterEffects: false,
    trailEffects: true,
    maxVisibleNotes: 15,
  },
  low: {
    particleCount: 0.25,
    shadowEnabled: false,
    animSmoothing: false,
    waterEffects: false,
    trailEffects: false,
    maxVisibleNotes: 10,
  },
};

export interface QualityConfig {
  particleCount: number;
  shadowEnabled: boolean;
  animSmoothing: boolean;
  waterEffects: boolean;
  trailEffects: boolean;
  maxVisibleNotes: number;
}

// ===== 对象池 =====

/**
 * 通用对象池
 * 减少频繁创建/销毁对象带来的 GC 压力
 */
export class ObjectPool<T> {
  private pool: T[] = [];
  private factory: () => T;
  private reset: (obj: T) => void;

  constructor(factory: () => T, reset: (obj: T) => void, initialSize: number = 32) {
    this.factory = factory;
    this.reset = reset;

    // 预分配
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(factory());
    }
  }

  /** 获取一个对象 */
  acquire(): T {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return this.factory();
  }

  /** 归还一个对象 */
  release(obj: T): void {
    this.reset(obj);
    this.pool.push(obj);
  }

  /** 获取池中可用数量 */
  getAvailable(): number {
    return this.pool.length;
  }
}

// ===== 批量渲染优化 =====

/**
 * 渲染批处理器
 * 将相同类型的绘制操作合并，减少 Canvas 状态切换
 */
export class RenderBatcher {
  private batches: Map<string, { fillStyle: string; rects: { x: number; y: number; w: number; h: number }[] }> = new Map();

  /** 添加矩形到批次 */
  addRect(style: string, x: number, y: number, w: number, h: number): void {
    if (!this.batches.has(style)) {
      this.batches.set(style, { fillStyle: style, rects: [] });
    }
    this.batches.get(style)!.rects.push({ x, y, w, h });
  }

  /** 一次性渲染所有批次 */
  flush(ctx: CanvasRenderingContext2D): void {
    for (const [, batch] of this.batches) {
      ctx.fillStyle = batch.fillStyle;
      for (const rect of batch.rects) {
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      }
      batch.rects.length = 0;
    }
  }

  /** 清空 */
  clear(): void {
    for (const [, batch] of this.batches) {
      batch.rects.length = 0;
    }
  }
}
