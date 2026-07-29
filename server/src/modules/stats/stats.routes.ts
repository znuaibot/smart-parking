// 统计报表模块路由
import { Router, Request, Response } from 'express';

export const statsRouter = Router();

// GET /api/v1/stats/realtime/:parkingId - 实时统计
statsRouter.get('/realtime/:parkingId', (req: Request, res: Response) => {
  res.json({ message: 'realtime stats - 待实现' });
});

// GET /api/v1/stats/daily/:parkingId - 日报
statsRouter.get('/daily/:parkingId', (req: Request, res: Response) => {
  res.json({ message: 'daily stats - 待实现' });
});

// GET /api/v1/stats/weekly/:parkingId - 周报
statsRouter.get('/weekly/:parkingId', (req: Request, res: Response) => {
  res.json({ message: 'weekly stats - 待实现' });
});

// GET /api/v1/stats/monthly/:parkingId - 月报
statsRouter.get('/monthly/:parkingId', (req: Request, res: Response) => {
  res.json({ message: 'monthly stats - 待实现' });
});

// GET /api/v1/stats/export - 导出报表
statsRouter.get('/export', (req: Request, res: Response) => {
  res.json({ message: 'export stats - 待实现' });
});
