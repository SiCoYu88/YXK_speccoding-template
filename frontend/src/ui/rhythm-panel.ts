/**
 * 音频与输入 UI
 *
 * 任务 10.1: 音乐播放控制
 * 任务 10.2: 节奏输入面板 UI
 * 任务 10.3: 判定特效系统
 * 任务 10.4: 玩家 HUD
 */

import type { AnimState } from '@shared/protocol/messages.js';
import type { ActiveNote } from '../game/note-generator.js';
import type { JudgeGrade } from '../game/judge.js';
import { JUDGE_GOOD_MS } from '@shared/protocol/constants.js';

// ===== 10.1 音乐播放控制 =====

/**
 * 音乐播放控制器
 * 封装 Web Audio API，提供加载、播放、暂停、时间轴同步功能
 */
export class MusicController {
  private audioContext: AudioContext;
  private gainNode: GainNode;
  private sourceNode: AudioBufferSourceNode | null = null;
  private buffer: AudioBuffer | null = null;
  private startTime: number = 0;
  private pauseTime: number = 0;
  private playing: boolean = false;

  constructor() {
    this.audioContext = new AudioContext();
    this.gainNode = this.audioContext.createGain();
    this.gainNode.connect(this.audioContext.destination);
  }

  /** 加载音频 */
  async load(url: string): Promise<void> {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    this.buffer = await this.audioContext.decodeAudioData(arrayBuffer);
  }

  /** 播放 */
  play(fromTime: number = 0): void {
    if (!this.buffer) return;
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    this.sourceNode = this.audioContext.createBufferSource();
    this.sourceNode.buffer = this.buffer;
    this.sourceNode.connect(this.gainNode);

    this.startTime = this.audioContext.currentTime - fromTime / 1000;
    this.sourceNode.start(0, fromTime / 1000);
    this.playing = true;
  }

  /** 暂停 */
  pause(): void {
    if (!this.playing || !this.sourceNode) return;
    this.pauseTime = this.getCurrentTime();
    this.sourceNode.stop();
    this.sourceNode = null;
    this.playing = false;
  }

  /** 获取当前播放时间 (ms) */
  getCurrentTime(): number {
    if (!this.playing) return this.pauseTime;
    return (this.audioContext.currentTime - this.startTime) * 1000;
  }

  /** 设置音量 (0-1) */
  setVolume(volume: number): void {
    this.gainNode.gain.value = volume;
  }

  /** 是否正在播放 */
  isPlaying(): boolean {
    return this.playing;
  }

  /** 获取总时长 (ms) */
  getDuration(): number {
    return this.buffer ? this.buffer.duration * 1000 : 0;
  }

  /** 销毁 */
  destroy(): void {
    this.pause();
    this.audioContext.close();
  }
}

// ===== 10.2 节奏输入面板 UI =====

/** 输入面板配置 */
export interface RhythmPanelConfig {
  /** 判定线 Y 位置（占画布高度比例） */
  judgeLine: number;
  /** 音符下落起始 Y 位置 */
  noteSpawnY: number;
  /** 面板宽度占比 */
  widthRatio: number;
}

const DEFAULT_PANEL_CONFIG: RhythmPanelConfig = {
  judgeLine: 0.85,
  noteSpawnY: 0.15,
  widthRatio: 0.3,
};

/**
 * 节奏输入面板渲染器
 */
export class RhythmPanelRenderer {
  private config: RhythmPanelConfig;

  constructor(config?: Partial<RhythmPanelConfig>) {
    this.config = { ...DEFAULT_PANEL_CONFIG, ...config };
  }

  /** 获取判定线 Y 坐标 */
  getJudgeLineY(canvasHeight: number): number {
    return canvasHeight * this.config.judgeLine;
  }

  /** 获取面板区域 */
  getPanelBounds(canvasWidth: number, canvasHeight: number) {
    const panelWidth = canvasWidth * this.config.widthRatio;
    const panelX = (canvasWidth - panelWidth) / 2;
    return {
      x: panelX,
      y: canvasHeight * this.config.noteSpawnY,
      width: panelWidth,
      height: canvasHeight * (this.config.judgeLine - this.config.noteSpawnY),
    };
  }

  /**
   * 渲染输入面板
   */
  render(ctx: CanvasRenderingContext2D, width: number, height: number, notes: readonly ActiveNote[], isSprinting: boolean): void {
    const bounds = this.getPanelBounds(width, height);
    const judgeY = this.getJudgeLineY(height);

    // 面板背景
    ctx.fillStyle = isSprinting ? 'rgba(255, 69, 0, 0.08)' : 'rgba(30, 41, 59, 0.6)';
    ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);

