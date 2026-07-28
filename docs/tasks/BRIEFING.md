# 前后端开发任务分配清单

> 本文件由架构师输出，供团队负责人转达给各开发人员。
> 所有路径相对于项目根目录 `/`。

---

## 📌 前置必读

所有开发人员必须先阅读以下文档：

| 文档 | 路径 | 说明 |
|------|------|------|
| 总体架构 | `docs/architecture/overview.md` | 了解分层架构、模块划分 |
| 代码规范 | `docs/design/code-standards.md` | 命名、目录、编码规范 |
| API 接口 | `docs/api/openapi.yaml` | 30+ 端点定义 |
| 数据库设计 | `docs/design/database.md` | 7 张核心表结构 |
| 架构评审 | `docs/architecture/review-process.md` | PR 流程、变更分级 |

---

## 🔧 后端开发任务

### 后端开发 A（负责：Shared + Auth + Stats 模块）

#### 任务清单

| 编号 | 任务 | 交货文件路径 | 预估 | 优先级 |
|------|------|-------------|------|--------|
| A-1 | Supabase 客户端封装完善 | `server/src/shared/database/supabase.ts` | 2h | P0 |
| A-2 | 统一配置管理完善 | `server/src/config/index.ts` | 2h | P0 |
| A-3 | 错误类型补充 | `server/src/shared/types/errors.ts` | 2h | P1 |
| A-4 | 日志工具完善 | `server/src/shared/utils/logger.ts` | 2h | P1 |
| A-5 | 认证模块 Service+Controller | `server/src/modules/auth/auth.service.ts` | 8h | P0 |
| A-6 | 鉴权中间件完善 | `server/src/middleware/authenticate.ts` | 4h | P0 |
| A-7 | 权限中间件 RBAC | `server/src/middleware/authorize.ts` | 4h | P1 |
| A-8 | 统计模块实现 | `server/src/modules/stats/` | 8h | P1 |

**任务详细说明：**

**A-5 认证模块（8h）**
- 新建 `server/src/modules/auth/auth.service.ts`
- 新建 `server/src/modules/auth/auth.controller.ts`  
- 实现登录/登出/刷新Token/获取当前用户
- 使用 Supabase Auth Admin API 验证
- 编写单元测试 `auth.test.ts`

```typescript
// auth.service.ts 核心接口示例
export class AuthService {
  async login(dto: LoginDTO): Promise<LoginResult> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: dto.username,
      password: dto.password,
    });
    if (error) throw new UnauthorizedError(error.message);
    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: { id: data.user.id, role: data.user.user_metadata?.role },
    };
  }
  
  async logout(token: string): Promise<void> {
    // token 加入黑名单或直接使用 Supabase signOut
  }
}
```

**A-6 鉴权中间件（4h）**
- 修改 `server/src/middleware/authenticate.ts`
- 使用 `supabase.auth.getUser(token)` 验证
- 解析失败抛出 `UnauthorizedError`
- 成功后将 user 注入 req.user

**A-7 权限中间件（4h）**
- 新建 `server/src/middleware/authorize.ts`
- 用法：`authorize('admin', 'operator')`
- 检查 `req.user.role` 是否在允许列表
- 不在列表返回 `ForbiddenError(403)`

**A-8 统计模块（8h）**
- 新建：
  - `server/src/modules/stats/stats.service.ts`
  - `server/src/modules/stats/stats.controller.ts`
  - `server/src/modules/stats/stats.repository.ts`
- 实现实时余位查询（查 `parking_availability` 视图）
- 实现日报/周报（查 `daily_stats` 物化视图）
- 路由已定义在 `stats.routes.ts`

---

### 后端开发 B（负责：Parking + Vehicle + Billing 模块）

#### 任务清单

