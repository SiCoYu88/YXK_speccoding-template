/**
 * 房间管理器
 * 管理所有比赛房间的创建、匹配和生命周期
 */

import type { WebSocket } from 'ws';
import { Room } from './room.js';
import type { ClientMessage } from '@shared/protocol/messages.js';

export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  /** WebSocket → playerId 映射 */
  private wsToPlayer: Map<WebSocket, { roomId: string; playerId: string }> = new Map();

  getRoomCount(): number {
    return this.rooms.size;
  }

  /**
   * 处理客户端消息
   */
  handleMessage(ws: WebSocket, message: ClientMessage): void {
    switch (message.type) {
      case 'match:request':
        this.handleMatchRequest(ws, message.playerName);
        break;
      case 'input:rhythm':
        this.handleRhythmInput(ws, message);
        break;
      case 'reconnect':
        this.handleReconnect(ws, message.playerId, message.roomId);
        break;
      default:
        console.warn('[RoomManager] Unknown message type:', (message as any).type);
    }
  }

  /**
   * 处理匹配请求
   */
  private handleMatchRequest(ws: WebSocket, playerName: string): void {
    // 查找可加入的房间
    let room = this.findAvailableRoom();

    if (!room) {
      // 创建新房间
      room = new Room();
      this.rooms.set(room.id, room);
      console.log(`[RoomManager] Created room: ${room.id}`);
    }

    // 加入房间
    const playerInfo = room.addPlayer(ws, playerName);

    if (!playerInfo) {
      ws.send(JSON.stringify({
        type: 'error',
        timestamp: Date.now(),
        code: 'JOIN_FAILED',
        message: '无法加入房间',
      }));
      return;
    }

    // 记录映射
    this.wsToPlayer.set(ws, { roomId: room.id, playerId: playerInfo.id });

    // 发送加入成功消息
    ws.send(JSON.stringify({
      type: 'match:joined',
      timestamp: Date.now(),
      roomId: room.id,
      players: room.getPlayers(),
      localPlayerId: playerInfo.id,
    }));

    console.log(`[RoomManager] Player ${playerInfo.name} joined room ${room.id} (${room.getPlayerCount()} players)`);
  }

  /**
   * 处理节奏输入
   */
  private handleRhythmInput(ws: WebSocket, message: ClientMessage): void {
    const mapping = this.wsToPlayer.get(ws);
    if (!mapping) return;

    const room = this.rooms.get(mapping.roomId);
    if (!room) return;

    // TODO: 服务端校验输入时间戳合理性（反作弊）
    // 目前仅转发输入用于位置同步
  }

  /**
   * 处理断线重连
   */
  private handleReconnect(ws: WebSocket, playerId: string, roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) {
      ws.send(JSON.stringify({
        type: 'error',
        timestamp: Date.now(),
        code: 'ROOM_NOT_FOUND',
        message: '房间不存在或已关闭',
      }));
      return;
    }

    const success = room.handleReconnect(ws, playerId);
    if (success) {
      this.wsToPlayer.set(ws, { roomId, playerId });
      console.log(`[RoomManager] Player ${playerId} reconnected to room ${roomId}`);
    } else {
      ws.send(JSON.stringify({
        type: 'error',
        timestamp: Date.now(),
        code: 'RECONNECT_FAILED',
        message: '重连失败，超时或已被标记放弃',
      }));
    }
  }

  /**
   * 处理 WebSocket 断开
   */
  handleDisconnect(ws: WebSocket): void {
    const mapping = this.wsToPlayer.get(ws);
    if (!mapping) return;

    const room = this.rooms.get(mapping.roomId);
    if (room) {
      room.handleDisconnect(mapping.playerId);

      // 如果房间已关闭，清理
      if (room.getState() === 'closed') {
        this.rooms.delete(mapping.roomId);
        console.log(`[RoomManager] Room ${mapping.roomId} closed and removed`);
      }
    }

    this.wsToPlayer.delete(ws);
  }

  /**
   * 查找可加入的等待中房间
   */
  private findAvailableRoom(): Room | null {
    for (const [, room] of this.rooms) {
      if (room.canJoin()) {
        return room;
      }
    }
    return null;
  }

  /**
   * 定期清理已关闭的房间
   */
  cleanup(): void {
    for (const [id, room] of this.rooms) {
      if (room.getState() === 'closed') {
        this.rooms.delete(id);
      }
    }
  }
}
