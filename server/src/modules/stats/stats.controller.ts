// 统计模块 - 控制器层
// 处理 HTTP 请求和响应

import { Request, Response, NextFunction } from 'express';
import { statsService, RealtimeStatsResponse, WeeklyStatsResponse } from './stats.service.js';
import { logger } from '../../shared/utils/logger.js';

export class StatsController {
  /**
   * GET /api/v1/stats/realtime/:parkingId
   * 获取实时余位统计
   */
  async getRealtimeStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { parkingId } = req.params;

      const stats = await statsService.getRealtimeStats(parkingId);

      res.status(200).json({
        code: 'SUCCESS',
        message: '获取实时统计成功',
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/stats/daily/:parkingId
   * 获取日报统计
   */
  async getDailyStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { parkingId } = req.params;
      const { date } = req.query;

      const stats = await statsService.getDailyStats(
        parkingId,
        date as string | undefined,
      );

      res.status(200).json({
        code: 'SUCCESS',
        message: '获取日报统计成功',
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/stats/weekly/:parkingId
   * 获取周报统计
   */
  async getWeeklyStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { parkingId } = req.params;
      const { weekStart } = req.query;

      const stats = await statsService.getWeeklyStats(
        parkingId,
        weekStart as string | undefined,
      );

      res.status(200).json({
        code: 'SUCCESS',
        message: '获取周报统计成功',
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/stats/monthly/:parkingId
   * 获取月报统计
   */
  async getMonthlyStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { parkingId } = req.params;
      const { month } = req.query;

      const stats = await statsService.getMonthlyStats(parkingId, month as string);

      res.status(200).json({
        code: 'SUCCESS',
        message: '获取月报统计成功',
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/stats/export
   * 导出统计报表
   */
  async exportStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { parkingId, startDate, endDate, format } = req.query;

      if (!parkingId || !startDate || !endDate) {
        res.status(400).json({
          code: 'VALIDATION_ERROR',
          message: '缺少必要参数: parkingId, startDate, endDate',
        });
        return;
      }

      // 导出功能：返回 CSV/JSON 格式数据
      res.status(200).json({
        code: 'SUCCESS',
        message: '导出功能开发中',
        data: {
          format: format || 'csv',
          filters: { parkingId, startDate, endDate },
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

// 单例导出
export const statsController = new StatsController();
