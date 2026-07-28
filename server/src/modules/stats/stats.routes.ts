// 统计报表模块路由
import { Router } from 'express';
import { statsController } from './stats.controller.js';

export const statsRouter = Router();

// GET /api/v1/stats/realtime/:parkingId - 实时统计
statsRouter.get('/realtime/:parkingId', (req, res, next) => statsController.getRealtimeStats(req, res, next));

// GET /api/v1/stats/daily/:parkingId - 日报
statsRouter.get('/daily/:parkingId', (req, res, next) => statsController.getDailyStats(req, res, next));

// GET /api/v1/stats/weekly/:parkingId - 周报
statsRouter.get('/weekly/:parkingId', (req, res, next) => statsController.getWeeklyStats(req, res, next));

// GET /api/v1/stats/monthly/:parkingId - 月报
statsRouter.get('/monthly/:parkingId', (req, res, next) => statsController.getMonthlyStats(req, res, next));
