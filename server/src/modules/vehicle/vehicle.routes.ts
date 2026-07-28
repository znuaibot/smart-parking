// 车辆进出模块路由
import { Router } from 'express';

export const vehicleRouter = Router();

// POST /api/v1/vehicle-entry - 车辆入场
vehicleRouter.post('/entry', (req, res) => {
  res.json({ message: 'vehicle entry - 待实现' });
});

// POST /api/v1/vehicle-exit - 车辆出场
vehicleRouter.post('/exit', (req, res) => {
  res.json({ message: 'vehicle exit - 待实现' });
});

// GET /api/v1/vehicle-records - 进出记录列表
vehicleRouter.get('/records', (req, res) => {
  res.json({ message: 'vehicle records - 待实现' });
});

// GET /api/v1/vehicle-records/:id - 进出记录详情
vehicleRouter.get('/records/:id', (req, res) => {
  res.json({ message: 'record detail - 待实现' });
});

// GET /api/v1/vehicles/:plate/ongoing - 查询在场车辆
vehicleRouter.get('/:plate/ongoing', (req, res) => {
  res.json({ message: 'ongoing vehicle - 待实现' });
});
