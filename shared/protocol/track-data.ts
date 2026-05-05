/**
 * 曲目节拍数据格式定义
 *
 * 每首曲目的节拍数据以 JSON 文件存储，运行时加载。
 * 文件命名规则：<track-id>.track.json
 */

/** 音符类型 */
export type NoteType = 'tap' | 'hold' | 'double';

/** 单个音符定义 */
export interface NoteData {
  /** 音符唯一 ID（在单曲中递增） */
  id: number;
  /** 音符对应的节拍时间点（ms，从曲目开始算起） */
  time: number;
  /** 音符类型 */
  type: NoteType;
  /** 长按音符的持续时间（ms），仅 type='hold' 时有效 */
  holdDuration?: number;
}

/** 冲刺段落定义 */
export interface SprintSection {
  /** 冲刺开始时间（ms） */
  startTime: number;
  /** 冲刺结束时间（ms） */
  endTime: number;
}

/** 曲目元数据 */
export interface TrackMetadata {
  /** 曲目唯一标识 */
  id: string;
  /** 曲目名称 */
  title: string;
  /** 艺术家/作者 */
  artist: string;
  /** BPM（每分钟节拍数） */
  bpm: number;
  /** 曲目总时长（ms） */
  duration: number;
  /** 难度等级（1-10） */
  difficulty: number;
  /** 音频文件路径（相对于 assets/music/） */
  audioFile: string;
  /** 基础速率（米/拍），决定全 Perfect 完赛时间 */
  baseSpeed: number;
}

/** 完整曲目节拍数据 */
export interface TrackData {
  /** 数据格式版本 */
  version: 1;
  /** 曲目元数据 */
  metadata: TrackMetadata;
  /** 所有音符列表（按时间排序） */
  notes: NoteData[];
  /** 冲刺段落列表（按时间排序，1-3个） */
  sprintSections: SprintSection[];
}

/**
 * JSON Schema 约束说明（供验证工具使用）：
 *
 * - metadata.bpm: 60-240 之间的正整数
 * - metadata.duration: > 0
 * - metadata.difficulty: 1-10 整数
 * - metadata.baseSpeed: > 0，需确保全 Perfect 完赛时间在曲目时长 85%-95%
 * - notes: 按 time 升序排列，id 从 1 开始递增
 * - notes[].time: >= 0 且 <= metadata.duration
 * - notes[].holdDuration: 仅 type='hold' 时必填，>= 100ms
 * - sprintSections: 1-3 个元素
 * - sprintSections[].duration (endTime - startTime): 8000ms - 16000ms
 * - sprintSections 不重叠，按 startTime 升序
 */
