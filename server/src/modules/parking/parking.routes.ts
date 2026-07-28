// 停车场模块路由
import { Router } from 'express';
import { parkingController } from './parking.controller.js';
import { spaceController } from './space.controller.js';
import { authenticate, requireRole, requireParkingAccess } from '../../middleware/authenticate.js';

export const parkingRouter = Router();

// 所有停车场路由需要鉴权
parkingRouter.use(authenticate);

// GET /api/v1/parkings - 列表（分页、搜索、筛选）— 所有已认证用户可查看
parkingRouter.get('/', (req, res, next) => parkingController.list(req, res, next));

// POST /api/v1/parkings - 创建停车场（仅管理员）
parkingRouter.post('/', requireRole('superadmin', 'admin'), (req, res, next) => parkingController.create(req, res, next));

// GET /api/v1/parkings/:id - 详情（需要所属停车场权限或管理员）
parkingRouter.get('/:id', requireParkingAccess, (req, res, next) => parkingController.getById(req, res, next));

// PUT /api/v1/parkings/:id - 更新（仅管理员）
parkingRouter.put('/:id', requireParkingAccess, requireRole('superadmin', 'admin'), (req, res, next) => parkingController.update(req, res, next));

// DELETE /api/v1/parkings/:id - 软删除（仅超级管理员）
parkingRouter.delete('/:id', requireParkingAccess, requireRole('superadmin'), (req, res, next) => parkingController.delete(req, res, next));

// POST /api/v1/parkings/:id/spaces/batch - 批量创建车位（仅管理员）
parkingRouter.post('/:id/spaces/batch', requireParkingAccess, requireRole('superadmin', 'admin'), (req, res, next) => spaceController.batchCreate(req, res, next));
