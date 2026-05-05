/**
 * Rhythm Swimming - 节奏游泳
 * 主入口文件
 *
 * 启动流程：
 * 1. 初始化 Canvas 和 UI
 * 2. 加载游戏配置
 * 3. 显示主菜单（曲目选择）
 * 4. 用户点击开始后预加载音频
 * 5. 倒计时 → 开始比赛
 */

import './styles/main.css';
import { initGameConfig, type GameConfig, type TrackInfo, formatDuration, difficultyStars } from './core/game-config.js';
import { AudioManager } from './core/audio-generator.js';
import { loadTrackData, buildTimelineIndex } from './core/track-loader.js';
import { GameSession } from './game/game-session.js';

// ===== DOM 元素 =====
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const uiOverlay = document.getElementById('ui-overlay') as HTMLDivElement;

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const ctx = canvas.getContext('2d')!;

// ===== 全局状态 =====
let gameConfig: GameConfig;
let audioManager: AudioManager;
let currentSession: GameSession | null = null;
let gameState: 'loading' | 'menu' | 'preparing' | 'playing' | 'result' = 'loading';

// ===== 初始化 =====
async function init() {
  console.log('[RhythmSwimming] Initializing...');

  // 加载配置
  gameConfig = await initGameConfig();
  console.log(`[RhythmSwimming] Loaded ${gameConfig.availableTracks.length} tracks`);

  // 初始化音频管理器
  audioManager = new AudioManager();

  // 显示主菜单
  showMainMenu();
  gameState = 'menu';

  // 启动渲染循环
  requestAnimationFrame(gameLoop);
}

// ===== 主菜单 =====
function showMainMenu() {
  uiOverlay.innerHTML = '';
  uiOverlay.style.display = 'flex';

  const menu = document.createElement('div');
  menu.className = 'main-menu';
  menu.innerHTML = `
    <h1 class="game-title">🏊 Rhythm Swimming</h1>
    <p class="game-subtitle">节奏游泳 - 踏准节拍，征服泳池</p>
    <div class="track-list" id="track-list"></div>
    <div class="menu-footer">
      <div class="settings-row">
        <label>难度：</label>
        <select id="difficulty-select">
          <option value="easy" ${gameConfig.difficulty === 'easy' ? 'selected' : ''}>简单</option>
          <option value="normal" ${gameConfig.difficulty === 'normal' ? 'selected' : ''}>普通</option>
          <option value="hard" ${gameConfig.difficulty === 'hard' ? 'selected' : ''}>困难</option>
        </select>
      </div>
      <div class="settings-row">
        <label>玩家：</label>
        <input type="text" id="player-name" value="${gameConfig.playerName}" maxlength="12" />
      </div>
    </div>
  `;

  uiOverlay.appendChild(menu);

  // 渲染曲目列表
  const trackList = document.getElementById('track-list')!;
  if (gameConfig.availableTracks.length === 0) {
    trackList.innerHTML = '<p class="no-tracks">暂无可用曲目，请检查 assets/music/ 目录</p>';
  } else {
    gameConfig.availableTracks.forEach(track => {
      trackList.appendChild(createTrackCard(track));
    });
  }
}

function createTrackCard(track: TrackInfo): HTMLElement {
  const card = document.createElement('div');
  card.className = 'track-card';
  card.innerHTML = `
    <div class="track-info">
      <h3 class="track-title">${track.title}</h3>
      <p class="track-artist">${track.artist}</p>
      <div class="track-meta">
        <span class="meta-item">♩ ${track.bpm} BPM</span>
        <span class="meta-item">⏱ ${formatDuration(track.duration)}</span>
        <span class="meta-item">🎵 ${track.noteCount} notes</span>
        <span class="meta-item">⚡ ${track.sprintCount} sprints</span>
      </div>
      <div class="track-difficulty">${difficultyStars(track.difficulty)}</div>
    </div>
    <button class="play-btn" data-track-id="${track.id}">▶ 开始</button>
  `;

  const btn = card.querySelector('.play-btn') as HTMLButtonElement;
  btn.addEventListener('click', () => startGame(track.id));

  return card;
}

