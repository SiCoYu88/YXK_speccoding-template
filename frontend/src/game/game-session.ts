/**
 * 游戏会话管理器
 * 整合所有子系统，实现完整的单人/多人比赛流程
 *
 * 流程：音乐→判定→速度→到终点→结算
 */

import type { TrackData } from '@shared/protocol/track-data.js';
import type { PlayerPositionData, RankingEntry } from '@shared/protocol/messages.js';
import { TRACK_LENGTH_METERS, JUDGE_GOOD_MS } from '@shared/protocol/constants.js';

import { type TimelineIndex } from '../core/track-loader.js';
import { AudioSync } from '../core/audio-sync.js';
import { type AudioManager } from '../core/audio-generator.js';
import { type GameConfig } from '../core/game-config.js';
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

/** 结算统计数据 */
export interface GameStats {
  progress: number;
  maxCombo: number;
  perfectCount: number;
  greatCount: number;
  goodCount: number;
  missCount: number;
  score: number;
  accuracy: number;
  finishTime: number | null;
}

export class GameSession {
  // 渲染上下文
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private trackData: TrackData;
  private config: GameConfig;
  private audioManager: AudioManager;

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
  private index: TimelineIndex;
  private lastFrameTime: number = 0;
  private callbacks: SessionEventCallback[] = [];

  // 比赛数据
  private startTime: number = 0;
  private finishTime: number | null = null;

  // 视觉反馈
  private lastJudge: { grade: JudgeGrade; time: number } | null = null;
  private sprintWarningShown: boolean = false;

  constructor(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    trackData: TrackData,
    index: TimelineIndex,
    config: GameConfig,
    audioManager: AudioManager,
  ) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.trackData = trackData;
    this.index = index;
    this.config = config;
    this.audioManager = audioManager;

    this.audioSync = new AudioSync();
    this.inputDetector = new InputDetector(canvas);
    this.judgeEngine = new JudgeEngine();
    this.comboSystem = new ComboSystem();
    this.staminaSystem = new StaminaSystem();

    // 初始化需要数据的子系统
    this.noteGenerator = new NoteGenerator(this.index);
    this.speedManager = new SwimSpeedManager(trackData.metadata.baseSpeed);
    this.sprintMechanic = new SprintMechanic(this.index);

    // 绑定输入处理
    this.inputDetector.onInput(this.handleInput.bind(this));

    // 绑定系统事件
    this.comboSystem.onEvent((e) => {
      if (e.type === 'break') {
        this.emit({ type: 'combo_break' });
      } else if (e.type === 'milestone') {
        this.emit({ type: 'combo_milestone', data: e.milestone });
        this.audioManager.playComboMilestone();
      }
    });

    this.staminaSystem.onEvent((e) => {
      if (e.type === 'warning' || e.type === 'critical') {
        this.emit({ type: 'stamina_warning', data: e });
      }
    });

