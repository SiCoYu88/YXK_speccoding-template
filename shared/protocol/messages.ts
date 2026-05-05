/**
 * 前后端共享通信协议 - 消息类型定义
 */

// ============ 基础类型 ============

/** 消息基类 */
export interface BaseMessage {
  type: string;
  timestamp: number;
}

/** 玩家标识 */
export interface PlayerInfo {
  id: string;
  name: string;
  lane: number; // 泳道编号 1-10
}

// ============ 房间系统消息 ============

/** 客户端 → 服务端：请求匹配 */
export interface MatchRequestMessage extends BaseMessage {
  type: 'match:request';
  playerName: string;
}

/** 服务端 → 客户端：匹配成功，加入房间 */
export interface MatchJoinedMessage extends BaseMessage {
  type: 'match:joined';
  roomId: string;
  players: PlayerInfo[];
  localPlayerId: string;
}

/** 服务端 → 客户端：有新玩家加入 */
export interface MatchPlayerJoinedMessage extends BaseMessage {
  type: 'match:player_joined';
  player: PlayerInfo;
  currentCount: number;
  maxCount: number;
}

/** 服务端 → 客户端：倒计时开始 */
export interface CountdownMessage extends BaseMessage {
  type: 'room:countdown';
  seconds: number; // 3, 2, 1, 0(=开始)
}

/** 服务端 → 客户端：比赛正式开始 */
export interface RaceStartMessage extends BaseMessage {
  type: 'race:start';
  trackId: string;
  serverTime: number;
}

// ============ 比赛进行中消息 ============

/** 客户端 → 服务端：玩家节奏输入 */
export interface RhythmInputMessage extends BaseMessage {
  type: 'input:rhythm';
  inputTime: number;       // 本地输入时间戳（ms）
  noteId: number;          // 对应音符 ID
  inputType: InputType;    // 输入类型
  holdDuration?: number;   // 长按持续时长（仅长按类型）
}

/** 输入类型枚举 */
export type InputType = 'tap' | 'hold' | 'double';

/** 服务端 → 客户端：位置同步（广播） */
export interface PositionSyncMessage extends BaseMessage {
  type: 'sync:position';
  players: PlayerPositionData[];
}

/** 单个玩家的位置数据 */
export interface PlayerPositionData {
  id: string;
  progress: number;      // 0-1，表示已游百分比
  speed: number;         // 当前泳速
  stamina: number;       // 当前体力
  combo: number;         // 当前连击数
  animState: AnimState;  // 动画状态
}

/** 动画状态枚举 */
export type AnimState = 'idle' | 'normal' | 'fast' | 'sprint' | 'fatigued' | 'still';

/** 服务端 → 客户端：冲刺段落事件 */
export interface SprintEventMessage extends BaseMessage {
  type: 'sprint:event';
  event: 'warning' | 'start' | 'end';
  countdown?: number; // 仅 warning 时有值
}

// ============ 比赛结束消息 ============

/** 服务端 → 客户端：玩家到达终点 */
export interface PlayerFinishMessage extends BaseMessage {
  type: 'race:player_finish';
  playerId: string;
  finishTime: number;
  rank: number;
}

/** 服务端 → 客户端：比赛结束，全部结算数据 */
export interface RaceResultMessage extends BaseMessage {
  type: 'race:result';
  rankings: RankingEntry[];
}

/** 排名条目 */
export interface RankingEntry {
  rank: number;
  player: PlayerInfo;
  finishTime: number | null;   // null = 未完赛
  progress: number;            // 最终进度 0-1
  stats: PlayerStats;
}

/** 玩家统计 */
export interface PlayerStats {
  totalNotes: number;
  perfect: number;
  great: number;
  good: number;
  miss: number;
  maxCombo: number;
  accuracy: number;            // 0-1
  staminaRemaining: number;
}

// ============ 系统消息 ============

/** 服务端 → 客户端：错误消息 */
export interface ErrorMessage extends BaseMessage {
  type: 'error';
  code: string;
  message: string;
}

/** 客户端 → 服务端：断线重连 */
export interface ReconnectMessage extends BaseMessage {
  type: 'reconnect';
  playerId: string;
  roomId: string;
}

/** 服务端 → 客户端：重连成功，恢复状态 */
export interface ReconnectSuccessMessage extends BaseMessage {
  type: 'reconnect:success';
  gameState: GameStateSnapshot;
}

/** 游戏状态快照（用于重连和状态同步） */
export interface GameStateSnapshot {
  roomId: string;
  trackId: string;
  elapsedTime: number;
  players: PlayerPositionData[];
  isSprinting: boolean;
  sprintEndsAt?: number;
}

// ============ 消息联合类型 ============

/** 客户端发送的所有消息类型 */
export type ClientMessage =
  | MatchRequestMessage
  | RhythmInputMessage
  | ReconnectMessage;

/** 服务端发送的所有消息类型 */
export type ServerMessage =
  | MatchJoinedMessage
  | MatchPlayerJoinedMessage
  | CountdownMessage
  | RaceStartMessage
  | PositionSyncMessage
  | SprintEventMessage
  | PlayerFinishMessage
  | RaceResultMessage
  | ErrorMessage
  | ReconnectSuccessMessage;
