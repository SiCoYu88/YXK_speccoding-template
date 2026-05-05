/**
 * 结算界面
 *
 * 任务 9.3: 结算界面（排名列表、玩家数据、个人详细统计）
 * 任务 9.4: MVP 庆祝动画（第1名特殊表彰）
 */

import type { RankingEntry } from '@shared/protocol/messages.js';

/** 结算界面状态 */
type ResultScreenState = 'entering' | 'showing' | 'mvp_celebration';

export class ResultScreen {
  private state: ResultScreenState = 'entering';
  private rankings: RankingEntry[] = [];
  private localPlayerId: string = '';
  private enterTimer: number = 0;
  private mvpTimer: number = 0;
  private mvpParticles: { x: number; y: number; vx: number; vy: number; color: string; life: number }[] = [];

  /** 显示结算界面 */
  show(rankings: RankingEntry[], localPlayerId: string): void {
    this.rankings = rankings;
    this.localPlayerId = localPlayerId;
    this.state = 'entering';
    this.enterTimer = 0;
    this.mvpTimer = 0;
  }

  /** 每帧更新 */
  update(dt: number): void {
    if (this.state === 'entering') {
      this.enterTimer += dt;
      if (this.enterTimer >= 1000) {
        this.state = 'showing';
        // 2秒后播放 MVP 动画
        setTimeout(() => {
          this.state = 'mvp_celebration';
          this.spawnMVPParticles();
        }, 2000);
      }
    }

    if (this.state === 'mvp_celebration') {
      this.mvpTimer += dt;
      // 更新粒子
      for (const p of this.mvpParticles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.1; // 重力
        p.life -= dt / 3000;
      }
      this.mvpParticles = this.mvpParticles.filter(p => p.life > 0);
    }
  }

  /** 生成 MVP 庆祝粒子 */
  private spawnMVPParticles(): void {
    const colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A'];
    for (let i = 0; i < 50; i++) {
      this.mvpParticles.push({
        x: Math.random() * 800 + 100,
        y: -20,
        vx: (Math.random() - 0.5) * 4,
        vy: Math.random() * 3 + 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 1,
      });
    }
  }

  /** 渲染 */
  render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    // 背景遮罩
    const alpha = Math.min(1, this.enterTimer / 500) * 0.85;
    ctx.fillStyle = `rgba(15, 23, 42, ${alpha})`;
    ctx.fillRect(0, 0, width, height);

    if (this.state === 'entering' && this.enterTimer < 500) return;

    const centerX = width / 2;
    const startY = 60;

    // 标题
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText('🏁 比赛结束', centerX, startY);

    // 排名列表
    const listY = startY + 60;
    const rowHeight = 45;

    for (let i = 0; i < this.rankings.length; i++) {
      const entry = this.rankings[i];
      const y = listY + i * rowHeight;
      const isLocal = entry.player.id === this.localPlayerId;

      // 行背景
      if (isLocal) {
        ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
        ctx.fillRect(centerX - 300, y - 15, 600, rowHeight - 5);
      }

      // 名次
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : '#94a3b8';
      ctx.fillText(`#${entry.rank}`, centerX - 260, y + 5);

      // 名字
      ctx.font = isLocal ? 'bold 16px sans-serif' : '16px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = isLocal ? '#60a5fa' : '#e2e8f0';
      ctx.fillText(entry.player.name, centerX - 220, y + 5);

      // 时间/距离
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#94a3b8';
      if (entry.finishTime !== null) {
        ctx.fillText(`${(entry.finishTime / 1000).toFixed(2)}s`, centerX + 50, y + 5);
      } else {
        ctx.fillText(`${(entry.progress * 50).toFixed(1)}m`, centerX + 50, y + 5);
      }

      // 准确率
      ctx.fillText(`${(entry.stats.accuracy * 100).toFixed(1)}%`, centerX + 140, y + 5);

      // 最高连击
      ctx.fillText(`${entry.stats.maxCombo}x`, centerX + 220, y + 5);
    }

    // 本地玩家详细统计
    const localEntry = this.rankings.find(r => r.player.id === this.localPlayerId);
    if (localEntry) {
      const statY = listY + this.rankings.length * rowHeight + 30;
      this.renderPersonalStats(ctx, localEntry, centerX, statY);
    }

    // MVP 庆祝
    if (this.state === 'mvp_celebration') {
      this.renderMVPCelebration(ctx, width);
    }
  }

  /** 渲染个人统计 */
  private renderPersonalStats(ctx: CanvasRenderingContext2D, entry: RankingEntry, x: number, y: number): void {
    ctx.fillStyle = 'rgba(30, 41, 59, 0.8)';
    ctx.fillRect(x - 250, y, 500, 120);
    ctx.strokeStyle = '#334155';
    ctx.strokeRect(x - 250, y, 500, 120);

    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText('📊 个人统计', x, y + 20);

    ctx.font = '13px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e2e8f0';

    const { stats } = entry;
    const col1X = x - 220;
    const col2X = x + 20;

    ctx.fillText(`总音符: ${stats.totalNotes}`, col1X, y + 45);
    ctx.fillStyle = '#FFD700'; ctx.fillText(`Perfect: ${stats.perfect}`, col1X, y + 65);
    ctx.fillStyle = '#00DDFF'; ctx.fillText(`Great: ${stats.great}`, col1X, y + 85);
    ctx.fillStyle = '#88FF88'; ctx.fillText(`Good: ${stats.good}`, col1X, y + 105);

    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(`Miss: ${stats.miss}`, col2X, y + 45);
    ctx.fillText(`最高连击: ${stats.maxCombo}x`, col2X, y + 65);
    ctx.fillText(`体力剩余: ${stats.staminaRemaining.toFixed(0)}`, col2X, y + 85);
    ctx.fillText(`准确率: ${(stats.accuracy * 100).toFixed(1)}%`, col2X, y + 105);
  }

  // ===== 9.4 MVP 庆祝动画 =====

  /** 渲染 MVP 庆祝 */
  private renderMVPCelebration(ctx: CanvasRenderingContext2D, width: number): void {
    // 粒子（彩纸效果）
    for (const p of this.mvpParticles) {
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 8, 8);
      ctx.restore();
    }

    // MVP 文字
    if (this.rankings.length > 0) {
      const mvp = this.rankings[0];
      const alpha = Math.min(1, this.mvpTimer / 500);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FFD700';
      ctx.shadowColor = '#FF8800';
      ctx.shadowBlur = 20;
      ctx.fillText(`🏆 MVP: ${mvp.player.name} 🏆`, width / 2, 40);
      ctx.restore();
    }
  }

  /** 是否正在显示 */
  isVisible(): boolean {
    return this.state !== 'entering' || this.enterTimer > 0;
  }
}
