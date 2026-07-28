# 开发任务文档索引

> Sprint 1：基础设施 + 认证 + 停车场/车位管理
> 时间：2 周（10 个工作日）

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

| 角色 | 工时 | 文件数 |
|------|------|--------|
| 后端 A | ~35h | ~8 个新文件 |
| 后端 B | ~40h | ~10 个新文件 |
| 前端 | ~38h | ~15 个新文件 |
| **合计** | **~113h** | **~33 个新文件** |

## 执行顺序

```
Week 1:
  D1-3: 后端 A 完成 Auth + Shared
  D1-5: 后端 B 完成 Parking CRUD
  D1-5: 前端完成 Layout + 登录页

Week 2:
  D6-8: 后端 A 完成 Stats
  D6-10: 后端 B 完成 Vehicle
  D6-10: 前端完成 停车场/车位/统计页面
```
