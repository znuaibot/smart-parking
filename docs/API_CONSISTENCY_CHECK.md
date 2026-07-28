# 前后端 API 一致性检查报告

## 概述
本报告对比前端（smart-parking-frontend）和后端（smart-parking-backend-b）的 API 接口定义，确保前后端对接无误。

---

## ✅ API 路径对照表

### 1. 认证模块 (Auth)

| 操作 | 前端 API | 后端路由 | 状态 | 备注 |
|------|---------|---------|------|------|
| 登录 | `POST /auth/login` | `POST /auth/login` | ✅ 一致 | 返回 `{code, message, data: {accessToken, refreshToken, user}}` |
| 登出 | `POST /auth/logout` | `POST /auth/logout` | ✅ 一致 | 需 Token |
| 刷新 Token | `POST /auth/refresh` | `POST /auth/refresh` | ✅ 一致 | Body: `{refreshToken}` |
| 当前用户 | `GET /auth/me` | `GET /auth/me` | ✅ 一致 | 返回用户信息 |
| 修改密码 | `PUT /auth/password` | ⚠️ 后端未实现 | 🟡 需补充 | Body: `{oldPassword, newPassword}` |

### 2. 停车场模块 (Parking)

| 操作 | 前端 API | 后端路由 | 状态 | 备注 |
|------|---------|---------|------|------|
| 列表 | `GET /parkings?page=&pageSize=&keyword=&status=` | `GET /parkings` | ✅ 一致 | 返回分页数据 |
| 详情 | `GET /parkings/:id` | `GET /parkings/:id` | ✅ 一致 | - |
| 创建 | `POST /parkings` | `POST /parkings` | ✅ 一致 | admin+ 权限 |
| 更新 | `PUT /parkings/:id` | `PUT /parkings/:id` | ✅ 一致 | admin+ 权限 |
| 删除 | `DELETE /parkings/:id` | `DELETE /parkings/:id` | ✅ 一致 | superadmin 权限 |

### 3. 车位模块 (Parking Spaces)

| 操作 | 前端 API | 后端路由 | 状态 | 备注 |
|------|---------|---------|------|------|
| 列表 | `GET /parkings/:id/spaces?zone=&status=&floor=` | ⚠️ 路径不同 | 🔴 需确认 | 前端用 `/parkings/:id/spaces`，后端用 `/parking-spaces?parkingId=` |
| 批量创建 | `POST /parkings/:id/spaces/batch` | `POST /parkings/:id/spaces/batch` | ✅ 一致 | admin+ 权限 |
| 车位详情 | `GET /parking-spaces/:id` | `GET /parking-spaces/:id` | ✅ 一致 | - |
| 更新状态 | `PUT /parking-spaces/:id/status` | `PUT /parking-spaces/:id/status` | ✅ 一致 | 乐观锁 |
| 实时余位 | `GET /parking-spaces/:parkingId/availability` | `GET /parking-spaces/:parkingId/availability` | ✅ 一致 | - |

### 4. 车辆进出模块 (Vehicle)

| 操作 | 前端 API | 后端路由 | 状态 | 备注 |
|------|---------|---------|------|------|
| 入场 | `POST /vehicle-entry` | `POST /vehicle-entry/entry` | 🔴 需确认 | 前端未调用（预留），后端路径为 `/entry` |
| 出场 | `POST /vehicle-exit` | `POST /vehicle-exit/exit` | 🔴 需确认 | 同上 |
| 记录列表 | `GET /vehicle-records` | `GET /vehicle-records/records` | 🔴 需确认 | 同上 |
| 在场车辆 | `GET /vehicles/:plate/ongoing` | `GET /vehicles/:plate/ongoing` | ✅ 一致 | - |

### 5. 计费模块 (Billing)

| 操作 | 前端 API | 后端路由 | 状态 | 备注 |
|------|---------|---------|------|------|
| 计费规则列表 | `GET /billing-rules` | `GET /billing-rules` | ✅ 一致 | - |
| 创建规则 | `POST /billing-rules` | `POST /billing-rules` | ✅ 一致 | admin+ 权限 |
| 账单列表 | `GET /bills` | `GET /bills` | ✅ 一致 | cashier+ 权限 |

### 6. 统计模块 (Stats)

| 操作 | 前端 API | 后端路由 | 状态 | 备注 |
|------|---------|---------|------|------|
| 实时余位 | `GET /stats/realtime?parkingId=` | `GET /stats/realtime` | ✅ 一致 | - |
| 日报 | `GET /stats/daily?parkingId=&startDate=&endDate=` | `GET /stats/daily` | ✅ 一致 | - |

---

## ⚠️ 需要确认的问题

