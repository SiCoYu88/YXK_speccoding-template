/**
 * 共享游戏常量 - 前后端一致使用
 */

// ============ 房间配置 ============
export const ROOM_MAX_PLAYERS = 10;
export const ROOM_MIN_PLAYERS = 3;
export const MATCH_TIMEOUT_SECONDS = 60;
export const COUNTDOWN_SECONDS = 3;
export const RECONNECT_TIMEOUT_MS = 30_000;

// ============ 赛道配置 ============
export const TRACK_LENGTH_METERS = 50;
export const EXTRA_TIME_AFTER_SONG_SECONDS = 30;

// ============ 节奏判定窗口（ms） ============
export const JUDGE_PERFECT_MS = 30;
export const JUDGE_GREAT_MS = 60;
export const JUDGE_GOOD_MS = 100;
export const INPUT_DEBOUNCE_MS = 50;

// ============ 划水效率映射 ============
export const EFFICIENCY_PERFECT = 1.0;
export const EFFICIENCY_GREAT = 0.8;
export const EFFICIENCY_GOOD = 0.5;
export const EFFICIENCY_MISS = 0.0;

// ============ 连击加成阈值 ============
export const COMBO_BONUS_THRESHOLDS = [
  { min: 0, max: 9, bonus: 1.0 },
  { min: 10, max: 24, bonus: 1.1 },
  { min: 25, max: 49, bonus: 1.2 },
  { min: 50, max: 99, bonus: 1.3 },
  { min: 100, max: Infinity, bonus: 1.5 },
] as const;

// ============ 体力系统 ============
export const STAMINA_MAX = 100;
export const STAMINA_INITIAL = 100;
export const STAMINA_DRAIN_PER_SECOND = 0.5;
export const STAMINA_MISS_PENALTY = 3;
export const STAMINA_CONSECUTIVE_MISS_EXTRA = 2;
export const STAMINA_CONSECUTIVE_MISS_THRESHOLD = 3;

/** 体力系数分档 */
export const STAMINA_SPEED_FACTORS = [
  { minStamina: 60, factor: 1.0 },
  { minStamina: 30, factor: 0.8 },
  { minStamina: 10, factor: 0.6 },
  { minStamina: 0, factor: 0.4 },
] as const;

// ============ 体力恢复 ============
export const STAMINA_RECOVERY_PERFECT_STREAK = 10;    // 连续 Perfect 次数
export const STAMINA_RECOVERY_PERFECT_AMOUNT = 5;
export const STAMINA_RECOVERY_COMBO_THRESHOLD = 50;   // 连击达到时
export const STAMINA_RECOVERY_COMBO_AMOUNT = 10;

// ============ 冲刺系统 ============
export const SPRINT_EFFICIENCY_MULTIPLIER = 2.0;
export const SPRINT_MISS_STAMINA_MULTIPLIER = 2.0;
export const SPRINT_WARNING_SECONDS = 3;

// ============ 速度平滑 ============
export const SPEED_SMOOTH_WINDOW = 3;       // 最近 N 拍加权平均
export const SPEED_TRANSITION_MS = 300;     // 最大过渡时间

// ============ 同步配置 ============
export const POSITION_SYNC_INTERVAL_MS = 100;
export const STATE_SNAPSHOT_INTERVAL_FRAMES = 300; // 每 300 逻辑帧发送状态快照

// ============ 连击里程碑 ============
export const COMBO_MILESTONES = [10, 25, 50, 100] as const;
