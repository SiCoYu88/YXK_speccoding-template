/**
 * 合成音频生成器
 * 使用 Web Audio API 程序化生成测试用音频资源
 * 包括：背景音乐（节拍驱动）、打击音效、判定反馈音效
 *
 * 正式版本应替换为真实音频文件
 */

export class AudioGenerator {
  private audioContext: AudioContext;

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
  }

  /**
   * 生成节拍驱动的背景音乐 AudioBuffer
   * @param bpm 每分钟节拍数
   * @param durationMs 总时长（ms）
   */
  generateBackgroundMusic(bpm: number, durationMs: number): AudioBuffer {
    const sampleRate = this.audioContext.sampleRate;
    const durationSec = durationMs / 1000;
    const totalSamples = Math.ceil(sampleRate * durationSec);
    const buffer = this.audioContext.createBuffer(2, totalSamples, sampleRate);

    const leftChannel = buffer.getChannelData(0);
    const rightChannel = buffer.getChannelData(1);

    const beatInterval = 60 / bpm; // 秒
    const samplesPerBeat = Math.floor(sampleRate * beatInterval);

    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      const beatPhase = (i % samplesPerBeat) / samplesPerBeat;

      // 低频 bass（每拍重拍）
      const bassEnvelope = Math.max(0, 1 - beatPhase * 4);
      const bassFreq = 80;
      const bass = Math.sin(2 * Math.PI * bassFreq * t) * bassEnvelope * 0.3;

      // 中频 pad（持续的和弦垫底）
      const padFreq1 = 220 * (1 + Math.sin(t * 0.1) * 0.02); // 轻微颤音
      const padFreq2 = 330 * (1 + Math.sin(t * 0.13) * 0.02);
      const pad = (Math.sin(2 * Math.PI * padFreq1 * t) + Math.sin(2 * Math.PI * padFreq2 * t)) * 0.08;

      // 高频 hi-hat（每半拍）
      const halfBeatPhase = (i % Math.floor(samplesPerBeat / 2)) / (samplesPerBeat / 2);
      const hihatEnvelope = Math.max(0, 1 - halfBeatPhase * 12);
      const hihat = (Math.random() * 2 - 1) * hihatEnvelope * 0.05;

      // 合成
      const sample = bass + pad + hihat;
      leftChannel[i] = sample;
      rightChannel[i] = sample;
    }

    return buffer;
  }

  /**
   * 生成打击/敲击音效（用于节拍输入反馈）
   */
  generateTapSound(): AudioBuffer {
    const sampleRate = this.audioContext.sampleRate;
    const duration = 0.1; // 100ms
    const totalSamples = Math.ceil(sampleRate * duration);
    const buffer = this.audioContext.createBuffer(1, totalSamples, sampleRate);
    const channel = buffer.getChannelData(0);

    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      const envelope = Math.max(0, 1 - t / duration);
      const freq = 800 * Math.pow(0.5, t * 10); // 下降频率
      channel[i] = Math.sin(2 * Math.PI * freq * t) * envelope * 0.5;
    }

    return buffer;
  }

  /**
   * 生成 Perfect 判定音效（清脆高音）
   */
  generatePerfectSound(): AudioBuffer {
    const sampleRate = this.audioContext.sampleRate;
    const duration = 0.15;
    const totalSamples = Math.ceil(sampleRate * duration);
    const buffer = this.audioContext.createBuffer(1, totalSamples, sampleRate);
    const channel = buffer.getChannelData(0);

    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      const envelope = Math.pow(Math.max(0, 1 - t / duration), 2);
      // 双音和谐
      const tone1 = Math.sin(2 * Math.PI * 1200 * t);
      const tone2 = Math.sin(2 * Math.PI * 1800 * t);
      channel[i] = (tone1 * 0.4 + tone2 * 0.3) * envelope;
    }

    return buffer;
  }

  /**
   * 生成 Great 判定音效
   */
  generateGreatSound(): AudioBuffer {
    const sampleRate = this.audioContext.sampleRate;
    const duration = 0.12;
    const totalSamples = Math.ceil(sampleRate * duration);
    const buffer = this.audioContext.createBuffer(1, totalSamples, sampleRate);
    const channel = buffer.getChannelData(0);

    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      const envelope = Math.max(0, 1 - t / duration);
      channel[i] = Math.sin(2 * Math.PI * 900 * t) * envelope * 0.4;
    }

    return buffer;
  }

  /**
   * 生成 Good 判定音效（较沉闷）
   */
  generateGoodSound(): AudioBuffer {
    const sampleRate = this.audioContext.sampleRate;
    const duration = 0.1;
    const totalSamples = Math.ceil(sampleRate * duration);
    const buffer = this.audioContext.createBuffer(1, totalSamples, sampleRate);
    const channel = buffer.getChannelData(0);

    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      const envelope = Math.max(0, 1 - t / duration);
      channel[i] = Math.sin(2 * Math.PI * 500 * t) * envelope * 0.3;
    }

    return buffer;
  }

  /**
   * 生成 Miss 音效（低频沉闷）
   */
  generateMissSound(): AudioBuffer {
    const sampleRate = this.audioContext.sampleRate;
    const duration = 0.2;
    const totalSamples = Math.ceil(sampleRate * duration);
    const buffer = this.audioContext.createBuffer(1, totalSamples, sampleRate);
    const channel = buffer.getChannelData(0);

    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      const envelope = Math.max(0, 1 - t / duration);
      channel[i] = Math.sin(2 * Math.PI * 200 * t) * envelope * 0.3 + (Math.random() - 0.5) * envelope * 0.1;
    }

    return buffer;
  }

  /**
   * 生成冲刺预警音效（由低到高的升调）
   */
  generateSprintWarningSound(): AudioBuffer {
    const sampleRate = this.audioContext.sampleRate;
    const duration = 0.5;
    const totalSamples = Math.ceil(sampleRate * duration);
    const buffer = this.audioContext.createBuffer(1, totalSamples, sampleRate);
    const channel = buffer.getChannelData(0);

    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      const progress = t / duration;
      const envelope = Math.sin(progress * Math.PI); // 中间最大
      const freq = 400 + progress * 800; // 400Hz → 1200Hz 升调
      channel[i] = Math.sin(2 * Math.PI * freq * t) * envelope * 0.4;
    }

    return buffer;
  }

  /**
   * 生成连击里程碑音效（三连音）
   */
  generateComboMilestoneSound(): AudioBuffer {
    const sampleRate = this.audioContext.sampleRate;
    const duration = 0.3;
    const totalSamples = Math.ceil(sampleRate * duration);
    const buffer = this.audioContext.createBuffer(1, totalSamples, sampleRate);
    const channel = buffer.getChannelData(0);

    const notes = [1000, 1200, 1500]; // 三连音频率
    const noteLength = duration / 3;

    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      const noteIndex = Math.min(2, Math.floor(t / noteLength));
      const noteT = t - noteIndex * noteLength;
      const envelope = Math.max(0, 1 - noteT / noteLength);
      channel[i] = Math.sin(2 * Math.PI * notes[noteIndex] * t) * envelope * 0.4;
    }

    return buffer;
  }

  /**
   * 生成终点冲线音效
   */
  generateFinishSound(): AudioBuffer {
    const sampleRate = this.audioContext.sampleRate;
    const duration = 1.0;
    const totalSamples = Math.ceil(sampleRate * duration);
    const buffer = this.audioContext.createBuffer(2, totalSamples, sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);

    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      const envelope = Math.pow(Math.max(0, 1 - t / duration), 0.5);

      // 和弦大三和弦 C-E-G
      const c = Math.sin(2 * Math.PI * 523 * t);
      const e = Math.sin(2 * Math.PI * 659 * t);
      const g = Math.sin(2 * Math.PI * 784 * t);

      const sample = (c + e + g) / 3 * envelope * 0.5;
      left[i] = sample;
      right[i] = sample;
    }

    return buffer;
  }
}

