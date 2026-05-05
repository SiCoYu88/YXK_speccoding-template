/**
 * WebSocket 客户端
 * 实现多人联机通信：匹配、状态同步、断线重连
 *
 * 任务 11.2: 多人联机支持
 */

import type { ClientMessage, ServerMessage } from '@shared/protocol/messages.js';
import { RECONNECT_TIMEOUT_MS } from '@shared/protocol/constants.js';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
export type MessageHandler = (message: ServerMessage) => void;

export class WSClient {
  private ws: WebSocket | null = null;
  private url: string;
  private state: ConnectionState = 'disconnected';
  private handlers: Map<string, MessageHandler[]> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;

  // 重连所需信息
  private playerId: string | null = null;
  private roomId: string | null = null;

  constructor(url: string) {
    this.url = url;
  }

  /** 获取连接状态 */
  getState(): ConnectionState {
    return this.state;
  }

  /** 连接 */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.state = 'connecting';
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.state = 'connected';
        this.reconnectAttempts = 0;
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const message: ServerMessage = JSON.parse(event.data);
          this.dispatchMessage(message);
        } catch (e) {
          console.error('[WSClient] Invalid message:', e);
        }
      };

      this.ws.onclose = () => {
        if (this.state === 'connected') {
          this.state = 'reconnecting';
          this.attemptReconnect();
        } else {
          this.state = 'disconnected';
        }
      };

      this.ws.onerror = (err) => {
        if (this.state === 'connecting') {
          reject(err);
        }
      };
    });
  }

  /** 发送消息 */
  send(message: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('[WSClient] Cannot send, not connected');
    }
  }

  /** 注册消息处理器 */
  on(type: string, handler: MessageHandler): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push(handler);
  }

  /** 请求匹配 */
  requestMatch(playerName: string): void {
    this.send({
      type: 'match:request',
      timestamp: Date.now(),
      playerName,
    });
  }

  /** 发送节奏输入 */
  sendRhythmInput(noteId: number, inputTime: number, inputType: 'tap' | 'hold' | 'double', holdDuration?: number): void {
    this.send({
      type: 'input:rhythm',
      timestamp: Date.now(),
      inputTime,
      noteId,
      inputType,
      holdDuration,
    });
  }

  /** 设置重连信息 */
  setReconnectInfo(playerId: string, roomId: string): void {
    this.playerId = playerId;
    this.roomId = roomId;
  }

  /** 尝试重连 */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.state = 'disconnected';
      console.error('[WSClient] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 10000);

    console.log(`[WSClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();

        // 连接成功，发送重连消息
        if (this.playerId && this.roomId) {
          this.send({
            type: 'reconnect',
            timestamp: Date.now(),
            playerId: this.playerId,
            roomId: this.roomId,
          });
        }
      } catch {
        this.attemptReconnect();
      }
    }, delay);
  }

  /** 分发消息 */
  private dispatchMessage(message: ServerMessage): void {
    const handlers = this.handlers.get(message.type) || [];
    for (const handler of handlers) {
      handler(message);
    }

    // 通配处理器
    const wildcardHandlers = this.handlers.get('*') || [];
    for (const handler of wildcardHandlers) {
      handler(message);
    }
  }

  /** 断开连接 */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.state = 'disconnected';
  }
}
