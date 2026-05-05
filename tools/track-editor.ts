/**
 * 曲目节拍数据编辑/校准工具
 *
 * 功能：
 *   - 从 BPM 检测结果生成初始 TrackData
 *   - 手动添加/删除/修改音符
 *   - 标注冲刺段落
 *   - 校准节拍偏移量
 *   - 输出符合 TrackData 格式的 JSON 文件
 *
 * 用法：
 *   npx tsx tools/track-editor.ts create --bpm 128 --audio "song.wav" --title "Song Name" --artist "Artist"
 *   npx tsx tools/track-editor.ts adjust --file "track.json" --offset 15
 *   npx tsx tools/track-editor.ts add-sprint --file "track.json" --start 30000 --end 42000
 *   npx tsx tools/track-editor.ts validate --file "track.json"
 *   npx tsx tools/track-editor.ts generate-notes --file "track.json" --pattern mixed
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TrackData, NoteData, SprintSection, NoteType } from '../shared/protocol/track-data.js';

// ============ 命令处理 ============

type Command = 'create' | 'adjust' | 'add-sprint' | 'validate' | 'generate-notes' | 'info';

function parseArgs(args: string[]): { command: Command; flags: Record<string, string> } {
  const command = args[0] as Command;
  const flags: Record<string, string> = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      flags[key] = args[i + 1] || 'true';
      i++;
    }
  }

  return { command, flags };
}

/**
 * 创建新的 TrackData 文件
 */
function createTrack(flags: Record<string, string>): void {
  const bpm = Number(flags.bpm) || 120;
  const duration = Number(flags.duration) || 180000; // 默认 3 分钟
  const title = flags.title || 'Untitled';
  const artist = flags.artist || 'Unknown';
  const audio = flags.audio || 'untitled.wav';
  const difficulty = Number(flags.difficulty) || 5;
  const output = flags.output || `${title.toLowerCase().replace(/\s+/g, '-')}.track.json`;

  // 计算基础速率：50米 / (duration * 0.9 / beatInterval) 拍
  const beatInterval = 60000 / bpm;
  const totalBeats = Math.floor(duration * 0.9 / beatInterval);
  const baseSpeed = 50 / totalBeats; // 米/拍

  const trackData: TrackData = {
    version: 1,
    metadata: {
      id: title.toLowerCase().replace(/\s+/g, '-'),
      title,
      artist,
      bpm,
      duration,
      difficulty,
      audioFile: audio,
      baseSpeed: Math.round(baseSpeed * 10000) / 10000,
    },
    notes: [],
    sprintSections: [],
  };

  const outputPath = resolve(output);
  writeFileSync(outputPath, JSON.stringify(trackData, null, 2));
  console.log(`[TrackEditor] Created: ${outputPath}`);
  console.log(`  BPM: ${bpm}, Duration: ${(duration / 1000).toFixed(1)}s`);
  console.log(`  Base Speed: ${trackData.metadata.baseSpeed} m/beat`);
  console.log(`  Total beats (full song): ${totalBeats}`);
}

/**
 * 校准节拍偏移量（将所有音符时间整体偏移）
 */
function adjustOffset(flags: Record<string, string>): void {
  const filePath = resolve(flags.file);
  const offset = Number(flags.offset) || 0;

  const trackData: TrackData = JSON.parse(readFileSync(filePath, 'utf-8'));

  trackData.notes = trackData.notes.map(note => ({
    ...note,
    time: Math.max(0, note.time + offset),
  }));

  trackData.sprintSections = trackData.sprintSections.map(section => ({
    startTime: Math.max(0, section.startTime + offset),
    endTime: section.endTime + offset,
  }));

  writeFileSync(filePath, JSON.stringify(trackData, null, 2));
  console.log(`[TrackEditor] Adjusted offset: ${offset}ms`);
  console.log(`  Notes adjusted: ${trackData.notes.length}`);
}

/**
 * 添加冲刺段落
 */
