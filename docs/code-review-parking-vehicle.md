# PR 代码审查报告：`feat/parking-vehicle`

> **审查时间**: 2026-07-28
> **分支**: `feat/parking-vehicle` → `main`
> **审查人**: 代码审查专家
> **变更范围**: 18 文件，+2184 / -61 行
> **覆盖模块**: 停车场 CRUD、车位管理、车辆进出（含 LPR 识别、计费、出场）

---

## 🔴 P0 — 严重（必须修复，影响生产安全/数据正确性）

### 1. Supabase 客户端使用 Service Role Key 绕过所有 RLS 策略

**文件**: `server/src/shared/database/supabase.ts:19`

服务端始终用 `SERVICE_ROLE_KEY` 连接，完全绕过 RLS。数据库已启用行级安全并配置了策略（迁移脚本 L322-333），但形同虚设。同时仓库层**没有任何业务级权限校验**，任何通过鉴权的用户都能操作任意停车场的数据。

**建议**:
- 短期：在 Service 层补上 `parkingId` 所属权限校验（确认当前用户的 `profiles.parking_id` 与请求的 `parkingId` 匹配）
- 长期：区分 admin 操作（service role）和用户操作（使用 JWT 对应的 anon key + RLS）

### 2. JWT 鉴权中间件完全无效

**文件**: `server/src/middleware/authenticate.ts:17-27`

传入任意 10 字符以上的字符串即可通过鉴权，且所有用户获得 `role: 'admin'`。配合 Service Role Key 的使用，整个系统等同于完全开放。

```ts
// 当前实现
req.user = { id: 'temp-user-id', role: 'admin' };
```

**建议**: 使用 `supabase.auth.getUser(token)` 替换占位逻辑，并从 `profiles` 表查询真实角色。

### 3. SQL 注入风险 + `exec_raw_sql` RPC 不存在

**文件**: `server/src/modules/parking/space.repository.ts:206`

数据库迁移脚本中**没有创建** `exec_raw_sql` 函数，部署后 `updateStatusAtomic` 调用必报错。

更严重的是搜索接口直接拼接用户输入（`parking.repository.ts:55`）：

```ts
query = query.or(`name.ilike.%${keyword}%,code.ilike.%${keyword}%`);
```

`keyword` 字段完全没有校验（`ListParkingQuerySchema` 中为 `z.string().optional()`），攻击者可构造含 `)` 或 `;` 的关键字触发 PostgREST 报错甚至注入。

**建议**:
- 删除 `exec_raw_sql` 方案，改用 Supabase 原生 `.eq('status', expectedStatus)` 做乐观锁
- `keyword` 搜索需做输入清洗（去除 `%`, `_`, `,`, `;`, `"` 等通配符/分隔符）

### 4. 乐观锁实现方法混乱，存在两条路径

**文件**: `server/src/modules/parking/space.repository.ts:139-218`

同一个 repository 类中存在两个乐观锁更新方法：
- `updateStatusWithOptimisticLock` — 接受 `expectedVersion: number`，但实际用 `expectedVersion === 0 ? 'available' : undefined` 做 WHERE 条件，语义完全错误
- `updateStatusAtomic` — 使用原生 SQL + RPC

Service 层只调用了 `updateStatusAtomic`，但 `updateStatusWithOptimisticLock` 作为公开方法仍然暴露，后续维护者可能误用。

**建议**: 删除 `updateStatusWithOptimisticLock`，只保留一种实现。

### 5. 出场流程非原子 — 可能导致重复出场/重复计费

**文件**: `server/src/modules/vehicle/vehicle.service.ts:81-126`

出场逻辑依次执行：查记录 → 创建账单 → 更新记录为 exited → 释放车位。这些操作**不在数据库事务中**。如果第 4 步成功但第 5 步失败（或进程崩溃），会出现已生成账单但车辆仍显示 `parked` 的状态，用户再次请求出场将导致重复计费。

**建议**: 用 Supabase RPC 包装为一个 PL/pgSQL 事务函数。

### 6. 批量创建车位无事务包裹，预校验不足

**文件**: `server/src/modules/parking/space.repository.ts:121-133`

`batchCreate` 前只校验了停车场存在性，**没有校验待插入编码是否已存在**。当 `count=1000` 时，如果编码与已有车位冲突，会触发唯一约束异常。

---

## 🟠 P1 — 高度（影响功能正确性或存在安全隐患）

### 7. `isCodeExists` 未使用 `excludeId` 参数 — 更新时可能误判冲突

**文件**: `server/src/modules/parking/parking.repository.ts:213-228`

Service 层调用时没有传 `excludeId`：

```ts
const exists = await parkingRepository.isCodeExists(dto.code);  // ← 缺少 excludeId
```

如果未来拓展更新编码功能时忘记传参，会导致与自身记录冲突。

