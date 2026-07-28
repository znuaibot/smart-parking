// 停车场模块 - 控制器层
import { Request, Response, NextFunction } from 'express';
import { parkingService } from './parking.service.js';
import {
  CreateParkingSchema,
  UpdateParkingSchema,
  ListParkingQuerySchema,
} from './parking.dto.js';

/**
 * 停车场控制器
 */
export class ParkingController {
  /**
   * GET /api/v1/parkings
   * 获取停车场列表
   * P0-D 修复：非管理员只能查看自己所属的停车场
   */
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const query = ListParkingQuerySchema.parse(req.query);
      
      // P0-D 修复：租户隔离 - 非管理员只能查看自己所属的停车场
      const userParkingId = req.user?.parkingId;
      const userRole = req.user?.role;
      
      if (userRole !== 'superadmin' && userRole !== 'admin') {
        // 非管理员只能查看自己所属的停车场
        if (userParkingId) {
          query.parkingId = userParkingId;
        }
      }
      
      const result = await parkingService.list(query);

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
   * GET /api/v1/parkings/:id
   * 获取停车场详情
   */
  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const parking = await parkingService.getById(id);

      res.json({
        code: 'SUCCESS',
        message: '查询成功',
        data: parking,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/parkings
   * 创建停车场
   */
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      // 校验请求体
      const dto = CreateParkingSchema.parse(req.body);
      const parking = await parkingService.create(dto);

      res.status(201).json({
        code: 'SUCCESS',
        message: '创建成功',
        data: parking,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/v1/parkings/:id
   * 更新停车场
   */
  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const dto = UpdateParkingSchema.parse(req.body);
      const parking = await parkingService.update(id, dto);

      res.json({
        code: 'SUCCESS',
        message: '更新成功',
        data: parking,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/parkings/:id
   * 软删除停车场
   */
  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      await parkingService.delete(id);

      res.json({
        code: 'SUCCESS',
        message: '删除成功',
      });
    } catch (error) {
      next(error);
    }
  }
}

// 单例导出
export const parkingController = new ParkingController();