| 编号 | 任务 | 交货文件路径 | 预估 | 优先级 |
|------|------|-------------|------|--------|
| B-1 | 停车场模块 Service | `server/src/modules/parking/parking.service.ts` | 10h | P0 |
| B-2 | 车位模块 Service | `server/src/modules/parking/space.service.ts` | 12h | P0 |
| B-3 | 车辆入场 Service | `server/src/modules/vehicle/vehicle.service.ts` | 10h | P0 |
| B-4 | 车辆出场 Service | `server/src/modules/vehicle/vehicle.service.ts` | 8h | P1 |

**任务详细说明：**

**B-1 停车场模块（10h）**
新建文件：
- `server/src/modules/parking/parking.service.ts`
- `server/src/modules/parking/parking.controller.ts`
- `server/src/modules/parking/parking.repository.ts`
- `server/src/modules/parking/parking.dto.ts`

实现功能：
```typescript
// parking.service.ts 核心方法
export class ParkingService {
  async list(query: ListParkingDTO): Promise<PaginatedResult<Parking>> {
    // 支持分页、按名称搜索、按状态筛选
  }
  
  async create(dto: CreateParkingDTO): Promise<Parking> {
    // 校验 code 唯一性
    // 插入后返回完整对象
  }
  
  async update(id: string, dto: UpdateParkingDTO): Promise<Parking> {
    // 部分更新
  }
  
  async delete(id: string): Promise<void> {
    // 软删除，更新 status = 'inactive'
  }
}
```

DTO 使用 Zod 校验：
```typescript
// parking.dto.ts
export const CreateParkingSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().regex(/^[A-Z0-9-]+$/).min(3).max(50),
  address: z.string().min(1),
  totalSpaces: z.number().int().positive(),
  contactPhone: z.string().optional(),
  config: z.record(z.any()).optional(),
});
```

**B-2 车位模块（12h）**
新建：
- `server/src/modules/parking/space.service.ts`
- `server/src/modules/parking/space.controller.ts`
- `server/src/modules/parking/space.repository.ts`

关键功能：
1. **批量创建车位**
   ```typescript
   async batchCreate(parkingId: string, dto: BatchCreateSpaceDTO): Promise<ParkingSpace[]> {
     // 使用 supabase.from('parking_spaces').insert(spaces)
     // 或 Prisma createMany
     // 生成如 A-01-001, A-01-002 ... 的编号
   }
   ```

2. **乐观锁状态更新**
   ```typescript
   async updateStatus(id: string, status: SpaceStatus, expectedVersion: number): Promise<ParkingSpace> {
     // UPDATE ... WHERE id = $1 AND version = $2
     // 如果返回行数为0，抛出 ConflictError
   }
   ```

3. **实时余位查询**
   ```typescript
   async getAvailability(parkingId: string): Promise<AvailabilityDTO> {
     // SELECT * FROM parking_availability WHERE id = $1
   }
   ```

**B-3/B-4 进出记录（18h）**
新建：
- `server/src/modules/vehicle/vehicle.service.ts`
- `server/src/modules/vehicle/vehicle.controller.ts`
- `server/src/modules/vehicle/vehicle.repository.ts`
- `server/src/modules/vehicle/lpr.service.ts`
- `server/src/modules/vehicle/vehicle.dto.ts`

车辆入场核心流程：
```typescript
async recordEntry(dto: VehicleEntryDTO): Promise<VehicleEntryRecord> {
  // 1. 验证车牌格式或调用 LPR 识别
  // 2. 检查重复入场（同车牌 + parked 状态）
  // 3. 开启事务：
  //    a. 插入入场记录
  //    b. 触发器自动分配车位（已有）
  // 4. 返回记录
}
```

车辆出场核心流程：
```typescript
async recordExit(dto: VehicleExitDTO): Promise<{ record: VehicleEntryRecord; bill: Bill }> {
  // 1. 查找同车牌的 parked 记录
  // 2. 计算停车时长
  // 3. 计算费用（需对接计费服务）
  // 4. 创建账单
  // 5. 更新记录为 exited
  // 6. 释放车位
  // 7. 返回 { record, bill }
}
```

