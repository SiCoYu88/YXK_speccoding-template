/**
 * 离线 BPM 检测工具
 *
 * 读取音频文件，通过能量峰值分析检测节拍时间点。
 * 输出：BPM 值 + 节拍时间点数组
 *
 * 用法：
 *   npx tsx tools/bpm-detector.ts <audio-file-path> [--output <output.json>]
 *
 * 原理：
 *   1. 解码音频为 PCM 数据
 *   2. 将音频分段计算能量（每段约 10ms）
 *   3. 检测能量峰值（超过局部平均的阈值）
 *   4. 分析峰值间隔推导 BPM
 *   5. 以推导的 BPM 生成量化后的节拍时间点
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ============ 配置 ============
const SAMPLE_RATE = 44100;
const SEGMENT_MS = 10;           // 每段 10ms
const SEGMENT_SAMPLES = Math.floor(SAMPLE_RATE * SEGMENT_MS / 1000);
const ENERGY_THRESHOLD = 1.4;    // 峰值需要比局部平均高 40%
const LOCAL_WINDOW = 40;         // 局部窗口大小（±20段）
const MIN_PEAK_DISTANCE_MS = 200; // 两个峰值最小间距（防抖）

interface BPMResult {
  bpm: number;
  beatTimes: number[];  // 每个节拍的时间（ms）
  confidence: number;   // 0-1，检测置信度
}

/**
 * 从 WAV 文件读取 PCM 样本数据（简化版，仅支持 16-bit PCM WAV）
 */
function readWavPCM(filePath: string): { samples: Float32Array; sampleRate: number } {
  const buffer = readFileSync(filePath);

  // 验证 WAV 头
  const riff = buffer.toString('ascii', 0, 4);
  if (riff !== 'RIFF') {
    throw new Error('Not a valid WAV file (missing RIFF header)');
  }

  const format = buffer.toString('ascii', 8, 12);
  if (format !== 'WAVE') {
    throw new Error('Not a valid WAV file (missing WAVE format)');
  }

  // 解析 fmt 块
  const numChannels = buffer.readUInt16LE(22);
  const sampleRate = buffer.readUInt32LE(24);
  const bitsPerSample = buffer.readUInt16LE(34);

  if (bitsPerSample !== 16) {
    throw new Error(`Unsupported bits per sample: ${bitsPerSample}. Only 16-bit PCM is supported.`);
  }

  // 找到 data 块
  let offset = 36;
  while (offset < buffer.length - 8) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkId === 'data') {
      offset += 8;
      break;
    }
    offset += 8 + chunkSize;
  }

  // 读取 PCM 样本并转为单声道 float
  const bytesPerSample = bitsPerSample / 8;
  const totalSamples = Math.floor((buffer.length - offset) / (bytesPerSample * numChannels));
  const samples = new Float32Array(totalSamples);

  for (let i = 0; i < totalSamples; i++) {
    let sum = 0;
    for (let ch = 0; ch < numChannels; ch++) {
      const sampleOffset = offset + (i * numChannels + ch) * bytesPerSample;
      sum += buffer.readInt16LE(sampleOffset) / 32768;
    }
    samples[i] = sum / numChannels;
  }

  return { samples, sampleRate };
}

/**
 * 计算每段的能量值
 */
function computeEnergy(samples: Float32Array): number[] {
  const numSegments = Math.floor(samples.length / SEGMENT_SAMPLES);
  const energy: number[] = new Array(numSegments);

  for (let i = 0; i < numSegments; i++) {
    let sum = 0;
    const start = i * SEGMENT_SAMPLES;
    for (let j = 0; j < SEGMENT_SAMPLES; j++) {
      sum += samples[start + j] ** 2;
    }
    energy[i] = sum / SEGMENT_SAMPLES;
  }

  return energy;
}

/**
 * 检测能量峰值
 */
function detectPeaks(energy: number[]): number[] {
  const peaks: number[] = [];
  let lastPeakIdx = -Infinity;

  const minPeakDistance = Math.floor(MIN_PEAK_DISTANCE_MS / SEGMENT_MS);

  for (let i = LOCAL_WINDOW; i < energy.length - LOCAL_WINDOW; i++) {
    // 计算局部平均
    let localSum = 0;
    for (let j = i - LOCAL_WINDOW; j <= i + LOCAL_WINDOW; j++) {
      localSum += energy[j];
    }
    const localAvg = localSum / (LOCAL_WINDOW * 2 + 1);

    // 检查是否是峰值
    if (energy[i] > localAvg * ENERGY_THRESHOLD && (i - lastPeakIdx) >= minPeakDistance) {
      // 确认是局部最大值
      let isMax = true;
      for (let j = Math.max(0, i - 3); j <= Math.min(energy.length - 1, i + 3); j++) {
        if (j !== i && energy[j] > energy[i]) {
          isMax = false;
          break;
        }
      }
      if (isMax) {
        peaks.push(i);
        lastPeakIdx = i;
      }
    }
  }

  return peaks;
}