    // 面板边框
    ctx.strokeStyle = isSprinting ? '#FF4500' : 'rgba(148, 163, 184, 0.3)';
    ctx.lineWidth = isSprinting ? 2 : 1;
    ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);

    // 判定线
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#3b82f6';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(bounds.x, judgeY);
    ctx.lineTo(bounds.x + bounds.width, judgeY);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 输入热区指示
    ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
    ctx.fillRect(bounds.x, judgeY - 20, bounds.width, 40);

    // 渲染音符
    for (const note of notes) {
      if (note.judged) continue;

      const noteY = bounds.y + bounds.height * note.position;
      const noteX = bounds.x + bounds.width / 2;

      this.renderNote(ctx, noteX, noteY, note, isSprinting);
    }
  }

  /** 渲染单个音符 */
  private renderNote(ctx: CanvasRenderingContext2D, x: number, y: number, note: ActiveNote, isSprinting: boolean): void {
    ctx.save();

    const type = note.data.type;
    let color = '#3b82f6';
    let size = 20;

    switch (type) {
      case 'tap':
        color = isSprinting ? '#FF8C00' : '#3b82f6';
        size = 18;
        break;
      case 'hold':
        color = isSprinting ? '#FF4500' : '#8b5cf6';
        size = 22;
        break;
      case 'double':
        color = isSprinting ? '#FFD700' : '#06b6d4';
        size = 20;
        break;
    }

    // 音符主体
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;

    if (type === 'tap') {
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === 'hold') {
      // 长按音符（矩形 + 尾巴）
      const holdHeight = Math.min(80, (note.data.holdDuration || 500) / 10);
      ctx.fillRect(x - size / 2, y - holdHeight, size, holdHeight);
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === 'double') {
      // 双拍音符（两个小圆）
      ctx.beginPath();
      ctx.arc(x - 12, y, size / 3, 0, Math.PI * 2);
      ctx.arc(x + 12, y, size / 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

// ===== 10.3 判定特效系统（扩展版） =====

/** 特效粒子 */
interface EffectParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
}

/**
 * 判定特效系统
 * Perfect/Great/Good/Miss 各等级有独立的粒子特效和颜色方案
 */
export class JudgeEffectSystem {
  private particles: EffectParticle[] = [];

  private readonly EFFECT_CONFIGS: Record<JudgeGrade, { count: number; speed: number; colors: string[] }> = {
    perfect: { count: 20, speed: 5, colors: ['#FFD700', '#FFAA00', '#FFF176', '#FFE082'] },
    great: { count: 12, speed: 4, colors: ['#00DDFF', '#0088FF', '#4FC3F7', '#81D4FA'] },
    good: { count: 8, speed: 3, colors: ['#88FF88', '#66BB6A', '#A5D6A7'] },
    miss: { count: 4, speed: 2, colors: ['#FF4444', '#E57373'] },
  };

  /** 触发特效 */
  trigger(grade: JudgeGrade, x: number, y: number): void {
    const config = this.EFFECT_CONFIGS[grade];

    for (let i = 0; i < config.count; i++) {
      const angle = (Math.PI * 2 * i) / config.count + (Math.random() - 0.5) * 0.8;
      const speed = config.speed * (0.5 + Math.random());

      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        size: 2 + Math.random() * 4,
        color: config.colors[Math.floor(Math.random() * config.colors.length)],
        life: 1,
        maxLife: 0.6 + Math.random() * 0.4,
      });
    }
  }

  /** 更新 */
  update(dt: number): void {
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.08; // 重力
      p.life -= dt / (p.maxLife * 1000);
      p.size *= 0.99;
    }
    this.particles = this.particles.filter(p => p.life > 0);
  }

  /** 渲染 */
  render(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

// ===== 10.4 玩家 HUD =====

/**
 * 玩家 HUD 渲染器
 * 显示：体力条、连击数、当前名次、冲刺状态指示器
 */
export class PlayerHUD {
  private combo: number = 0;
  private rank: number = 1;
  private stamina: number = 100;
  private isSprinting: boolean = false;
  private comboAnimScale: number = 1;

  /** 更新数据 */
  updateData(data: {
    combo?: number;
    rank?: number;
    stamina?: number;
    isSprinting?: boolean;
  }): void {
    if (data.combo !== undefined && data.combo !== this.combo) {
      this.comboAnimScale = 1.3; // 连击变化时放大动画
      this.combo = data.combo;
    }
    if (data.rank !== undefined) this.rank = data.rank;
    if (data.stamina !== undefined) this.stamina = data.stamina;
    if (data.isSprinting !== undefined) this.isSprinting = data.isSprinting;
  }

  /** 更新动画 */
  update(dt: number): void {
    // 连击数字缩放回弹
    if (this.comboAnimScale > 1) {
      this.comboAnimScale = Math.max(1, this.comboAnimScale - dt / 200);
    }
  }

  /** 渲染 HUD */
  render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    // === 左上角：名次 ===
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = this.rank <= 3 ? '#FFD700' : '#e2e8f0';
    ctx.fillText(`#${this.rank}`, 20, height - 60);

    // === 连击数（右侧） ===
    if (this.combo > 0) {
      ctx.save();
      ctx.translate(width - 80, height - 80);
      ctx.scale(this.comboAnimScale, this.comboAnimScale);
      ctx.font = 'bold 32px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = this.combo >= 50 ? '#FFD700' : this.combo >= 25 ? '#06b6d4' : '#e2e8f0';
      ctx.fillText(`${this.combo}`, 0, 0);
      ctx.font = '14px sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('COMBO', 0, 20);
      ctx.restore();
    }

    // === 冲刺状态指示器 ===
    if (this.isSprinting) {
      const pulseAlpha = 0.6 + Math.sin(performance.now() / 150) * 0.4;
      ctx.save();
      ctx.globalAlpha = pulseAlpha;
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FF4500';
      ctx.fillText('⚡ SPRINT ⚡', width / 2, height - 30);
      ctx.restore();
    }

    // === 体力条（底部左侧） ===
    const barX = 20;
    const barY = height - 35;
    const barWidth = 150;
    const barHeight = 16;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    const staminaPercent = this.stamina / 100;
    const staminaColor = this.stamina > 60 ? '#4ade80' : this.stamina > 30 ? '#facc15' : '#ef4444';
    ctx.fillStyle = staminaColor;
    ctx.fillRect(barX + 1, barY + 1, (barWidth - 2) * staminaPercent, barHeight - 2);

    ctx.strokeStyle = '#475569';
    ctx.strokeRect(barX, barY, barWidth, barHeight);

    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.fillText(`⚡ ${Math.round(this.stamina)}`, barX + barWidth / 2, barY + barHeight / 2 + 4);
  }
}
