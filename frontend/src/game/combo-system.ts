/**
 * 连击系统
 * - 连续非 Miss 判定时连击数累加
 * - Miss 时重置为 0
 * - 达到里程碑时触发特殊事件
 */

import { COMBO_MILESTONES } from '@shared/protocol/constants.js';
import type { JudgeGrade } from './judge.js';

/** 连击事件类型 */
export type ComboEventType = 'increment' | 'break' | 'milestone';

/** 连击事件 */
export interface ComboEvent {
  type: ComboEventType;
  combo: number;
  milestone?: number; // 仅 type='milestone' 时
}

/** 连击事件回调 */
export type ComboEventCallback = (event: ComboEvent) => void;

export class ComboSystem {
  private currentCombo: number = 0;
  private maxCombo: number = 0;
  private callbacks: ComboEventCallback[] = [];

  /** 获取当前连击数 */
  getCombo(): number {
    return this.currentCombo;
  }

  /** 获取最高连击数 */
  getMaxCombo(): number {
    return this.maxCombo;
  }

  /**
   * 注册连击事件回调
   */
  onEvent(callback: ComboEventCallback): void {
    this.callbacks.push(callback);
  }

  /**
   * 处理判定结果
   * @param grade 判定等级
   */
  processGrade(grade: JudgeGrade): void {
    if (grade === 'miss') {
      this.breakCombo();
    } else {
      this.incrementCombo();
    }
  }

  /** 连击 +1 */
  private incrementCombo(): void {
    this.currentCombo++;
    if (this.currentCombo > this.maxCombo) {
      this.maxCombo = this.currentCombo;
    }

    this.emit({ type: 'increment', combo: this.currentCombo });

    // 检查是否达到里程碑
    for (const milestone of COMBO_MILESTONES) {
      if (this.currentCombo === milestone) {
        this.emit({ type: 'milestone', combo: this.currentCombo, milestone });
        break;
      }
    }
  }

  /** 连击中断 */
  private breakCombo(): void {
    if (this.currentCombo > 0) {
      this.emit({ type: 'break', combo: 0 });
    }
    this.currentCombo = 0;
  }

  /** 发射事件 */
  private emit(event: ComboEvent): void {
    for (const cb of this.callbacks) {
      cb(event);
    }
  }

  /** 重置 */
  reset(): void {
    this.currentCombo = 0;
    this.maxCombo = 0;
  }
}