function addSprint(flags: Record<string, string>): void {
  const filePath = resolve(flags.file);
  const startTime = Number(flags.start);
  const endTime = Number(flags.end);

  if (!startTime || !endTime || endTime <= startTime) {
    console.error('[Error] Invalid sprint times. --start and --end must be valid ms values.');
    process.exit(1);
  }

  const duration = endTime - startTime;
  if (duration < 8000 || duration > 16000) {
    console.warn(`[Warning] Sprint duration ${duration}ms is outside recommended range (8000-16000ms).`);
  }

  const trackData: TrackData = JSON.parse(readFileSync(filePath, 'utf-8'));

  if (trackData.sprintSections.length >= 3) {
    console.error('[Error] Maximum 3 sprint sections allowed.');
    process.exit(1);
  }

  const newSprint: SprintSection = { startTime, endTime };
  trackData.sprintSections.push(newSprint);
  trackData.sprintSections.sort((a, b) => a.startTime - b.startTime);

  writeFileSync(filePath, JSON.stringify(trackData, null, 2));
  console.log(`[TrackEditor] Added sprint section: ${startTime}ms - ${endTime}ms (${(duration / 1000).toFixed(1)}s)`);
}

/**
 * 自动生成音符（按 BPM 节拍生成）
 */
function generateNotes(flags: Record<string, string>): void {
  const filePath = resolve(flags.file);
  const pattern = (flags.pattern || 'simple') as 'simple' | 'mixed' | 'dense';

  const trackData: TrackData = JSON.parse(readFileSync(filePath, 'utf-8'));
  const { bpm, duration } = trackData.metadata;
  const beatInterval = 60000 / bpm;

  const notes: NoteData[] = [];
  let noteId = 1;
  let time = beatInterval; // 从第一拍开始

  while (time < duration - 1000) {
    let type: NoteType = 'tap';

    if (pattern === 'mixed' || pattern === 'dense') {
      const rand = Math.random();
      if (rand < 0.1) {
        type = 'hold';
      } else if (rand < 0.15) {
        type = 'double';
      }
    }

    const note: NoteData = {
      id: noteId++,
      time: Math.round(time),
      type,
    };

    if (type === 'hold') {
      note.holdDuration = Math.round(beatInterval * (1 + Math.random()));
    }

    notes.push(note);

    // dense 模式在某些拍有半拍音符
    if (pattern === 'dense' && Math.random() < 0.3) {
      time += beatInterval / 2;
      notes.push({
        id: noteId++,
        time: Math.round(time),
        type: 'tap',
      });
      time += beatInterval / 2;
    } else {
      time += beatInterval;
    }
  }

  trackData.notes = notes;

  writeFileSync(filePath, JSON.stringify(trackData, null, 2));
  console.log(`[TrackEditor] Generated ${notes.length} notes (pattern: ${pattern})`);
}

/**
 * 验证 TrackData 文件
 */
function validateTrack(flags: Record<string, string>): void {
  const filePath = resolve(flags.file);
  const trackData: TrackData = JSON.parse(readFileSync(filePath, 'utf-8'));
  const errors: string[] = [];
  const warnings: string[] = [];

  const { metadata, notes, sprintSections } = trackData;

  // 元数据验证
  if (metadata.bpm < 60 || metadata.bpm > 240) {
    errors.push(`BPM ${metadata.bpm} out of range (60-240)`);
  }
  if (metadata.duration <= 0) {
    errors.push('Duration must be > 0');
  }
  if (metadata.difficulty < 1 || metadata.difficulty > 10) {
    errors.push(`Difficulty ${metadata.difficulty} out of range (1-10)`);
  }
  if (metadata.baseSpeed <= 0) {
    errors.push('Base speed must be > 0');
  }

  // 音符验证
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    if (note.time < 0 || note.time > metadata.duration) {
      errors.push(`Note ${note.id}: time ${note.time}ms out of range`);
    }
    if (i > 0 && note.time < notes[i - 1].time) {
      errors.push(`Note ${note.id}: not in ascending time order`);
    }
    if (note.type === 'hold' && (!note.holdDuration || note.holdDuration < 100)) {
      errors.push(`Note ${note.id}: hold type must have holdDuration >= 100ms`);
    }
  }

  // 冲刺段落验证
  if (sprintSections.length > 3) {
    errors.push(`Sprint sections: ${sprintSections.length} exceeds max (3)`);
  }
  for (let i = 0; i < sprintSections.length; i++) {
    const section = sprintSections[i];
    const dur = section.endTime - section.startTime;
    if (dur < 8000 || dur > 16000) {
      warnings.push(`Sprint ${i + 1}: duration ${dur}ms outside recommended range (8000-16000ms)`);
    }
    if (i > 0 && section.startTime < sprintSections[i - 1].endTime) {
      errors.push(`Sprint ${i + 1}: overlaps with previous section`);
    }
  }

  // 基础速率验证
  const beatInterval = 60000 / metadata.bpm;
  const totalBeats = notes.length;
  const fullPerfectTime = totalBeats * beatInterval;
  const completionRatio = fullPerfectTime / metadata.duration;
  if (completionRatio < 0.85 || completionRatio > 0.95) {
    warnings.push(`Full-perfect completion ratio: ${(completionRatio * 100).toFixed(1)}% (target: 85%-95%)`);
  }

  // 输出结果
  console.log(`[TrackEditor] Validation: ${filePath}`);
  console.log(`  Notes: ${notes.length}, Sprints: ${sprintSections.length}`);

  if (errors.length === 0 && warnings.length === 0) {
    console.log('  ✓ All checks passed!');
  } else {
    if (errors.length > 0) {
      console.log(`  ✗ ${errors.length} error(s):`);
      errors.forEach(e => console.log(`    - ${e}`));
    }
    if (warnings.length > 0) {
      console.log(`  ⚠ ${warnings.length} warning(s):`);
      warnings.forEach(w => console.log(`    - ${w}`));
    }
  }

  if (errors.length > 0) process.exit(1);
}

