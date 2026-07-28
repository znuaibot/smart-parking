// 车位模块路由
import { Router } from 'express';

export const spaceRouter = Router();

// GET /api/v1/parking-spaces - 车位列表（跨停车场查询）
spaceRouter.get('/', (req, res) => {
  res.json({ message: 'list spaces - 待实现' });
});

// PUT /api/v1/parking-spaces/:id - 更新车位
spaceRouter.put('/:id', (req, res) => {
  res.json({ message: 'update space - 待实现' });
});

// PUT /api/v1/parking-spaces/:id/status - 更新车位状态
spaceRouter.put('/:id/status', (req, res) => {
  res.json({ message: 'update space status - 待实现' });
});

// GET /api/v1/parking-spaces/:parkingId/availability - 实时余位
spaceRouter.get('/:parkingId/availability', (req, res) => {
  res.json({ message: 'availability - 待实现' });
});
