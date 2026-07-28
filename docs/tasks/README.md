# 开发任务文档索引

> Sprint 1：基础设施 + 认证 + 停车场/车位管理

## 工作空间分配

| 工作空间目录 | 负责人 | 分支 |
|-------------|--------|------|
| `/mnt/data/catpaw/home/workspace/code/smart-parking-backend-a/` | 后端开发 A | `feat/auth-stats` |
| `/mnt/data/catpaw/home/workspace/code/smart-parking-backend-b/` | 后端开发 B | `feat/parking-vehicle` |
| `/mnt/data/catpaw/home/workspace/code/smart-parking-frontend/` | 前端开发 | `feat/frontend` |

## 分支策略

| 分支名 | 负责人 | 说明 |
|--------|--------|------|
| `feat/auth-stats` | 后端开发 A | Auth + Stats + Shared |
| `feat/parking-vehicle` | 后端开发 B | Parking + Vehicle + Billing 基础 |
| `feat/frontend` | 前端开发 | 全部管理后台页面 |
| `main` | 架构师 | 主分支，PR 合并目标 |

### 工作流程

```bash
# 进入你的工作空间目录
cd /mnt/data/catpaw/home/workspace/code/smart-parking-backend-a   # 后端 A
cd /mnt/data/catpaw/home/workspace/code/smart-parking-backend-b   # 后端 B
cd /mnt/data/catpaw/home/workspace/code/smart-parking-frontend    # 前端

# 编码...
# 完成后推送并创建 PR 到 main
git push origin feat/auth-stats
```

## 文档导航

| 文档 | 阅读对象 | 说明 |
|------|---------|------|
| [backend-a.md](./backend-a.md) | 后端开发 A | Shared + Auth + Stats 模块 |
| [backend-b.md](./backend-b.md) | 后端开发 B | Parking + Vehicle 模块 |
| [frontend.md](./frontend.md) | 前端开发 | 全部管理后台页面 |
| [BRIEFING.md](./BRIEFING.md) | 全员 | 完整任务清单（汇总版） |

## 通用文档（全员必读）

| 文档 | 路径 | 说明 |
|------|------|------|
| 代码规范 | `docs/design/code-standards.md` | 命名、目录、编码规范 |
| API 规范 | `docs/api/openapi.yaml` | 30+ 端点定义 |
| 数据库设计 | `docs/design/database.md` | 7 张核心表 + 分区 + 触发器 |
| 架构总览 | `docs/architecture/overview.md` | 分层架构、模块划分 |
| 评审流程 | `docs/architecture/review-process.md` | PR 流程、变更分级 |

## 工时汇总

| 角色 | 文件数 |
|------|--------|
| 后端开发 A | ~8 个新文件 |
| 后端开发 B | ~10 个新文件 |
| 前端开发 | ~15 个新文件 |
| **合计** | **~33 个新文件** |

## 执行顺序

并行开发，各自独立完成：
- 后端 A: Auth + Stats 模块
- 后端 B: Parking + Vehicle 模块
- 前端: 全部管理后台页面
