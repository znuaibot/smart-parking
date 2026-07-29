// Pino 结构化日志封装
// 开发环境使用 pino-pretty，生产环境输出 JSON

import { pino } from 'pino';
import { config } from '../../config/index.js';

export const logger = pino({
  level: config.LOG_LEVEL,
  transport: config.NODE_ENV === 'development' 
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'yyyy-mm-dd HH:MM:ss.l' } }
    : undefined,
  base: {
    env: config.NODE_ENV,
    service: 'smart-parking-api',
  },
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token'],
    remove: true,
  },
});

// 便捷方法
export const logRequest = (req: any) => ({
  requestId: req.requestId,
  method: req.method,
  url: req.originalUrl,
  ip: req.ip,
  userAgent: req.get('User-Agent'),
});

export const logError = (error: Error, context?: Record<string, any>) => ({
  error: error.message,
  stack: error.stack,
  ...context,
});

// ==================== 新增日志方法 ====================

/**
 * 记录数据库查询
 * @param query 查询语句或查询名称
 * @param duration 查询耗时（毫秒）
 * @param options 额外选项
 */
export function logDbQuery(
  query: string | { table: string; operation: string },
  duration: number,
  options?: {
    rows?: number;
    userId?: string;
    error?: string;
  },
): void {
  const queryInfo = typeof query === 'string' 
    ? { query: query.substring(0, 200) } // 限制长度
    : query;

  const logData = {
    type: 'db_query',
    ...queryInfo,
    duration: `${duration}ms`,
    ...(options?.rows !== undefined && { rows: options.rows }),
    ...(options?.userId && { userId: options.userId }),
  };

  if (options?.error) {
    logger.error({ ...logData, error: options.error }, 'Database query failed');
  } else if (duration > 1000) {
    logger.warn(logData, 'Slow database query');
  } else {
    logger.debug(logData, 'Database query executed');
  }
}

/**
 * 记录 API 调用
 * @param req Express 请求对象
 * @param res Express 响应对象
 * @param duration 请求耗时（毫秒）
 */
export function logAPICall(
  req: any,
  res: any,
  duration: number,
): void {
  const logData = {
    type: 'api_call',
    requestId: req.requestId,
    method: req.method,
    url: req.originalUrl,
    statusCode: res.statusCode,
    duration: `${duration}ms`,
    ip: req.ip,
    userAgent: req.get?.('User-Agent'),
    userId: req.user?.id,
  };

  if (res.statusCode >= 500) {
    logger.error(logData, 'API request failed');
  } else if (res.statusCode >= 400) {
    logger.warn(logData, 'API request error');
  } else {
    logger.info(logData, 'API request completed');
  }
}

/**
 * 记录身份认证事件
 * @param event 事件类型
 * @param details 详情
 */
export function logAuthEvent(
  event: 'login' | 'logout' | 'refresh' | 'failed' | 'password_change',
  details: {
    userId?: string;
    email?: string;
    ip?: string;
    reason?: string;
  },
): void {
  const logData = {
    type: 'auth_event',
    event,
    ...details,
  };

  if (event === 'failed') {
    logger.warn(logData, 'Authentication failed');
  } else {
    logger.info(logData, `Authentication ${event}`);
  }
}

/**
 * 记录业务操作日志
 * @param action 操作类型
 * @param details 详情
 */
export function logOperation(
  action: string,
  details: {
    userId?: string;
    targetId?: string;
    targetType?: string;
    metadata?: Record<string, any>;
  },
): void {
  logger.info({
    type: 'operation',
    action,
    ...details,
    timestamp: new Date().toISOString(),
  }, `Operation: ${action}`);
}

export default logger;
