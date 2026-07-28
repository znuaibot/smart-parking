// 车辆进出模块路由
// 修复：分离路由以消除路径重复（如 /vehicle-entry/entry → /vehicle-entry）
import { Router } from 'express';
import { vehicleController } from './vehicle.controller.js';
import { authenticate, requireRole } from '../../middleware/authenticate.js';

// 车辆入场路由 - 挂载到 /api/v1/vehicle-entry
export const vehicleEntryRouter = Router();
vehicleEntryRouter.use(authenticate);
vehicleEntryRouter.post('/', requireRole('superadmin', 'admin', 'operator'), (req, res, next) => vehicleController.recordEntry(req, res, next));

// 车辆出场路由 - 挂载到 /api/v1/vehicle-exit
export const vehicleExitRouter = Router();
vehicleExitRouter.use(authenticate);
vehicleExitRouter.post('/', requireRole('superadmin', 'admin', 'operator'), (req, res, next) => vehicleController.recordExit(req, res, next));

// 进出记录路由 - 挂载到 /api/v1/vehicle-records
export const vehicleRecordRouter = Router();
vehicleRecordRouter.use(authenticate);
vehicleRecordRouter.get('/', (req, res, next) => vehicleController.listRecords(req, res, next));
vehicleRecordRouter.get('/:id', (req, res, next) => vehicleController.getRecordById(req, res, next));

// 在场车辆查询路由 - 挂载到 /api/v1/vehicles
export const vehicleOngoingRouter = Router();
vehicleOngoingRouter.use(authenticate);
vehicleOngoingRouter.get('/:plate/ongoing', requireRole('superadmin', 'admin', 'operator'), (req, res, next) => vehicleController.getOngoing(req, res, next));
