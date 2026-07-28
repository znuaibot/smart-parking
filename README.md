# 车位管家 - 智能停车场管理系统

## 项目简介

面向中小型停车场的 SaaS 管理系统，提供车辆进出管理、智能计费、车位引导、数据分析等核心能力。

## 分支策略

| 工作空间目录 | 负责人 | 分支 |
|-------------|--------|------|
| `/mnt/data/catpaw/home/workspace/code/smart-parking-backend-a/` | 后端开发 A | `feat/auth-stats` |
| `/mnt/data/catpaw/home/workspace/code/smart-parking-backend-b/` | 后端开发 B | `feat/parking-vehicle` |
| `/mnt/data/catpaw/home/workspace/code/smart-parking-frontend/` | 前端开发 | `feat/frontend` |
| - | 架构师 | `main` |

### 开发流程

```bash
# 进入你的工作空间
cd /mnt/data/catpaw/home/workspace/code/smart-parking-backend-a    # 后端 A
cd /mnt/data/catpaw/home/workspace/code/smart-parking-backend-b    # 后端 B
cd /mnt/data/catpaw/home/workspace/code/smart-parking-frontend     # 前端

# 编码...
# 完成后推送并创建 PR
git push origin feat/auth-stats
```

## 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│ 前端 (React + Ant Design + Vite)                            │
├─────────────────────────────────────────────────────────────┤
│ 后端 (Node.js + Express + TypeScript)                       │
├─────────────────────────────────────────────────────────────┤
│ 数据库 (Supabase PostgreSQL + 外部 Redis)                   │
└─────────────────────────────────────────────────────────────┘
```

## 快速开始

### 前置要求
- Node.js >= 20
- Docker Desktop (可选，用于本地 Nginx)
- Supabase 账号或项目
- Redis 服务（或使用外部 Redis）

### 外部依赖

| 服务 | 地址 | 说明 |
|------|------|------|
| Redis | 120.26.109.126:6399 | 已测试连接成功 |
| Supabase | aws-0-ap-southeast-2.pooler.supabase.com | 需配置密码 |

### 本地开发步骤

```bash
# 1. 克隆仓库
git clone https://github.com/znuaibot/smart-parking.git
cd smart-parking

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local，填入：
#   - SUPABASE_PASSWORD (从 Supabase Dashboard 获取)
#   - SUPABASE_ANON_KEY
#   - SUPABASE_SERVICE_ROLE_KEY
#   - SUPABASE_JWT_SECRET

# 4. 启动后端 (连接外部 Redis 和 Supabase)
npm run dev:api

# 5. 启动前端 (另一个终端)
npm run dev:client
```

### 使用 Docker Compose (可选)

```bash
# 启动 API + Nginx (连接外部 Redis & Supabase)
docker compose up -d

# 启动包含本地 PostgreSQL (用于本地数据库开发)
docker compose --profile local-db up -d
```

## 目录结构

```
smart-parking/
├── supabase/                  # Supabase 配置和迁移
│   ├── migrations/            # 数据库迁移文件
│   ├── seed.sql               # 种子数据
│   └── config.toml            # Supabase 配置
├── server/                    # 后端服务
│   ├── src/
│   │   ├── config/            # 配置管理
│   │   ├── middleware/        # 中间件
│   │   ├── shared/            # 公共组件
│   │   ├── modules/           # 业务模块
│   │   ├── index.ts           # 入口文件
│   │   └── app.ts             # Express 应用
│   ├── prisma/                # Prisma Schema
│   ├── package.json
│   └── Dockerfile
├── client/                    # 前端应用 (React)
│   ├── src/
│   │   ├── pages/             # 页面
│   │   ├── components/        # 组件
│   │   ├── hooks/             # 自定义 Hooks
│   │   ├── store/             # 状态管理
│   │   ├── api/               # API 客户端
│   │   ├── App.tsx            # 路由配置
│   │   └── main.tsx           # 入口文件
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── docs/                      # 文档
│   ├── api/                   # API 文档 (OpenAPI)
│   ├── architecture/          # 架构文档
│   ├── design/                # 设计文档
│   └── tasks/                 # 任务分配
├── docker-compose.yml         # Docker 编排
├── nginx/                     # Nginx 配置
├── .env.example               # 环境变量模板
├── .env.local                 # 本地实际配置 (gitignored)
└── .github/workflows/         # CI/CD
```

## 核心模块

| 模块 | 路径 | 说明 |
|------|------|------|
| 认证 | server/src/modules/auth/ | 用户登录、Token 管理、RBAC 权限 |
| 车位 | server/src/modules/parking/ | 停车场/车位 CRUD、乐观锁状态管理 |
| 进出 | server/src/modules/vehicle/ | 入场记录、出场匹配、LPR 车牌识别 |
| 计费 | server/src/modules/billing/ | 计费规则、账单生成、支付对接 |
| 统计 | server/src/modules/stats/ | 实时统计、日报周报月报 |

## 连接信息

### Redis
```
Host: 120.26.109.126
Port: 6399
Password: ipaking@545
状态: ✅ 已测试连接成功
```

### Supabase (PostgreSQL)
```
Host: aws-0-ap-southeast-2.pooler.supabase.com
Port: 6543
Database: postgres
User: postgres.vadlhadksuzmdonnpfke
区域: 悉尼 (ap-southeast-2)
```

> 注: Supabase 密码需从 Dashboard 获取：
> https://supabase.com/dashboard/project/_/settings/database

## 开发文档

- [架构设计](./docs/architecture/overview.md)
- [数据库设计](./docs/design/database.md)
- [代码规范](./docs/design/code-standards.md)
- [API 规范](./docs/api/openapi.yaml)
- [任务分配](./docs/tasks/BRIEFING.md)
- [架构评审流程](./docs/architecture/review-process.md)

## 已安装 Skills

| Skill | 路径 | 用途 |
|-------|------|------|
| supabase | ~/.meituan-catpaw/48840449/skills/supabase/ | Supabase 全流程开发指导 |
| supabase-postgres-best-practices | ~/.meituan-catpaw/48840449/skills/supabase-postgres-best-practices/ | PostgreSQL 最佳实践 |

## 贡献指南

1. 从 `main` 分支创建特性分支: `feat/xxx` 或 `fix/xxx`
2. 提交代码前确保通过: `npm run lint && npm run test`
3. 提交 PR 到 `develop` 分支
4. PR 需至少 1 人 Code Review 通过
5. 合并到 `main` 分支后自动部署

## 许可证

MIT License
