/**
 * 房间系统核心实现
 *
 * 任务 7.1: 房间创建与匹配
 * 任务 7.2: 匹配超时处理
 * 任务 7.3: 倒计时与同步开赛
 * 任务 7.4: 房间状态机
 * 任务 7.5: 断线重连
 */

import { v4 as uuidv4 } from 'uuid';
import type { WebSocket } from 'ws';
import {
  ROOM_MAX_PLAYERS,
  ROOM_MIN_PLAYERS,
  MATCH_TIMEOUT_SECONDS,
  COUNTDOWN_SECONDS,
  RECONNECT_TIMEOUT_MS,
} from '@shared/protocol/constants.js';
import type {
  PlayerInfo,
  ServerMessage,
  PlayerPositionData,
  GameStateSnapshot,
} from '@shared/protocol/messages.js';

// ===== 7.4 房间状态机 =====

/** 房间状态：等待中→倒计时→比赛中→结算中→已关闭 */
export type RoomState = 'waiting' | 'countdown' | 'racing' | 'settling' | 'closed';

/** 玩家连接状态 */
export type PlayerConnectionState = 'connected' | 'disconnected' | 'abandoned';

/** 房间内玩家 */
export interface RoomPlayer {
  info: PlayerInfo;
  ws: WebSocket | null;
  connectionState: PlayerConnectionState;
  disconnectTime?: number;
  /** 比赛数据 */
  progress: number;
  speed: number;
  stamina: number;
  combo: number;
  finishTime: number | null;
}

export class Room {
  readonly id: string;
  private state: RoomState = 'waiting';
  private players: Map<string, RoomPlayer> = new Map();
  private createdAt: number = Date.now();
  private matchTimeoutTimer: NodeJS.Timeout | null = null;
  private countdownTimer: NodeJS.Timeout | null = null;
  private raceStartTime: number = 0;
  private trackId: string = 'ocean-pulse'; // 默认曲目

  constructor() {
    this.id = uuidv4();
  }

  // ===== 7.1 房间创建与匹配逻辑 =====

  /** 获取当前状态 */
  getState(): RoomState {
    return this.state;
  }

  /** 获取当前人数 */
  getPlayerCount(): number {
    return this.players.size;
  }

  /** 房间是否可加入 */
  canJoin(): boolean {
    return this.state === 'waiting' && this.players.size < ROOM_MAX_PLAYERS;
  }

  /**
   * 玩家加入房间
   */
  addPlayer(ws: WebSocket, playerName: string): PlayerInfo | null {
    if (!this.canJoin()) return null;

    const playerId = uuidv4();
    const lane = this.players.size + 1;

    const info: PlayerInfo = {
      id: playerId,
      name: playerName,
      lane,
    };

    const player: RoomPlayer = {
      info,
      ws,
      connectionState: 'connected',
      progress: 0,
      speed: 0,
      stamina: 100,
      combo: 0,
      finishTime: null,
    };

    this.players.set(playerId, player);

    // 通知房间内其他玩家
    this.broadcast({
      type: 'match:player_joined',
      timestamp: Date.now(),
      player: info,
      currentCount: this.players.size,
      maxCount: ROOM_MAX_PLAYERS,
    });

    // 如果满员，开始倒计时
    if (this.players.size >= ROOM_MAX_PLAYERS) {
      this.startCountdown();
    }
    // 首次有玩家加入时启动匹配超时计时器
    else if (this.players.size === 1) {
      this.startMatchTimeout();
    }

    return info;
  }

  // ===== 7.2 匹配超时处理 =====

  /** 启动匹配超时计时器 */
  private startMatchTimeout(): void {
    this.matchTimeoutTimer = setTimeout(() => {
      if (this.state !== 'waiting') return;

      if (this.players.size >= ROOM_MIN_PLAYERS) {
        // 达到最低人数，开赛
        this.startCountdown();
      } else {
        // 人数不足，解散
        this.broadcast({
          type: 'error',
          timestamp: Date.now(),
          code: 'MATCH_TIMEOUT',
          message: '匹配超时，人数不足，请重新匹配',
        });
        this.close();
      }
    }, MATCH_TIMEOUT_SECONDS * 1000);
  }

  // ===== 7.3 倒计时与同步开赛 =====

