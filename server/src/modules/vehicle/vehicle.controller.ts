// 车辆进出模块 - 控制器层
import { Request, Response, NextFunction } from 'express';
import { vehicleService } from './vehicle.service.js';
import {
  VehicleEntrySchema,
  VehicleExitSchema,
  ListVehicleRecordsQuerySchema,
} from './vehicle.dto.js';
import { z } from 'zod';

/**
 * 车辆进出控制器
 */
export class VehicleController {
  /**
   * POST /api/v1/vehicle-entry
   * 记录车辆入场
   */
  async recordEntry(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = VehicleEntrySchema.parse(req.body);
      const record = await vehicleService.recordEntry(dto);

      res.status(201).json({
        code: 'SUCCESS',
        message: '入场记录创建成功',
        data: record,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/vehicle-exit
   * 记录车辆出场
   */
  async recordExit(req: Request, res: Response, next: NextFunction) {
    try {
      const dto = VehicleExitSchema.parse(req.body);
      const result = await vehicleService.recordExit(dto);

      res.json({
        code: 'SUCCESS',
        message: '出场记录创建成功',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/vehicle-records
   * 进出记录列表
   * P0-B 修复：非管理员用户只能查看自己停车场的记录
   */
  async listRecords(req: Request, res: Response, next: NextFunction) {
    try {
      const query = ListVehicleRecordsQuerySchema.parse(req.query);
      
      // P0-B 修复：租户隔离 - 非管理员只能查看自己停车场的数据
      const userParkingId = req.user?.parkingId;
      const userRole = req.user?.role;
      
      // superadmin 和 admin 可以查看所有停车场
      if (userRole !== 'superadmin' && userRole !== 'admin') {
        // 强制过滤为用户所属停车场
        query.parkingId = userParkingId;
      }
      
      const result = await vehicleService.listRecords(query);

      res.json({
        code: 'SUCCESS',
        message: '查询成功',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/vehicle-records/:id
   * 进出记录详情
   * P0-B 修复：校验记录所属停车场
   */
  async getRecordById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      
      // P0-B 修复：先查询记录，校验所属停车场
      const record = await vehicleService.getRecordById(id);
      
      const userParkingId = req.user?.parkingId;
      const userRole = req.user?.role;
      
      // superadmin 和 admin 可以查看所有记录
      if (userRole !== 'superadmin' && userRole !== 'admin') {
        if (record.parking_id !== userParkingId) {
          throw new Error('无权查看此记录');
        }
      }

      res.json({
        code: 'SUCCESS',
        message: '查询成功',
        data: record,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/vehicles/:plate/ongoing
   * 查询在场车辆
   */
  async getOngoing(req: Request, res: Response, next: NextFunction) {
    try {
      const { plate } = req.params;
      const querySchema = z.object({
        parkingId: z.string().uuid().optional(),
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().positive().max(100).default(20),
      });

      const query = querySchema.parse({ ...req.query, plateNumber: plate });
      
      // P0-B 修复：租户隔离
      const userParkingId = req.user?.parkingId;
      const userRole = req.user?.role;
      
      if (userRole !== 'superadmin' && userRole !== 'admin') {
        query.parkingId = userParkingId;
      }
      
      const result = await vehicleService.getOngoingVehicles(query);

      res.json({
        code: 'SUCCESS',
        message: '查询成功',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

// 单例导出
export const vehicleController = new VehicleController();
