# 后端开发 B - 任务分配

> 工作空间：`/mnt/data/catpaw/home/workspace/code/smart-parking-backend-b/`
> 分支：`feat/parking-vehicle`
> 负责模块：Parking 停车场 + Vehicle 进出记录 + Billing 计费基础

---

## 必读文档

请先阅读以下文档再开始编码：
1. [代码规范](../../design/code-standards.md) — 命名、分层、事务规范
2. [数据库设计](../../design/database.md) — 7 张核心表结构、分区策略、触发器
3. [API 接口规范](../../api/openapi.yaml) — Vehicle/Billing 端点定义

---

## 任务清单

### 任务 B-1: 停车场模块实现⭐ 核心任务

**新建文件：**
- `server/src/modules/parking/parking.service.ts`
- `server/src/modules/parking/parking.controller.ts`
- `server/src/modules/parking/parking.repository.ts`
- `server/src/modules/parking/parking.dto.ts`
- `server/src/modules/parking/parking.test.ts`

**实现接口：**

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/parkings | 列表（分页、按名称搜索、按状态筛选） |
| POST | /api/v1/parkings | 创建（校验 code 唯一性） |
| GET | /api/v1/parkings/:id | 详情 |
| PUT | /api/v1/parkings/:id | 更新 |
| DELETE | /api/v1/parkings/:id | 软删除（status='inactive'） |

**DTO 定义：**
```typescript
export const CreateParkingSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().regex(/^[A-Z0-9-]+$/).min(3).max(50),
  address: z.string().min(1),
  totalSpaces: z.number().int().positive(),
  contactPhone: z.string().optional(),
  config: z.record(z.any()).optional(),
});
```

### 任务 B-2: 车位模块实现⭐ 核心任务

**新建文件：**
- `server/src/modules/parking/space.service.ts`
- `server/src/modules/parking/space.controller.ts`
- `server/src/modules/parking/space.repository.ts`

**实现接口：**

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/parking-spaces | 列表（按区域、楼层、状态筛选） |
| POST | /api/v1/parkings/:id/spaces/batch | **批量创建车位** |
| PUT | /api/v1/parking-spaces/:id/status | 更新状态（**乐观锁**） |
| GET | /api/v1/parking-spaces/:parkingId/availability | 实时余位 |

**批量创建逻辑：**
```typescript
// 生成如 A-01-001, A-01-002 ... 编号
// 使用 supabase.from('parking_spaces').insert(spaces) 或 Prisma createMany
async batchCreate(parkingId: string, dto: BatchCreateSpaceDTO): Promise<ParkingSpace[]>
```

**乐观锁实现：**
```sql
UPDATE parking_spaces 
SET status = $1, updated_at = NOW(), version = version + 1
WHERE id = $2 AND version = $3
RETURNING *;
-- 返回行数为0 → 抛出 ConflictError(409)
```

> 注：`version` 字段已包含在初始迁移中，默认值为 0。

### 任务 B-3: 车辆入场模块 ⭐ 核心任务

**新建文件：**
- `server/src/modules/vehicle/vehicle.service.ts`
- `server/src/modules/vehicle/vehicle.controller.ts`
- `server/src/modules/vehicle/vehicle.repository.ts`
- `server/src/modules/vehicle/vehicle.dto.ts`
- `server/src/modules/vehicle/lpr.service.ts`

**实现接口：**

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/v1/vehicle-entry | 车辆入场（支持手动/自动车牌识别） |
| GET | /api/v1/vehicles/:plate/ongoing | 查询在场车辆 |

**入场流程：**
```typescript
async recordEntry(dto: VehicleEntryDTO): Promise<VehicleEntryRecord> {
  // 1. 解析请求参数（plateNumber 可选，可手动录入）
  // 2. 如果无 plateNumber → 调用 LPR 服务识别
  // 3. 检查重复入场（同车牌 + status='parked'）
  // 4. 开启事务：
  //    a. 插入入场记录
  //    b. 触发器自动分配车位（数据库已配置）
  // 5. 返回记录
}
```

**DTO 校验（车牌正则）：**
```typescript
const plateRegex = /^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼使领][A-Z][A-Z0-9]{4,5}[A-Z0-9挂学警港澳]$/;
```

### 任务 B-4: 车辆出场模块

**扩展文件：** `server/src/modules/vehicle/vehicle.service.ts`

**实现接口：**

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/v1/vehicle-exit | 车辆出场 |
| GET | /api/v1/vehicle-records | 进出记录列表 |

**出场流程：**
```typescript
async recordExit(dto: VehicleExitDTO): Promise<{ record: VehicleEntryRecord; bill: Bill }> {
  // 1. 查找同车牌 + parked 记录
  // 2. 计算停车时长（exitTime - entryTime）
  // 3. 计算费用（暂返回0，计费规则由后续补充）
  // 4. 创建待支付账单
  // 5. 更新记录状态为 exited
  // 6. 触发器释放车位
  // 7. 返回 { record, bill }
}
```

**查询 SQL 示例：**
```sql
-- 在场车辆检查
SELECT * FROM vehicle_entry_records
WHERE plate_number = $1 AND parking_id = $2 AND status = 'parked';
```

---

## 数据库触发器（已配置）

以下触发器已在 `supabase/migrations/20240101000000_init.sql` 中创建：

1. **自动分配车位** — 插入入场记录时自动分配空闲车位
2. **自动更新余位** — 车位状态变更时更新停车场统计
3. **updated_at 自动更新** — 所有表自动维护更新时间

你不需要手动维护这些逻辑，只需正常 INSERT/UPDATE 即可。

---

## 验收标准

- [ ] 停车场 CRUD 可用，支持分页搜索
- [ ] 批量创建 100 个车位 < 1s
- [ ] 并发更新同一车位只有一个成功（乐观锁）
- [ ] 入场记录正确创建，重复入场返回 409
- [ ] 出场后车位自动释放
- [ ] 单元测试覆盖率 > 70%

## 提交规范

```bash
git commit -m "feat(parking): 实现停车场 CRUD 接口"
git commit -m "feat(space): 实现车位批量创建和乐观锁"
git commit -m "feat(vehicle): 实现车辆入场记录接口"
git commit -m "feat(vehicle): 实现车辆出场接口"
```
