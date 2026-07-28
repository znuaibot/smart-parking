// 限流中间件 - 基于滑动窗口算法

import { Request, Response, NextFunction } from 'express';
import { TooManyRequestsError } from '../shared/types/errors.js';

// 简单的内存限流（生产环境建议使用 Redis）
const requestCounts = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = 60 * 1000; // 1分钟窗口
const MAX_REQUESTS = 100;    // 每个 IP 每分钟最多 100 次请求

export function rateLimiter(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();

  const record = requestCounts.get(ip);

  if (!record || now > record.resetAt) {
    requestCounts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return next();
  }

  record.count++;

  if (record.count > MAX_REQUESTS) {
    throw new TooManyRequestsError();
  }

  next();
}
