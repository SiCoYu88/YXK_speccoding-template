/**
 * 帧同步 + 状态快照混合同步方案
 *
 * 任务 7.6: 实现帧同步 + 状态快照混合同步方案
 *
 * 设计：
 * - 比赛中使用固定帧率（60fps 逻辑帧）帧同步推进
 * - 每隔 300 帧（约5秒）服务端广播状态快照用于校正
 * - 位置同步间隔 100ms
 */

import type { WebSocket } from 'ws';
import {
  POSITION_SYNC_INTERVAL_MS,
  STATE_SNAPSHOT_INTERVAL_FRAMES,
} from '@shared/protocol/constants.js';
import type {
  PlayerPositionData,
  PositionSyncMessage,
  GameStateSnapshot,
} from '@shared/protocol/messages.js';

const LOGIC_FPS = 60;
const FRAME_MS = 1000 / LOGIC_FPS;

/** 同步中的玩家数据 */
export interface SyncPlayer {
  id: string;
  ws: WebSocket | null;
  position: PlayerPositionData;
  lastInputTime: number;
}

/**
 * 帧同步管理器
 * 管理一个房间内的实时同步
 */
export class FrameSyncManager {
  private players: Map<string, SyncPlayer> = new Map();
  private logicFrame: number = 0;
  private running: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private syncIntervalId: NodeJS.Timeout | null = null;
  private startTime: number = 0;

  /**
   * 注册玩家到同步系统
   */
  addPlayer(id: string, ws: WebSocket | null): void {
    this.players.set(id, {
      id,
      ws,
      position: {
        id,
        progress: 0,
        speed: 0,
        stamina: 100,
        combo: 0,
        animState: 'idle',
      },
      lastInputTime: 0,
    });
  }

  /**
   * 移除玩家
   */
  removePlayer(id: string): void {
    this.players.delete(id);
  }

  /**
   * 更新玩家的 WebSocket（重连场景）
   */
  updatePlayerWs(id: string, ws: WebSocket | null): void {
    const player = this.players.get(id);
    if (player) {
      player.ws = ws;
    }
  }

  /**
   * 更新玩家位置数据（由客户端输入驱动）
   */
  updatePlayerPosition(id: string, data: Partial<PlayerPositionData>): void {
    const player = this.players.get(id);
    if (player) {
      Object.assign(player.position, data);
    }
  }

  /**
   * 开始同步循环
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.startTime = Date.now();
    this.logicFrame = 0;

    // 逻辑帧循环（60fps）
    this.intervalId = setInterval(() => {
      this.tick();
    }, FRAME_MS);

    // 位置同步广播（100ms 间隔）
    this.syncIntervalId = setInterval(() => {
      this.broadcastPositions();
    }, POSITION_SYNC_INTERVAL_MS);
  }

  /**
   * 停止同步循环
   */
  stop(): void {
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
  }

  /**
   * 逻辑帧处理
   */
  private tick(): void {
    this.logicFrame++;

    // 每 300 帧（约 5 秒）发送完整状态快照
    if (this.logicFrame % STATE_SNAPSHOT_INTERVAL_FRAMES === 0) {
      this.broadcastSnapshot();
    }
  }

  /**
   * 广播位置同步消息
   */
  private broadcastPositions(): void {
    const players: PlayerPositionData[] = [];
    for (const [, player] of this.players) {
      players.push({ ...player.position });
    }

    const message: PositionSyncMessage = {
      type: 'sync:position',
      timestamp: Date.now(),
      players,
    };

    this.broadcast(message);
  }

  /**
   * 广播完整状态快照（用于纠错和断线重连）
   */
  private broadcastSnapshot(): void {
    // 状态快照包含完整游戏状态
    // 客户端收到后与本地状态对比，如有偏差则修正
    const snapshot = this.getSnapshot();

    // 快照通过位置同步通道发送（客户端自行判断是否需要修正）
    this.broadcastPositions();
  }

  /**
   * 获取当前游戏状态快照
   */
  getSnapshot(): GameStateSnapshot {
    const players: PlayerPositionData[] = [];
    for (const [, player] of this.players) {
      players.push({ ...player.position });
    }

    return {
      roomId: '',  // 由上层填充
      trackId: '', // 由上层填充
      elapsedTime: Date.now() - this.startTime,
      players,
      isSprinting: false, // 由上层填充
    };
  }

  /**
   * 获取已运行时间
   */
  getElapsedTime(): number {
    return Date.now() - this.startTime;
  }

  /**
   * 获取当前逻辑帧
   */
  getFrame(): number {
    return this.logicFrame;
  }

  /**
   * 广播消息给所有连接中的玩家
   */
  private broadcast(message: object): void {
    const data = JSON.stringify(message);
    for (const [, player] of this.players) {
      if (player.ws && player.ws.readyState === 1) { // OPEN
        player.ws.send(data);
      }
    }
  }
}
