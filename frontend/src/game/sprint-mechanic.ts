/**
 * 冲刺机制 (sprint-mechanic)
 *
 * 任务 6.1: 冲刺段落数据解析
 * 任务 6.2: 冲刺触发与结束逻辑
 * 任务 6.3: 冲刺期间判定权重翻倍
 * 任务 6.4: 冲刺预警（开始前3秒倒计时）
 * 任务 6.5: 冲刺视觉与音效表现
 */

import type { SprintSection } from '@shared/protocol/track-data.js';
import type { TimelineIndex } from '../core/track-loader.js';
import {
  SPRINT_EFFICIENCY_MULTIPLIER,
  SPRINT_MISS_STAMINA_MULTIPLIER,
  SPRINT_WARNING_SECONDS,
} from '@shared/protocol/constants.js';

// ===== 6.1 冲刺段落数据解析 =====

/** 冲刺状态 */
export type SprintState = 'idle' | 'warning' | 'active' | 'ending';

/** 冲刺事件 */
export interface SprintEvent {
  type: 'warning_start' | 'countdown' | 'sprint_start' | 'sprint_end';
  countdown?: number; // 3, 2, 1
  section?: SprintSection;
}

export type SprintEventCallback = (event: SprintEvent) => void;

export class SprintMechanic {
  private sprintSections: SprintSection[] = [];
  private currentState: SprintState = 'idle';
  private currentSectionIdx: number = -1;
  private warningStartTime: number = -1;
  private lastCountdown: number = -1;
  private callbacks: SprintEventCallback[] = [];

  constructor(index: TimelineIndex) {
    // 6.1: 从曲目节拍数据中读取冲刺区间
    this.sprintSections = index.sprints;
  }

  /** 获取当前冲刺状态 */
  getState(): SprintState {
    return this.currentState;
  }

  /** 是否处于冲刺激活状态 */
  isActive(): boolean {
    return this.currentState === 'active';
  }

  /** 注册事件回调 */
  onEvent(callback: SprintEventCallback): void {
    this.callbacks.push(callback);
  }

  // ===== 6.2 冲刺触发与结束逻辑 =====

  /**
   * 每帧更新冲刺状态
   * @param currentTime 当前游戏时间（ms）
   */
  update(currentTime: number): void {
    // 找到当前相关的冲刺段落
    const nextSectionIdx = this.findRelevantSection(currentTime);

    if (nextSectionIdx === -1) {
      // 没有待处理的冲刺段落
      if (this.currentState === 'active') {
        this.endSprint();
      }
      return;
    }

    const section = this.sprintSections[nextSectionIdx];
    const warningTime = section.startTime - SPRINT_WARNING_SECONDS * 1000;

    // ===== 6.4 冲刺预警 =====
    if (currentTime >= warningTime && currentTime < section.startTime) {
      if (this.currentState !== 'warning') {
        this.currentState = 'warning';
        this.currentSectionIdx = nextSectionIdx;
        this.warningStartTime = warningTime;
        this.lastCountdown = SPRINT_WARNING_SECONDS + 1;
        this.emit({ type: 'warning_start', section });
      }

      // 倒计时 3, 2, 1
      const remaining = Math.ceil((section.startTime - currentTime) / 1000);
      if (remaining !== this.lastCountdown && remaining > 0 && remaining <= SPRINT_WARNING_SECONDS) {
        this.lastCountdown = remaining;
        this.emit({ type: 'countdown', countdown: remaining, section });
      }
    }
    // 冲刺开始
    else if (currentTime >= section.startTime && currentTime <= section.endTime) {
      if (this.currentState !== 'active') {
        this.startSprint(section);
      }
    }
    // 冲刺结束
    else if (currentTime > section.endTime && this.currentSectionIdx === nextSectionIdx) {
      if (this.currentState === 'active') {
        this.endSprint();
      }
    }
  }

  /** 触发冲刺开始 */
  private startSprint(section: SprintSection): void {
    this.currentState = 'active';
    this.emit({ type: 'sprint_start', section });
  }

  /** 触发冲刺结束 */
  private endSprint(): void {
    this.currentState = 'idle';
    this.currentSectionIdx = -1;
    this.lastCountdown = -1;
    this.emit({ type: 'sprint_end' });
  }

