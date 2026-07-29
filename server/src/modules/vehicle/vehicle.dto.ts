// 车辆进出模块 - 请求参数校验 DTO
import { z } from 'zod';

/**
 * 中国车牌正则表达式
 * 支持：普通蓝牌、黄牌、新能源绿牌、临时车牌、使馆车牌等
 */
const PLATE_REGEX = /^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼使领][A-Z][A-Z0-9]{4,5}[A-Z0-9挂学警港澳]$/;

/**
 * 车辆入场请求体
 */
export const VehicleEntrySchema = z.object({
  parkingId: z.string().uuid('无效的停车场 ID'),
  plateNumber: z
    .string()
    .regex(PLATE_REGEX, '车牌格式不正确')
    .optional()
    .describe('车牌号码（可选，不提供时需配合 imageUrl 进行 LPR 识别）'),
  vehicleType: z.enum(['small', 'large', 'new_energy', 'unknown']).default('unknown'),
  entryGateId: z.string().max(50).optional(),
  entryImageUrl: z.string().url().optional().describe('入场图片 URL（用于 LPR 识别）'),
  operatorId: z.string().uuid().optional(),
  remark: z.string().max(500).optional(),
});

/**
 * 车辆出场请求体
 */
export const VehicleExitSchema = z.object({
  plateNumber: z.string().regex(PLATE_REGEX, '车牌格式不正确'),
  parkingId: z.string().uuid('无效的停车场 ID'),
  exitGateId: z.string().max(50).optional(),
  exitImageUrl: z.string().url().optional(),
  operatorId: z.string().uuid().optional(),
  remark: z.string().max(500).optional(),
});

/**
 * 进出记录查询参数
 */
export const ListVehicleRecordsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  parkingId: z.string().uuid().optional(),
  plateNumber: z.string().optional(),
  status: z.enum(['parked', 'exited', 'overstay', 'exception']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

/**
 * 在场车辆查询参数
 */
export const VehicleOngoingQuerySchema = z.object({
  parkingId: z.string().uuid().optional(),
  plateNumber: z.string().optional(),
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
});

// 类型导出
export type VehicleEntryDTO = z.infer<typeof VehicleEntrySchema>;
export type VehicleExitDTO = z.infer<typeof VehicleExitSchema>;
export type ListVehicleRecordsQuery = z.infer<typeof ListVehicleRecordsQuerySchema>;
export type VehicleOngoingQuery = z.infer<typeof VehicleOngoingQuerySchema>;
