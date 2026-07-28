# 车位管家 - 智能停车场管理系统

## 项目简介

面向中小型停车场的 SaaS 管理系统，提供车辆进出管理、智能计费、车位引导、数据分析等核心能力。

## 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│ 前端 (React + Ant Design)                                   │
├─────────────────────────────────────────────────────────────┤
│ 后端 (Node.js + Express + TypeScript)                       │
├─────────────────────────────────────────────────────────────┤
│ 数据库 (Supabase PostgreSQL + Redis 缓存)                   │
└─────────────────────────────────────────────────────────────┘
```

## 快速开始

### 前置要求
- Node.js >= 20
- Docker Desktop (用于本地数据库)
- Supabase 账号 (免费计划即可)

### 本地开发

```bash
# 1. 克隆仓库
git clone https://github.com/znuaibot/smart-parking.git
cd smart-parking

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local 填入你的 Supabase 配置

# 4. 启动数据库
docker compose up -d postgres redis

# 5. 运行数据库迁移
npm run db:migrate

# 6. 导入种子数据
npm run db:seed

# 7. 启动后端
npm run dev:api

# 8. 启动前端 (另一个终端)
npm run dev:client
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
│   │   │   ├── auth/          # 认证模块
│   │   │   ├── parking/       # 车位模块
│   │   │   ├── vehicle/       # 进出记录模块
│   │   │   ├── billing/       # 计费模块
│   │   │   └── stats/         # 统计模块
│   │   ├── index.ts           # 入口文件
│   │   └── app.ts             # Express 应用
│   ├── prisma/                # Prisma 类型定义
│   └── package.json
├── client/                    # 前端应用
│   ├── src/
│   │   ├── pages/             # 页面
│   │   ├── components/        # 组件
│   │   ├── hooks/             # 自定义 Hooks
│   │   ├── store/             # 状态管理
│   │   ├── api/               # API 客户端
│   │   ├── types/             # 类型定义
│   │   ├── App.tsx            # 路由配置
│   │   └── main.tsx           # 入口文件
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── docs/                      # 文档
│   ├── api/                   # API 文档
│   ├── architecture/          # 架构文档
│   ├── design/                # 设计文档
│   └── tasks/                 # 任务分配
├── docker-compose.yml         # Docker 编排
├── nginx/                     # Nginx 配置
└── .github/workflows/         # CI/CD
```

## 核心模块

| 模块 | 路径 | 说明 |
|------|------|------|
| 认证 | server/src/modules/auth/ | 用户登录、Token 管理、权限控制 |
| 车位 | server/src/modules/parking/ | 停车场/车位 CRUD、状态管理 |
| 进出 | server/src/modules/vehicle/ | 入场记录、出场匹配、车牌识别 |
| 计费 | server/src/modules/billing/ | 计费规则、账单生成、支付对接 |
| 统计 | server/src/modules/stats/ | 实时统计、报表生成 |

## API 文档

详见 [docs/api/openapi.yaml](./docs/api/openapi.yaml)

交互式文档启动后访问: http://localhost:3000/api-docs

## 开发文档

- [架构设计](./docs/architecture/overview.md)
- [数据库设计](./docs/design/database.md)
- [代码规范](./docs/design/code-standards.md)
- [任务分配](./docs/tasks/sprint-1.md)
- [架构评审流程](./docs/architecture/review-process.md)

## 贡献指南

1. 从 `main` 分支创建特性分支: `feat/xxx` 或 `fix/xxx`
2. 提交代码前确保通过: `npm run lint && npm run test`
3. 提交 PR 到 `develop` 分支
4. PR 需至少 1 人 Code Review 通过
5. 合并到 `main` 分支后自动部署

## 许可证

MIT License