---

## 🎨 前端开发任务

### 前端开发（负责：全部管理后台页面）

#### 任务清单

| 编号 | 任务 | 交货文件路径 | 预估 | 优先级 |
|------|------|-------------|------|--------|
| F-1 | API 客户端 + 路由配置 | `client/src/api/client.ts` | 4h | P0 |
| F-2 | 登录页面 | `client/src/pages/Login/` | 6h | P0 |
| F-3 | 停车场列表页 | `client/src/pages/parking/ParkingList.tsx` | 8h | P0 |
| F-4 | 车位管理页面 | `client/src/pages/parking/SpaceList.tsx` | 10h | P0 |
| F-5 | 余位统计卡片 | `client/src/components/stats/AvailabilityCard.tsx` | 4h | P1 |
| F-6 | 布局组件和导航 | `client/src/components/layout/` | 6h | P0 |

**任务详细说明：**

**F-1 API 客户端 + 路由（4h）**
新建：
- `client/src/api/client.ts`

```typescript
// client/src/api/client.ts
import axios from 'axios';
import type { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse } from 'axios';

const apiClient: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// 请求拦截器
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('accessToken');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  error => Promise.reject(error)
);

// 响应拦截器
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem('accessToken');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default apiClient;
```

更新：
- `client/src/App.tsx` — 添加完整路由配置

**F-2 登录页面（6h）**
新建：
- `client/src/pages/Login/index.tsx`
- `client/src/api/auth.ts`

UI 要求：
- 居中卡片布局（Ant Design Card）
- Logo + 标题
- 用户名/密码输入框（Ant Design Form）
- 登录按钮带 loading 状态
- 错误信息 Alert 展示
- 登录成功跳转首页

**F-3 停车场列表页（8h）**
新建：
- `client/src/pages/parking/ParkingList.tsx`
- `client/src/pages/parking/ParkingForm.tsx`（弹窗）
- `client/src/api/parking.ts`

表格列：
| 名称 | 编码 | 地址 | 总车位 | 余位 | 占用率 | 状态 | 操作 |
使用 Ant Design Table + ProTable（可选）

**F-4 车位管理页面（10h）**
新建：
- `client/src/pages/parking/SpaceList.tsx`
- `client/src/components/parking/SpaceGrid.tsx`（可视化网格）

可视化网格要求：
```typescript
// SpaceGrid.tsx 颜色映射
const statusColors = {
  available: '#52c41a',   // 绿色
  occupied: '#ff4d4f',    // 红色
  reserved: '#faad14',    // 黄色
  disabled: '#d9d9d9',    // 灰色
};

// 点击车位弹出 Popover 显示详情
// Select 下拉修改状态
```

**F-5 统计卡片（4h）**
新建：
- `client/src/components/stats/AvailabilityCard.tsx`

使用 Ant Design Statistic + echarts 环形图：
- 总车位数
- 可用数
- 占用率环形图
- 各区域余位进度条

**F-6 布局组件（6h）**
新建：
- `client/src/components/layout/AppLayout.tsx`
- `client/src/components/layout/Sidebar.tsx`
- `client/src/components/layout/Header.tsx`
- `client/src/hooks/useAuth.ts`

菜单结构：
```typescript
const menuItems = [
  { key: '/', label: '首页', icon: <DashboardOutlined /> },
  {
    key: 'parking',
    label: '停车场管理',
    icon: <CarOutlined />,
    children: [
      { key: '/parkings', label: '停车场列表' },
      { key: '/parking-spaces', label: '车位管理' },
    ],
  },
  {
    key: 'vehicle',
    label: '进出管理',
    icon: <LoginOutlined />,
    children: [
      { key: '/vehicle-records', label: '进出记录' },
    ],
  },
  {
    key: 'billing',
    label: '计费管理',
    icon: <MoneyCollectOutlined />,
    children: [
      { key: '/billing-rules', label: '计费规则' },
      { key: '/bills', label: '账单列表' },
    ],
  },
  {
    key: 'stats',
    label: '统计报表',
    icon: <BarChartOutlined />,
    children: [
      { key: '/stats/realtime', label: '实时统计' },
      { key: '/stats/reports', label: '报表导出' },
    ],
  },
];
```

