/**
 * 音符生成器
 * 按时间轴生成音符，支持单拍/长拍/双拍
 * 音符提前出现（前置时间根据 BPM 动态计算：0.8s-1.5s）
 */

import type { NoteData, NoteType } from '@shared/protocol/track-data.js';
import type { TimelineIndex } from '../core/track-loader.js';
import { queryNotesInRange } from '../core/track-loader.js';

/** 活跃音符（已生成但还未被判定的音符） */
export interface ActiveNote {
  /** 原始音符数据 */
  data: NoteData;
  /** 生成时间（游戏时间 ms） */
  spawnTime: number;
  /** 是否已被判定 */
  judged: boolean;
  /** 屏幕上的归一化位置 0=顶部/远 1=判定线 >1=已过 */
  position: number;
}

/** 音符生成器配置 */
export interface NoteGeneratorConfig {
  /** 音符前置时间（从出现到到达判定线的时间 ms） */
  approachTime: number;
}

export class NoteGenerator {
  private index: TimelineIndex;
  private config: NoteGeneratorConfig;
  private nextNoteIdx: number = 0;
  private activeNotes: ActiveNote[] = [];
  /** 已过期音符的最大保留时间（判定窗口外） */
  private readonly EXPIRE_MS = 200;

  constructor(index: TimelineIndex) {
    this.index = index;
    // 前置时间根据 BPM 动态计算：BPM 越高前置时间越短
    // 范围：0.8s (BPM>=180) ~ 1.5s (BPM<=80)
    const approachTime = Math.max(800, Math.min(1500, 2000 - index.bpm * 6.67));
    this.config = { approachTime };
  }

  /** 获取当前前置时间 */
  getApproachTime(): number {
    return this.config.approachTime;
  }

  /** 获取所有活跃音符 */
  getActiveNotes(): readonly ActiveNote[] {
    return this.activeNotes;
  }

  /**
   * 每帧更新：生成新音符 + 更新位置 + 清理过期音符
   * @param currentTime 当前游戏时间（ms，从曲目开始算起）
   */
  update(currentTime: number): void {
    // 1. 生成新音符（检查是否有音符需要在当前时间出现）
    this.spawnNotes(currentTime);

    // 2. 更新所有活跃音符的位置
    this.updatePositions(currentTime);

    // 3. 清理已过期且已判定的音符
    this.cleanupExpired(currentTime);
  }

  /**
   * 生成新音符
   * 音符在 (time - approachTime) 时刻出现
   */
  private spawnNotes(currentTime: number): void {
    const spawnHorizon = currentTime + this.config.approachTime;

    while (this.nextNoteIdx < this.index.notes.length) {
      const noteData = this.index.notes[this.nextNoteIdx];

      // 如果音符的目标时间还没到前置窗口内，停止
      if (noteData.time > spawnHorizon) break;

      // 如果音符已经过期（当前时间已超过其判定窗口），跳过
      if (noteData.time + this.EXPIRE_MS < currentTime) {
        this.nextNoteIdx++;
        continue;
      }

      // 生成活跃音符
      const activeNote: ActiveNote = {
        data: noteData,
        spawnTime: currentTime,
        judged: false,
        position: 0,
      };

      this.activeNotes.push(activeNote);
      this.nextNoteIdx++;
    }
  }

  /**
   * 更新音符位置（0=刚出现，1=到达判定线，>1=已过判定线）
   */
  private updatePositions(currentTime: number): void {
    for (const note of this.activeNotes) {
      const elapsed = currentTime - (note.data.time - this.config.approachTime);
      note.position = elapsed / this.config.approachTime;
    }
  }

  /**
   * 清理过期音符（已判定且过了判定线一段时间的）
   */
  private cleanupExpired(currentTime: number): void {
    this.activeNotes = this.activeNotes.filter(note => {
      // 保留未判定且还在过期窗口内的
      if (!note.judged && note.data.time + this.EXPIRE_MS >= currentTime) return true;
      // 已判定的保留短时间用于显示反馈动画
      if (note.judged && note.data.time + 500 >= currentTime) return true;
      return false;
    });
  }

  /**
   * 标记音符为已判定
   */
  markJudged(noteId: number): void {
    const note = this.activeNotes.find(n => n.data.id === noteId);
    if (note) {
      note.judged = true;
    }
  }

  /**
   * 找到最接近判定线且未判定的音符
   */
  findJudgeCandidate(currentTime: number, maxWindowMs: number = 100): ActiveNote | null {
    let best: ActiveNote | null = null;
    let bestDelta = Infinity;

    for (const note of this.activeNotes) {
      if (note.judged) continue;
      const delta = Math.abs(note.data.time - currentTime);
      if (delta <= maxWindowMs && delta < bestDelta) {
        bestDelta = delta;
        best = note;
      }
    }

    return best;
  }

  /**
   * 获取未判定且已过期的音符（应判为 Miss）
   */
  getExpiredUnjudged(currentTime: number, missThresholdMs: number = 100): ActiveNote[] {
    return this.activeNotes.filter(
      note => !note.judged && (currentTime - note.data.time) > missThresholdMs
    );
  }

  /**
   * 重置生成器（用于重新开始）
   */
  reset(): void {
    this.nextNoteIdx = 0;
    this.activeNotes = [];
  }
}
