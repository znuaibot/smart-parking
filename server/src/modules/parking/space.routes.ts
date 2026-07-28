// 车位模块路由
import { Router } from 'express';
import { spaceController } from './space.controller.js';
import { authenticate, requireRole, requireParkingAccess } from '../../middleware/authenticate.js';

export const spaceRouter = Router();

// 所有车位路由需要鉴权
spaceRouter.use(authenticate);

// GET /api/v1/parking-spaces - 车位列表（跨停车场查询，需登录）
spaceRouter.get('/', (req, res, next) => spaceController.list(req, res, next));

// GET /api/v1/parking-spaces/:id - 车位详情
spaceRouter.get('/:id', (req, res, next) => spaceController.getById(req, res, next));

// PUT /api/v1/parking-spaces/:id/status - 更新车位状态（乐观锁，需操作员以上权限）
spaceRouter.put('/:id/status', requireRole('superadmin', 'admin', 'operator'), (req, res, next) => spaceController.updateStatus(req, res, next));

// GET /api/v1/parking-spaces/:parkingId/availability - 实时余位
spaceRouter.get('/:parkingId/availability', requireParkingAccess, (req, res, next) => spaceController.getAvailability(req, res, next));
