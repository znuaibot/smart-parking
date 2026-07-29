// 请求 ID 中间件 - 生成唯一请求 ID 用于链路追踪

import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';

export function requestId(req: Request, res: Response, next: NextFunction) {
  const id = req.headers['x-request-id'] as string || randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}

// Express 类型扩展 - 使用 ES2015 模块语法替代 namespace
import 'express';
declare module 'express-serve-static-core' {
  interface Request {
    requestId: string;
    user?: {
      id: string;
      role: string;
    };
  }
}
