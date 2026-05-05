/**
 * 游戏会话管理器
 * 整合所有子系统，实现完整的单人/多人比赛流程
 *
 * 流程：音乐→判定→速度→到终点→结算
 */

import type { TrackData } from '@shared/protocol/track-data.js';
import type { PlayerPositionData, RankingEntry } from '@shared/protocol/messages.js';
import { TRACK_LENGTH_METERS, JUDGE_GOOD_MS } from '@shared/protocol/constants.js';

import { buildTimelineIndex, type TimelineIndex } from '../core/track-loader.js';
import { AudioSync } from '../core/audio-sync.js';
import { NoteGenerator } from './note-generator.js';
import { InputDetector, type InputEvent } from './input-detector.js';
import { JudgeEngine, type JudgeGrade, type JudgeResult } from './judge.js';
import { ComboSystem } from './combo-system.js';
import { SwimSpeedManager, getEfficiency, getComboBonus } from './swim-speed-model.js';
import { StaminaSystem } from './stamina-system.js';
import { SprintMechanic } from './sprint-mechanic.js';

/** 游戏会话状态 */
export type SessionState = 'idle' | 'loading' | 'countdown' | 'playing' | 'finished';

/** 会话事件 */
export type SessionEventType = 'judge' | 'combo_break' | 'combo_milestone' | 'sprint_start' | 'sprint_end' | 'finish' | 'stamina_warning';

export interface SessionEvent {
  type: SessionEventType;
  data?: unknown;
}

export type SessionEventCallback = (event: SessionEvent) => void;

export class GameSession {
  // 子系统
  private audioSync: AudioSync;
  private noteGenerator!: NoteGenerator;
  private inputDetector: InputDetector;
  private judgeEngine: JudgeEngine;
  private comboSystem: ComboSystem;
  private speedManager!: SwimSpeedManager;
  private staminaSystem: StaminaSystem;
  private sprintMechanic!: SprintMechanic;

  // 状态
  private state: SessionState = 'idle';
  private index!: TimelineIndex;
  private lastFrameTime: number = 0;
  private callbacks: SessionEventCallback[] = [];

  // 比赛数据
  private startTime: number = 0;
  private finishTime: number | null = null;

  constructor(targetElement: HTMLElement) {
    this.audioSync = new AudioSync();
    this.inputDetector = new InputDetector(targetElement);
    this.judgeEngine = new JudgeEngine();
    this.comboSystem = new ComboSystem();
    this.staminaSystem = new StaminaSystem();

    // 绑定输入处理
    this.inputDetector.onInput(this.handleInput.bind(this));

    // 绑定系统事件
    this.comboSystem.onEvent((e) => {
      if (e.type === 'break') {
        this.emit({ type: 'combo_break' });
      } else if (e.type === 'milestone') {
        this.emit({ type: 'combo_milestone', data: e.milestone });
      }
    });

    this.staminaSystem.onEvent((e) => {
      if (e.type === 'warning' || e.type === 'critical') {
        this.emit({ type: 'stamina_warning', data: e });
      }
    });
  }

  /** 注册事件回调 */
  onEvent(callback: SessionEventCallback): void {
    this.callbacks.push(callback);
  }

  /** 获取当前状态 */
  getState(): SessionState {
    return this.state;
  }

  /**
   * 加载曲目并准备比赛
   */
  async load(trackData: TrackData, audioUrl?: string): Promise<void> {
    this.state = 'loading';

    // 构建时间轴索引
    this.index = buildTimelineIndex(trackData);

    // 初始化子系统
    this.noteGenerator = new NoteGenerator(this.index);
    this.speedManager = new SwimSpeedManager(trackData.metadata.baseSpeed);
    this.sprintMechanic = new SprintMechanic(this.index);

    // 冲刺事件绑定
    this.sprintMechanic.onEvent((e) => {
      if (e.type === 'sprint_start') this.emit({ type: 'sprint_start' });
      if (e.type === 'sprint_end') this.emit({ type: 'sprint_end' });
    });

    // 加载音频（如果有）
    if (audioUrl) {
      await this.audioSync.loadAudio(audioUrl);
    }

    this.state = 'idle';
  }

  /**
   * 开始比赛
   */
  start(): void {
    this.state = 'playing';
    this.startTime = performance.now();
    this.lastFrameTime = this.startTime;
    this.finishTime = null;

    // 重置所有子系统
    this.noteGenerator.reset();
    this.judgeEngine.reset();
    this.comboSystem.reset();
    this.speedManager.reset();
    this.staminaSystem.reset();
    this.sprintMechanic.reset();

    // 开始播放音乐
    this.audioSync.play(0);
  }

