/**
 * 游泳赛道可视化 (swimming-track)
 *
 * 任务 8.1: 泳道分配与渲染
 * 任务 8.2: 玩家位置同步与显示
 * 任务 8.3: 游泳动画状态机
 * 任务 8.4: Miss 失误动画反馈
 * 任务 8.5: 赛道顶部进度条
 * 任务 8.6: 玩家到达终点动画
 */

import type { PlayerPositionData, AnimState } from '@shared/protocol/messages.js';
import { ROOM_MAX_PLAYERS, TRACK_LENGTH_METERS } from '@shared/protocol/constants.js';

// ===== 8.3 游泳动画状态机 =====

/** 动画帧配置 */
interface AnimConfig {
  frameCount: number;
  frameDuration: number; // ms per frame
  color: string;
}

const ANIM_CONFIGS: Record<AnimState, AnimConfig> = {
  idle: { frameCount: 2, frameDuration: 500, color: '#60a5fa' },
  normal: { frameCount: 4, frameDuration: 200, color: '#3b82f6' },
  fast: { frameCount: 4, frameDuration: 120, color: '#2563eb' },
  sprint: { frameCount: 6, frameDuration: 80, color: '#f59e0b' },
  fatigued: { frameCount: 3, frameDuration: 350, color: '#94a3b8' },
  still: { frameCount: 1, frameDuration: 1000, color: '#6b7280' },
};

/** 泳道中的单个选手 */
interface SwimmerState {
  id: string;
  name: string;
  lane: number;
  progress: number; // 0-1
  speed: number;
  animState: AnimState;
  targetAnimState: AnimState;
  animFrame: number;
  animTimer: number;
  transitionTimer: number; // 动画过渡计时
  isLocal: boolean;
  finished: boolean;
  finishAnimTimer: number;
  // 8.4 Miss 动画
  missAnimTimer: number;
  isMissing: boolean;
}

// ===== 主渲染器 =====

export class SwimmingTrackRenderer {
  private swimmers: Map<string, SwimmerState> = new Map();
  private localPlayerId: string = '';
  private canvasWidth: number = 0;
  private canvasHeight: number = 0;

  // 赛道布局
  private trackTop: number = 80;     // 进度条下方
  private trackBottom: number = 0;
  private laneHeight: number = 0;

  constructor() {}

  /** 设置本地玩家 ID */
  setLocalPlayer(playerId: string): void {
    this.localPlayerId = playerId;
  }

  /** 更新画布尺寸 */
  updateSize(width: number, height: number): void {
    this.canvasWidth = width;
    this.canvasHeight = height;
    this.trackBottom = height - 100; // 底部留给输入面板
    this.laneHeight = (this.trackBottom - this.trackTop) / ROOM_MAX_PLAYERS;
  }

  // ===== 8.1 泳道分配与渲染 =====

  /**
   * 初始化选手
   */
  initSwimmers(players: { id: string; name: string; lane: number }[]): void {
    this.swimmers.clear();
    for (const p of players) {
      this.swimmers.set(p.id, {
        id: p.id,
        name: p.name,
        lane: p.lane,
        progress: 0,
        speed: 0,
        animState: 'idle',
        targetAnimState: 'idle',
        animFrame: 0,
        animTimer: 0,
        transitionTimer: 0,
        isLocal: p.id === this.localPlayerId,
        finished: false,
        finishAnimTimer: 0,
        missAnimTimer: 0,
        isMissing: false,
      });
    }
  }

  // ===== 8.2 玩家位置同步与显示 =====

  /**
   * 更新玩家位置数据（来自服务端同步）
   */
  updatePositions(players: PlayerPositionData[]): void {
    for (const data of players) {
      const swimmer = this.swimmers.get(data.id);
      if (swimmer) {
        swimmer.progress = data.progress;
        swimmer.speed = data.speed;
        swimmer.targetAnimState = data.animState;
      }
    }
  }

  // ===== 8.4 Miss 失误动画 =====

  /** 触发 Miss 动画 */
  triggerMissAnimation(playerId: string): void {
    const swimmer = this.swimmers.get(playerId);
    if (swimmer) {
      swimmer.isMissing = true;
      swimmer.missAnimTimer = 500; // 0.5 秒
    }
  }

  // ===== 8.6 玩家到达终点 =====

  /** 触发终点动画 */
  triggerFinishAnimation(playerId: string): void {
    const swimmer = this.swimmers.get(playerId);
    if (swimmer) {
      swimmer.finished = true;
      swimmer.finishAnimTimer = 2000; // 2 秒庆祝动画
    }
  }

  /**
   * 每帧更新
   */
  update(dt: number): void {
    for (const [, swimmer] of this.swimmers) {
      // 8.3 动画状态机过渡（0.2秒平滑）
      if (swimmer.animState !== swimmer.targetAnimState) {
        swimmer.transitionTimer += dt;
        if (swimmer.transitionTimer >= 200) {
          swimmer.animState = swimmer.targetAnimState;
          swimmer.transitionTimer = 0;
          swimmer.animFrame = 0;
        }
      }

      // 动画帧更新
      const config = ANIM_CONFIGS[swimmer.animState];
      swimmer.animTimer += dt;
      if (swimmer.animTimer >= config.frameDuration) {
        swimmer.animTimer = 0;
        swimmer.animFrame = (swimmer.animFrame + 1) % config.frameCount;
      }

      // Miss 动画计时
      if (swimmer.isMissing) {
        swimmer.missAnimTimer -= dt;
        if (swimmer.missAnimTimer <= 0) {
          swimmer.isMissing = false;
        }
      }

      // 终点动画计时
      if (swimmer.finished && swimmer.finishAnimTimer > 0) {
        swimmer.finishAnimTimer -= dt;
      }
    }
  }