/**
 * 音频资源管理器
 * 预加载所有音效并提供播放接口
 */
export class AudioManager {
  private audioContext: AudioContext;
  private generator: AudioGenerator;
  private masterGain: GainNode;

  // 预加载的音频缓冲
  private bgmBuffer: AudioBuffer | null = null;
  private tapBuffer: AudioBuffer | null = null;
  private perfectBuffer: AudioBuffer | null = null;
  private greatBuffer: AudioBuffer | null = null;
  private goodBuffer: AudioBuffer | null = null;
  private missBuffer: AudioBuffer | null = null;
  private sprintWarningBuffer: AudioBuffer | null = null;
  private comboMilestoneBuffer: AudioBuffer | null = null;
  private finishBuffer: AudioBuffer | null = null;

  // 当前播放的 BGM 源
  private bgmSource: AudioBufferSourceNode | null = null;
  private bgmStartTime: number = 0;
  private bgmPauseOffset: number = 0;
  private isPlaying: boolean = false;

  constructor() {
    this.audioContext = new AudioContext();
    this.generator = new AudioGenerator(this.audioContext);
    this.masterGain = this.audioContext.createGain();
    this.masterGain.connect(this.audioContext.destination);
    this.masterGain.gain.value = 0.8;
  }

  get context(): AudioContext {
    return this.audioContext;
  }

