// 车辆进出模块路由
import { Router } from 'express';
import { vehicleController } from './vehicle.controller.js';

export const vehicleRouter = Router();

// POST /api/v1/vehicle-entry - 车辆入场
vehicleRouter.post('/entry', (req, res, next) => vehicleController.recordEntry(req, res, next));

// POST /api/v1/vehicle-exit - 车辆出场
vehicleRouter.post('/exit', (req, res, next) => vehicleController.recordExit(req, res, next));

// GET /api/v1/vehicle-records - 进出记录列表
vehicleRouter.get('/records', (req, res, next) => vehicleController.listRecords(req, res, next));

// GET /api/v1/vehicle-records/:id - 进出记录详情
vehicleRouter.get('/records/:id', (req, res, next) => vehicleController.getRecordById(req, res, next));

// GET /api/v1/vehicles/:plate/ongoing - 查询在场车辆
vehicleRouter.get('/:plate/ongoing', (req, res, next) => vehicleController.getOngoing(req, res, next));
