// Pino 结构化日志封装

import pino from 'pino';
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