  /** 找到当前时间相关的冲刺段落索引 */
  private findRelevantSection(currentTime: number): number {
    for (let i = 0; i < this.sprintSections.length; i++) {
      const section = this.sprintSections[i];
      const warningTime = section.startTime - SPRINT_WARNING_SECONDS * 1000;
      // 如果当前时间在预警期到结束之间，这就是相关段落
      if (currentTime >= warningTime && currentTime <= section.endTime) {
        return i;
      }
      // 如果还没到预警期，返回这个作为下一个即将到来的
      if (currentTime < warningTime) {
        return -1; // 还没到，不需要处理
      }
    }
    return -1;
  }

  // ===== 6.3 冲刺期间判定权重翻倍 =====

  /**
   * 获取当前效率倍率
   * 冲刺时 ×2.0，非冲刺 ×1.0
   */
  getEfficiencyMultiplier(): number {
    return this.isActive() ? SPRINT_EFFICIENCY_MULTIPLIER : 1.0;
  }

  /**
   * 获取当前 Miss 体力惩罚倍率
   * 冲刺时 ×2.0，非冲刺 ×1.0
   */
  getMissStaminaMultiplier(): number {
    return this.isActive() ? SPRINT_MISS_STAMINA_MULTIPLIER : 1.0;
  }

  /** 发射事件 */
  private emit(event: SprintEvent): void {
    for (const cb of this.callbacks) {
      cb(event);
    }
  }

  /** 重置 */
  reset(): void {
    this.currentState = 'idle';
    this.currentSectionIdx = -1;
    this.warningStartTime = -1;
    this.lastCountdown = -1;
  }
}

// ===== 6.5 冲刺视觉与音效表现 =====

/**
 * 冲刺视觉效果渲染器
 */
export class SprintVisualRenderer {
  private state: SprintState = 'idle';
  private countdown: number = 0;
  private glowIntensity: number = 0;
  private sprintTextAlpha: number = 0;
  private sprintTextScale: number = 1;

  /** 更新状态 */
  setState(state: SprintState): void {
    if (state === 'active' && this.state !== 'active') {
      // 冲刺开始：显示 "SPRINT!" 文字
      this.sprintTextAlpha = 1;
      this.sprintTextScale = 2.0;
    }
    this.state = state;
  }

  /** 设置倒计时 */
  setCountdown(seconds: number): void {
    this.countdown = seconds;
  }

  /** 每帧更新 */
  update(dt: number): void {
    if (this.state === 'active') {
      // 泳道发光效果脉动
      this.glowIntensity = 0.5 + Math.sin(performance.now() / 200) * 0.3;
      // SPRINT 文字逐渐消退
      if (this.sprintTextAlpha > 0) {
        this.sprintTextAlpha -= dt / 1000;
        this.sprintTextScale = 1 + this.sprintTextAlpha;
      }
    } else if (this.state === 'warning') {
      this.glowIntensity = 0.2 + Math.sin(performance.now() / 400) * 0.1;
    } else {
      this.glowIntensity = 0;
      this.sprintTextAlpha = 0;
    }
  }

  /**
   * 渲染冲刺视觉效果
   */
  render(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): void {
    // 预警倒计时文字
    if (this.state === 'warning' && this.countdown > 0) {
      ctx.save();
      ctx.font = 'bold 64px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FFD700';
      ctx.shadowColor = '#FF8800';
      ctx.shadowBlur = 20;
      ctx.globalAlpha = 0.8;
      ctx.fillText(`${this.countdown}`, canvasWidth / 2, canvasHeight / 3);
      ctx.restore();
    }

    // 冲刺开始文字 "SPRINT!"
    if (this.sprintTextAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = this.sprintTextAlpha;
      ctx.translate(canvasWidth / 2, canvasHeight / 3);
      ctx.scale(this.sprintTextScale, this.sprintTextScale);
      ctx.font = 'bold 48px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FF4500';
      ctx.shadowColor = '#FF0000';
      ctx.shadowBlur = 30;
      ctx.fillText('SPRINT!', 0, 0);
      ctx.restore();
    }

    // 边框发光效果
    if (this.glowIntensity > 0) {
      ctx.save();
      ctx.globalAlpha = this.glowIntensity;
      ctx.strokeStyle = this.state === 'active' ? '#FF4500' : '#FFD700';
      ctx.lineWidth = 4;
      ctx.shadowColor = this.state === 'active' ? '#FF0000' : '#FF8800';
      ctx.shadowBlur = 20;
      ctx.strokeRect(2, 2, canvasWidth - 4, canvasHeight - 4);
      ctx.restore();
    }
  }
}
