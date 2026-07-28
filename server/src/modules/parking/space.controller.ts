// 车位模块 - 控制器层
import { Request, Response, NextFunction } from 'express';
import { spaceService, BatchCreateSpaceDTO, UpdateSpaceStatusDTO } from './space.service.js';
import { z } from 'zod';

/**
 * 车位控制器
 */
export class SpaceController {
  /**
   * GET /api/v1/parking-spaces
   * 车位列表（跨停车场查询）
   */
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const querySchema = z.object({
        parkingId: z.string().uuid().optional(),
        zone: z.string().optional(),
        floor: z.coerce.number().int().positive().optional(),
        status: z.enum(['available', 'occupied', 'reserved', 'disabled']).optional(),
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().positive().max(200).default(50),
      });

      const query = querySchema.parse(req.query);
      const result = await spaceService.list(query);

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
   * GET /api/v1/parking-spaces/:id
   * 车位详情
   */
  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const space = await spaceService.getById(id);

      res.json({
        code: 'SUCCESS',
        message: '查询成功',
        data: space,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/parkings/:id/spaces/batch
   * 批量创建车位
   */
  async batchCreate(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: parkingId } = req.params;

      const bodySchema = z.object({
        zone: z.string().min(1).max(10),
        floor: z.number().int().positive().default(1),
        startNumber: z.number().int().positive().default(1),
        count: z.number().int().positive().max(1000),
        spaceType: z.enum(['normal', 'vip', 'disabled', 'charging']).default('normal'),
        prefix: z.string().optional(),
      });

      const dto = bodySchema.parse(req.body);
      const spaces = await spaceService.batchCreate(parkingId, dto);

      res.status(201).json({
        code: 'SUCCESS',
        message: `成功创建 ${spaces.length} 个车位`,
        data: spaces,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/v1/parking-spaces/:id/status
   * 更新车位状态（乐观锁）
   */
  async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const bodySchema = z.object({
        status: z.enum(['available', 'occupied', 'reserved', 'disabled']),
        expectedStatus: z.enum(['available', 'occupied', 'reserved', 'disabled']),
        currentPlate: z.string().nullable().optional(),
        currentEntryId: z.string().uuid().nullable().optional(),
      });

      const dto = bodySchema.parse(req.body);
      const space = await spaceService.updateStatus(id, dto);

      res.json({
        code: 'SUCCESS',
        message: '状态更新成功',
        data: space,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/parking-spaces/:parkingId/availability
   * 实时余位查询
   */
  async getAvailability(req: Request, res: Response, next: NextFunction) {
    try {
      const { parkingId } = req.params;
      const availability = await spaceService.getAvailability(parkingId);

      res.json({
        code: 'SUCCESS',
        message: '查询成功',
        data: availability,
      });
    } catch (error) {
      next(error);
    }
  }
}

// 单例导出
export const spaceController = new SpaceController();