  /** 开始倒计时 */
  private startCountdown(): void {
    if (this.matchTimeoutTimer) {
      clearTimeout(this.matchTimeoutTimer);
      this.matchTimeoutTimer = null;
    }

    this.state = 'countdown';
    let remaining = COUNTDOWN_SECONDS;

    const tick = () => {
      this.broadcast({
        type: 'room:countdown',
        timestamp: Date.now(),
        seconds: remaining,
      });

      if (remaining === 0) {
        this.startRace();
      } else {
        remaining--;
        this.countdownTimer = setTimeout(tick, 1000);
      }
    };

    tick();
  }

  /** 正式开赛 */
  private startRace(): void {
    this.state = 'racing';
    this.raceStartTime = Date.now();

    this.broadcast({
      type: 'race:start',
      timestamp: Date.now(),
      trackId: this.trackId,
      serverTime: this.raceStartTime,
    });
  }

  // ===== 7.5 断线重连 =====

  /**
   * 处理玩家断线
   */
  handleDisconnect(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;

    player.ws = null;
    player.connectionState = 'disconnected';
    player.disconnectTime = Date.now();

    // 如果在等待/倒计时阶段，直接移除
    if (this.state === 'waiting' || this.state === 'countdown') {
      this.players.delete(playerId);
      return;
    }

    // 比赛中：30秒内可重连
    setTimeout(() => {
      const p = this.players.get(playerId);
      if (p && p.connectionState === 'disconnected') {
        p.connectionState = 'abandoned';
        // 检查是否所有人都断线
        this.checkAllDisconnected();
      }
    }, RECONNECT_TIMEOUT_MS);
  }

  /**
   * 处理玩家重连
   */
  handleReconnect(ws: WebSocket, playerId: string): boolean {
    const player = this.players.get(playerId);
    if (!player || player.connectionState === 'abandoned') {
      return false;
    }

    player.ws = ws;
    player.connectionState = 'connected';
    player.disconnectTime = undefined;

    // 发送当前游戏状态快照
    const snapshot = this.getGameSnapshot();
    this.sendToPlayer(playerId, {
      type: 'reconnect:success',
      timestamp: Date.now(),
      gameState: snapshot,
    });

    return true;
  }

  /** 获取游戏状态快照 */
  private getGameSnapshot(): GameStateSnapshot {
    const players: PlayerPositionData[] = [];
    for (const [, player] of this.players) {
      players.push({
        id: player.info.id,
        progress: player.progress,
        speed: player.speed,
        stamina: player.stamina,
        combo: player.combo,
        animState: player.connectionState === 'connected' ? 'normal' : 'still',
      });
    }

    return {
      roomId: this.id,
      trackId: this.trackId,
      elapsedTime: Date.now() - this.raceStartTime,
      players,
      isSprinting: false, // TODO: 从曲目时间轴判断
    };
  }

  /** 检查是否所有人都断线 */
  private checkAllDisconnected(): void {
    const allDisconnected = [...this.players.values()].every(
      p => p.connectionState !== 'connected'
    );

    if (allDisconnected) {
      setTimeout(() => {
        // 30秒后再检查
        const stillAllDisconnected = [...this.players.values()].every(
          p => p.connectionState !== 'connected'
        );
        if (stillAllDisconnected) {
          this.close();
        }
      }, RECONNECT_TIMEOUT_MS);
    }
  }

  // ===== 通用方法 =====

  /** 更新玩家位置数据（由同步模块调用） */
  updatePlayerData(playerId: string, data: Partial<RoomPlayer>): void {
    const player = this.players.get(playerId);
    if (player) {
      Object.assign(player, data);
    }
  }

  /** 获取所有玩家信息 */
  getPlayers(): PlayerInfo[] {
    return [...this.players.values()].map(p => p.info);
  }

  /** 根据 WebSocket 查找玩家 ID */
  findPlayerByWs(ws: WebSocket): string | null {
    for (const [id, player] of this.players) {
      if (player.ws === ws) return id;
    }
    return null;
  }

  /** 广播消息给所有连接中的玩家 */
  private broadcast(message: ServerMessage): void {
    const data = JSON.stringify(message);
    for (const [, player] of this.players) {
      if (player.ws && player.connectionState === 'connected') {
        player.ws.send(data);
      }
    }
  }

  /** 发送消息给指定玩家 */
  private sendToPlayer(playerId: string, message: ServerMessage): void {
    const player = this.players.get(playerId);
    if (player?.ws && player.connectionState === 'connected') {
      player.ws.send(JSON.stringify(message));
    }
  }

  /** 关闭房间 */
  close(): void {
    this.state = 'closed';
    if (this.matchTimeoutTimer) clearTimeout(this.matchTimeoutTimer);
    if (this.countdownTimer) clearTimeout(this.countdownTimer);
    this.players.clear();
  }
}
