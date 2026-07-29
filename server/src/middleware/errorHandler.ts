// 全局错误处理中间件
// P2-D 修复：补全自定义错误映射，包括 express-rate-limit 的 TooManyRequestsError

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  TooManyRequestsError,
  InternalError,
  ServiceUnavailableError,
  TokenExpiredError,
  TokenRefreshError,
  AccountDisabledError,
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
 * P2-D 修复：显式映射所有自定义错误类型到 HTTP 状态码
 * P2-C 修复：添加 metrics 指标记录
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
    metrics.increment('error.validation');
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      title: 'Validation Error',
      message: '参数校验失败',
      details,
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  }

  // ==================== 显式错误类型映射 ====================

  // Token 相关错误
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

  // 账号状态错误
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

  // 权限错误
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

  // 资源错误
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

  // 业务错误
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

  // 限流错误
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

  // 服务错误
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

  // 通用 AppError 兜底（处理未显式映射的子类）
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error('Server Error', {
        code: err.code,
        error: err.message,
        stack: err.stack,
        requestId: req.requestId,
      });
    } else {
      logger.warn('Client Error', {
        code: err.code,
        error: err.message,
        requestId: req.requestId,
      });
    }

    metrics.increment('error.app_error');
    const response: Record<string, unknown> = {
      code: err.code,
      title: err.name,
      message: err.message,
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    };

    if (err instanceof ValidationError && err.details.length > 0) {
      response.details = err.details;
    }

    return res.status(err.statusCode).json(response);
  }

  // 处理 express-rate-limit 错误（非 AppError 实例）
  if (err.name === 'TooManyRequestsError' || (err as any).statusCode === 429) {
    metrics.increment('error.rate_limited');
    return res.status(429).json({
      code: 'TOO_MANY_REQUESTS',
      title: 'Too Many Requests',
      message: '请求过于频繁，请稍后重试',
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  }

  // JWT 验证错误（来自 jsonwebtoken 或 @supabase/supabase-js）
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    metrics.increment('error.jwt_error');
    return res.status(401).json({
      code: 'TOKEN_INVALID',
      title: 'Unauthorized',
      message: err.name === 'TokenExpiredError' ? '访问令牌已过期' : '访问令牌无效',
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  }

  // PostgreSQL 错误（来自 Supabase）
  if ((err as any).code && typeof (err as any).code === 'string' && /^[0-9A-Z]{5}$/.test((err as any).code)) {
    logger.error('Postgres Error', {
      code: (err as any).code,
      message: err.message,
      stack: err.stack,
      requestId: req.requestId,
    });
    metrics.increment('error.database');
    return res.status(500).json({
      code: 'DATABASE_ERROR',
      title: 'Database Error',
      message: config.NODE_ENV === 'production' ? '数据库操作失败' : err.message,
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  }

  // 未知错误（仅记录详细信息）
  logger.error('Unexpected Error', {
    name: err.name,
    error: err.message,
    stack: err.stack,
    requestId: req.requestId,
  });
  metrics.increment('error.unexpected');
  res.status(500).json({
    code: 'INTERNAL_ERROR',
    title: 'Internal Server Error',
    message: config.NODE_ENV === 'production' ? '服务器内部错误' : err.message,
    requestId: req.requestId,
    timestamp: new Date().toISOString(),
  });
}