/**
 * 显示曲目信息
 */
function showInfo(flags: Record<string, string>): void {
  const filePath = resolve(flags.file);
  const trackData: TrackData = JSON.parse(readFileSync(filePath, 'utf-8'));
  const { metadata, notes, sprintSections } = trackData;

  console.log(`\n[Track Info]`);
  console.log(`  Title: ${metadata.title}`);
  console.log(`  Artist: ${metadata.artist}`);
  console.log(`  BPM: ${metadata.bpm}`);
  console.log(`  Duration: ${(metadata.duration / 1000).toFixed(1)}s`);
  console.log(`  Difficulty: ${metadata.difficulty}/10`);
  console.log(`  Base Speed: ${metadata.baseSpeed} m/beat`);
  console.log(`  Audio: ${metadata.audioFile}`);
  console.log(`  Notes: ${notes.length}`);
  console.log(`  Sprint Sections: ${sprintSections.length}`);

  if (notes.length > 0) {
    const types = { tap: 0, hold: 0, double: 0 };
    notes.forEach(n => types[n.type]++);
    console.log(`  Note Types: tap=${types.tap}, hold=${types.hold}, double=${types.double}`);
  }

  if (sprintSections.length > 0) {
    sprintSections.forEach((s, i) => {
      console.log(`  Sprint ${i + 1}: ${(s.startTime / 1000).toFixed(1)}s - ${(s.endTime / 1000).toFixed(1)}s (${((s.endTime - s.startTime) / 1000).toFixed(1)}s)`);
    });
  }
}

// ============ CLI 入口 ============
if (process.argv[1]?.includes('track-editor')) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`Track Editor - 曲目节拍数据编辑工具

Commands:
  create          Create new track data file
    --bpm         BPM (default: 120)
    --duration    Duration in ms (default: 180000)
    --title       Track title
    --artist      Artist name
    --audio       Audio file path
    --difficulty  Difficulty 1-10 (default: 5)
    --output      Output file path

  generate-notes  Auto-generate notes from BPM
    --file        Track data file path
    --pattern     Note pattern: simple|mixed|dense (default: simple)

  add-sprint      Add a sprint section
    --file        Track data file path
    --start       Start time in ms
    --end         End time in ms

  adjust          Adjust timing offset for all notes
    --file        Track data file path
    --offset      Offset in ms (positive = later, negative = earlier)

  validate        Validate track data file
    --file        Track data file path

  info            Show track information
    --file        Track data file path
`);
    process.exit(0);
  }

  const { command, flags } = parseArgs(args);

  switch (command) {
    case 'create':
      createTrack(flags);
      break;
    case 'adjust':
      adjustOffset(flags);
      break;
    case 'add-sprint':
      addSprint(flags);
      break;
    case 'generate-notes':
      generateNotes(flags);
      break;
    case 'validate':
      validateTrack(flags);
      break;
    case 'info':
      showInfo(flags);
      break;
    default:
      console.error(`[Error] Unknown command: ${command}`);
      process.exit(1);
  }
}
