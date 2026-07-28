# PR 审查报告：feat/parking-vehicle

> 审查时间: 2026-07-28
> 远程最新 commit: 5c76164（merge: 合并远程分支，保留 P0 安全修复）
> 审查人: 代码审查专家

---

## 审查历史

### 第一次审查（ff53f94 原始 PR）：发现 6 个 P0 → 拒绝合并

开发者修复提交 b62e767，确认 6 个 P0 均已修复。

### 第二次审查（b62e767 P0 修复后）：发现 6 个新问题

| 级别 | 问题 |
|------|------|
| P0 | check_space_code_conflicts 返回字段名 conflict_code vs 不匹配 |
| P0 | isCodeExists 调用未传 excludeId |
| P1 | 所有路由缺 requireParkingAccess 中间件 |
| P1 | getOngoing plate 参数未校验 |
| P1 | 计费逻辑硬编码，未读 billing_rules |
| P1 | Profile 缺失默认赋予 viewer 角色（过宽） |

### 第三次审查（开发者自主修复后 5c76164）：当前结论

开发者在远程重写了大量代码，自主修复了前述 P0 与大部分 P1。但引入若干新问题。

---

## 🔴 P0 — 阻塞，导致编译失败 / 运行崩溃

### P0-1: batchCreate 签名严重不匹配

**影响**: TypeScript 编译报错 + 运行时 RPC UUID 解析失败

- `space.service.ts:109` 调用 `spaceRepository.batchCreate(spaces)` — 只传 1 个参数
- `space.repository.ts:125` 期望 `(parking_id: string, spaces: Array<...>)` — 需要 2 个参数
- 返回类型也不匹配：Service 期望 `ParkingSpace[]`，Repository 返回 `{ created: number; results: ParkingSpace[] }`

### P0-2: checkCodeConflicts 方法不存在

**影响**: TypeScript 编译报错

- `space.service.ts:101` 调用 `spaceRepository.checkCodeConflicts(parkingId, codes)`
- `space.repository.ts` 中**没有这个方法** — 开发者把冲突校验移入了 RPC，但未删除 Service 层调用

---

## 🟠 P1 — 高度（安全/逻辑缺陷）

### P1-3: 路由缺少跨租户权限校验

`index.ts` 所有业务路由只挂 `authenticate`，缺 `requireParkingAccess`。任何 operator 可用合法 token 操作任意停车场数据。

### P1-4: getOngoing plate 参数未校验

`vehicle.controller.ts:97` 中 `plate` 路径参数完全未校验，可传入任意字符串触发全表扫描。

### P1-5: 重复出场 TOCTOU 竞态

`vehicle.service.ts:81-93` 先 `findOngoingByPlate` 再 `processExitAtomic`，两者之间无原子保护。并发请求可能让同一记录出场两次后报错不明确。

### P1-6: UpdateParkingDTO 缺 code 字段

停车场编码一旦创建无法修改。设计意图可接受，但需明确记录，避免后续需求无法实现。

### P1-7: user_metadata role fallback 不可信

`authenticate.ts:74` profiles 表查询失败时回退到 `user_metadata?.role`，但 `user_metadata` 可能被用户自行修改。应拒绝访问。

---

## 🟡 P2 — 中度

- P2-8: `process_vehicle_exit` RPC 计费硬编码（15分钟免费 + 5元/小时），未读 billing_rules 表，车型不区分
- P2-9: `exec_raw_sql` 安全校验存在绕过可能（$$ 字符串、注释）
- P2-10: RPC 参数命名不统一（p_ 前缀 vs 无前缀）
- P2-11: 出场时数据库触发器 `release_space_on_exit` 与 RPC 内手动释放可能双重操作
- P2-12: 日志中 `params` 可能包含完整 DTO，建议只输出白名单字段

---

## ✅ 开发者已正确修复（无需再改）

- JWT 鉴权（admin.getUser + profiles 表查角色）
- SQL 注入防护（sanitizeSearchKeyword）
- exec_raw_sql RPC 安全实现
- 出场原子性（process_vehicle_exit 事务）
- 批量创建（batch_create_spaces 含预校验）

---

## 结论

**当前 PR 不可合并。** P0 两项（batchCreate 签名 + checkCodeConflicts 方法缺失）会导致 TypeScript 编译失败。修复这两项后需重新审查确认。

P1 建议在同批次修复。P2 可后续迭代。
