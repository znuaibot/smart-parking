// 统计报表模块路由
import { Router } from 'express';

export const statsRouter = Router();

// GET /api/v1/stats/realtime/:parkingId - 实时统计
statsRouter.get('/realtime/:parkingId', (req, res) => {
  res.json({ message: 'realtime stats - 待实现' });
});

// GET /api/v1/stats/daily/:parkingId - 日报
statsRouter.get('/daily/:parkingId', (req, res) => {
  res.json({ message: 'daily stats - 待实现' });
});

// GET /api/v1/stats/weekly/:parkingId - 周报
statsRouter.get('/weekly/:parkingId', (req, res) => {
  res.json({ message: 'weekly stats - 待实现' });
});

// GET /api/v1/stats/monthly/:parkingId - 月报
statsRouter.get('/monthly/:parkingId', (req, res) => {
  res.json({ message: 'monthly stats - 待实现' });
});

// GET /api/v1/stats/export - 导出报表
statsRouter.get('/export', (req, res) => {
  res.json({ message: 'export stats - 待实现' });
});
