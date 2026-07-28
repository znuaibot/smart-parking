// 车位模块路由
import { Router } from 'express';
import { spaceController } from './space.controller.js';

export const spaceRouter = Router();

// GET /api/v1/parking-spaces - 车位列表（跨停车场查询）
spaceRouter.get('/', (req, res, next) => spaceController.list(req, res, next));

// GET /api/v1/parking-spaces/:id - 车位详情
spaceRouter.get('/:id', (req, res, next) => spaceController.getById(req, res, next));

// PUT /api/v1/parking-spaces/:id/status - 更新车位状态（乐观锁）
spaceRouter.put('/:id/status', (req, res, next) => spaceController.updateStatus(req, res, next));

// GET /api/v1/parking-spaces/:parkingId/availability - 实时余位
spaceRouter.get('/:parkingId/availability', (req, res, next) => spaceController.getAvailability(req, res, next));