### 8. 计费逻辑与数据模型不匹配

**文件**: `server/src/modules/vehicle/vehicle.service.ts:171-183`

`calculateFee` 统一按小型车计费，但 `billing_rules` 表已设计不同车型不同费率。当前计费完全忽略了数据库中的计费规则配置。

### 9. `mockLPR` 可能在生产环境被调用

**文件**: `server/src/modules/vehicle/lpr.service.ts:37-39`

如果管理员忘记配置 `LPR_API_URL`（schema 中为 optional），生产环境会生成随机假车牌写入数据库。`logger.warn` 在繁忙的生产日志中极易被忽略。

**建议**: 非 development/test 环境下，mock 应直接抛 `ServiceUnavailableError` 而非静默降级。

### 10. `getOngoing` 路由参数未校验

**文件**: `server/src/modules/vehicle/vehicle.controller.ts:97-105`

`plate` 来自 URL path 参数，格式完全不受控，直接传入数据库查询。虽然 Supabase 参数化查询可防 SQL 注入，但缺少业务校验（如车牌正则），可能被滥用于模糊探测。

### 11. 限流中间件存在内存泄漏与多实例绕过

**文件**: `server/src/middleware/rateLimiter.ts:7`

过期条目永远不被清理，长时间运行会持续增长。多进程部署下每个进程有独立的计数器，实际防护值 = `100 × workers`。

---

## 🟡 P2 — 中度（影响代码质量和后续维护）

### 12. Controller 层 schema 校验风格不统一

- `parking.controller.ts` — 从独立 DTO 文件引入 schema ✅
- `space.controller.ts` — 在 controller 文件内联定义 schema ⚠️
- `vehicle.controller.ts` — DTO + controller 混合 ⚠️

建议统一为独立 `*.dto.ts` 文件管理。

### 13. 日志记录完整 DTO 可能泄漏敏感信息

**文件**: `server/src/modules/parking/parking.service.ts:66`

`logger.info('Updating parking', { id, updates: dto })` 直接序列化 DTO，如果 `config` 字段存入敏感信息会泄漏到日志。

### 14. `parking.test.ts` 存在空测试体

**文件**: `server/src/modules/parking/parking.test.ts:198-206`

空 `it()` 会错误地报告测试通过，给团队「覆盖率足够」的假象。要么补全，要么删除。

### 15. 限流 Map 内存泄漏

过期窗口的记录从未被清理，长时间运行会持续增长占用内存。

### 16. `vehicle.repository.ts` Decimal 类型处理

`Bill.amount` 在 Prisma 中定义为 `Decimal`，但接口定义为 `number`。Supabase-js 返回的 `decimal` 字段是字符串，直接 `as Bill` 不做转换会隐蔽地丢失精度。

---

## 🟢 P3 — 低度（代码美化/一致性）

### 17. 命名不一致

Repository 类既导出类又导出单例实例，`findByCode` 方法未被 Service 层调用可删除。

### 18. Prisma Schema 与实际 SQL 迁移不同步

`prisma/schema.prisma` 缺少部分 relation 字段，虽然注释说明"以 SQL 迁移为准"，但 Prisma Client 生成类型时会产生误导。

### 19. `space.routes` 中参数命名容易误解

`/:id`（车位ID）与 `/:parkingId/availability`（停车场ID）共用不同参数命名风格，容易让维护者混淆。

---

## ✅ 值得肯定的点

1. **分层架构清晰** — Controller → Service → Repository 三层分离，职责边界清楚
2. **Zod 校验覆盖大部分入口** — 大部分参数使用了 schema 校验
3. **错误类型体系完善** — `errors.ts` 的 AppError 继承体系设计合理
4. **数据库设计专业** — 分区表、RLS、触发器自动维护余位统计、账单状态枚举体现实战经验
5. **乐观锁思路正确** — 选用 `status` 字段做 CAS 比 version 字段更适合业务语义
6. **`isCodeExists` 预留了 `excludeId` 参数** — 接口设计考虑了更新场景

---

## 📊 总结

| 优先级 | 数量 | 核心风险 |
|--------|------|----------|
| P0 | 6 | 系统无鉴权、SQL 注入、RPC 不存在、出场非原子、批量车位无事务 |
| P1 | 5 | 编码更新自冲突、LPR mock 降级、路由参数污染、限流绕过 |
| P2 | 6 | 风格不统一、空测试、日志膨胀、死代码 |
| P3 | 3 | 类型精度、命名、Prisma 同步 |

**合并建议**: 当前 PR **不应合并**。P0 中的鉴权失效、keyword SQL 注入、出场非原子三个问题在真实业务场景下可直接导致数据泄漏或资金损失。建议先修复全部 P0 后再合并，P1 可在后续迭代中跟进。
