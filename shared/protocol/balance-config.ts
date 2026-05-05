/**
 * 数值平衡配置
 *
 * 任务 11.4: 数值平衡调优
 *
 * 所有影响游戏体验的数值参数集中管理
 * 便于迭代调优和 A/B 测试
 */

export interface BalanceConfig {
  // ===== 体力系统 =====
  stamina: {
    /** 初始/最大体力 */
    max: number;
    /** 基础消耗（点/秒） */
    drainPerSecond: number;
    /** Miss 额外消耗 */
    missPenalty: number;
    /** 连续 Miss (≥N次) 额外消耗 */
    consecutiveMissThreshold: number;
    consecutiveMissExtra: number;
    /** 连续 Perfect 恢复（次数 → 恢复量） */
    perfectStreakCount: number;
    perfectStreakRecovery: number;
    /** 连击恢复（达到次数 → 恢复量） */
    comboRecoveryThreshold: number;
    comboRecoveryAmount: number;
    /** 体力系数分档 */
    speedFactors: { minStamina: number; factor: number }[];
  };

  // ===== 连击加成 =====
  combo: {
    /** 加成阈值 */
    bonusThresholds: { min: number; max: number; bonus: number }[];
    /** 里程碑触发点 */
    milestones: number[];
  };

  // ===== 速度系统 =====
  speed: {
    /** 速度平滑窗口（拍数） */
    smoothWindow: number;
    /** 最大过渡时间 (ms) */
    transitionMs: number;
    /** 赛道长度 (米) */
    trackLength: number;
  };

  // ===== 冲刺系统 =====
  sprint: {
    /** 效率倍率 */
    efficiencyMultiplier: number;
    /** Miss 体力消耗倍率 */
    missStaminaMultiplier: number;
    /** 预警秒数 */
    warningSeconds: number;
  };

  // ===== 判定窗口 =====
  judge: {
    perfectMs: number;
    greatMs: number;
    goodMs: number;
    /** 输入防抖 (ms) */
    debounceMs: number;
  };

  // ===== 效率映射 =====
  efficiency: {
    perfect: number;
    great: number;
    good: number;
    miss: number;
  };
}

/**
 * 默认平衡配置（经过初步调优）
 *
 * 设计目标：
 * - 全 Perfect 玩家在曲目 ~90% 时完赛
 * - 平均 Good 玩家能完成 ~70% 赛道
 * - 体力不会在前半段耗尽（最快也要到 60% 进度才可能归零）
 * - 冲刺段差距最大约 15% 进度
 */
export const DEFAULT_BALANCE: BalanceConfig = {
  stamina: {
    max: 100,
    drainPerSecond: 0.5,
    missPenalty: 3,
    consecutiveMissThreshold: 3,
    consecutiveMissExtra: 2,
    perfectStreakCount: 10,
    perfectStreakRecovery: 5,
    comboRecoveryThreshold: 50,
    comboRecoveryAmount: 10,
    speedFactors: [
      { minStamina: 60, factor: 1.0 },
      { minStamina: 30, factor: 0.8 },
      { minStamina: 10, factor: 0.6 },
      { minStamina: 0, factor: 0.4 },
    ],
  },

  combo: {
    bonusThresholds: [
      { min: 0, max: 9, bonus: 1.0 },
      { min: 10, max: 24, bonus: 1.1 },
      { min: 25, max: 49, bonus: 1.2 },
      { min: 50, max: 99, bonus: 1.3 },
      { min: 100, max: Infinity, bonus: 1.5 },
    ],
    milestones: [10, 25, 50, 100],
  },

  speed: {
    smoothWindow: 3,
    transitionMs: 300,
    trackLength: 50,
  },

  sprint: {
    efficiencyMultiplier: 2.0,
    missStaminaMultiplier: 2.0,
    warningSeconds: 3,
  },

  judge: {
    perfectMs: 30,
    greatMs: 60,
    goodMs: 100,
    debounceMs: 50,
  },

  efficiency: {
    perfect: 1.0,
    great: 0.8,
    good: 0.5,
    miss: 0.0,
  },
};

