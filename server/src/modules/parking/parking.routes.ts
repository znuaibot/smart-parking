// 停车场模块路由
import { Router } from 'express';
import { parkingController } from './parking.controller.js';
import { spaceController } from './space.controller.js';

export const parkingRouter = Router();

// GET /api/v1/parkings - 列表（分页、搜索、筛选）
parkingRouter.get('/', (req, res, next) => parkingController.list(req, res, next));

// POST /api/v1/parkings - 创建停车场
parkingRouter.post('/', (req, res, next) => parkingController.create(req, res, next));

// GET /api/v1/parkings/:id - 详情
parkingRouter.get('/:id', (req, res, next) => parkingController.getById(req, res, next));

// PUT /api/v1/parkings/:id - 更新
parkingRouter.put('/:id', (req, res, next) => parkingController.update(req, res, next));

// DELETE /api/v1/parkings/:id - 软删除
parkingRouter.delete('/:id', (req, res, next) => parkingController.delete(req, res, next));

// POST /api/v1/parkings/:id/spaces/batch - 批量创建车位
parkingRouter.post('/:id/spaces/batch', (req, res, next) => spaceController.batchCreate(req, res, next));
