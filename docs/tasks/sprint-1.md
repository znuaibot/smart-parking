# Sprint 1 开发任务清单 - 适配 Supabase + GitHub

## 📋 任务总览

| 角色 | 任务数 | 预估工时 | 负责路径 |
|------|--------|---------|---------|
| 后端开发 A | 8 个 | ~35h | server/src/ |
| 后端开发 B | 6 个 | ~32h | server/src/ |
| 前端开发 | 6 个 | ~38h | client/src/ |
| **合计** | **20 个** | **~105h** | - |

---

## 🔧 后端开发 A - 负责模块：Shared + Auth + Stats

### 任务 A-1: Supabase 客户端封装（2h）

**文件路径：** `server/src/shared/database/supabase.ts`

**要做的事：**
1. 已完成基础封装，需要补充：
   - 添加连接池配置
   - 添加错误重试逻辑
   - 添加查询性能日志

**验收标准：**
- [ ] 导出 `supabase` 单例可直接使用
- [ ] Service Role Key 注入正确
- [ ] 支持自定义 options

---

### 任务 A-2: 统一配置管理（2h）

**文件路径：** `server/src/config/index.ts`

**要做的事：**
1. 已完成基础结构，需要补充：
   - 添加 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` 校验
   - 添加数据库连接测试函数 `testDbConnection()`
   - 添加启动时配置完整性检查

**验收标准：**
- [ ] 缺少必要配置时启动报错并明确提示
- [ ] `config.isDev` / `config.isProd` 正确

---

### 任务 A-3: 错误类型补充（2h）

**文件路径：** `server/src/shared/types/errors.ts`

**要做的事：**
1. 已完成基础错误类型，需要补充：
   - `SupabaseError` - Supabase 返回的错误包装
   - `LPRFailedError` - 车牌识别失败
   - `PaymentFailedError` - 支付失败

**验收标准：**
- [ ] 每种错误有明确的 errorCode
- [ ] isOperational 标记正确

---

### 任务 A-4: 日志工具完善（2h）

**文件路径：** `server/src/shared/utils/logger.ts`

**要做的事：**
1. 已完成基础 Pino 配置，需要补充：
   - 添加 `logDbQuery(query, duration)` 方法
   - 添加 `logAPICall(req, res, duration)` 方法
   - 生产环境输出 JSON 到 stdout，开发环境用 pino-pretty

**验收标准：**
- [ ] 日志包含 requestId
- [ ] 敏感字段自动脱敏（password、token）

---

### 任务 A-5: 认证模块实现（8h）

**文件路径：**
- `server/src/modules/auth/auth.routes.ts`
- `server/src/modules/auth/auth.service.ts`（新建）
- `server/src/modules/auth/auth.controller.ts`（新建）

**要做的事：**
1. **登录接口 POST /api/v1/auth/login**
   - 接收 { username, password }
   - 调用 Supabase Auth 验证
   - 返回 { accessToken, refreshToken, user }
   
2. **登出接口 POST /api/v1/auth/logout**
   - 将 Token 加入黑名单（Redis 或 Supabase 表）
   
3. **刷新 Token POST /api/v1/auth/refresh**
   - 验证 refreshToken
   - 返回新的 accessToken

4. **获取当前用户 GET /api/v1/auth/me**
   - 解析 JWT 获取用户信息
   - 查询 users 表返回详情

**关键代码结构：**
```typescript
// auth.service.ts
export class AuthService {
  async login(username: string, password: string): Promise<LoginResult> {
    // 1. 调用 Supabase Auth signInWithPassword
    // 2. 获取用户角色信息
    // 3. 返回 Token + 用户信息
  }
  