---

## 📋 需要新建的完整文件清单（汇总）

### 后端（20 个新文件）

```
server/src/
├── modules/auth/
│   ├── auth.service.ts              # 业务逻辑
│   ├── auth.controller.ts           # 控制器
│   └── auth.test.ts                 # 单元测试
├── modules/parking/
│   ├── parking.service.ts           # 停车场业务
│   ├── parking.controller.ts        # 控制器
│   ├── parking.repository.ts        # 数据访问
│   ├── parking.dto.ts               # Zod 校验
│   ├── space.service.ts             # 车位业务
│   ├── space.controller.ts          # 控制器
│   ├── space.repository.ts          # 数据访问
│   └── parking.test.ts              # 单元测试
├── modules/vehicle/
│   ├── vehicle.service.ts           # 进出记录业务
│   ├── vehicle.controller.ts        # 控制器
│   ├── vehicle.repository.ts        # 数据访问
│   ├── vehicle.dto.ts               # Zod 校验
│   ├── lpr.service.ts               # 车牌识别
│   └── vehicle.test.ts              # 单元测试
├── modules/stats/
│   ├── stats.service.ts             # 统计业务
│   ├── stats.controller.ts          # 控制器
│   ├── stats.repository.ts          # 数据访问
│   └── stats.test.ts                # 单元测试
└── middleware/
    └── authorize.ts                 # RBAC 权限中间件
```

### 前端（15 个新文件）

```
client/src/
├── api/
│   ├── client.ts                    # Axios 封装
│   ├── auth.ts                      # 认证 API
│   ├── parking.ts                   # 停车场 API
│   └── space.ts                     # 车位 API
├── components/
│   ├── layout/
│   │   ├── AppLayout.tsx            # 整体布局
│   │   ├── Sidebar.tsx              # 侧边导航
│   │   └── Header.tsx               # 顶部栏
│   ├── parking/
│   │   └── SpaceGrid.tsx            # 车位可视化
│   └── stats/
│       └── AvailabilityCard.tsx     # 余位统计卡片
├── pages/
│   ├── Login/index.tsx              # 登录页
│   ├── Dashboard/index.tsx          # 首页
│   ├── parking/
│   │   ├── ParkingList.tsx          # 停车场列表
│   │   └── ParkingForm.tsx          # 编辑弹窗
│   └── parking/
│       └── SpaceList.tsx            # 车位列表
├── hooks/
│   └── useAuth.ts                   # 认证 Hook
└── store/
    └── authStore.ts                 # 认证状态
```

---

## ✅ 验收标准清单

每个任务完成后，开发者需自行检查：

- [ ] 文件路径正确
- [ ] 代码通过 ESLint（`npm run lint`）
- [ ] TypeScript 编译无错误（`npm run typecheck`）
- [ ] 有单元测试且通过（`npm run test`）
- [ ] 函数/组件有 JSDoc 注释
- [ ] 关键逻辑有中文注释
- [ ] 提交信息符合 Conventional Commits 规范

---

## 🔗 重要链接

| 资源 | 链接 |
|------|------|
| GitHub 仓库 | https://github.com/znuaibot/smart-parking |
| API 文档 (本地) | http://localhost:3000/api-docs |
| Supabase 控制台 | https://supabase.com/dashboard |
| 在线 API 规范 | https://petstore.swagger.io/?url=https://raw.githubusercontent.com/znuaibot/smart-parking/main/docs/api/openapi.yaml |