  /**
   * 渲染赛道
   */
  render(ctx: CanvasRenderingContext2D): void {
    this.renderLanes(ctx);
    this.renderSwimmers(ctx);
    this.renderProgressBar(ctx);
  }

  /** 渲染泳道背景 */
  private renderLanes(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < ROOM_MAX_PLAYERS; i++) {
      const y = this.trackTop + i * this.laneHeight;

      // 泳道背景（交替颜色）
      ctx.fillStyle = i % 2 === 0 ? 'rgba(30, 58, 138, 0.3)' : 'rgba(30, 64, 175, 0.2)';
      ctx.fillRect(0, y, this.canvasWidth, this.laneHeight);

      // 泳道分隔线
      ctx.strokeStyle = 'rgba(96, 165, 250, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y + this.laneHeight);
      ctx.lineTo(this.canvasWidth, y + this.laneHeight);
      ctx.stroke();
    }

    // 起点线
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(60, this.trackTop);
    ctx.lineTo(60, this.trackBottom);
    ctx.stroke();

    // 终点线
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(this.canvasWidth - 40, this.trackTop);
    ctx.lineTo(this.canvasWidth - 40, this.trackBottom);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /** 渲染选手 */
  private renderSwimmers(ctx: CanvasRenderingContext2D): void {
    for (const [, swimmer] of this.swimmers) {
      const laneY = this.trackTop + (swimmer.lane - 1) * this.laneHeight;
      const laneCenter = laneY + this.laneHeight / 2;

      // 计算选手X位置
      const startX = 60;
      const endX = this.canvasWidth - 40;
      const x = startX + (endX - startX) * swimmer.progress;

      // 本地玩家泳道高亮
      if (swimmer.isLocal) {
        ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
        ctx.fillRect(0, laneY, this.canvasWidth, this.laneHeight);
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, laneY + 1, this.canvasWidth - 2, this.laneHeight - 2);
      }

      // Miss 动画效果
      if (swimmer.isMissing) {
        ctx.save();
        ctx.globalAlpha = 0.6;
        // 溅水效果
        ctx.fillStyle = '#93c5fd';
        for (let i = 0; i < 5; i++) {
          const sx = x + (Math.random() - 0.5) * 30;
          const sy = laneCenter + (Math.random() - 0.5) * 20;
          ctx.beginPath();
          ctx.arc(sx, sy, 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // 选手身体
      const config = ANIM_CONFIGS[swimmer.animState];
      const bodyOffset = Math.sin(swimmer.animFrame * Math.PI / 2) * 3; // 上下摆动

      ctx.save();
      ctx.fillStyle = swimmer.isLocal ? '#60a5fa' : config.color;
      ctx.beginPath();
      ctx.ellipse(x, laneCenter + bodyOffset, 15, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      // 手臂（划水动画）
      const armAngle = (swimmer.animFrame / config.frameCount) * Math.PI * 2;
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, laneCenter + bodyOffset);
      ctx.lineTo(x + Math.cos(armAngle) * 12, laneCenter + bodyOffset + Math.sin(armAngle) * 10);
      ctx.stroke();
      ctx.restore();

      // 终点庆祝动画
      if (swimmer.finished && swimmer.finishAnimTimer > 0) {
        ctx.save();
        ctx.globalAlpha = swimmer.finishAnimTimer / 2000;
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fbbf24';
        ctx.fillText('🏆', x, laneY + 15);
        ctx.restore();
      }

      // 名字标签
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = swimmer.isLocal ? '#93c5fd' : '#94a3b8';
      ctx.fillText(swimmer.name, x, laneY + this.laneHeight - 4);
    }
  }

  // ===== 8.5 赛道顶部进度条 =====

  /** 渲染进度条 */
  private renderProgressBar(ctx: CanvasRenderingContext2D): void {
    const barX = 40;
    const barY = 20;
    const barWidth = this.canvasWidth - 80;
    const barHeight = 30;

    // 背景
    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
    ctx.fillRect(barX, barY, barWidth, barHeight);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barWidth, barHeight);

    // 赛道标记
    ctx.fillStyle = '#475569';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i <= 10; i++) {
      const x = barX + (barWidth * i) / 10;
      ctx.fillRect(x, barY + barHeight - 4, 1, 4);
      if (i % 5 === 0) {
        ctx.fillText(`${i * 5}m`, x, barY + barHeight + 12);
      }
    }

    // 玩家位置标记（≥10fps 刷新，由外部调用 update 保证）
    const sortedSwimmers = [...this.swimmers.values()].sort((a, b) => b.progress - a.progress);

    for (let i = 0; i < sortedSwimmers.length; i++) {
      const swimmer = sortedSwimmers[i];
      const markerX = barX + barWidth * swimmer.progress;
      const markerY = barY + barHeight / 2;

      // 标记点
      ctx.beginPath();
      ctx.arc(markerX, markerY, swimmer.isLocal ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = swimmer.isLocal ? '#3b82f6' : '#64748b';
      ctx.fill();

      // 本地玩家名次
      if (swimmer.isLocal) {
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fbbf24';
        ctx.fillText(`#${i + 1}`, markerX, barY - 4);
      }
    }
  }
}
