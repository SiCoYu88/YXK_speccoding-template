# 🏊 节奏游泳 - Rhythm Swimming

一款音乐节奏 × 游泳竞速的多人实时竞技游戏。玩家在10人房间中通过按照音乐节拍进行输入操作来控制角色的游泳动作，节奏准确度直接影响泳速和排名。

## 🎮 核心玩法

- **节奏判定**：按照音乐节拍精准"划水"，判定分为 Perfect / Great / Good / Miss
- **速度映射**：节奏越准确，泳速越快（效率 × 连击加成 × 体力系数）
- **体力管理**：体力随时间消耗，Miss 额外扣除，需要保持节奏来维持体力
- **冲刺阶段**：音乐高潮段自动触发冲刺，判定权重翻倍
- **10人竞技**：实时匹配，同步开赛，争夺名次

## 📁 项目结构

```
├── frontend/          # 前端 (Vite + TypeScript + Canvas)
├── backend/           # 后端 (Node.js + Express + WebSocket)
├── shared/            # 前后端共享代码
│   └── protocol/      # 通信协议和常量定义
├── assets/            # 资源文件
│   ├── music/         # 音乐文件
│   ├── audio/         # 音效文件
│   └── images/        # 图片资源
├── spec/              # 项目规范文档
└── openspec/          # 需求级变更管理
```

## 🚀 快速开始

### 环境要求

- Node.js >= 20.x
- npm >= 10.x

### 安装依赖

```bash
npm run install:all
```

### 启动开发服务器

```bash
# 同时启动前端和后端（推荐）
npm run dev

# 或者分别启动
npm run dev:frontend   # http://localhost:5173
npm run dev:backend    # http://localhost:3000 (WS: ws://localhost:3000/ws)
```

### 多客户端调试

开发模式下，打开多个浏览器标签页（或不同浏览器）即可模拟多客户端联机：

1. 启动 `npm run dev`
2. 在多个浏览器标签中打开 `http://localhost:5173`
3. 每个标签页作为一个独立玩家

### 构建

```bash
npm run build
```

## 🏗️ 技术栈

| 层级 | 技术 |
|------|------|
| 前端渲染 | HTML5 Canvas + TypeScript |
| 前端构建 | Vite 5 |
| 后端框架 | Express 5 + Node.js |
| 实时通信 | WebSocket (ws) |
| 同步方案 | 帧同步 + 状态快照混合 |
| 节奏引擎 | Web Audio API + 自定义判定系统 |

## 📋 开发状态

详见 [openspec/changes/rhythm-swimming-game/tasks.md](openspec/changes/rhythm-swimming-game/tasks.md)
