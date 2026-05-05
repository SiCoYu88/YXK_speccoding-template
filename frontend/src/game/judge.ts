/**
 * 节奏判定评分核心
 * Perfect ±30ms、Great ±60ms、Good ±100ms、Miss >100ms
 */

import {
  JUDGE_PERFECT_MS,
  JUDGE_GREAT_MS,
  JUDGE_GOOD_MS,
} from '@shared/protocol/constants.js';

/** 判定等级 */
export type JudgeGrade = 'perfect' | 'great' | 'good' | 'miss';

/** 判定结果 */
export interface JudgeResult {
  /** 判定等级 */
  grade: JudgeGrade;
  /** 时间差（ms），正=晚，负=早 */
  delta: number;
  /** 音符 ID */
  noteId: number;
  /** 判定时的游戏时间 */
  judgeTime: number;
}

/**
 * 判定引擎
 * 将输入时间与目标节拍时间进行比对
 */
export class JudgeEngine {
  private results: JudgeResult[] = [];

  /**
   * 对一次输入进行判定
   * @param inputTime 玩家输入时间（ms）
   * @param noteTime 目标音符时间（ms）
   * @param noteId 音符 ID
   * @returns 判定结果
   */
  judge(inputTime: number, noteTime: number, noteId: number): JudgeResult {
    const delta = inputTime - noteTime; // 正=晚，负=早
    const absDelta = Math.abs(delta);

    let grade: JudgeGrade;

    if (absDelta <= JUDGE_PERFECT_MS) {
      grade = 'perfect';
    } else if (absDelta <= JUDGE_GREAT_MS) {
      grade = 'great';
    } else if (absDelta <= JUDGE_GOOD_MS) {
      grade = 'good';
    } else {
      grade = 'miss';
    }

    const result: JudgeResult = {
      grade,
      delta,
      noteId,
      judgeTime: inputTime,
    };

    this.results.push(result);
    return result;
  }

  /**
   * 对超时未输入的音符判定为 Miss
   * @param noteId 音符 ID
   * @param noteTime 音符目标时间
   * @param currentTime 当前游戏时间
   */
  judgeMiss(noteId: number, noteTime: number, currentTime: number): JudgeResult {
    const result: JudgeResult = {
      grade: 'miss',
      delta: currentTime - noteTime,
      noteId,
      judgeTime: currentTime,
    };

    this.results.push(result);
    return result;
  }

  /** 获取所有判定结果 */
  getResults(): readonly JudgeResult[] {
    return this.results;
  }

  /** 获取最后一次判定 */
  getLastResult(): JudgeResult | null {
    return this.results.length > 0 ? this.results[this.results.length - 1] : null;
  }

  /** 获取统计 */
  getStats(): { perfect: number; great: number; good: number; miss: number; total: number } {
    const stats = { perfect: 0, great: 0, good: 0, miss: 0, total: this.results.length };
    for (const r of this.results) {
      stats[r.grade]++;
    }
    return stats;
  }

  /** 获取准确率（Perfect + Great 占比） */
  getAccuracy(): number {
    if (this.results.length === 0) return 0;
    const stats = this.getStats();
    return (stats.perfect + stats.great) / stats.total;
  }

  /** 重置 */
  reset(): void {
    this.results = [];
  }
}
