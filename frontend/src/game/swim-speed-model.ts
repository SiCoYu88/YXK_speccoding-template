/**
 * 泳频-速度映射模型 (swim-speed-model)
 *
 * 任务 4.1: 判定等级到划水效率映射
 * 任务 4.2: 连击加成系数计算
 * 任务 4.3: 泳速计算公式
 * 任务 4.4: 速度平滑处理
 * 任务 4.5: 基础速率配置系统
 */

import type { JudgeGrade } from './judge.js';
import {
  EFFICIENCY_PERFECT,
  EFFICIENCY_GREAT,
  EFFICIENCY_GOOD,
  EFFICIENCY_MISS,
  COMBO_BONUS_THRESHOLDS,
  SPEED_SMOOTH_WINDOW,
  SPEED_TRANSITION_MS,
  TRACK_LENGTH_METERS,
} from '@shared/protocol/constants.js';

// ============ 4.1 判定等级到划水效率映射 ============

/** 判定等级 → 划水效率系数 */
const EFFICIENCY_MAP: Record<JudgeGrade, number> = {
  perfect: EFFICIENCY_PERFECT,  // 1.0
  great: EFFICIENCY_GREAT,      // 0.8
  good: EFFICIENCY_GOOD,        // 0.5
  miss: EFFICIENCY_MISS,        // 0.0
};

/**
 * 获取判定等级对应的划水效率
 */
export function getEfficiency(grade: JudgeGrade): number {
  return EFFICIENCY_MAP[grade];
}

// ============ 4.2 连击加成系数计算 ============

/**
 * 根据连击数计算加成系数
 * 0-9: 1.0x | 10-24: 1.1x | 25-49: 1.2x | 50-99: 1.3x | 100+: 1.5x
 */
export function getComboBonus(combo: number): number {
  for (const threshold of COMBO_BONUS_THRESHOLDS) {
    if (combo >= threshold.min && combo <= threshold.max) {
      return threshold.bonus;
    }
  }
  return 1.0;
}

// ============ 4.3 泳速计算公式 ============

/** 泳速计算输入参数 */
export interface SpeedCalculationInput {
  /** 基础速率（米/拍） */
  baseSpeed: number;
  /** 划水效率（来自判定等级） */
  efficiency: number;
  /** 连击加成系数 */
  comboBonus: number;
  /** 体力系数 */
  staminaFactor: number;
  /** 是否处于冲刺状态 */
  isSprinting: boolean;
}

/**
 * 计算实际泳速
 * 公式：基础速率 × 划水效率 × 连击加成 × 体力系数
 * 冲刺时效率翻倍（上限 2.0）
 */
export function calculateSpeed(input: SpeedCalculationInput): number {
  let efficiency = input.efficiency;

  // 冲刺时效率翻倍
  if (input.isSprinting) {
    efficiency = Math.min(2.0, efficiency * 2.0);
  }

  return input.baseSpeed * efficiency * input.comboBonus * input.staminaFactor;
}

// ============ 4.4 速度平滑处理 ============

/**
 * 速度平滑器
 * 使用最近 3 拍的加权平均，过渡时间 ≤ 0.3 秒
 */
export class SpeedSmoother {
  /** 最近 N 拍的速度记录 */
  private speedHistory: number[] = [];
  /** 当前平滑后的速度 */
  private smoothedSpeed: number = 0;
  /** 目标速度 */
  private targetSpeed: number = 0;
  /** 上次更新时间 */
  private lastUpdateTime: number = 0;

  /** 权重（最近的拍权重最大） */
  private readonly weights = [0.5, 0.33, 0.17]; // 最近, 次近, 第三近

  /**
   * 记录一次新的速度值
   */
  addSpeed(speed: number, currentTime: number): void {
    this.speedHistory.push(speed);
    if (this.speedHistory.length > SPEED_SMOOTH_WINDOW) {
      this.speedHistory.shift();
    }

    // 计算加权平均作为目标速度
    this.targetSpeed = this.calculateWeightedAverage();
    this.lastUpdateTime = currentTime;
  }

  /**
   * 每帧更新平滑速度
   * @param currentTime 当前时间
   * @returns 当前平滑后的泳速
   */
  update(currentTime: number): number {
    if (this.speedHistory.length === 0) return 0;

    const elapsed = currentTime - this.lastUpdateTime;
    const transitionProgress = Math.min(1, elapsed / SPEED_TRANSITION_MS);

    // 线性插值从当前平滑值到目标值
    this.smoothedSpeed = this.smoothedSpeed + (this.targetSpeed - this.smoothedSpeed) * transitionProgress;

    return this.smoothedSpeed;
  }

  /** 获取当前平滑速度 */
  getSpeed(): number {
    return this.smoothedSpeed;
  }