// ===== 开始游戏 =====
async function startGame(trackId: string) {
  gameState = 'preparing';

  // 显示加载界面
  uiOverlay.innerHTML = `
    <div class="loading-screen">
      <h2>🎶 Loading...</h2>
      <p id="loading-status">正在加载曲目数据...</p>
      <div class="loading-bar"><div class="loading-fill" id="loading-fill"></div></div>
    </div>
  `;

  const statusEl = document.getElementById('loading-status')!;
  const fillEl = document.getElementById('loading-fill')!;

  try {
    // 1. 加载曲目数据
    fillEl.style.width = '20%';
    const trackData = await loadTrackData(trackId);
    const timeline = buildTimelineIndex(trackData);

    // 2. 预加载音频
    statusEl.textContent = '正在生成音频资源...';
    fillEl.style.width = '50%';
    await audioManager.preload(trackData.metadata.bpm, trackData.metadata.duration);

    // 3. 创建游戏会话
    statusEl.textContent = '正在初始化游戏...';
    fillEl.style.width = '80%';

    currentSession = new GameSession(
      canvas,
      ctx,
      trackData,
      timeline,
      gameConfig,
      audioManager
    );

    // 4. 倒计时
    fillEl.style.width = '100%';
    statusEl.textContent = '准备开始！';

    await countdown(3);

    // 5. 开始！
    uiOverlay.style.display = 'none';
    gameState = 'playing';
    currentSession.start();

  } catch (error) {
    console.error('[RhythmSwimming] Failed to start game:', error);
    statusEl.textContent = `加载失败: ${error}`;
    fillEl.style.width = '0%';
    fillEl.style.backgroundColor = '#ff4444';

    setTimeout(() => {
      showMainMenu();
      gameState = 'menu';
    }, 3000);
  }
}

// ===== 倒计时 =====
function countdown(seconds: number): Promise<void> {
  return new Promise(resolve => {
    let remaining = seconds;

    uiOverlay.innerHTML = `<div class="countdown"><span id="countdown-number">${remaining}</span></div>`;
    uiOverlay.style.display = 'flex';

    const countdownEl = document.getElementById('countdown-number')!;

    const interval = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        countdownEl.textContent = 'GO!';
        countdownEl.classList.add('countdown-go');
        clearInterval(interval);
        setTimeout(resolve, 500);
      } else {
        countdownEl.textContent = String(remaining);
        countdownEl.classList.add('countdown-pulse');
        setTimeout(() => countdownEl.classList.remove('countdown-pulse'), 300);
      }
    }, 1000);
  });
}

// ===== 游戏主循环 =====
function gameLoop(timestamp: number) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  switch (gameState) {
    case 'loading':
      renderLoadingScreen();
      break;
    case 'menu':
      renderMenuBackground(timestamp);
      break;
    case 'playing':
      if (currentSession) {
        currentSession.update(timestamp);
        currentSession.render();

        // 检查比赛是否结束
        if (currentSession.isFinished) {
          gameState = 'result';
          showResult();
        }
      }
      break;
    case 'result':
      // 结果界面由 DOM 渲染
      break;
  }

  requestAnimationFrame(gameLoop);
}

// ===== 渲染函数 =====
function renderLoadingScreen() {
  ctx.fillStyle = '#0a1628';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#4fc3f7';
  ctx.font = '24px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Loading...', canvas.width / 2, canvas.height / 2);
}

function renderMenuBackground(timestamp: number) {
  // 动态水波纹背景
  ctx.fillStyle = '#0a1628';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const waveCount = 5;
  for (let w = 0; w < waveCount; w++) {
    ctx.beginPath();
    ctx.strokeStyle = `rgba(79, 195, 247, ${0.1 + w * 0.03})`;
    ctx.lineWidth = 2;

    const baseY = canvas.height * (0.3 + w * 0.12);
    const speed = 0.001 + w * 0.0003;
    const amplitude = 20 + w * 5;
    const frequency = 0.005 + w * 0.001;

    for (let x = 0; x < canvas.width; x += 3) {
      const y = baseY + Math.sin(x * frequency + timestamp * speed) * amplitude;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

// ===== 结算画面 =====
function showResult() {
  if (!currentSession) return;

  const stats = currentSession.getStats();
  audioManager.stopBGM();
  audioManager.playFinish();

  uiOverlay.style.display = 'flex';
  uiOverlay.innerHTML = `
    <div class="result-screen">
      <h1 class="result-title">🏆 比赛结束!</h1>
      <div class="result-stats">
        <div class="stat-row">
          <span class="stat-label">完成进度</span>
          <span class="stat-value">${(stats.progress * 100).toFixed(1)}%</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">最高连击</span>
          <span class="stat-value">${stats.maxCombo}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Perfect</span>
          <span class="stat-value perfect-text">${stats.perfectCount}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Great</span>
          <span class="stat-value great-text">${stats.greatCount}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Good</span>
          <span class="stat-value good-text">${stats.goodCount}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Miss</span>
          <span class="stat-value miss-text">${stats.missCount}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">总分</span>
          <span class="stat-value score-text">${stats.score.toLocaleString()}</span>
        </div>
      </div>
      <button class="back-btn" id="back-to-menu">返回菜单</button>
    </div>
  `;

  document.getElementById('back-to-menu')!.addEventListener('click', () => {
    currentSession = null;
    showMainMenu();
    gameState = 'menu';
  });
}

// ===== 启动 =====
init().catch(err => {
  console.error('[RhythmSwimming] Init failed:', err);
});

export { canvas, uiOverlay, ctx };