  async logout(token: string): Promise<void> {
    // 将 token 加入黑名单
  }
}
```

**验收标准：**
- [ ] 登录成功返回 Token
- [ ] 密码错误返回 401
- [ ] 无效 Token 访问受保护接口返回 401
- [ ] 单元测试覆盖核心逻辑

---

### 任务 A-6: 鉴权中间件完善（4h）

**文件路径：** `server/src/middleware/authenticate.ts`

**要做的事：**
1. 替换当前的临时实现，使用 Supabase Admin API 校验 Token
2. 解析 JWT 获取用户角色
3. 将用户信息注入 req.user

**Supabase Token 校验逻辑：**
```typescript
// 使用 Supabase Admin API 验证 token
const { data: { user }, error } = await supabase.auth.getUser(token);
if (error || !user) throw new UnauthorizedError();
req.user = { id: user.id, role: user.user_metadata?.role };
```

**验收标准：**
- [ ] 有效 Token 放行
- [ ] 无效/过期 Token 返回 401
- [ ] 无 Token 请求返回 401

---

### 任务 A-7: 权限中间件（RBAC）（4h）

**文件路径：** `server/src/middleware/authorize.ts`（新建）

**要做的事：**
1. 实现角色权限校验中间件
2. 支持装饰器模式：`authorize('admin', 'operator')`
3. 不返回 403 的场景：用户无权限

**路由配置示例：**
```typescript
// 只有超级管理员可以创建停车场
parkingRouter.post('/', authorize('superadmin'), parkingController.create);
```

**验收标准：**
- [ ] 超级管理员可以访问所有接口
- [ ] 收费员不能访问管理接口
- [ ] 无权限返回 403 + 明确错误信息

---

### 任务 A-8: 统计模块基础（8h）

**文件路径：**
- `server/src/modules/stats/stats.routes.ts`（已存在）
- `server/src/modules/stats/stats.service.ts`（新建）
- `server/src/modules/stats/stats.repository.ts`（新建）

**要做的事：**
1. **实时统计 GET /api/v1/stats/realtime/:parkingId**
   - 查询 `parking_availability` 视图
   - 返回总车位、占用、余位、占用率

2. **日报统计 GET /api/v1/stats/daily/:parkingId**
   - 查询 `daily_stats` 物化视图
   - 返回指定日期范围的入场次数、平均时长、收入

3. **周报/月报 GET /api/v1/stats/weekly/:parkingId**
   - 聚合日报数据
   - 返回趋势数据（图表友好格式）

**SQL 查询示例：**
```sql
-- 实时余位
SELECT * FROM parking_availability WHERE id = $1;

