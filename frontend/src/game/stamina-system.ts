/**
 * 体力与耐力系统 (stamina-system)
 *
 * 任务 5.1: 体力值管理（初始100，范围0-100）
 * 任务 5.2: 体力消耗规则
 * 任务 5.3: 体力对速度的影响
 * 任务 5.4: 体力恢复机制
 * 任务 5.5: 体力UI（进度条、警告）
 */

import type { JudgeGrade } from './judge.js';
import {
  STAMINA_MAX,
  STAMINA_INITIAL,
  STAMINA_DRAIN_PER_SECOND,
  STAMINA_MISS_PENALTY,
  STAMINA_CONSECUTIVE_MISS_EXTRA,
  STAMINA_CONSECUTIVE_MISS_THRESHOLD,
  STAMINA_SPEED_FACTORS,
  STAMINA_RECOVERY_PERFECT_STREAK,
  STAMINA_RECOVERY_PERFECT_AMOUNT,
  STAMINA_RECOVERY_COMBO_THRESHOLD,
  STAMINA_RECOVERY_COMBO_AMOUNT,
} from '@shared/protocol/constants.js';

/** 体力事件类型 */
export type StaminaEventType = 'drain' | 'miss_penalty' | 'recovery' | 'warning' | 'critical';

/** 体力事件 */
export interface StaminaEvent {
  type: StaminaEventType;
  value: number;       // 当前体力值
  change: number;      // 变化量（正=恢复，负=消耗）
  reason?: string;     // 原因描述
}

export type StaminaEventCallback = (event: StaminaEvent) => void;

export class StaminaSystem {
  // ===== 5.1 体力值管理 =====
  private currentStamina: number = STAMINA_INITIAL;
  private consecutiveMissCount: number = 0;
  private consecutivePerfectCount: number = 0;
  private comboRecoveryTriggered: boolean = false; // 防止同一次连击重复触发

  private callbacks: StaminaEventCallback[] = [];
  private lastUpdateTime: number = 0;

  /** 获取当前体力值 */
  getStamina(): number {
    return this.currentStamina;
  }

  /** 获取体力百分比 (0-1) */
  getStaminaPercent(): number {
    return this.currentStamina / STAMINA_MAX;
  }

  /** 注册事件回调 */
  onEvent(callback: StaminaEventCallback): void {
    this.callbacks.push(callback);
  }

  // ===== 5.2 体力消耗规则 =====

  /**
   * 每帧更新：基础体力消耗（0.5/秒）
   * @param currentTime 当前游戏时间（ms）
   */
  update(currentTime: number): void {
    if (this.lastUpdateTime === 0) {
      this.lastUpdateTime = currentTime;
      return;
    }

    const dt = (currentTime - this.lastUpdateTime) / 1000; // 转为秒
    this.lastUpdateTime = currentTime;

    // 基础消耗：每秒 0.5 点
    const drain = STAMINA_DRAIN_PER_SECOND * dt;
    this.applyChange(-drain, 'drain', '基础消耗');
  }

  /**
   * 处理判定结果对体力的影响
   */
  processJudge(grade: JudgeGrade, combo: number): void {
    if (grade === 'miss') {
      this.handleMiss();
    } else {
      this.consecutiveMissCount = 0;

      if (grade === 'perfect') {
        this.handlePerfect();
      } else {
        this.consecutivePerfectCount = 0;
      }

      // 检查连击恢复
      this.checkComboRecovery(combo);
    }
  }

  /** Miss 额外消耗 */
  private handleMiss(): void {
    this.consecutivePerfectCount = 0;
    this.consecutiveMissCount++;

    // Miss 额外消耗 3 点
    let penalty = STAMINA_MISS_PENALTY;

    // 连续 3+ 次 Miss 额外再消耗 2 点
    if (this.consecutiveMissCount >= STAMINA_CONSECUTIVE_MISS_THRESHOLD) {
      penalty += STAMINA_CONSECUTIVE_MISS_EXTRA;
    }

    this.applyChange(-penalty, 'miss_penalty', `Miss惩罚(连续${this.consecutiveMissCount}次)`);
  }

  // ===== 5.4 体力恢复机制 =====

  /** 连续 Perfect 恢复 */
  private handlePerfect(): void {
    this.consecutivePerfectCount++;

    if (this.consecutivePerfectCount >= STAMINA_RECOVERY_PERFECT_STREAK) {
      this.applyChange(STAMINA_RECOVERY_PERFECT_AMOUNT, 'recovery', `连续${STAMINA_RECOVERY_PERFECT_STREAK}次Perfect`);
      this.consecutivePerfectCount = 0; // 重置计数
    }
  }

