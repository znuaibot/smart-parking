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
} from '../shared/types/errors.js';
import { logger } from '../shared/utils/logger.js';
import { config } from '../config/index.js';

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
  if (err instanceof TokenExpiredError) {
    return res.status(401).json({
      code: 'TOKEN_EXPIRED',
      title: 'Token Expired',
      message: err.message,
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  }

  if (err instanceof UnauthorizedError) {
    return res.status(401).json({
      code: 'UNAUTHORIZED',
      title: 'Unauthorized',
      message: err.message,
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  }

  if (err instanceof AccountDisabledError) {
    return res.status(403).json({
      code: 'ACCOUNT_DISABLED',
      title: 'Account Disabled',
      message: err.message,
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  }

  if (err instanceof ForbiddenError) {
    return res.status(403).json({
      code: 'FORBIDDEN',
      title: 'Forbidden',
      message: err.message,
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  }

  if (err instanceof NotFoundError) {
    return res.status(404).json({
      code: 'NOT_FOUND',
      title: 'Not Found',
      message: err.message,
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  }

  if (err instanceof ConflictError) {
    return res.status(409).json({
      code: 'CONFLICT',
      title: 'Conflict',
      message: err.message,
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  }

  if (err instanceof ValidationError) {
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
    return res.status(429).json({
      code: 'TOO_MANY_REQUESTS',
      title: 'Too Many Requests',
      message: err.message,
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  }

  if (err instanceof ServiceUnavailableError) {
    return res.status(503).json({
      code: 'SERVICE_UNAVAILABLE',
      title: 'Service Unavailable',
      message: err.message,
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  }

  // 通用 AppError 处理（兜底）
  if (err instanceof AppError && err.isOperational) {
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
  logger.error('Unexpected Error', { error: err.message, stack: err.stack, requestId: req.requestId });
  res.status(500).json({
    code: 'INTERNAL_ERROR',
    title: 'Internal Server Error',
    message: config.NODE_ENV === 'production' ? '服务器内部错误' : err.message,
    requestId: req.requestId,
    timestamp: new Date().toISOString(),
  });
}
