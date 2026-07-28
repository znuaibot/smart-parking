// 车辆进出模块路由
import { Router } from 'express';
import { vehicleController } from './vehicle.controller.js';
import { authenticate, requireRole } from '../../middleware/authenticate.js';

export const vehicleRouter = Router();

// 所有车辆进出路由需要鉴权
vehicleRouter.use(authenticate);

// POST /api/v1/vehicle-entry - 车辆入场（需操作员以上权限）
vehicleRouter.post('/entry', requireRole('superadmin', 'admin', 'operator'), (req, res, next) => vehicleController.recordEntry(req, res, next));

// POST /api/v1/vehicle-exit - 车辆出场（需操作员以上权限）
vehicleRouter.post('/exit', requireRole('superadmin', 'admin', 'operator'), (req, res, next) => vehicleController.recordExit(req, res, next));

// GET /api/v1/vehicle-records - 进出记录列表（需登录）
vehicleRouter.get('/records', (req, res, next) => vehicleController.listRecords(req, res, next));

// GET /api/v1/vehicle-records/:id - 进出记录详情（需登录）
vehicleRouter.get('/records/:id', (req, res, next) => vehicleController.getRecordById(req, res, next));

// GET /api/v1/vehicles/:plate/ongoing - 查询在场车辆（需操作员以上权限）
vehicleRouter.get('/:plate/ongoing', requireRole('superadmin', 'admin', 'operator'), (req, res, next) => vehicleController.getOngoing(req, res, next));
