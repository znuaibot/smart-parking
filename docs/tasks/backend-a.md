# 后端开发 A - 任务分配

> 工作空间：`/mnt/data/catpaw/home/workspace/code/smart-parking-backend-a/`
> 分支：`feat/auth-stats`
> 负责模块：Shared 基础设施 + Auth 认证 + Stats 统计

---

## 必读文档

请先阅读以下文档再开始编码：
1. [代码规范](../../design/code-standards.md) — 命名、分层、错误处理规范
2. [API 接口规范](../../api/openapi.yaml) — 所有端点定义
3. [架构总览](../../architecture/overview.md) — 了解分层架构

---

## 任务清单

### 任务 A-1: Supabase 客户端封装

**路径：** `server/src/shared/database/supabase.ts`

Supabase 客户端已创建基础版本，需要你完善：
- 添加查询性能日志（记录慢查询）
- 添加错误重试逻辑（网络错误自动重试 1 次）
- 导出 TypeScript 类型

### 任务 A-2: 统一配置管理

**路径：** `server/src/config/index.ts`

配置文件已存在，需要你：
- 添加启动时数据库连接测试函数 `testDbConnection()`
- 添加 `SUPABASE_PASSWORD` 校验（缺失时 fail-fast）
- 补充 Redis 连接健康检查

### 任务 A-3: 错误类型补充

**路径：** `server/src/shared/types/errors.ts`

已有基础错误类，需要补充：
- `SupabaseError` — 包装 Supabase 返回的错误
- `LPRFailedError` — 车牌识别失败
- `PaymentFailedError` — 支付失败

### 任务 A-4: 日志工具完善

**路径：** `server/src/shared/utils/logger.ts`

Pino 已配置，需要补充：
- `logDbQuery(query, duration)` — 记录 SQL 查询
- `logAPICall(req, res, duration)` — 记录 API 调用
- 开发环境使用 pino-pretty，生产环境输出 JSON

### 任务 A-5: 认证模块实现⭐ 核心任务

**新建文件：**
- `server/src/modules/auth/auth.service.ts`
- `server/src/modules/auth/auth.controller.ts`
- `server/src/modules/auth/auth.test.ts`

**实现接口：**

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/v1/auth/login | 登录，返回 accessToken + refreshToken |
| POST | /api/v1/auth/logout | 登出，Token 加入黑名单 |
| POST | /api/v1/auth/refresh | 刷新 accessToken |
| GET | /api/v1/auth/me | 获取当前用户信息（含 profiles 表明细） |

**用户角色存储策略：**
- Supabase Auth `auth.users` 存储认证信息（email/password）
- `profiles` 表存储业务属性（role, parking_id, display_name）
- 登录成功后 JOIN `profiles` 表返回完整用户信息

**核心代码结构：**
```typescript
// auth.service.ts
export class AuthService {
  async login(dto: LoginDTO): Promise<LoginResult> {
    // 1. 调用 Supabase Auth signInWithPassword 验证密码
    // 2. 查询 profiles 表获取角色信息
    // 3. 返回 Token + 用户信息
    const { data, error } = await supabase.auth.signInWithPassword({
      email: dto.email,
      password: dto.password,
    });
    if (error) throw new UnauthorizedError(error.message());
    
    // 获取用户角色
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, parking_id, display_name')
      .eq('id', data.user.id)
      .single();
    
    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        role: profile?.role || 'operator',
        parkingId: profile?.parking_id,
        displayName: profile?.display_name,
      },
    };
  }
}
```

### 任务 A-6: 鉴权中间件

**路径：** `server/src/middleware/authenticate.ts`

当前是临时实现，需要替换为：
```typescript
// 使用 Supabase Admin API 验证 token
const { data: { user }, error } = await supabase.auth.getUser(token);
if (error || !user) throw new UnauthorizedError();
req.user = { id: user.id, role: user.user_metadata?.role };
```

### 任务 A-7: 权限中间件 RBAC

**新建文件：** `server/src/middleware/authorize.ts`

**角色存储策略：**
- 角色存储在 `profiles` 表（非 user_metadata）
- 鉴权中间件从 JWT 中获得 user_id，再查 `profiles` 表获取 role
- 支持装饰器模式：`authorize('admin', 'operator')`

**实现逻辑：**
```typescript
export function authorize(...allowedRoles: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) throw new UnauthorizedError();
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();
      
      if (!profile || !allowedRoles.includes(profile.role)) {
        throw new ForbiddenError(`需要角色: ${allowedRoles.join(', ')}`);
      }
      
      req.user.role = profile.role;
      next();
    } catch (error) {
      next(error);
    }
  };
}

// 路由配置示例:
parkingRouter.post('/', authorize('superadmin'), parkingController.create);
```

### 任务 A-8: 统计模块

**新建文件：**
- `server/src/modules/stats/stats.service.ts`
- `server/src/modules/stats/stats.controller.ts`
- `server/src/modules/stats/stats.repository.ts`

| API | 说明 |
|-----|------|
| GET /api/v1/stats/realtime/:parkingId | 实时余位（查 `parking_availability` 视图） |
| GET /api/v1/stats/daily/:parkingId | 日报（查 `daily_stats` 物化视图） |
| GET /api/v1/stats/weekly/:parkingId | 周报（聚合日报数据） |

---

## 验收标准

- [ ] 所有接口通过 Postman 手动测试
- [ ] 单元测试覆盖率 > 70%
- [ ] ESLint 无报错，TypeScript 编译无错误
- [ ] 所有 PR 经过 Code Review 后合并

## 提交规范

```bash
git commit -m "feat(auth): 实现用户登录接口"
git commit -m "feat(middleware): 实现 RBAC 权限校验"
git commit -m "feat(stats): 实现实时余位统计接口"
```