-- 日报
SELECT * FROM daily_stats 
WHERE parking_id = $1 AND stat_date BETWEEN $2 AND $3
ORDER BY stat_date;
```

**验收标准：**
- [ ] 实时统计响应时间 < 100ms
- [ ] 支持日期范围查询
- [ ] 返回前端图表需要的格式

---

## 🔧 后端开发 B - 负责模块：Parking + Vehicle + Billing

### 任务 B-1: 停车场模块实现（10h）

**文件路径：**
- `server/src/modules/parking/parking.routes.ts`（已存在）
- `server/src/modules/parking/parking.service.ts`（新建）
- `server/src/modules/parking/parking.repository.ts`（新建）
- `server/src/modules/parking/parking.dto.ts`（新建）

**要做的事：**

1. **停车场 CRUD**
   - `GET /api/v1/parkings` - 列表（分页、筛选）
   - `POST /api/v1/parkings` - 创建
   - `GET /api/v1/parkings/:id` - 详情
   - `PUT /api/v1/parkings/:id` - 更新
   - `DELETE /api/v1/parkings/:ids` - 删除（软删除）

2. **DTO 定义**
   ```typescript
   // parking.dto.ts
   export const CreateParkingSchema = z.object({
     name: z.string().min(1).max(100),
     code: z.string().regex(/^[A-Z0-9-]+$/),
     address: z.string(),
     totalSpaces: z.number().int().positive(),
   });
   ```

3. **关键字段校验**
   - code 唯一性
   - totalSpaces > 0

**验收标准：**
- [ ] 所有 CRUD 接口可用
- [ ] 参数校验失败返回 400 + 详细错误
- [ ] 唯一约束冲突返回 409
- [ ] 单元测试覆盖率 > 70%

---

### 任务 B-2: 车位模块实现（12h）

**文件路径：**
- `server/src/modules/parking/space.routes.ts`（已存在）
- `server/src/modules/parking/space.service.ts`（新建）
- `server/src/modules/parking/space.repository.ts`（新建）

**要做的事：**

1. **车位 CRUD**
   - `GET /api/v1/parking-spaces` - 车位列表
   - `POST /api/v1/parkings/:id/spaces/batch` - 批量创建（接受数组）
   - `PUT /api/v1/parking-spaces/:id/status` - 更新状态（乐观锁）

2. **批量创建车位**
   ```typescript
   // 接受格式
   {
     "spaces": [
       { "code": "A-01-001", "zone": "A", "floor": 1, "spaceType": "normal" },
       ...
     ]
   }
   // 使用 Prisma createMany 或 Supabase 批量插入
   ```

3. **乐观锁状态更新**
   ```sql
   UPDATE parking_spaces 
   SET status = $1, updated_at = NOW(), version = version + 1
   WHERE id = $2 AND version = $3
   RETURNING *;
   -- 如果 RETURNING 空结果，说明版本冲突，返回 409
   ```

4. **实时余位查询**
   - 直接查询 `parking_availability` 视图
   - 按 zone 分组统计

**验收标准：**
- [ ] 批量创建 100 个车位 < 1s
- [ ] 并发更新同一车位只有一个成功
- [ ] 实时余位查询 < 50ms

---

### 任务 B-3: 车辆入场模块（10h）

**文件路径：**
- `server/src/modules/vehicle/vehicle.routes.ts`（已存在）
- `server/src/modules/vehicle/vehicle.service.ts`（新建）
- `server/src/modules/vehicle/vehicle.repository.ts`（新建）
- `server/src/modules/vehicle/lpr.service.ts`（新建）
- `server/src/modules/vehicle/vehicle.dto.ts`（新建）

**要做的事：**

1. **入场记录 POST /api/v1/vehicle-entry**
   ```typescript
   // 流程
   1. 解析请求：plateNumber（可选，可手动录入）、imageUrl、gateId
   2. 如果无 plateNumber，调用 LPR 服务识别
   3. 检查是否重复入场（同一 plateNumber + status='parked'）
   4. 创建入场记录
   5. 自动分配车位（触发器已实现）
   6. 返回记录
   ```

2. **LPR 车牌识别服务**
   ```typescript
   // lpr.service.ts
   export class LPRService {
     async recognize(imageUrl: string): Promise<LPRResult> {
       // 1. 优先调用云端 API（如配置）
       // 2. 未配置则调用 Supabase Edge Function（本地 OCR）
       // 3. 返回 { plateNumber, confidence }
     }
   }
   ```

3. **DTO 定义**
   ```typescript
   export const VehicleEntrySchema = z.object({
     parkingId: z.string().uuid(),
     plateNumber: z.string().regex(/^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼使领][A-Z][A-Z0-9]{4,5}[A-Z0-9挂学警港澳]$/).optional(),
     imageUrl: z.string().url(),
     gateId: z.string(),
     entryType: z.enum(['auto', 'manual']).default('auto'),
   });
   ```

**验收标准：**
- [ ] 正确车牌识别后自动录入
- [ ] 重复入场返回 409
- [ ] 无牌车支持手动录入
- [ ] 入场记录持久化

---

### 任务 B-4: 车辆出场模块（8h）

**文件路径：**
- `server/src/modules/vehicle/vehicle.service.ts`（扩展）

**要做的事：**

1. **出场 POST /api/v1/vehicle-exit**
   ```typescript
   // 流程
   1. 根据 plateNumber + parkingId + status='parked' 查找记录
   2. 计算停车时长（exitTime - entryTime）
   3. 调用计费服务计算费用
   4. 创建待支付账单
   5. 更新记录状态为 exited
   6. 释放车位
   7. 返回 { record, bill }
   ```

2. **查询在场车辆 GET /api/v1/vehicles/:plate/ongoing**
   ```sql
   SELECT * FROM vehicle_entry_records
   WHERE plate_number = $1 AND parking_id = $2 AND status = 'parked';
   ```

**验收标准：**
- [ ] 出场返回完整账单信息
- [ ] 车位自动释放
- [ ] 不存在的车辆查询返回 404

---

## 🎨 前端开发 - 负责全部页面

### 任务 F-1: 项目配置和路由（4h）

**文件路径：**
- `client/src/App.tsx`（已存在，需完善）
- `client/src/api/client.ts`（新建）

**要做的事：**

1. **API 客户端封装**
   ```typescript
   // client/src/api/client.ts
   import axios from 'axios';
   
   const apiClient = axios.create({
     baseURL: import.meta.env.VITE_API_URL || '/api/v1',
     timeout: 30000,
   });
   
   // 请求拦截器 - 添加 Token
   apiClient.interceptors.request.use(config => {
     const token = localStorage.getItem('accessToken');
     if (token) config.headers.Authorization = `Bearer ${token}`;
     return config;
   });
   
   // 响应拦截器 - 处理 401
   apiClient.interceptors.response.use(
     response => response,
     error => {
       if (error.response?.status === 401) {
         // 尝试刷新 Token 或跳转登录
         window.location.href = '/login';
       }
       return Promise.reject(error);
     }
   );
   
   export default apiClient;
   ```

2. **完善路由配置**
   ```typescript
   // App.tsx - 添加懒加载和路由守卫
   import { lazy, Suspense } from 'react';
   import { Routes, Route } from 'react-router-dom';
   
   const Login = lazy(() => import('./pages/Login'));
   const Dashboard = lazy(() => import('./pages/Dashboard'));
   const ParkingList = lazy(() => import('./pages/parking/ParkingList'));
   // ...
   ```

**验收标准：**
- [ ] API 客户端全局可用
- [ ] 路由正确跳转
- [ ] 401 自动跳转登录

---

### 任务 F-2: 登录页面（6h）

**文件路径：**
- `client/src/pages/Login/index.tsx`（新建）
- `client/src/api/auth.ts`（新建）

**要做的事：**

1. **UI 设计**
   - 卡片式居中布局
   - Logo + 标题
   - 用户名 + 密码输入框
   - 登录按钮（带 loading）
   - 错误提示

2. **API 调用**
   ```typescript
   // api/auth.ts
   export const login = async (credentials: LoginCredentials) => {
     const { data } = await apiClient.post('/auth/login', credentials);
     localStorage.setItem('accessToken', data.accessToken);
     localStorage.setItem('refreshToken', data.refreshToken);
     localStorage.setItem('user', JSON.stringify(data.user));
     return data;
   };
   ```

3. **状态管理**
   - useLoading 状态
   - 错误信息展示
   - 登录成功后跳转首页

**验收标准：**
- [ ] 输入错误密码显示错误提示
- [ ] 登录成功跳转首页
- [ ] Token 正确存储
- [ ] 移动端适配

---

### 任务 F-3: 停车场管理页面（8h）

**文件路径：**
- `client/src/pages/parking/ParkingList.tsx`（新建）
- `client/src/pages/parking/ParkingForm.tsx`（新建）
- `client/src/api/parking.ts`（新建）

**要做的事：**

1. **列表页**
   - 表格展示：名称、编码、地址、总车位、余位、状态
   - 搜索/筛选栏
   - 分页
   - 操作列：编辑、删除、查看车位

2. **创建/编辑弹窗**
   - 表单字段：名称、编码、地址、总车位数
   - 提交调用 API

3. **API 封装**
   ```typescript
   // api/parking.ts
   export const parkingApi = {
     list: (params) => apiClient.get('/parkings', { params }),
     create: (data) => apiClient.post('/parkings', data),
     update: (id, data) => apiClient.put(`/parkings/${id}`, data),
     delete: (id) => apiClient.delete(`/parkings/${id}`),
     getAvailability: (id) => apiClient.get(`/parking-spaces/${id}/availability`),
   };
   ```

**验收标准：**
- [ ] 列表正确展示数据
- [ ] 搜索筛选正常
- [ ] 创建/编辑/删除功能可用
- [ ] 操作后有成功提示

---

### 任务 F-4: 车位管理页面（10h）

**文件路径：**
- `client/src/pages/parking/SpaceList.tsx`（新建）
- `client/src/components/parking/SpaceGrid.tsx`（新建）
- `client/src/api/space.ts`（新建）

**要做的事：**

1. **列表页**
   - 筛选条件：区域、楼层、状态
   - 表格：编号、区域、楼层、类型、状态、当前车牌
   - 批量操作：批量创建、批量修改状态

2. **车位可视化网格组件**
   ```typescript
   // components/parking/SpaceGrid.tsx
   // 使用 CSS Grid 或 Canvas 展示车位布局
   // - 绿色：可用
   // - 红色：占用  
   // - 黄色：预约
   // - 灰色：禁用
   // - 紫色：VIP
   // - 蓝色：充电桩
   // 点击车位显示详情/修改状态
   ```

3. **颜色图例**
   - 顶部显示各状态的颜色说明
   - 支持点击查看对应类型的车位

**验收标准：**
- [ ] 列表筛选正常
- [ ] 可视化网格正确渲染
- [ ] 点击车位可修改状态
- [ ] 颜色区分清晰

---

### 任务 F-5: 实时余位统计卡片（4h）

**文件路径：**
- `client/src/components/stats/AvailabilityCard.tsx`（新建）

**要做的事：**

1. **统计卡片组件**
   - 总车位数
   - 可用车位数
   - 占用率（环形进度图）
   - 各区域余位分布

2. **自动刷新**
   - 每 30 秒刷新一次
   - 或接入 Supabase Realtime 实时更新

**验收标准：**
- [ ] 数据实时更新
- [ ] 图表可视化清晰
- [ ] 响应式布局

---

### 任务 F-6: 布局组件和导航（6h）

**文件路径：**
- `client/src/components/layout/AppLayout.tsx`（新建）
- `client/src/components/layout/Sidebar.tsx`（新建）
- `client/src/components/layout/Header.tsx`（新建）
- `client/src/hooks/useAuth.ts`（新建）

**要做的事：**

1. **整体布局**
   - 左侧导航栏（200px，可折叠）
   - 顶部 Header（面包屑 + 用户信息）
   - 右侧内容区

2. **菜单结构**
   ```
   首页
   停车场管理
     - 停车场列表
     - 车位管理
   进出管理
     - 实时进出监控
     - 进出记录查询
   计费管理
     - 计费规则
     - 账单列表
   统计报表
     - 实时统计
     - 日报/周报/月报
   系统管理
     - 用户管理
     - 操作日志
   ```

3. **自定义 Hook**
   ```typescript
   // hooks/useAuth.ts
   export const useAuth = () => {
     const user = JSON.parse(localStorage.getItem('user') || 'null');
     const isAuthenticated = !!user;
     const logout = () => { /* 清除 Token 并跳转 */ };
     return { user, isAuthenticated, logout };
   };
   ```

**验收标准：**
- [ ] 布局正确渲染
- [ ] 菜单点击路由正确
- [ ] 响应式适配
- [ ] 用户信息显示正确

---

## 📁 需要新建的完整文件清单

### 后端新建文件（20 个）

```
server/src/
├── modules/auth/
│   ├── auth.service.ts          # 认证业务逻辑
│   ├── auth.controller.ts       # 认证控制器
│   └── auth.test.ts             # 单元测试
├── modules/parking/
│   ├── parking.service.ts       # 停车场业务逻辑
│   ├── parking.controller.ts    # 停车场控制器
│   ├── parking.repository.ts    # 数据访问层
│   ├── parking.dto.ts           # 参数校验
│   ├── space.service.ts         # 车位业务逻辑
│   ├── space.controller.ts      # 车位控制器
│   ├── space.repository.ts      # 数据访问层
│   └── parking.test.ts          # 单元测试
├── modules/vehicle/
│   ├── vehicle.service.ts       # 进出记录业务逻辑
│   ├── vehicle.controller.ts    # 进出记录控制器
│   ├── vehicle.repository.ts    # 数据访问层
│   ├── vehicle.dto.ts           # 参数校验
│   ├── lpr.service.ts           # 车牌识别服务
│   └── vehicle.test.ts          # 单元测试
├── modules/stats/
│   ├── stats.service.ts         # 统计业务逻辑
│   ├── stats.controller.ts      # 统计控制器
│   ├── stats.repository.ts      # 数据访问层
│   └── stats.test.ts            # 单元测试
└── middleware/
    └── authorize.ts             # 权限中间件
