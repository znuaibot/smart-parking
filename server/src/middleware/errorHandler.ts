// 全局错误处理中间件
// P2-D 修复：补全自定义错误映射，包括 express-rate-limit 的 TooManyRequestsError

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import {
  AppError,
  ValidationError,
  InternalError,
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
 * P2-D 修复：支持所有自定义错误类型，包括 express-rate-limit 错误
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

  // 已知业务错误（包括所有 AppError 子类）
  if (err instanceof AppError) {
    // 5xx 错误记录详细堆栈
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

    // P2-D 修复：构建统一错误响应格式
    const response: Record<string, unknown> = {
      code: err.code,
      title: err.name,
      message: err.message,
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    };

    // ValidationError 包含 details 字段
    if (err instanceof ValidationError && err.details.length > 0) {
      response.details = err.details;
    }

    return res.status(err.statusCode).json(response);
  }

  // 处理 express-rate-limit 错误（非 AppError 实例）
  // express-rate-limit 会在 message 中包含 "Too Many Requests"
  if (err.name === 'TooManyRequestsError' || (err as any).statusCode === 429) {
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
    return res.status(401).json({
      code: 'TOKEN_EXPIRED',
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
  res.status(500).json({
    code: 'INTERNAL_ERROR',
    title: 'Internal Server Error',
    message: config.NODE_ENV === 'production' ? '服务器内部错误' : err.message,
    requestId: req.requestId,
    timestamp: new Date().toISOString(),
  });
}
