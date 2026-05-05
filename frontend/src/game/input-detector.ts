/**
 * 输入检测模块
 * 精确记录毫秒级输入时间戳
 * 支持：单次点击(tap)、长按(hold)、双击(double)
 * 50ms 防抖
 */

import type { InputType } from '@shared/protocol/messages.js';
import { INPUT_DEBOUNCE_MS } from '@shared/protocol/constants.js';

/** 输入事件 */
export interface InputEvent {
  /** 输入类型 */
  type: InputType;
  /** 输入时间戳（ms，使用 performance.now()） */
  timestamp: number;
  /** 长按持续时间（仅 type='hold' 时有效） */
  holdDuration?: number;
}

/** 输入回调 */
export type InputCallback = (event: InputEvent) => void;

/** 输入检测器配置 */
export interface InputDetectorConfig {
  /** 防抖时间（ms） */
  debounceMs: number;
  /** 双击最大间隔（ms） */
  doubleTapWindowMs: number;
  /** 长按最小时间（ms） */
  holdThresholdMs: number;
  /** 绑定的目标元素 */
  targetElement: HTMLElement;
}

const DEFAULT_CONFIG: Omit<InputDetectorConfig, 'targetElement'> = {
  debounceMs: INPUT_DEBOUNCE_MS,
  doubleTapWindowMs: 200,
  holdThresholdMs: 250,
};

export class InputDetector {
  private config: InputDetectorConfig;
  private callback: InputCallback | null = null;

  // 状态追踪
  private lastInputTime: number = -Infinity;
  private isPressed: boolean = false;
  private pressStartTime: number = 0;
  private pendingTap: { time: number; timer: number } | null = null;

  // 绑定的事件处理器（用于解绑）
  private boundHandlers: { type: string; handler: EventListener }[] = [];

  constructor(targetElement: HTMLElement, config?: Partial<Omit<InputDetectorConfig, 'targetElement'>>) {
    this.config = { ...DEFAULT_CONFIG, ...config, targetElement };
    this.bindEvents();
  }

  /** 设置输入回调 */
  onInput(callback: InputCallback): void {
    this.callback = callback;
  }

  /** 获取高精度时间戳 */
  private now(): number {
    return performance.now();
  }

  /** 绑定 DOM 事件 */
  private bindEvents(): void {
    const el = this.config.targetElement;

    // 触摸事件（移动端优先）
    this.addListener(el, 'touchstart', this.handlePointerDown.bind(this));
    this.addListener(el, 'touchend', this.handlePointerUp.bind(this));

    // 鼠标事件（桌面端）
    this.addListener(el, 'mousedown', this.handlePointerDown.bind(this));
    this.addListener(el, 'mouseup', this.handlePointerUp.bind(this));

    // 键盘事件（空格键/D/F/J/K 作为输入键）
    this.addListener(document as any, 'keydown', this.handleKeyDown.bind(this));
    this.addListener(document as any, 'keyup', this.handleKeyUp.bind(this));

    // 防止默认行为
    this.addListener(el, 'contextmenu', (e: Event) => e.preventDefault());
  }

  private addListener(el: HTMLElement | Document, type: string, handler: EventListener): void {
    el.addEventListener(type, handler, { passive: false });
    this.boundHandlers.push({ type, handler });
  }

  /** 指针按下 */
  private handlePointerDown(e: Event): void {
    e.preventDefault();
    const time = this.now();

    // 防抖检测
    if (time - this.lastInputTime < this.config.debounceMs) return;

    this.isPressed = true;
    this.pressStartTime = time;
  }

  /** 指针抬起 */
  private handlePointerUp(e: Event): void {
    e.preventDefault();
    if (!this.isPressed) return;

    const time = this.now();
    this.isPressed = false;

    // 防抖检测
    if (time - this.lastInputTime < this.config.debounceMs) return;

    const pressDuration = time - this.pressStartTime;

    // 判断是长按还是点击
    if (pressDuration >= this.config.holdThresholdMs) {
      // 长按
      this.emitInput({
        type: 'hold',
        timestamp: this.pressStartTime,
        holdDuration: pressDuration,
      });
    } else {
      // 短按 - 检查是否双击
      this.handleTapOrDouble(this.pressStartTime);
    }
  }

  /** 键盘按下 */
  private handleKeyDown(e: Event): void {
    const ke = e as KeyboardEvent;
    if (ke.repeat) return; // 忽略重复触发

    const validKeys = ['Space', 'KeyD', 'KeyF', 'KeyJ', 'KeyK'];
    if (!validKeys.includes(ke.code)) return;

    ke.preventDefault();
    const time = this.now();

    if (time - this.lastInputTime < this.config.debounceMs) return;

    this.isPressed = true;
    this.pressStartTime = time;
  }

  /** 键盘抬起 */
  private handleKeyUp(e: Event): void {
    const ke = e as KeyboardEvent;
    const validKeys = ['Space', 'KeyD', 'KeyF', 'KeyJ', 'KeyK'];
    if (!validKeys.includes(ke.code)) return;

    if (!this.isPressed) return;

    const time = this.now();
    this.isPressed = false;

    if (time - this.lastInputTime < this.config.debounceMs) return;

    const pressDuration = time - this.pressStartTime;

    if (pressDuration >= this.config.holdThresholdMs) {
      this.emitInput({
        type: 'hold',
        timestamp: this.pressStartTime,
        holdDuration: pressDuration,
      });
    } else {
      this.handleTapOrDouble(this.pressStartTime);
    }
  }

  /**
   * 处理单击/双击判定
   * 使用延时窗口等待可能的第二次点击
   */
  private handleTapOrDouble(tapTime: number): void {
    if (this.pendingTap) {
      // 已有一个待定的点击，判定为双击
      window.clearTimeout(this.pendingTap.timer);
      const firstTapTime = this.pendingTap.time;
      this.pendingTap = null;

      this.emitInput({
        type: 'double',
        timestamp: firstTapTime, // 使用第一次点击的时间
      });
    } else {
      // 第一次点击，等待可能的第二次
      const timer = window.setTimeout(() => {
        // 超时，判定为单击
        this.pendingTap = null;
        this.emitInput({
          type: 'tap',
          timestamp: tapTime,
        });
      }, this.config.doubleTapWindowMs);

      this.pendingTap = { time: tapTime, timer };
    }
  }

  /** 发射输入事件 */
  private emitInput(event: InputEvent): void {
    this.lastInputTime = event.timestamp;
    if (this.callback) {
      this.callback(event);
    }
  }

  /** 销毁，解绑所有事件 */
  destroy(): void {
    const el = this.config.targetElement;
    for (const { type, handler } of this.boundHandlers) {
      el.removeEventListener(type, handler);
      document.removeEventListener(type, handler);
    }
    this.boundHandlers = [];

    if (this.pendingTap) {
      window.clearTimeout(this.pendingTap.timer);
      this.pendingTap = null;
    }
  }
}
