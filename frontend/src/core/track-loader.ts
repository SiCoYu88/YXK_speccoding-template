/**
 * 曲目节拍数据加载器
 * 负责加载 TrackData JSON，构建时间轴索引以便高效查询
 */

import type { TrackData, NoteData, SprintSection } from '@shared/protocol/track-data.js';

/** 时间轴索引 - 用于快速查找某时间点附近的音符 */
export interface TimelineIndex {
  /** 按时间排序的音符数组（引用原始数据） */
  notes: NoteData[];
  /** 每秒的起始音符索引（bucket），用于 O(1) 定位 */
  secondBuckets: Map<number, number>;
  /** 冲刺段落 */
  sprints: SprintSection[];
  /** BPM */
  bpm: number;
  /** 每拍时长 ms */
  beatInterval: number;
  /** 总时长 ms */
  duration: number;
}

/**
 * 加载并解析曲目节拍数据
 */
export async function loadTrackData(trackId: string): Promise<TrackData> {
  const url = `/music/${trackId}.track.json`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to load track data: ${url} (${response.status})`);
  }

  const data: TrackData = await response.json();

  // 基本验证
  if (data.version !== 1) {
    throw new Error(`Unsupported track data version: ${data.version}`);
  }

  if (!data.metadata || !data.notes || !data.sprintSections) {
    throw new Error('Invalid track data: missing required fields');
  }

  return data;
}

/**
 * 构建时间轴索引
 * 将音符按秒分桶，实现 O(1) 时间定位
 */
export function buildTimelineIndex(trackData: TrackData): TimelineIndex {
  const { metadata, notes, sprintSections } = trackData;
  const beatInterval = 60000 / metadata.bpm;

  // 确保音符按时间排序
  const sortedNotes = [...notes].sort((a, b) => a.time - b.time);

  // 构建秒级分桶索引
  const secondBuckets = new Map<number, number>();
  for (let i = 0; i < sortedNotes.length; i++) {
    const second = Math.floor(sortedNotes[i].time / 1000);
    if (!secondBuckets.has(second)) {
      secondBuckets.set(second, i);
    }
  }

  return {
    notes: sortedNotes,
    secondBuckets,
    sprints: [...sprintSections].sort((a, b) => a.startTime - b.startTime),
    bpm: metadata.bpm,
    beatInterval,
    duration: metadata.duration,
  };
}

/**
 * 查询某时间范围内的音符
 * @param index 时间轴索引
 * @param startMs 起始时间（ms）
 * @param endMs 结束时间（ms）
 * @returns 该范围内的所有音符
 */
export function queryNotesInRange(index: TimelineIndex, startMs: number, endMs: number): NoteData[] {
  const startSecond = Math.floor(startMs / 1000);
  const endSecond = Math.floor(endMs / 1000);

  // 找到起始搜索位置
  let searchStart = 0;
  for (let s = startSecond; s >= 0; s--) {
    if (index.secondBuckets.has(s)) {
      searchStart = index.secondBuckets.get(s)!;
      break;
    }
  }

  // 线性搜索范围内的音符
  const result: NoteData[] = [];
  for (let i = searchStart; i < index.notes.length; i++) {
    const note = index.notes[i];
    if (note.time > endMs) break;
    if (note.time >= startMs) {
      result.push(note);
    }
  }

  return result;
}

/**
 * 查找距离指定时间最近的音符
 * @param index 时间轴索引
 * @param timeMs 目标时间（ms）
 * @param maxDistanceMs 最大搜索距离（ms）
 * @returns 最近的音符及时间差，如果无则返回 null
 */
export function findNearestNote(
  index: TimelineIndex,
  timeMs: number,
  maxDistanceMs: number = 150
): { note: NoteData; delta: number } | null {
  const notes = queryNotesInRange(index, timeMs - maxDistanceMs, timeMs + maxDistanceMs);

  if (notes.length === 0) return null;

  let nearest: NoteData = notes[0];
  let minDelta = Math.abs(notes[0].time - timeMs);

  for (let i = 1; i < notes.length; i++) {
    const delta = Math.abs(notes[i].time - timeMs);
    if (delta < minDelta) {
      minDelta = delta;
      nearest = notes[i];
    }
  }

  return { note: nearest, delta: nearest.time - timeMs };
}

/**
 * 判断指定时间是否处于冲刺段落中
 * @param index 时间轴索引
 * @param timeMs 当前时间
 * @returns 冲刺段落信息或 null
 */
export function getSprintAtTime(index: TimelineIndex, timeMs: number): SprintSection | null {
  for (const sprint of index.sprints) {
    if (timeMs >= sprint.startTime && timeMs <= sprint.endTime) {
      return sprint;
    }
    if (sprint.startTime > timeMs) break; // 已排序，后续不需要检查
  }
  return null;
}

/**
 * 获取即将到来的下一个冲刺段落
 * @param index 时间轴索引
 * @param timeMs 当前时间
 * @returns 下一个冲刺段落或 null
 */
export function getNextSprint(index: TimelineIndex, timeMs: number): SprintSection | null {
  for (const sprint of index.sprints) {
    if (sprint.startTime > timeMs) {
      return sprint;
    }
  }
  return null;
}