/**
 * 数值平衡模拟器
 * 用于快速验证参数配置是否合理
 */
export function simulateRace(config: BalanceConfig, params: {
  bpm: number;
  durationMs: number;
  baseSpeed: number;
  /** Perfect 命中率 (0-1) */
  perfectRate: number;
  /** Great 命中率 */
  greatRate: number;
  /** Good 命中率 */
  goodRate: number;
  /** Miss 率 */
  missRate: number;
}): {
  finalProgress: number;
  finalStamina: number;
  estimatedTime: number | null;
  averageSpeed: number;
} {
  const { bpm, durationMs, baseSpeed, perfectRate, greatRate, goodRate, missRate } = params;
  const beatInterval = 60000 / bpm;
  const totalBeats = Math.floor(durationMs / beatInterval);

  let stamina = config.stamina.max;
  let progress = 0;
  let combo = 0;
  let consecutiveMiss = 0;
  let consecutivePerfect = 0;
  let totalSpeed = 0;
  let finishBeat: number | null = null;

  for (let beat = 0; beat < totalBeats; beat++) {
    // 基础体力消耗
    stamina -= config.stamina.drainPerSecond * (beatInterval / 1000);

    // 随机判定
    const rand = Math.random();
    let grade: 'perfect' | 'great' | 'good' | 'miss';
    let efficiency: number;

    if (rand < perfectRate) {
      grade = 'perfect';
      efficiency = config.efficiency.perfect;
      consecutiveMiss = 0;
      consecutivePerfect++;
      combo++;
    } else if (rand < perfectRate + greatRate) {
      grade = 'great';
      efficiency = config.efficiency.great;
      consecutiveMiss = 0;
      consecutivePerfect = 0;
      combo++;
    } else if (rand < perfectRate + greatRate + goodRate) {
      grade = 'good';
      efficiency = config.efficiency.good;
      consecutiveMiss = 0;
      consecutivePerfect = 0;
      combo++;
    } else {
      grade = 'miss';
      efficiency = config.efficiency.miss;
      consecutiveMiss++;
      consecutivePerfect = 0;
      combo = 0;

      // Miss 体力惩罚
      stamina -= config.stamina.missPenalty;
      if (consecutiveMiss >= config.stamina.consecutiveMissThreshold) {
        stamina -= config.stamina.consecutiveMissExtra;
      }
    }

    // 体力恢复
    if (consecutivePerfect >= config.stamina.perfectStreakCount) {
      stamina = Math.min(config.stamina.max, stamina + config.stamina.perfectStreakRecovery);
      consecutivePerfect = 0;
    }
    if (combo === config.stamina.comboRecoveryThreshold) {
      stamina = Math.min(config.stamina.max, stamina + config.stamina.comboRecoveryAmount);
    }

    // 体力钳制
    stamina = Math.max(0, Math.min(config.stamina.max, stamina));

    // 体力系数
    let staminaFactor = config.stamina.speedFactors[config.stamina.speedFactors.length - 1].factor;
    for (const sf of config.stamina.speedFactors) {
      if (stamina >= sf.minStamina) {
        staminaFactor = sf.factor;
        break;
      }
    }

    // 连击加成
    let comboBonus = 1.0;
    for (const ct of config.combo.bonusThresholds) {
      if (combo >= ct.min && combo <= ct.max) {
        comboBonus = ct.bonus;
        break;
      }
    }

    // 计算速度
    const speed = baseSpeed * efficiency * comboBonus * staminaFactor;
    totalSpeed += speed;
    progress += speed;

    if (progress >= config.speed.trackLength && finishBeat === null) {
      finishBeat = beat;
    }
  }

  const finalProgress = Math.min(1, progress / config.speed.trackLength);
  const estimatedTime = finishBeat !== null ? finishBeat * beatInterval : null;
  const averageSpeed = totalSpeed / totalBeats;

  return { finalProgress, finalStamina: stamina, estimatedTime, averageSpeed };
}