### 问题 1：车辆进出路由路径不一致

**前端调用**（当前未调用，预留）：
```
POST /vehicle-entry
POST /vehicle-exit
GET /vehicle-records
```

**后端路由**（index.ts）：
```
/app.use('/api/v1/vehicle-entry', authenticate, vehicleRouter);
```
其中 vehicleRouter 内部路径：
```
POST /entry
POST /exit
GET /records
```

**实际组合路径**：
```
POST /api/v1/vehicle-entry/entry
POST /api/v1/vehicle-exit/exit
GET /api/v1/vehicle-records/records
```

**建议**：前端需要更新 API 调用路径以匹配后端：
```typescript
// 前端 API 定义应改为
vehicleApi.entry: (data) => apiClient.post('/vehicle-entry/entry', data),
vehicleApi.exit: (data) => apiClient.post('/vehicle-exit/exit', data),
vehicleApi.getRecords: (params) => apiClient.get('/vehicle-records/records', { params }),
```

或者修改后端路由配置，去掉前缀重复：
```typescript
// index.js 改为
app.use('/api/v1', vehicleRouter);  // 让 vehicleRouter 包含完整路径
```

### 问题 2：车位列表路径差异

**前端**：`GET /parkings/:id/spaces`
**后端**：`GET /parking-spaces?parkingId=:id`

这是两种不同的设计。前端偏爱 RESTful 嵌套资源，后端偏爱查询参数。

**建议**：后端增加兼容路由：
```typescript
parkingRouter.get('/:id/spaces', (req, res, next) => spaceController.list(req, res, next));
```

### 问题 3：修改密码接口未实现

前端定义了 `changePassword(oldPassword, newPassword)`，但后端需要确认是否已实现该路由（PR #1 中可能已在 auth.routes.ts 中实现，需检查）。

---

## ✅ 请求/响应格式兼容性

### 响应格式

**后端返回格式**（统一格式）：
```json
{
  "code": "SUCCESS",
  "message": "操作成功",
  "data": { ... },
  "requestId": "...",
  "timestamp": "..."
}
```

**前端期望格式**：
```typescript
interface ApiResponse<T> {
  code: number | string;
  message: string;
  data: T;
}
```

✅ 兼容（前端做了 `res.data` 解包）

### 分页响应

**后端**：
```json
{
  "list": [...],
  "total": 100,
  "page": 1,
  "pageSize": 20
}
```

**前端期望**：
```typescript
interface PaginatedResponse<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}
```

✅ 完全兼容

### 错误响应

**后端错误格式**：
```json
{
  "code": "NOT_FOUND",
  "title": "Not Found",
  "message": "停车场 not found: xxx",
  "requestId": "...",
  "timestamp": "..."
}
```

**前端错误处理**：使用 `error.response.data?.message` 获取错误信息
✅ 兼容

---

## 🔧 建议修复方案

### 优先级 1：修复车辆进出路径（必须）

**方案 A**：修改前端 API 调用（推荐，改动小）
```typescript
// client/src/api/vehicle.ts
export const vehicleApi = {
  entry: (data: VehicleEntryInput) =>
    apiClient.post('/vehicle-entry/entry', data).then(res => res.data),
  exit: (data: VehicleExitInput) =>
    apiClient.post('/vehicle-exit/exit', data).then(res => res.data),
  getRecords: (params?: RecordListParams) =>
    apiClient.get('/vehicle-records/records', { params }).then(res => res.data),
};
```

**方案 B**：修改后端路由（路径更简洁）
```typescript
// 在 index.ts 中改为
app.use('/api/v1/vehicle', vehicleRouter);  // vehicleRouter 中包含 /entry, /exit, /records

// vehicle.routes.ts 改为
vehicleRouter.post('/entry', ...);
vehicleRouter.post('/exit', ...);
vehicleRouter.get('/records', ...);
```

### 优先级 2：车位列表兼容路由（建议）

后端 `parking.routes.ts` 增加兼容路由：
```typescript
parkingRouter.get('/:id/spaces', (req, res, next) => {
  req.query.parkingId = req.params.id;
  return spaceController.list(req, res, next);
});
```

### 优先级 3：确认密码修改接口

检查后端 auth.routes.ts 是否已实现 `PUT /auth/password`，如未实现需补充。

---

## 📋 总结

| 分类 | 数量 |
|------|------|
| ✅ 完全一致 | 15 |
| 🔴 需要修复 | 3（车辆进出路由） |
| 🟡 建议优化 | 2（车位列表、密码修改） |

**下一步行动**：
1. 决定车辆进出路由修复方案（推荐方案 A，前端适配）
2. 后端增加车位列表兼容路由
3. 确认密码修改接口状态
