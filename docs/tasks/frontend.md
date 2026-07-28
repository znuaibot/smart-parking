# 前端开发 - 任务分配

> 负责模块：全部管理后台页面（React + Ant Design）
> 预估工时：~38h | 优先级：P0

---

## 必读文档

请先阅读以下文档再开始编码：
1. [代码规范](../../design/code-standards.md) — 组件、Hook、样式规范
2. [API 接口规范](../../api/openapi.yaml) — 所有端点定义（与后端对齐）
3. [架构总览](../../architecture/overview.md) — 前端分层结构

---

## 任务清单

### 任务 F-1: API 客户端封装（4h）

**新建文件：** `client/src/api/client.ts`

```typescript
import axios from 'axios';
import type { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse } from 'axios';

const apiClient: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// 请求拦截器 - 添加 Token
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

// 响应拦截器 - 401 跳转登录
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

**新建文件：** `client/src/api/auth.ts`、`client/src/api/parking.ts`、`client/src/api/space.ts`

### 任务 F-2: 布局组件和导航（6h）⭐ 优先完成

**新建文件：**
- `client/src/components/layout/AppLayout.tsx`
- `client/src/components/layout/Sidebar.tsx`
- `client/src/components/layout/Header.tsx`
- `client/src/hooks/useAuth.ts`

**菜单结构：**
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
    ],
  },
];
```

**UI 布局：**
```
┌─────────────────────────────────────────────────────────┐
│ Header: 面包屑 + 用户信息 + 退出                        │
├──────────┬──────────────────────────────────────────────┤
│          │                                              │
│ Sidebar  │           Content Area                        │
│ (200px) │           (动态路由)                         │
│          │                                              │
│ - 首页   │                                              │
│ - 停车   │                                              │
│ - 进出   │                                              │
│ - 计费   │                                              │
│ - 统计   │                                              │
└──────────┴──────────────────────────────────────────────┘
```

### 任务 F-3: 登录页面（6h）⭐ 核心页面

**新建文件：**
- `client/src/pages/Login/index.tsx`

**UI 要求：**
- 居中卡片布局（Ant Design Card + Form）
- Logo + "车位管家" 标题
- 用户名/密码输入框
- 登录按钮（带 loading 状态）
- 错误信息 Alert 展示
- 登录成功跳转首页

**接口调用：**
```typescript
const login = async (values: LoginFormValues) => {
  const { data } = await apiClient.post('/auth/login', values);
  localStorage.setItem('accessToken', data.accessToken);
  localStorage.setItem('refreshToken', data.refreshToken);
  localStorage.setItem('user', JSON.stringify(data.user));
  navigate('/');
};
```

### 任务 F-4: 停车场列表页（8h）⭐ 核心页面

**新建文件：**
- `client/src/pages/parking/ParkingList.tsx`
- `client/src/pages/parking/ParkingForm.tsx`

**表格列定义：**

| 列名 | 字段 | 说明 |
|------|------|------|
| 名称 | name | 可点击查看详情 |
| 编码 | code | 唯一标识 |
| 地址 | address | 完整地址 |
| 总车位 | totalSpaces | 数字 |
| 余位 | availableSpaces | 数字 |
| 占用率 | occupancyRate | 进度条 |
| 状态 | status | Tag (active/inactive) |
| 操作 | - | 编辑 / 删除 / 查看车位 |

**功能：**
- 搜索栏（按名称、编码模糊搜索）
- 分页（默认 20 条/页）
- 创建/编辑弹窗（Modal + Form）
- 删除确认（Popconfirm）

### 任务 F-5: 车位管理页面（10h）⭐ 最复杂页面

**新建文件：**
- `client/src/pages/parking/SpaceList.tsx`
- `client/src/components/parking/SpaceGrid.tsx`

**两种视图模式：**

1. **列表视图** — Ant Design Table
   - 筛选：区域、楼层、状态
   - 列：编号、区域、楼层、类型、状态、当前车牌
   - 批量操作：批量创建、批量修改状态

2. **网格视图** — 车位可视化（重点）
   ```typescript
   // SpaceGrid.tsx 颜色映射
   const statusColors = {
     available: '#52c41a',   // 绿色 - 可用
     occupied: '#ff4d4f',    // 红色 - 占用
     reserved: '#faad14',    // 黄色 - 预约
     disabled: '#d9d9d9',    // 灰色 - 禁用
   };
   
   // 点击车位 → Popover 显示详情
   // 包含：车位号、类型、状态、当前车牌、入场时间
   // 操作：修改状态（Select 下拉）
   ```

**颜色图例显示：**
```
🟢 可用  🔴 占用  🟡 预约  ⚪ 禁用  🟣 VIP  🔵 充电桩
```

### 任务 F-6: 统计卡片和首页（4h）

**新建文件：**
- `client/src/components/stats/AvailabilityCard.tsx`
- `client/src/pages/Dashboard/index.tsx`

**统计卡片：**
- 总车位数、可用数、占用数
- 占用率环形图（echarts-for-react）
- 各区域余位分布（Progress 进度条）
- 每 30 秒自动刷新

---

## 技术规范

### 路由配置（App.tsx）
```typescript
<Routes>
  <Route path="/login" element={<Login />} />
  <Route element={<AppLayout />}>
    <Route path="/" element={<Dashboard />} />
    <Route path="/parkings" element={<ParkingList />} />
    <Route path="/parking-spaces" element={<SpaceList />} />
    <Route path="/vehicle-records" element={<VehicleRecordList />} />
    <Route path="/billing-rules" element={<BillingRuleList />} />
    <Route path="/bills" element={<BillList />} />
    <Route path="/stats/realtime" element={<RealtimeStats />} />
  </Route>
</Routes>
```

### 状态管理
- 使用 **Zustand**（轻量 Redux 替代品）
- 全局状态：用户信息、Token、当前停车场

### 请求封装
- 所有 API 调用使用 `apiClient`（统一拦截器）
- 业务 API 按模块拆分：`api/parking.ts`、`api/auth.ts` 等

### 组件规范
- 函数组件 + Hooks
- 组件文件使用 PascalCase：`ParkingList.tsx`
- 样式使用 CSS Modules 或 antd 内置样式

---

## 验收标准

- [ ] 登录页完整可用，401 自动跳转
- [ ] 布局 + 导航菜单正确渲染
- [ ] 停车场列表支持 CRUD
- [ ] 车位网格可视化正确，颜色区分清晰
- [ ] 统计数据实时更新（30s 刷新）
- [ ] 单元测试覆盖核心组件

## 提交规范

```bash
git commit -m "feat: 布局组件和导航菜单"
git commit -m "feat: 登录页面"
git commit -m "feat: 停车场 CRUD"
git commit -m "feat: 车位管理可视化"
git commit -m "feat: 统计卡片"
```