  /** 连击达到 50 时恢复 */
  private checkComboRecovery(combo: number): void {
    if (combo >= STAMINA_RECOVERY_COMBO_THRESHOLD && !this.comboRecoveryTriggered) {
      this.applyChange(STAMINA_RECOVERY_COMBO_AMOUNT, 'recovery', `连击${STAMINA_RECOVERY_COMBO_THRESHOLD}达成`);
      this.comboRecoveryTriggered = true;
    }

    // 如果连击重置了（combo < threshold），允许下次再触发
    if (combo < STAMINA_RECOVERY_COMBO_THRESHOLD) {
      this.comboRecoveryTriggered = false;
    }
  }

  // ===== 5.3 体力对速度的影响 =====

  /**
   * 获取当前体力系数
   * >60: 1.0 | 30-60: 0.8 | 10-30: 0.6 | <10: 0.4
   */
  getSpeedFactor(): number {
    for (const { minStamina, factor } of STAMINA_SPEED_FACTORS) {
      if (this.currentStamina >= minStamina) {
        return factor;
      }
    }
    return 0.4; // 兜底
  }

  // ===== 内部方法 =====

  /** 应用体力变化（带钳制） */
  private applyChange(amount: number, type: StaminaEventType, reason: string): void {
    const oldStamina = this.currentStamina;
    this.currentStamina = Math.max(0, Math.min(STAMINA_MAX, this.currentStamina + amount));
    const actualChange = this.currentStamina - oldStamina;

    if (Math.abs(actualChange) > 0.001) {
      this.emit({ type, value: this.currentStamina, change: actualChange, reason });
    }

    // 检查警告阈值
    if (oldStamina >= 30 && this.currentStamina < 30) {
      this.emit({ type: 'warning', value: this.currentStamina, change: 0, reason: '体力低于30' });
    }
    if (oldStamina >= 10 && this.currentStamina < 10) {
      this.emit({ type: 'critical', value: this.currentStamina, change: 0, reason: '体力低于10' });
    }
  }

  private emit(event: StaminaEvent): void {
    for (const cb of this.callbacks) {
      cb(event);
    }
  }

  /** 设置冲刺状态（冲刺时 Miss 消耗翻倍通过外部调用 processJudge 前修改） */

  /** 重置 */
  reset(): void {
    this.currentStamina = STAMINA_INITIAL;
    this.consecutiveMissCount = 0;
    this.consecutivePerfectCount = 0;
    this.comboRecoveryTriggered = false;
    this.lastUpdateTime = 0;
  }
}

// ===== 5.5 体力UI =====

/** 体力条渲染参数 */
export interface StaminaBarConfig {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 体力条渲染器
 */
export class StaminaBarRenderer {
  private config: StaminaBarConfig;
  private flashTimer: number = 0;
  private isFlashing: boolean = false;

  constructor(config: StaminaBarConfig) {
    this.config = config;
  }

  /**
   * 每帧更新
   */
  update(dt: number, stamina: number): void {
    // 低于 30 时闪烁（每秒 2 次 = 每 250ms 切换）
    if (stamina < 30) {
      this.flashTimer += dt;
      if (this.flashTimer >= 250) {
        this.isFlashing = !this.isFlashing;
        this.flashTimer = 0;
      }
    } else {
      this.isFlashing = false;
      this.flashTimer = 0;
    }
  }

  /**
   * 渲染体力条
   */
  render(ctx: CanvasRenderingContext2D, stamina: number): void {
    const { x, y, width, height } = this.config;
    const percent = stamina / STAMINA_MAX;

    // 背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(x, y, width, height);

    // 边框
    ctx.strokeStyle = stamina < 30 && this.isFlashing ? '#FF0000' : '#444';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);

    // 填充色（根据体力分档变色）
    let fillColor: string;
    if (stamina > 60) {
      fillColor = '#4ade80'; // 绿色
    } else if (stamina > 30) {
      fillColor = '#facc15'; // 黄色
    } else if (stamina > 10) {
      fillColor = this.isFlashing ? '#FF0000' : '#f87171'; // 红色闪烁
    } else {
      fillColor = this.isFlashing ? '#FF0000' : '#991b1b'; // 深红闪烁
    }

    // 填充
    const fillWidth = width * percent;
    ctx.fillStyle = fillColor;
    ctx.fillRect(x + 1, y + 1, fillWidth - 2, height - 2);

    // 文字
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(`${Math.round(stamina)}`, x + width / 2, y + height / 2);
  }
}
