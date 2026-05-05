/**
 * 网络延迟模拟器
 *
 * 任务 11.3: 网络延迟模拟测试
 *
 * 功能：
 * - 为 WebSocket 消息添加可配置的人工延迟
 * - 支持固定延迟和抖动模拟
 * - 用于验证 200ms+ 延迟下的判定体验和公平性
 */

import type { WebSocket } from 'ws';

export interface LatencyConfig {
  /** 基础延迟 (ms) */
  baseLatencyMs: number;
  /** 延迟抖动范围 (ms)，实际延迟 = base ± jitter */
  jitterMs: number;
  /** 丢包率 (0-1) */
  packetLossRate: number;
  /** 是否启用 */
  enabled: boolean;
}

const DEFAULT_CONFIG: LatencyConfig = {
  baseLatencyMs: 0,
  jitterMs: 0,
  packetLossRate: 0,
  enabled: false,
};

/**
 * 延迟模拟代理
 * 包裹原始 WebSocket，对发送的消息添加延迟
 */
export class LatencySimulator {
  private config: LatencyConfig;
  private pendingMessages: { ws: WebSocket; data: string; sendTime: number }[] = [];
  private timer: NodeJS.Timeout | null = null;

  constructor(config?: Partial<LatencyConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (this.config.enabled) {
      this.startProcessing();
    }
  }

  /** 更新配置 */
  setConfig(config: Partial<LatencyConfig>): void {
    const wasEnabled = this.config.enabled;
    this.config = { ...this.config, ...config };

    if (this.config.enabled && !wasEnabled) {
      this.startProcessing();
    } else if (!this.config.enabled && wasEnabled) {
      this.stopProcessing();
      this.flushAll();
    }
  }

  /**
   * 发送消息（经过延迟模拟）
   */
  send(ws: WebSocket, data: string): void {
    if (!this.config.enabled) {
      // 无延迟，直接发送
      if (ws.readyState === 1) {
        ws.send(data);
      }
      return;
    }

    // 模拟丢包
    if (Math.random() < this.config.packetLossRate) {
      return; // 丢弃
    }

    // 计算延迟
    const jitter = (Math.random() - 0.5) * 2 * this.config.jitterMs;
    const delay = Math.max(0, this.config.baseLatencyMs + jitter);
    const sendTime = Date.now() + delay;

    this.pendingMessages.push({ ws, data, sendTime });
  }

  /**
   * 广播消息（对所有连接添加延迟）
   */
  broadcast(connections: WebSocket[], data: string): void {
    for (const ws of connections) {
      this.send(ws, data);
    }
  }

  /** 开始处理队列 */
  private startProcessing(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.processQueue(), 5); // 5ms 精度
  }

  /** 停止处理 */
  private stopProcessing(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** 处理消息队列 */
  private processQueue(): void {
    const now = Date.now();
    const toSend: typeof this.pendingMessages = [];
    const remaining: typeof this.pendingMessages = [];

    for (const msg of this.pendingMessages) {
      if (msg.sendTime <= now) {
        toSend.push(msg);
      } else {
        remaining.push(msg);
      }
    }

    this.pendingMessages = remaining;

    for (const msg of toSend) {
      if (msg.ws.readyState === 1) {
        msg.ws.send(msg.data);
      }
    }
  }

  /** 立即发送所有待发消息 */
  private flushAll(): void {
    for (const msg of this.pendingMessages) {
      if (msg.ws.readyState === 1) {
        msg.ws.send(msg.data);
      }
    }
    this.pendingMessages = [];
  }

  /** 获取当前队列深度 */
  getPendingCount(): number {
    return this.pendingMessages.length;
  }

  /** 获取统计信息 */
  getStats(): { enabled: boolean; baseLatency: number; jitter: number; lossRate: number; pending: number } {
    return {
      enabled: this.config.enabled,
      baseLatency: this.config.baseLatencyMs,
      jitter: this.config.jitterMs,
      lossRate: this.config.packetLossRate,
      pending: this.pendingMessages.length,
    };
  }

  /** 销毁 */
  destroy(): void {
    this.stopProcessing();
    this.pendingMessages = [];
  }
}

/**
 * 预设延迟配置
 */
export const LATENCY_PRESETS = {
  /** 无延迟（本地调试） */
  none: { baseLatencyMs: 0, jitterMs: 0, packetLossRate: 0, enabled: false },
  /** 良好网络 (20ms ±5ms) */
  good: { baseLatencyMs: 20, jitterMs: 5, packetLossRate: 0, enabled: true },
  /** 普通网络 (80ms ±20ms) */
  average: { baseLatencyMs: 80, jitterMs: 20, packetLossRate: 0.01, enabled: true },
  /** 较差网络 (200ms ±50ms, 2% 丢包) */
  poor: { baseLatencyMs: 200, jitterMs: 50, packetLossRate: 0.02, enabled: true },
  /** 极差网络 (500ms ±100ms, 5% 丢包) */
  terrible: { baseLatencyMs: 500, jitterMs: 100, packetLossRate: 0.05, enabled: true },
} as const;
