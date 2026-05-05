/**
 * Rhythm Swimming - 后端服务入口
 * Express HTTP + WebSocket 服务器
 */

import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { RoomManager } from './room/room-manager.js';

const app = express();
const server = createServer(app);

// WebSocket 服务器
const wss = new WebSocketServer({ server, path: '/ws' });

// 房间管理器
const roomManager = new RoomManager();

// HTTP 路由
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', rooms: roomManager.getRoomCount() });
});

// WebSocket 连接处理
wss.on('connection', (ws) => {
  console.log('[WS] New connection');

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      roomManager.handleMessage(ws, message);
    } catch (err) {
      console.error('[WS] Invalid message:', err);
    }
  });

  ws.on('close', () => {
    roomManager.handleDisconnect(ws);
  });
});

// 启动服务器
const PORT = Number(process.env.PORT) || 3000;
server.listen(PORT, () => {
  console.log(`[Server] Rhythm Swimming backend running on port ${PORT}`);
  console.log(`[Server] WebSocket endpoint: ws://localhost:${PORT}/ws`);
});

export { app, server, wss };
