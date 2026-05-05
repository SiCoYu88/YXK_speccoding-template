/**
 * 结算与排名系统 (result-ranking)
 *
 * 任务 9.1: 比赛结束判定
 * 任务 9.2: 排名计算
 * 任务 9.4: MVP 表彰（数据标记）
 * 任务 9.5: 历史记录存储与查询
 */

import { EXTRA_TIME_AFTER_SONG_SECONDS } from '@shared/protocol/constants.js';
import type { RankingEntry, PlayerInfo, PlayerStats } from '@shared/protocol/messages.js';

// ===== 9.1 比赛结束判定 =====

/** 比赛结束原因 */
export type RaceEndReason = 'all_finished' | 'time_expired' | 'force_end';

/** 单个玩家比赛数据 */
export interface PlayerRaceData {
  player: PlayerInfo;
  progress: number;          // 0-1
  finishTime: number | null; // null = 未完赛
  stats: PlayerStats;
  isAbandoned: boolean;
}

/**
 * 比赛结束判定器
 */
export class RaceEndJudge {
  private trackDurationMs: number;
  private raceStartTime: number;
  private songEndTime: number;
  private maxRaceTime: number;

  constructor(trackDurationMs: number, raceStartTime: number) {
    this.trackDurationMs = trackDurationMs;
    this.raceStartTime = raceStartTime;
    this.songEndTime = raceStartTime + trackDurationMs;
    this.maxRaceTime = raceStartTime + trackDurationMs + EXTRA_TIME_AFTER_SONG_SECONDS * 1000;
  }

  /**
   * 检查比赛是否应该结束
   */
  checkEnd(players: PlayerRaceData[], currentTime: number): RaceEndReason | null {
    // 条件1：所有存活玩家到达终点
    const activePlayers = players.filter(p => !p.isAbandoned);
    const allFinished = activePlayers.every(p => p.finishTime !== null);
    if (allFinished && activePlayers.length > 0) {
      return 'all_finished';
    }

    // 条件2：超过最大比赛时间（曲目时长 + 30秒）
    if (currentTime >= this.maxRaceTime) {
      return 'time_expired';
    }

    return null;
  }

  /** 获取剩余时间（ms） */
  getRemainingTime(currentTime: number): number {
    return Math.max(0, this.maxRaceTime - currentTime);
  }

  /** 是否已过曲目结束时间 */
  isSongEnded(currentTime: number): boolean {
    return currentTime >= this.songEndTime;
  }
}

// ===== 9.2 排名计算 =====

/**
 * 计算最终排名
 * 优先级：到达时间 > 已游距离 > 准确率
 */
export function calculateRankings(players: PlayerRaceData[]): RankingEntry[] {
  // 分为完赛组和未完赛组
  const finished: PlayerRaceData[] = [];
  const unfinished: PlayerRaceData[] = [];
  const abandoned: PlayerRaceData[] = [];

  for (const p of players) {
    if (p.isAbandoned) {
      abandoned.push(p);
    } else if (p.finishTime !== null) {
      finished.push(p);
    } else {
      unfinished.push(p);
    }
  }

  // 完赛的按到达时间排序（先到先排）
  finished.sort((a, b) => a.finishTime! - b.finishTime!);

  // 未完赛的按已游距离排序
  unfinished.sort((a, b) => {
    if (b.progress !== a.progress) return b.progress - a.progress;
    // 距离相同按准确率排序
    return b.stats.accuracy - a.stats.accuracy;
  });

  // 放弃的排最后
  abandoned.sort((a, b) => b.progress - a.progress);

  // 组合排名
  const ranked = [...finished, ...unfinished, ...abandoned];
  const rankings: RankingEntry[] = ranked.map((p, idx) => ({
    rank: idx + 1,
    player: p.player,
    finishTime: p.finishTime,
    progress: p.progress,
    stats: p.stats,
  }));

  return rankings;
}

// ===== 9.5 历史记录存储 =====

/** 比赛历史记录条目 */
export interface MatchHistoryEntry {
  matchId: string;
  timestamp: number;
  trackId: string;
  playerCount: number;
  myRank: number;
  myStats: PlayerStats;
  finishTime: number | null;
}

/**
 * 历史记录管理器（内存版，实际应持久化到数据库）
 */
export class MatchHistoryManager {
  /** 玩家 ID → 历史记录列表 */
  private histories: Map<string, MatchHistoryEntry[]> = new Map();
  private readonly MAX_RECORDS = 50;

  /**
   * 保存比赛记录
   */
  saveRecord(playerId: string, entry: MatchHistoryEntry): void {
    if (!this.histories.has(playerId)) {
      this.histories.set(playerId, []);
    }

    const records = this.histories.get(playerId)!;
    records.unshift(entry); // 最新的在前

    // 保留最近 50 条
    if (records.length > this.MAX_RECORDS) {
      records.length = this.MAX_RECORDS;
    }
  }

  /**
   * 查询历史记录（按时间倒序）
   */
  getRecords(playerId: string, limit: number = 50): MatchHistoryEntry[] {
    const records = this.histories.get(playerId);
    if (!records) return [];
    return records.slice(0, limit);
  }

  /**
   * 获取玩家统计摘要
   */
  getPlayerSummary(playerId: string): {
    totalMatches: number;
    wins: number;
    avgRank: number;
    avgAccuracy: number;
  } {
    const records = this.histories.get(playerId);
    if (!records || records.length === 0) {
      return { totalMatches: 0, wins: 0, avgRank: 0, avgAccuracy: 0 };
    }

    let wins = 0;
    let rankSum = 0;
    let accSum = 0;

    for (const r of records) {
      if (r.myRank === 1) wins++;
      rankSum += r.myRank;
      accSum += r.myStats.accuracy;
    }

    return {
      totalMatches: records.length,
      wins,
      avgRank: rankSum / records.length,
      avgAccuracy: accSum / records.length,
    };
  }
}
