// 全局错误处理中间件

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError, InternalError } from '../shared/types/errors.js';
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

  // 已知业务错误
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

  // 未知错误（仅记录详细信息）
  logger.error('Unexpected Error', { error: err.message, stack: err.stack, requestId: req.requestId });
  res.status(500).json({
    code: 'INTERNAL_ERROR',
    title: 'Internal Server Error',
    message: config.NODE_ENV === 'production' ? '服务器内部错误' : err.message,
    requestId: req.requestId,
    timestamp: new Date().toISOString(),
  });
}