  /**
   * 每帧更新（由外部游戏循环调用）
   */
  update(timestamp: number): void {
    if (this.state !== 'playing') return;

    const dt = timestamp - this.lastFrameTime;
    this.lastFrameTime = timestamp;

    // 获取同步后的游戏时间
    const gameTime = this.audioSync.getCurrentTime();
    this.audioSync.checkSync();

    // 更新音符生成器
    this.noteGenerator.update(gameTime);

    // 更新冲刺状态
    this.sprintMechanic.update(gameTime);

    // 更新体力消耗
    this.staminaSystem.update(gameTime);

    // 更新速度
    this.speedManager.update(gameTime, dt);

    // 检查过期未输入的音符（判为 Miss）
    const expired = this.noteGenerator.getExpiredUnjudged(gameTime, JUDGE_GOOD_MS);
    for (const note of expired) {
      this.processJudge('miss', note.data.id, note.data.time, gameTime);
      this.noteGenerator.markJudged(note.data.id);
    }

    // 检查是否到达终点
    if (this.speedManager.isFinished() && !this.finishTime) {
      this.finishTime = gameTime;
      this.state = 'finished';
      this.audioSync.pause();
      this.emit({ type: 'finish', data: { time: this.finishTime } });
    }
  }

  /**
   * 处理玩家输入
   */
  private handleInput(event: InputEvent): void {
    if (this.state !== 'playing') return;

    const gameTime = this.audioSync.getCurrentTime();

    // 寻找最接近判定线的候选音符
    const candidate = this.noteGenerator.findJudgeCandidate(gameTime, JUDGE_GOOD_MS);

    if (!candidate) {
      // 没有可判定的音符，忽略
      return;
    }

    // 执行判定
    const result = this.judgeEngine.judge(gameTime, candidate.data.time, candidate.data.id);
    this.noteGenerator.markJudged(candidate.data.id);
    this.processJudge(result.grade, result.noteId, candidate.data.time, gameTime);
  }

  /**
   * 处理判定结果（统一入口）
   */
  private processJudge(grade: JudgeGrade, noteId: number, noteTime: number, currentTime: number): void {
    // 更新连击
    this.comboSystem.processGrade(grade);
    const combo = this.comboSystem.getCombo();

    // 更新体力
    this.staminaSystem.processJudge(grade, combo);

    // 计算速度
    const staminaFactor = this.staminaSystem.getSpeedFactor();
    const isSprinting = this.sprintMechanic.isActive();
    this.speedManager.processJudge(grade, combo, staminaFactor, isSprinting, currentTime);

    // 发射判定事件
    this.emit({ type: 'judge', data: { grade, noteId, combo } });
  }

  // ===== 状态查询 =====

  getProgress(): number { return this.speedManager.getProgress(); }
  getSpeed(): number { return this.speedManager.getSpeed(); }
  getCombo(): number { return this.comboSystem.getCombo(); }
  getMaxCombo(): number { return this.comboSystem.getMaxCombo(); }
  getStamina(): number { return this.staminaSystem.getStamina(); }
  getStaminaFactor(): number { return this.staminaSystem.getSpeedFactor(); }
  isSprinting(): boolean { return this.sprintMechanic.isActive(); }
  getActiveNotes() { return this.noteGenerator.getActiveNotes(); }
  getJudgeStats() { return this.judgeEngine.getStats(); }
  getAccuracy(): number { return this.judgeEngine.getAccuracy(); }
  getGameTime(): number { return this.audioSync.getCurrentTime(); }
  getFinishTime(): number | null { return this.finishTime; }

  /** 获取完整玩家状态（用于同步） */
  getPlayerState(): PlayerPositionData {
    return {
      id: 'local',
      progress: this.getProgress(),
      speed: this.getSpeed(),
      stamina: this.getStamina(),
      combo: this.getCombo(),
      animState: this.determineAnimState(),
    };
  }

  /** 根据当前状态确定动画状态 */
  private determineAnimState(): 'idle' | 'normal' | 'fast' | 'sprint' | 'fatigued' | 'still' {
    if (this.state !== 'playing') return 'idle';
    if (this.sprintMechanic.isActive()) return 'sprint';
    if (this.staminaSystem.getStamina() < 20) return 'fatigued';

    const speed = this.speedManager.getSpeed();
    if (speed === 0) return 'still';
    if (speed > 0.3) return 'fast';
    return 'normal';
  }

  /** 获取结算数据 */
  getRankingEntry(playerName: string): RankingEntry {
    const stats = this.judgeEngine.getStats();
    return {
      rank: 1,
      player: { id: 'local', name: playerName, lane: 1 },
      finishTime: this.finishTime,
      progress: this.getProgress(),
      stats: {
        totalNotes: stats.total,
        perfect: stats.perfect,
        great: stats.great,
        good: stats.good,
        miss: stats.miss,
        maxCombo: this.getMaxCombo(),
        accuracy: this.getAccuracy(),
        staminaRemaining: this.getStamina(),
      },
    };
  }

  /** 发射事件 */
  private emit(event: SessionEvent): void {
    for (const cb of this.callbacks) {
      cb(event);
    }
  }

  /** 销毁 */
  destroy(): void {
    this.audioSync.destroy();
    this.inputDetector.destroy();
  }
}