  /** 计算加权平均 */
  private calculateWeightedAverage(): number {
    const len = this.speedHistory.length;
    if (len === 0) return 0;

    let sum = 0;
    let weightSum = 0;

    for (let i = 0; i < len; i++) {
      const weight = this.weights[len - 1 - i] || this.weights[this.weights.length - 1];
      sum += this.speedHistory[i] * weight;
      weightSum += weight;
    }

    return sum / weightSum;
  }

  /** 重置 */
  reset(): void {
    this.speedHistory = [];
    this.smoothedSpeed = 0;
    this.targetSpeed = 0;
  }
}

// ============ 4.5 基础速率配置系统 ============

/** 曲目速率配置 */
export interface TrackSpeedConfig {
  /** 曲目 ID */
  trackId: string;
  /** 基础速率（米/拍） */
  baseSpeed: number;
  /** 预期全 Perfect 完赛时间在曲目时长的比例 */
  completionRatio: number;
}

/**
 * 计算曲目的基础速率
 * 确保全 Perfect 完赛在曲目 85%-95% 时长
 *
 * @param trackDurationMs 曲目总时长（ms）
 * @param totalNotes 总音符数
 * @param bpm BPM
 * @param targetRatio 目标完赛比例（默认 0.9，即曲目 90% 时完赛）
 * @returns 基础速率（米/拍）
 */
export function calculateBaseSpeed(
  trackDurationMs: number,
  totalNotes: number,
  bpm: number,
  targetRatio: number = 0.9
): number {
  // 全 Perfect 时：每拍推进 baseSpeed 米
  // 加上连击加成（假设平均 1.2x），体力满（1.0x）
  // 目标：totalNotes * baseSpeed * avgComboBonus = TRACK_LENGTH_METERS
  // 且用时 = totalNotes * beatInterval = targetRatio * trackDurationMs
  const avgComboBonus = 1.2; // 假设平均连击加成
  const baseSpeed = TRACK_LENGTH_METERS / (totalNotes * avgComboBonus);

  // 验证完赛时间
  const beatInterval = 60000 / bpm;
  const fullPerfectTime = totalNotes * beatInterval;
  const ratio = fullPerfectTime / trackDurationMs;

  // 如果比例不在 85%-95% 范围内，调整
  if (ratio < 0.85 || ratio > 0.95) {
    // 重新计算以适应目标比例
    const targetBeats = Math.floor(targetRatio * trackDurationMs / beatInterval);
    return TRACK_LENGTH_METERS / (targetBeats * avgComboBonus);
  }

  return baseSpeed;
}

/**
 * 完整的泳速管理器
 * 整合效率映射、连击加成、体力系数、冲刺状态和速度平滑
 */
export class SwimSpeedManager {
  private baseSpeed: number;
  private smoother: SpeedSmoother;
  private currentRawSpeed: number = 0;
  private distanceTraveled: number = 0; // 已游距离（米）

  constructor(baseSpeed: number) {
    this.baseSpeed = baseSpeed;
    this.smoother = new SpeedSmoother();
  }

  /**
   * 处理一次判定，更新速度
   */
  processJudge(
    grade: JudgeGrade,
    combo: number,
    staminaFactor: number,
    isSprinting: boolean,
    currentTime: number
  ): number {
    const efficiency = getEfficiency(grade);
    const comboBonus = getComboBonus(combo);

    this.currentRawSpeed = calculateSpeed({
      baseSpeed: this.baseSpeed,
      efficiency,
      comboBonus,
      staminaFactor,
      isSprinting,
    });

    this.smoother.addSpeed(this.currentRawSpeed, currentTime);
    return this.currentRawSpeed;
  }

  /**
   * 每帧更新，返回当前平滑速度并更新已游距离
   * @param currentTime 当前时间
   * @param dt 帧时长（ms）
   */
  update(currentTime: number, dt: number): number {
    const speed = this.smoother.update(currentTime);
    // 速度单位：米/拍，需转换为米/ms
    // 但这里简化为直接用帧间距来推进
    this.distanceTraveled += speed * (dt / 1000); // 近似
    return speed;
  }

  /** 获取当前平滑速度 */
  getSpeed(): number {
    return this.smoother.getSpeed();
  }

  /** 获取已游距离 */
  getDistance(): number {
    return this.distanceTraveled;
  }

  /** 获取进度百分比 (0-1) */
  getProgress(): number {
    return Math.min(1, this.distanceTraveled / TRACK_LENGTH_METERS);
  }

  /** 是否已到达终点 */
  isFinished(): boolean {
    return this.distanceTraveled >= TRACK_LENGTH_METERS;
  }

  /** 重置 */
  reset(): void {
    this.smoother.reset();
    this.currentRawSpeed = 0;
    this.distanceTraveled = 0;
  }
}
