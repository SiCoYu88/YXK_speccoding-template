/**
 * 判定结果即时反馈
 * 在判定完成后 16ms 内（1帧）展示判定等级文字和视觉特效
 */

import type { JudgeGrade } from '../game/judge.js';

/** 反馈粒子 */
interface FeedbackParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // 0-1, 1=刚生成
  color: string;
  size: number;
}

/** 判定反馈显示条目 */
interface FeedbackEntry {
  grade: JudgeGrade;
  time: number; // 创建时间 (performance.now())
  x: number;
  y: number;
  alpha: number;
  scale: number;
  particles: FeedbackParticle[];
}

/** 各等级的颜色配置 */
const GRADE_COLORS: Record<JudgeGrade, { text: string; glow: string; particle: string }> = {
  perfect: { text: '#FFD700', glow: '#FFAA00', particle: '#FFEE88' },
  great: { text: '#00DDFF', glow: '#0088FF', particle: '#88DDFF' },
  good: { text: '#88FF88', glow: '#44CC44', particle: '#AAFFAA' },
  miss: { text: '#FF4444', glow: '#CC0000', particle: '#FF8888' },
};

/** 各等级的显示文字 */
const GRADE_TEXT: Record<JudgeGrade, string> = {
  perfect: 'PERFECT!',
  great: 'GREAT!',
  good: 'GOOD',
  miss: 'MISS',
};

const FEEDBACK_DURATION_MS = 600; // 反馈持续时间
const PARTICLE_COUNT = { perfect: 12, great: 8, good: 4, miss: 2 };

export class JudgeFeedback {
  private entries: FeedbackEntry[] = [];
  private defaultX: number = 0;
  private defaultY: number = 0;

  /**
   * 设置默认反馈位置（判定线位置）
   */
  setPosition(x: number, y: number): void {
    this.defaultX = x;
    this.defaultY = y;
  }

  /**
   * 触发判定反馈（必须在 16ms 内调用）
   */
  trigger(grade: JudgeGrade, x?: number, y?: number): void {
    const px = x ?? this.defaultX;
    const py = y ?? this.defaultY;

    const particles = this.createParticles(grade, px, py);

    this.entries.push({
      grade,
      time: performance.now(),
      x: px,
      y: py,
      alpha: 1,
      scale: 1.5, // 初始放大
      particles,
    });
  }

  /** 创建粒子特效 */
  private createParticles(grade: JudgeGrade, x: number, y: number): FeedbackParticle[] {
    const count = PARTICLE_COUNT[grade];
    const color = GRADE_COLORS[grade].particle;
    const particles: FeedbackParticle[] = [];

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = 1.5 + Math.random() * 2;

      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1, // 偏向上方
        life: 1,
        color,
        size: 3 + Math.random() * 3,
      });
    }

    return particles;
  }

  /**
   * 每帧更新
   * @param dt 帧时长 ms
   */
  update(dt: number): void {
    const now = performance.now();

    // 更新每个反馈条目
    for (const entry of this.entries) {
      const elapsed = now - entry.time;
      const progress = Math.min(1, elapsed / FEEDBACK_DURATION_MS);

      // 文字：先放大后缩小，逐渐上浮透明
      if (progress < 0.15) {
        entry.scale = 1.5 - progress * 3.3; // 1.5 → 1.0
      } else {
        entry.scale = 1.0;
      }
      entry.alpha = 1 - Math.pow(progress, 2);
      entry.y -= dt * 0.05; // 缓慢上浮

      // 粒子更新
      for (const p of entry.particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05; // 重力
        p.life -= dt / FEEDBACK_DURATION_MS;
        p.size *= 0.98;
      }
    }

    // 清理过期条目
    this.entries = this.entries.filter(e => now - e.time < FEEDBACK_DURATION_MS);
  }

  /**
   * 渲染反馈（在 Canvas 上绘制）
   */
  render(ctx: CanvasRenderingContext2D): void {
    for (const entry of this.entries) {
      const colors = GRADE_COLORS[entry.grade];
      const text = GRADE_TEXT[entry.grade];

      // 渲染粒子
      for (const p of entry.particles) {
        if (p.life <= 0) continue;
        ctx.save();
        ctx.globalAlpha = p.life * entry.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 渲染判定文字
      ctx.save();
      ctx.globalAlpha = entry.alpha;
      ctx.translate(entry.x, entry.y);
      ctx.scale(entry.scale, entry.scale);

      // 发光效果
      ctx.shadowColor = colors.glow;
      ctx.shadowBlur = 15;

      // 文字
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = colors.text;
      ctx.fillText(text, 0, 0);

      ctx.restore();
    }
  }

  /** 清空所有反馈 */
  clear(): void {
    this.entries = [];
  }
}
