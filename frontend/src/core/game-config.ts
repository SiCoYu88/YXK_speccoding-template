/**
 * 游戏配置加载器
 * 管理曲目列表、游戏参数、难度设置等所有配置数据
 */

import type { TrackData, TrackMetadata } from '@shared/protocol/track-data.js';
import { DEFAULT_BALANCE, type BalanceConfig } from '@shared/protocol/balance-config.js';

/** 曲目选择信息（不含完整节拍数据） */
export interface TrackInfo {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  duration: number;
  difficulty: number;
  /** 冲刺段数量 */
  sprintCount: number;
  /** 音符总数 */
  noteCount: number;
}

/** 游戏难度等级 */
export type DifficultyLevel = 'easy' | 'normal' | 'hard';

/** 难度配置修饰器 */
export interface DifficultyModifier {
  /** 判定窗口放大倍率 */
  judgeWindowScale: number;
  /** 体力消耗倍率 */
  staminaDrainScale: number;
  /** 音符密度倍率（<1 会跳过部分音符） */
  noteDensityScale: number;
  /** 冲刺难度倍率 */
  sprintDifficultyScale: number;
}

/** 难度修饰器预设 */
export const DIFFICULTY_MODIFIERS: Record<DifficultyLevel, DifficultyModifier> = {
  easy: {
    judgeWindowScale: 1.5,    // 判定窗口 1.5 倍宽
    staminaDrainScale: 0.7,   // 体力消耗减少 30%
    noteDensityScale: 0.7,    // 只有 70% 的音符
    sprintDifficultyScale: 0.8,
  },
  normal: {
    judgeWindowScale: 1.0,
    staminaDrainScale: 1.0,
    noteDensityScale: 1.0,
    sprintDifficultyScale: 1.0,
  },
  hard: {
    judgeWindowScale: 0.75,   // 判定窗口缩小 25%
    staminaDrainScale: 1.3,   // 体力消耗增加 30%
    noteDensityScale: 1.0,    // 不减少音符
    sprintDifficultyScale: 1.5,
  },
};

/** 游戏全局配置 */
export interface GameConfig {
  /** 数值平衡参数 */
  balance: BalanceConfig;
  /** 当前难度 */
  difficulty: DifficultyLevel;
  /** 难度修饰器 */
  difficultyModifier: DifficultyModifier;
  /** 可选曲目列表 */
  availableTracks: TrackInfo[];
  /** 是否开启音效 */
  soundEnabled: boolean;
  /** 主音量 (0-1) */
  masterVolume: number;
  /** 音效音量 (0-1) */
  sfxVolume: number;
  /** 背景音乐音量 (0-1) */
  bgmVolume: number;
  /** 视觉特效强度 (0-1) */
  visualEffectsIntensity: number;
  /** 输入校准偏移 (ms) */
  inputCalibrationOffset: number;
  /** 玩家昵称 */
  playerName: string;
}

/** 默认游戏配置 */
export const DEFAULT_GAME_CONFIG: GameConfig = {
  balance: DEFAULT_BALANCE,
  difficulty: 'normal',
  difficultyModifier: DIFFICULTY_MODIFIERS.normal,
  availableTracks: [],
  soundEnabled: true,
  masterVolume: 0.8,
  sfxVolume: 1.0,
  bgmVolume: 0.6,
  visualEffectsIntensity: 1.0,
  inputCalibrationOffset: 0,
  playerName: 'Player',
};

/**
 * 从 TrackData 提取 TrackInfo 摘要
 */
export function extractTrackInfo(trackData: TrackData): TrackInfo {
  return {
    id: trackData.metadata.id,
    title: trackData.metadata.title,
    artist: trackData.metadata.artist,
    bpm: trackData.metadata.bpm,
    duration: trackData.metadata.duration,
    difficulty: trackData.metadata.difficulty,
    sprintCount: trackData.sprintSections.length,
    noteCount: trackData.notes.length,
  };
}

/**
 * 加载所有可用曲目的信息
 */
export async function loadAvailableTracks(): Promise<TrackInfo[]> {
  // 曲目注册表 - 新增曲目时在此添加
  const trackIds = ['ocean-pulse', 'neon-wave'];

  const tracks: TrackInfo[] = [];

  for (const id of trackIds) {
    try {
      const response = await fetch(`/assets/music/${id}.track.json`);
      if (response.ok) {
        const data: TrackData = await response.json();
        tracks.push(extractTrackInfo(data));
      }
    } catch (e) {
      console.warn(`[GameConfig] Failed to load track info: ${id}`, e);
    }
  }

  return tracks;
}

/**
 * 根据难度修饰器调整平衡配置
 */
export function applyDifficultyModifier(
  baseConfig: BalanceConfig,
  modifier: DifficultyModifier
): BalanceConfig {
  return {
    ...baseConfig,
    stamina: {
      ...baseConfig.stamina,
      drainPerSecond: baseConfig.stamina.drainPerSecond * modifier.staminaDrainScale,
      missPenalty: baseConfig.stamina.missPenalty * modifier.staminaDrainScale,
    },
    judge: {
      ...baseConfig.judge,
      perfectMs: Math.round(baseConfig.judge.perfectMs * modifier.judgeWindowScale),
      greatMs: Math.round(baseConfig.judge.greatMs * modifier.judgeWindowScale),
      goodMs: Math.round(baseConfig.judge.goodMs * modifier.judgeWindowScale),
    },
    sprint: {
      ...baseConfig.sprint,
      efficiencyMultiplier: baseConfig.sprint.efficiencyMultiplier * modifier.sprintDifficultyScale,
      missStaminaMultiplier: baseConfig.sprint.missStaminaMultiplier * modifier.sprintDifficultyScale,
    },
  };
}

/**
 * 从 localStorage 加载用户配置
 */
export function loadUserConfig(): Partial<GameConfig> {
  try {
    const saved = localStorage.getItem('rhythm-swimming-config');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.warn('[GameConfig] Failed to load user config from localStorage', e);
  }
  return {};
}

/**
 * 保存用户配置到 localStorage
 */
export function saveUserConfig(config: Partial<GameConfig>): void {
  try {
    const toSave = {
      difficulty: config.difficulty,
      soundEnabled: config.soundEnabled,
      masterVolume: config.masterVolume,
      sfxVolume: config.sfxVolume,
      bgmVolume: config.bgmVolume,
      visualEffectsIntensity: config.visualEffectsIntensity,
      inputCalibrationOffset: config.inputCalibrationOffset,
      playerName: config.playerName,
    };
    localStorage.setItem('rhythm-swimming-config', JSON.stringify(toSave));
  } catch (e) {
    console.warn('[GameConfig] Failed to save user config', e);
  }
}

/**
 * 初始化完整游戏配置
 */
export async function initGameConfig(): Promise<GameConfig> {
  const userConfig = loadUserConfig();
  const difficulty = (userConfig.difficulty ?? 'normal') as DifficultyLevel;
  const modifier = DIFFICULTY_MODIFIERS[difficulty];

  const config: GameConfig = {
    ...DEFAULT_GAME_CONFIG,
    ...userConfig,
    difficulty,
    difficultyModifier: modifier,
    balance: applyDifficultyModifier(DEFAULT_BALANCE, modifier),
    availableTracks: await loadAvailableTracks(),
  };

  return config;
}

/**
 * 格式化时长为 mm:ss
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * 难度星级显示
 */
export function difficultyStars(level: number): string {
  return '★'.repeat(Math.min(level, 10)) + '☆'.repeat(Math.max(0, 10 - level));
}
