// 停车场模块 - 请求参数校验 DTO
import { z } from 'zod';

/**
 * 创建停车场请求体
 */
export const CreateParkingSchema = z.object({
  name: z.string().min(1, '停车场名称不能为空').max(100, '停车场名称最多100个字符'),
  code: z
    .string()
    .regex(/^[A-Z0-9-]+$/, '停车场编码只能包含大写字母、数字和连字符')
    .min(3, '停车场编码至少3个字符')
    .max(50, '停车场编码最多50个字符'),
  address: z.string().min(1, '地址不能为空'),
  totalSpaces: z.number().int('总车位数必须为正整数').positive('总车位数必须大于0'),
  contactPhone: z.string().optional(),
  config: z.record(z.any()).optional(),
});

/**
 * 更新停车场请求体（部分更新）
 */
export const UpdateParkingSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  address: z.string().min(1).optional(),
  contactPhone: z.string().optional(),
  totalSpaces: z.number().int().positive().optional(),
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
  config: z.record(z.any()).optional(),
});

/**
 * 停车场列表查询参数
 */
export const ListParkingQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  keyword: z.string().optional(),
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
  parkingId: z.string().uuid().optional(),
});

// 类型导出
export type CreateParkingDTO = z.infer<typeof CreateParkingSchema>;
export type UpdateParkingDTO = z.infer<typeof UpdateParkingSchema>;
export type ListParkingQuery = z.infer<typeof ListParkingQuerySchema>;