  /** 获取当前 BGM 播放时间（ms） */
  get currentTimeMs(): number {
    if (!this.isPlaying) return this.bgmPauseOffset * 1000;
    return (this.audioContext.currentTime - this.bgmStartTime + this.bgmPauseOffset) * 1000;
  }

  /**
   * 预加载所有音频资源
   */
  async preload(bpm: number, durationMs: number): Promise<void> {
    // 确保 AudioContext 已激活
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    this.bgmBuffer = this.generator.generateBackgroundMusic(bpm, durationMs);
    this.tapBuffer = this.generator.generateTapSound();
    this.perfectBuffer = this.generator.generatePerfectSound();
    this.greatBuffer = this.generator.generateGreatSound();
    this.goodBuffer = this.generator.generateGoodSound();
    this.missBuffer = this.generator.generateMissSound();
    this.sprintWarningBuffer = this.generator.generateSprintWarningSound();
    this.comboMilestoneBuffer = this.generator.generateComboMilestoneSound();
    this.finishBuffer = this.generator.generateFinishSound();
  }

  /** 播放背景音乐 */
  playBGM(): void {
    if (!this.bgmBuffer || this.isPlaying) return;

    this.bgmSource = this.audioContext.createBufferSource();
    this.bgmSource.buffer = this.bgmBuffer;

    const bgmGain = this.audioContext.createGain();
    bgmGain.gain.value = 0.5; // BGM 音量较低
    this.bgmSource.connect(bgmGain);
    bgmGain.connect(this.masterGain);

    this.bgmSource.start(0, this.bgmPauseOffset);
    this.bgmStartTime = this.audioContext.currentTime;
    this.isPlaying = true;

    this.bgmSource.onended = () => {
      this.isPlaying = false;
    };
  }

  /** 暂停 BGM */
  pauseBGM(): void {
    if (!this.bgmSource || !this.isPlaying) return;
    this.bgmPauseOffset += this.audioContext.currentTime - this.bgmStartTime;
    this.bgmSource.stop();
    this.bgmSource = null;
    this.isPlaying = false;
  }

  /** 停止 BGM */
  stopBGM(): void {
    if (this.bgmSource) {
      this.bgmSource.stop();
      this.bgmSource = null;
    }
    this.isPlaying = false;
    this.bgmPauseOffset = 0;
  }

  /** 播放一次性音效 */
  private playOneShot(buffer: AudioBuffer | null, volume: number = 1.0): void {
    if (!buffer) return;
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    const gain = this.audioContext.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(this.masterGain);
    source.start();
  }

  playTap(): void { this.playOneShot(this.tapBuffer); }
  playPerfect(): void { this.playOneShot(this.perfectBuffer); }
  playGreat(): void { this.playOneShot(this.greatBuffer); }
  playGood(): void { this.playOneShot(this.goodBuffer); }
  playMiss(): void { this.playOneShot(this.missBuffer, 0.6); }
  playSprintWarning(): void { this.playOneShot(this.sprintWarningBuffer); }
  playComboMilestone(): void { this.playOneShot(this.comboMilestoneBuffer); }
  playFinish(): void { this.playOneShot(this.finishBuffer); }

  /** 设置主音量 (0-1) */
  setVolume(volume: number): void {
    this.masterGain.gain.value = Math.max(0, Math.min(1, volume));
  }

  /** 销毁并释放资源 */
  dispose(): void {
    this.stopBGM();
    this.audioContext.close();
  }
}