    // 冲刺事件绑定
    this.sprintMechanic.onEvent((e) => {
      if (e.type === 'sprint_start') {
        this.emit({ type: 'sprint_start' });
      }
      if (e.type === 'sprint_end') {
        this.emit({ type: 'sprint_end' });
      }
    });
  }

  /** 比赛是否已结束 */
  get isFinished(): boolean {
    return this.state === 'finished';
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
    this.audioManager.playBGM();
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

    // 检查是否到达终点或时间耗尽
    const isOverTime = gameTime >= this.trackData.metadata.duration + 30000; // 曲目结束 +30s
    if ((this.speedManager.isFinished() || isOverTime) && !this.finishTime) {
      this.finishTime = gameTime;
      this.state = 'finished';
      this.audioSync.pause();
      this.audioManager.stopBGM();
      this.emit({ type: 'finish', data: { time: this.finishTime } });
    }
  }

  /**
   * 渲染游戏画面
   */
  render(): void {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;

    // 背景
    ctx.fillStyle = '#0a1628';
    ctx.fillRect(0, 0, w, h);

    // 水面效果
    this.renderWater(w, h);

    // 泳道和进度
    this.renderTrack(w, h);

    // 音符轨道
    this.renderNotes(w, h);

    // HUD
    this.renderHUD(w, h);

    // 判定反馈
    this.renderJudgeFeedback(w, h);

    // 冲刺预警
    if (this.sprintMechanic.isApproaching()) {
      this.renderSprintWarning(w, h);
    }
  }

  private renderWater(w: number, h: number): void {
    const { ctx } = this;
    const gameTime = this.audioSync.getCurrentTime();

    // 泳池水面
    const gradient = ctx.createLinearGradient(0, h * 0.3, 0, h);
    gradient.addColorStop(0, '#0d2847');
    gradient.addColorStop(0.5, '#0a3d6b');
    gradient.addColorStop(1, '#061e36');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, h * 0.3, w, h * 0.7);

    // 水波纹
    ctx.strokeStyle = 'rgba(79, 195, 247, 0.15)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      const baseY = h * (0.35 + i * 0.1);
      for (let x = 0; x < w; x += 4) {
        const y = baseY + Math.sin(x * 0.008 + gameTime * 0.002 + i) * 5;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  private renderTrack(w: number, h: number): void {
    const { ctx } = this;
    const progress = this.getProgress();

    // 泳道线
    const laneY = h * 0.75;
    const laneStartX = w * 0.05;
    const laneEndX = w * 0.95;
    const laneWidth = laneEndX - laneStartX;

    // 泳道背景
    ctx.fillStyle = 'rgba(79, 195, 247, 0.05)';
    ctx.fillRect(laneStartX, laneY - 20, laneWidth, 40);

    // 泳道边线
    ctx.strokeStyle = 'rgba(79, 195, 247, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(laneStartX, laneY - 20);
    ctx.lineTo(laneEndX, laneY - 20);
    ctx.moveTo(laneStartX, laneY + 20);
    ctx.lineTo(laneEndX, laneY + 20);
    ctx.stroke();

    // 进度条
    const progressX = laneStartX + progress * laneWidth;
    ctx.fillStyle = '#4fc3f7';
    ctx.fillRect(laneStartX, laneY - 3, progressX - laneStartX, 6);

    // 游泳者图标
    ctx.fillStyle = '#fff';
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🏊', progressX, laneY + 6);

    // 冲刺段标记
    for (const sprint of this.index.sprints) {
      const startFrac = sprint.startTime / this.trackData.metadata.duration;
      const endFrac = sprint.endTime / this.trackData.metadata.duration;
      const sx = laneStartX + startFrac * laneWidth;
      const ex = laneStartX + endFrac * laneWidth;

      ctx.fillStyle = this.sprintMechanic.isActive()
        ? 'rgba(255, 110, 64, 0.2)'
        : 'rgba(255, 110, 64, 0.08)';
      ctx.fillRect(sx, laneY - 18, ex - sx, 36);
    }

    // 终点线
    ctx.strokeStyle = '#ffd740';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(laneEndX, laneY - 25);
    ctx.lineTo(laneEndX, laneY + 25);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private renderNotes(w: number, h: number): void {
    const { ctx } = this;
    const gameTime = this.audioSync.getCurrentTime();
    const activeNotes = this.noteGenerator.getActiveNotes();

    // 判定线位置
    const judgeLineX = w * 0.2;
    const noteY = h * 0.45;

    // 判定线
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(judgeLineX, noteY - 30);
    ctx.lineTo(judgeLineX, noteY + 30);
    ctx.stroke();

    // 判定线光晕
    ctx.shadowColor = '#4fc3f7';
    ctx.shadowBlur = 10;
    ctx.strokeStyle = '#4fc3f7';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(judgeLineX, noteY - 30);
    ctx.lineTo(judgeLineX, noteY + 30);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 渲染音符
    const approachTime = 1200; // 音符从右侧飞来的时间 (ms)
    for (const note of activeNotes) {
      const timeUntil = note.data.time - gameTime;
      const progress = 1 - timeUntil / approachTime;

      if (progress < 0 || progress > 1.3) continue;

      const noteX = judgeLineX + (1 - progress) * (w * 0.7);

      // 音符外观
      let radius = 16;
      let color = '#4fc3f7';

      switch (note.data.type) {
        case 'tap':
          color = '#4fc3f7';
          radius = 14;
          break;
        case 'hold':
          color = '#66bb6a';
          radius = 16;
          // 绘制长条
          const holdEndTime = note.data.time + (note.data.holdDuration || 500);
          const holdEndProgress = 1 - (holdEndTime - gameTime) / approachTime;
          const holdEndX = judgeLineX + (1 - holdEndProgress) * (w * 0.7);
          ctx.fillStyle = 'rgba(102, 187, 106, 0.3)';
          ctx.fillRect(Math.min(noteX, holdEndX), noteY - 8, Math.abs(holdEndX - noteX), 16);
          break;
        case 'double':
          color = '#ffd740';
          radius = 14;
          break;
      }

      // 绘制音符圆形
      ctx.beginPath();
      ctx.arc(noteX, noteY, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // 音符内环
      ctx.beginPath();
      ctx.arc(noteX, noteY, radius * 0.6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.fill();

      // 音符类型标识
      ctx.fillStyle = '#fff';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      if (note.data.type === 'double') ctx.fillText('2x', noteX, noteY + 4);
      if (note.data.type === 'hold') ctx.fillText('━', noteX, noteY + 4);
    }
  }

  private renderHUD(w: number, h: number): void {
    const { ctx } = this;
    const stats = this.judgeEngine.getStats();
    const combo = this.comboSystem.getCombo();
    const stamina = this.staminaSystem.getStamina();
    const progress = this.getProgress();

    // 连击数（左上）
    if (combo > 0) {
      ctx.textAlign = 'center';
      ctx.fillStyle = combo >= 50 ? '#ffd740' : combo >= 25 ? '#4fc3f7' : '#fff';
      ctx.font = `bold ${Math.min(48, 32 + combo * 0.2)}px sans-serif`;
      ctx.fillText(`${combo}`, w * 0.5, h * 0.15);
      ctx.font = '14px sans-serif';
      ctx.fillStyle = '#90a4ae';
      ctx.fillText('COMBO', w * 0.5, h * 0.15 + 20);
    }

    // 分数（右上）
    const score = this.calculateScore();
    ctx.textAlign = 'right';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(score.toLocaleString(), w - 20, 40);

    // 进度（右上第二行）
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#4fc3f7';
    ctx.fillText(`${(progress * 100).toFixed(1)}%`, w - 20, 62);

    // 体力条（左上）
    const barWidth = 150;
    const barHeight = 8;
    const barX = 20;
    const barY = 30;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    const staminaColor = stamina > 60 ? '#66bb6a' : stamina > 30 ? '#ffd740' : '#ef5350';
    ctx.fillStyle = staminaColor;
    ctx.fillRect(barX, barY, barWidth * (stamina / 100), barHeight);

    // 体力文字
    ctx.textAlign = 'left';
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#90a4ae';
    ctx.fillText(`体力 ${Math.round(stamina)}%`, barX, barY + 22);

    // 时间
    const gameTime = this.audioSync.getCurrentTime();
    const totalTime = this.trackData.metadata.duration;
    const timeStr = `${this.formatTime(gameTime)} / ${this.formatTime(totalTime)}`;
    ctx.textAlign = 'left';
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#78909c';
    ctx.fillText(timeStr, barX, barY + 42);

    // 冲刺状态
    if (this.sprintMechanic.isActive()) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillStyle = '#ff6e40';
      ctx.fillText('⚡ SPRINT ⚡', w * 0.5, h * 0.25);
    }
  }

  private renderJudgeFeedback(w: number, h: number): void {
    if (!this.lastJudge) return;

    const elapsed = performance.now() - this.lastJudge.time;
    if (elapsed > 500) {
      this.lastJudge = null;
      return;
    }

    const alpha = 1 - elapsed / 500;
    const offsetY = -elapsed * 0.05;
    const scale = 1 + (1 - alpha) * 0.3;

    const { ctx } = this;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.globalAlpha = alpha;
    ctx.font = `bold ${24 * scale}px sans-serif`;

    let text = '';
    switch (this.lastJudge.grade) {
      case 'perfect':
        ctx.fillStyle = '#ffd740';
        text = 'PERFECT!';
        break;
      case 'great':
        ctx.fillStyle = '#4fc3f7';
        text = 'GREAT!';
        break;
      case 'good':
        ctx.fillStyle = '#66bb6a';
        text = 'GOOD';
        break;
      case 'miss':
        ctx.fillStyle = '#ef5350';
        text = 'MISS';
        break;
    }

    ctx.fillText(text, w * 0.2, h * 0.35 + offsetY);
    ctx.restore();
  }

  private renderSprintWarning(w: number, h: number): void {
    const { ctx } = this;
    const t = performance.now() * 0.005;
    const alpha = 0.5 + Math.sin(t) * 0.5;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 20px sans-serif';
    ctx.fillStyle = '#ff6e40';
    ctx.fillText('⚠ 冲刺即将开始！准备好！ ⚠', w * 0.5, h * 0.2);
    ctx.restore();
  }

  /**
   * 处理玩家输入
   */
  private handleInput(event: InputEvent): void {
    if (this.state !== 'playing') return;

    const gameTime = this.audioSync.getCurrentTime();

    // 播放敲击音效
    this.audioManager.playTap();

    // 寻找最接近判定线的候选音符
    const candidate = this.noteGenerator.findJudgeCandidate(gameTime, JUDGE_GOOD_MS);

    if (!candidate) {
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

    // 播放判定音效
    switch (grade) {
      case 'perfect': this.audioManager.playPerfect(); break;
      case 'great': this.audioManager.playGreat(); break;
      case 'good': this.audioManager.playGood(); break;
      case 'miss': this.audioManager.playMiss(); break;
    }

    // 视觉反馈
    this.lastJudge = { grade, time: performance.now() };

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

  /** 获取结算统计 */
  getStats(): GameStats {
    const judgeStats = this.judgeEngine.getStats();
    return {
      progress: this.getProgress(),
      maxCombo: this.getMaxCombo(),
      perfectCount: judgeStats.perfect,
      greatCount: judgeStats.great,
      goodCount: judgeStats.good,
      missCount: judgeStats.miss,
      score: this.calculateScore(),
      accuracy: this.getAccuracy(),
      finishTime: this.finishTime,
    };
  }

  /** 计算总分 */
  private calculateScore(): number {
    const stats = this.judgeEngine.getStats();
    return stats.perfect * 300 + stats.great * 200 + stats.good * 100 + this.getMaxCombo() * 10;
  }

  /** 格式化时间 */
  private formatTime(ms: number): string {
    const totalSec = Math.floor(Math.max(0, ms) / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  }

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