/**
 * 从峰值间隔推导 BPM
 */
function estimateBPM(peakIndices: number[]): { bpm: number; confidence: number } {
  if (peakIndices.length < 4) {
    return { bpm: 120, confidence: 0 };
  }

  // 计算所有相邻峰值的间隔
  const intervals: number[] = [];
  for (let i = 1; i < peakIndices.length; i++) {
    intervals.push((peakIndices[i] - peakIndices[i - 1]) * SEGMENT_MS);
  }

  // 统计间隔的直方图（以 10ms 为 bin）
  const histogram = new Map<number, number>();
  for (const interval of intervals) {
    const bin = Math.round(interval / 10) * 10;
    histogram.set(bin, (histogram.get(bin) || 0) + 1);
  }

  // 找到最频繁的间隔
  let bestBin = 500;
  let bestCount = 0;
  for (const [bin, count] of histogram) {
    if (count > bestCount && bin >= 200 && bin <= 1500) {
      bestCount = count;
      bestBin = bin;
    }
  }

  const bpm = Math.round(60000 / bestBin);
  const confidence = Math.min(1, bestCount / intervals.length);

  // BPM 合理范围：60-240
  const clampedBPM = Math.max(60, Math.min(240, bpm));

  return { bpm: clampedBPM, confidence };
}

/**
 * 根据估计的 BPM 生成量化后的节拍时间点
 */
function generateBeatTimes(bpm: number, durationMs: number, peakTimesMs: number[]): number[] {
  const beatInterval = 60000 / bpm;
  const beats: number[] = [];

  // 找到最佳起始偏移（与峰值最对齐的偏移量）
  let bestOffset = 0;
  let bestScore = -Infinity;

  for (let offset = 0; offset < beatInterval; offset += 5) {
    let score = 0;
    for (const peakTime of peakTimesMs) {
      const nearestBeat = Math.round((peakTime - offset) / beatInterval) * beatInterval + offset;
      const diff = Math.abs(peakTime - nearestBeat);
      if (diff < 50) score += 1;
      else if (diff < 100) score += 0.5;
    }
    if (score > bestScore) {
      bestScore = score;
      bestOffset = offset;
    }
  }

  // 生成节拍序列
  let time = bestOffset;
  while (time < durationMs) {
    beats.push(Math.round(time));
    time += beatInterval;
  }

  return beats;
}

/**
 * 主检测函数
 */
export function detectBPM(audioFilePath: string): BPMResult {
  console.log(`[BPM Detector] Reading: ${audioFilePath}`);

  const { samples, sampleRate } = readWavPCM(audioFilePath);
  const durationMs = (samples.length / sampleRate) * 1000;

  console.log(`[BPM Detector] Duration: ${(durationMs / 1000).toFixed(1)}s, Sample Rate: ${sampleRate}`);

  // 计算能量
  const energy = computeEnergy(samples);
  console.log(`[BPM Detector] Energy segments: ${energy.length}`);

  // 检测峰值
  const peakIndices = detectPeaks(energy);
  const peakTimesMs = peakIndices.map(i => i * SEGMENT_MS);
  console.log(`[BPM Detector] Peaks detected: ${peakIndices.length}`);

  // 估算 BPM
  const { bpm, confidence } = estimateBPM(peakIndices);
  console.log(`[BPM Detector] Estimated BPM: ${bpm} (confidence: ${(confidence * 100).toFixed(0)}%)`);

  // 生成量化节拍
  const beatTimes = generateBeatTimes(bpm, durationMs, peakTimesMs);
  console.log(`[BPM Detector] Generated beats: ${beatTimes.length}`);

  return { bpm, beatTimes, confidence };
}

// ============ CLI 入口 ============
if (process.argv[1]?.includes('bpm-detector')) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: npx tsx tools/bpm-detector.ts <audio.wav> [--output <output.json>]');
    process.exit(1);
  }

  const audioPath = resolve(args[0]);
  const outputIdx = args.indexOf('--output');
  const outputPath = outputIdx !== -1 ? resolve(args[outputIdx + 1]) : null;

  try {
    const result = detectBPM(audioPath);

    if (outputPath) {
      writeFileSync(outputPath, JSON.stringify(result, null, 2));
      console.log(`[BPM Detector] Result saved to: ${outputPath}`);
    } else {
      console.log('\n[Result]');
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (err) {
    console.error('[BPM Detector] Error:', (err as Error).message);
    process.exit(1);
  }
}