```

### 前端新建文件（15 个）

```
client/src/
├── api/
│   ├── client.ts                # Axios 基础封装
│   ├── auth.ts                  # 认证 API
│   ├── parking.ts               # 停车场 API
│   └── space.ts                 # 车位 API
├── components/
│   ├── layout/
│   │   ├── AppLayout.tsx        # 整体布局
│   │   ├── Sidebar.tsx          # 侧边导航
│   │   └── Header.tsx           # 顶部栏
│   ├── parking/
│   │   └── SpaceGrid.tsx        # 车位可视化
│   └── stats/
│       └── AvailabilityCard.tsx # 余位统计卡片
├── pages/
│   ├── Login/index.tsx          # 登录页
│   ├── Dashboard/index.tsx      # 首页仪表盘
│   ├── parking/
│   │   ├── ParkingList.tsx      # 停车场列表
│   │   └── ParkingForm.tsx      # 停车场表单
│   └── parking/
│       └── SpaceList.tsx        # 车位列表
├── hooks/
│   └── useAuth.ts               # 认证 Hook
└── store/
    └── authStore.ts             # 认证状态
```

---

## ⏰ 建议执行顺序

### Week 1（第 1-5 天）

| 天 | 后端 A | 后端 B | 前端 |
|----|--------|--------|------|
| D1 | A-1 Supabase 封装 | B-1 停车场 CRUD | F-1 API 客户端 + 路由 |
| D2 | A-2 配置管理 | B-1 停车场 CRUD | F-2 登录页面 |
| D3 | A-5 认证模块 | B-2 车位模块 | F-2 登录页面 |
| D4 | A-5 认证模块 | B-2 车位模块 | F-3 停车场列表 |
| D5 | A-6 鉴权中间件 | B-2 车位批量创建 | F-6 布局组件 |

### Week 2（第 6-10 天）

| 天 | 后端 A | 后端 B | 前端 |
|----|--------|--------|------|
| D6 | A-7 权限中间件 | B-3 车辆入场 | F-3 停车场表单 |
| D7 | A-8 统计模块 | B-3 车牌识别 | F-4 车位列表 |
| D8 | A-8 统计模块 | B-4 车辆出场 | F-4 车位可视化 |
| D9 | 集成测试 | 集成测试 | F-5 统计卡片 |
| D10 | Bug 修复 | Bug 修复 | 联调测试 |

---

## 🗄️ Supabase 配置清单

### Secrets 配置（GitHub > Settings > Secrets）

```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=xxxxx
SUPABASE_SERVICE_ROLE_KEY=xxxxx
SUPABASE_JWT_SECRET=xxxxx
DATABASE_URL=postgresql://postgres:xxxxx@db.xxxxx.supabase.co:5432/postgres
GITHUB_TOKEN=xxx  (可选，用于 CI)
```

### Supabase Dashboard 配置

1. **创建新项目**
   - 区域：northeast-asia
   - 密码：设置强密码
   - 关联 GitHub 仓库

2. **Authentication 配置**
   - 启用 Email 登录
   - 禁用 Email 确认（开发阶段）
   - 配置 JWT Secret

3. **RLS 策略（临时）**
   - 开发阶段可禁用 RLS
   - 上线前再启用并配置策略

---

## ✅ Sprint 1 验收标准

### 功能完整性
- [ ] 用户可登录/登出
- [ ] 停车场的增删改查
- [ ] 车位的批量创建和状态管理
- [ ] 车辆入场记录（含车牌识别接口预留）
- [ ] 实时余位统计展示

### 质量基线
- [ ] 单元测试覆盖率 > 70%
- [ ] ESLint 无报错
- [ ] TypeScript 编译无错误
- [ ] 所有 PR 经过 Code Review

### 非功能要求
- [ ] API 响应时间 < 500ms
- [ ] 前端首屏加载时间 < 3s
- [ ] 支持 Chrome/Firefox/Safari
