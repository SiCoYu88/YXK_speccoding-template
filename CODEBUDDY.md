# CODEBUDDY.md This file provides guidance to CodeBuddy when working with code in this repository.

## 项目概览

这是一个 **SpecCoding 全栈开发模板**，基于 OpenSpec + Superpowers 工作流驱动的 spec-driven 项目。模板本身不含业务代码，而是提供完整的开发流程骨架和规范约定。

## 常用命令

### OpenSpec 变更管理

```bash
# 创建新变更（脚手架）
openspec-cn new change "<name>"
```

### Git 分支操作

```bash
# 创建版本分支（从 main）
git checkout main && git pull && git checkout -b version/v<semver>

# 创建 feature 分支并记录父分支
parent=$(git rev-parse --abbrev-ref HEAD)
git checkout -b feature/<name>
git config branch.feature/<name>.parent "$parent"

# 合并回父分支
parent=$(git config --get branch.$(git rev-parse --abbrev-ref HEAD).parent)
git checkout "$parent" && git merge feature/<name> && git branch -d feature/<name>
```

### 后端开发（以 Node.js 为例，当 backend/ 有代码时）

```bash
cd backend
npm install              # 安装依赖
npm run dev              # 启动开发服务器（热重载）
npm start                # 生产启动
npm test                 # 运行全部测试
npx vitest run <file>    # 运行单个测试文件
npm run migrate:up       # 运行数据库迁移
```

## 架构与工作流

### 两级 Spec 体系

项目通过两层文档管理需求和设计，**严禁混淆**：

**项目级（`spec/`）**：全局视图，变动频率低，人工主导。
- `requirements.md` — 累积式需求（按版本标签追加，带 R-ID）
- `design.md` — 架构决策
- `tasks.md` — 里程碑任务（每条 ↔ 一个 openspec 变更）
- `devlog.md` — 开发日志（归档/合并时自动追加）
- `structure.md` — 顶层目录结构

**需求级（`openspec/changes/<name>/`）**：单次变更的全部产出物，高频，AI 产出。
- `proposal.md` — 是什么、为什么
- `design.md` — 技术方案、架构决策、风险权衡
- `specs/<feature>/spec.md` — 场景式需求规格
- `plan.md` — 实现计划（**必须**落在此目录）
- `tasks.md` — 可勾选的实现任务清单

### 七阶段开发工作流

每个 task 严格走一次完整循环：

```
1. git branch（创建 feature 分支 + 记录父分支）
2. openspec scaffold（创建变更目录）
3. brainstorming（探索设计，产出 proposal/design/specs）
4. writing-plans（产出 plan.md，必须在变更目录下）
5. executing-plans（严格按 plan.md 执行代码变更）
6. archive（归档到 openspec/changes/archive/）
7. git merge（合回父分支，追加 devlog）
```

### 两级分支模型

```
main ── version/v1.2（版本分支，承载一批需求）
              ├── feature/add-user-auth
              └── feature/implement-payment
```

- **版本分支**：命名必须为 `version/v<semver>`，从 main 创建
- **feature 分支**：从当前所在分支（通常是版本分支）拉出
- **父分支记录**：`git config branch.<name>.parent`，合并时读此值回到正确目标
- **版本 → main 合并**由人工处理，AI 不碰 main

### 协作模式

| 阶段 | AI 姿态 |
|------|---------|
| 方案制定（brainstorming / writing-plans） | 多问、列 tradeoff、设 checkpoint，关键判断交人类 |
| 执行落地（executing-plans / 写代码） | 自主推进，仅在方案冲突/不可逆操作/反复失败时请示 |

### Spec 文档维护时机

项目级 spec 仅在两个边界同步，开发过程中不动：

1. **版本 kickoff**：人工触发后，AI 讨论澄清 → 确认 → 批量写入 requirements/tasks/design/devlog
2. **openspec 归档**：自动勾选 tasks.md ✅ + 检测是否需要提升 design（需人工确认）

### 关键目录说明

| 目录 | 用途 |
|------|------|
| `backend/` | 后端代码（技术栈自选） |
| `frontend/` | 前端代码（Web/H5/App） |
| `prototype/` | 原型设计稿 |
| `spec/` | 项目级规范文档 |
| `openspec/` | 需求级变更管理 |
| `.claude/commands/opsx/` | 斜杠命令定义（apply/archive/explore/propose） |
| `.claude/skills/` | OpenSpec 技能（apply-change/archive-change/explore/propose） |
| `.codebuddy/` | CodeBuddy 配置（勿删） |
| `docs/` | README 引用的静态资源 |

### 产出物归一原则

单次变更的所有产出物**必须统一存放**在 `openspec/changes/<name>/` 下。plan.md 绝不可散落到仓库根或其他位置。这是一键归档、可审计、可回滚的前提。

### 版本 kickoff 规则

触发后 AI 必须：
1. 读分支名抽取版本号（匹配 `^version/(v\d+(\.\d+)*)$`）
2. 读 `git config --get user.initials` 获取缩写
3. 进入讨论阶段，**禁止立即修改 spec**
4. 经确认后批量写入，需求带版本标签 `[v1.2 新增]` + 唯一 ID `R-v1.2-<缩写>-<序号>`
5. 修订老需求时原条目保留，标注"已由 X 取代"

### 参考示例

`openspec/changes/archive/example-add-user-auth/` 包含一个完整的变更示例（proposal → design → specs → plan → tasks），新手可直接参照结构。
