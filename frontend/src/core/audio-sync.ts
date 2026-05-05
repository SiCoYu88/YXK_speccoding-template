/**
 * 音画同步校正模块
 * 确保音乐播放与音符显示之间的同步误差不超过 ±5ms
 * 如果检测到偏移，自动校正
 */

const MAX_SYNC_ERROR_MS = 5;
const CORRECTION_SMOOTHING = 0.1; // 校正平滑系数（避免突变）

export class AudioSync {
  /** 音频上下文 */
  private audioContext: AudioContext | null = null;
  /** 音频源节点 */
  private sourceNode: AudioBufferSourceNode | null = null;
  /** 音频缓冲区 */
  private audioBuffer: AudioBuffer | null = null;

  /** 游戏时间轴起始时间（performance.now()） */
  private gameStartTime: number = 0;
  /** 音频开始播放的 AudioContext 时间 */
  private audioStartContextTime: number = 0;

  /** 累计校正偏移量（ms） */
  private correctionOffset: number = 0;
  /** 当前检测到的同步误差 */
  private currentSyncError: number = 0;

  /** 是否正在播放 */
  private playing: boolean = false;

  constructor() {
    this.audioContext = new AudioContext();
  }

  /**
   * 加载音频文件
   */
  async loadAudio(url: string): Promise<void> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }

    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
  }

  /**
   * 开始播放并同步游戏时间轴
   * @param gameTime 当前游戏时间（用于 resume 场景）
   */
  play(gameTime: number = 0): void {
    if (!this.audioContext || !this.audioBuffer) {
      console.warn('[AudioSync] Cannot play: audio not loaded');
      return;
    }

    // 确保 AudioContext 处于运行状态
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    // 创建新的源节点
    this.sourceNode = this.audioContext.createBufferSource();
    this.sourceNode.buffer = this.audioBuffer;
    this.sourceNode.connect(this.audioContext.destination);

    // 记录同步锚点
    this.gameStartTime = performance.now() - gameTime;
    this.audioStartContextTime = this.audioContext.currentTime;
    this.correctionOffset = 0;

    // 如果是从中间开始（断线重连等场景）
    const offsetSeconds = gameTime / 1000;
    this.sourceNode.start(0, offsetSeconds);
    this.playing = true;
  }

  /**
   * 暂停
   */
  pause(): void {
    if (this.sourceNode && this.playing) {
      this.sourceNode.stop();
      this.sourceNode = null;
      this.playing = false;
    }
  }

  /**
   * 获取当前游戏时间（已校正，ms）
   * 这是所有游戏系统应使用的统一时间源
   */
  getCurrentTime(): number {
    if (!this.playing) return 0;
    const rawTime = performance.now() - this.gameStartTime;
    return rawTime + this.correctionOffset;
  }

  /**
   * 获取音频实际播放位置（ms）
   */
  getAudioTime(): number {
    if (!this.audioContext || !this.playing) return 0;
    const elapsed = this.audioContext.currentTime - this.audioStartContextTime;
    return elapsed * 1000;
  }

  /**
   * 每帧调用：检测并校正同步误差
   * @returns 当前同步误差（ms），正=音频超前游戏，负=音频落后
   */
  checkSync(): number {
    if (!this.playing) return 0;

    const gameTime = this.getCurrentTime();
    const audioTime = this.getAudioTime();
    const error = audioTime - gameTime;

    this.currentSyncError = error;

    // 如果误差超过阈值，进行校正
    if (Math.abs(error) > MAX_SYNC_ERROR_MS) {
      // 平滑校正：每帧修正一部分，避免视觉跳变
      const correction = error * CORRECTION_SMOOTHING;
      this.correctionOffset += correction;
    }

    return error;
  }

  /** 获取当前同步误差 */
  getSyncError(): number {
    return this.currentSyncError;
  }

  /** 是否正在播放 */
  isPlaying(): boolean {
    return this.playing;
  }

  /** 获取音频总时长（ms） */
  getDuration(): number {
    return this.audioBuffer ? this.audioBuffer.duration * 1000 : 0;
  }

  /** 销毁 */
  destroy(): void {
    this.pause();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
