// 全局错误处理中间件
// P2-A 修复：明确映射所有自定义错误类型，提升错误响应可读性

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import {
  AppError,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  TokenExpiredError,
  AccountDisabledError,
  ConflictError,
  TooManyRequestsError,
  InternalError,
  ServiceUnavailableError,
  TokenRefreshError,
  InvalidCredentialsError,
  ParkingFullError,
  VehicleAlreadyParkedError,
  VehicleNotParkedError,
  LPRFailedError,
  PaymentFailedError,
} from '../shared/types/errors.js';
import { logger } from '../shared/utils/logger.js';
import { config } from '../config/index.js';
import { metrics } from '../shared/utils/metrics.js';

/**
 * 404 处理
 */
export function notFoundHandler(req: Request, res: Response, _next: NextFunction) {
  res.status(404).json({
    code: 'NOT_FOUND',
    title: 'Resource Not Found',
    message: `路径不存在: ${req.method} ${req.originalUrl}`,
    requestId: req.requestId,
    timestamp: new Date().toISOString(),
  });
}

/**
 * 全局错误处理
 * 明确处理所有自定义错误类型，返回统一的错误响应格式
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  // Zod 参数校验错误
  if (err instanceof ZodError) {
    const details = err.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      title: 'Validation Error',
      message: '参数校验失败',
      details,
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  }

  // P2-A 修复：明确映射已知业务错误类型
  // P2-C 修复：添加 metrics 指标记录
  if (err instanceof TokenExpiredError) {
    metrics.increment('error.token_expired');
    return res.status(401).json({
      code: 'TOKEN_EXPIRED',
      title: 'Token Expired',
      message: err.message,
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  }

  if (err instanceof UnauthorizedError) {
    metrics.increment('error.unauthorized');
    return res.status(401).json({
      code: 'UNAUTHORIZED',
      title: 'Unauthorized',
      message: err.message,
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  }

  if (err instanceof AccountDisabledError) {
    metrics.increment('error.account_disabled');
    return res.status(403).json({
      code: 'ACCOUNT_DISABLED',
      title: 'Account Disabled',
      message: err.message,
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  }

  if (err instanceof ForbiddenError) {
    metrics.increment('error.forbidden');
    return res.status(403).json({
      code: 'FORBIDDEN',
      title: 'Forbidden',
      message: err.message,
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  }

  if (err instanceof NotFoundError) {
    metrics.increment('error.not_found');
    return res.status(404).json({
      code: 'NOT_FOUND',
      title: 'Not Found',
      message: err.message,
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  }

  if (err instanceof ConflictError) {
    metrics.increment('error.conflict');
    return res.status(409).json({
      code: 'CONFLICT',
      title: 'Conflict',
      message: err.message,
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  }

  if (err instanceof ValidationError) {
    metrics.increment('error.validation');
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      title: 'Validation Error',
      message: err.message,
      details: err.details,
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  }

  if (err instanceof TooManyRequestsError) {
    metrics.increment('error.too_many_requests');
    return res.status(429).json({
      code: 'TOO_MANY_REQUESTS',
      title: 'Too Many Requests',
      message: err.message,
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  }

  if (err instanceof ServiceUnavailableError) {
    metrics.increment('error.service_unavailable');
    return res.status(503).json({
      code: 'SERVICE_UNAVAILABLE',
      title: 'Service Unavailable',
      message: err.message,
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  }

  // P2-D 修复：补全剩余业务错误映射
  if (err instanceof TokenRefreshError) {
    metrics.increment('error.token_refresh_failed');
    return res.status(401).json({
      code: 'TOKEN_REFRESH_FAILED',
      title: 'Token Refresh Failed',
      message: err.message,
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  }

  if (err instanceof InvalidCredentialsError) {
    metrics.increment('error.invalid_credentials');
    return res.status(401).json({
      code: 'INVALID_CREDENTIALS',
      title: 'Invalid Credentials',
      message: err.message,
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  }

  if (err instanceof ParkingFullError) {
    metrics.increment('error.parking_full');
    return res.status(409).json({
      code: 'PARKING_FULL',
      title: 'Parking Full',
      message: err.message,
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  }

  if (err instanceof VehicleAlreadyParkedError) {
    metrics.increment('error.vehicle_already_parked');
    return res.status(409).json({
      code: 'VEHICLE_ALREADY_PARKED',
      title: 'Vehicle Already Parked',
      message: err.message,
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  }

  if (err instanceof VehicleNotParkedError) {
    metrics.increment('error.vehicle_not_parked');
    return res.status(404).json({
      code: 'VEHICLE_NOT_PARKED',
      title: 'Vehicle Not Parked',
      message: err.message,
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  }

  if (err instanceof LPRFailedError) {
    metrics.increment('error.lpr_failed');
    return res.status(422).json({
      code: 'LPR_FAILED',
      title: 'LPR Failed',
      message: err.message,
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  }

  if (err instanceof PaymentFailedError) {
    metrics.increment('error.payment_failed');
    return res.status(402).json({
      code: 'PAYMENT_FAILED',
      title: 'Payment Failed',
      message: err.message,
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  }

  // 通用 AppError 处理（兜底）
  if (err instanceof AppError && err.isOperational) {
    metrics.increment('error.app_error');
    if (err.statusCode >= 500) {
      logger.error('Server Error', { error: err.message, stack: err.stack, requestId: req.requestId });
    }
    return res.status(err.statusCode).json({
      code: err.code,
      title: err.name,
      message: err.message,
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  }

  // 未知错误（仅记录详细信息，生产环境不暴露堆栈）
  metrics.increment('error.unexpected');
  logger.error('Unexpected Error', { error: err.message, stack: err.stack, requestId: req.requestId });
  res.status(500).json({
    code: 'INTERNAL_ERROR',
    title: 'Internal Server Error',
    message: config.NODE_ENV === 'production' ? '服务器内部错误' : err.message,
    requestId: req.requestId,
    timestamp: new Date().toISOString(),
  });
}
