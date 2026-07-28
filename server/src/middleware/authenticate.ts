// JWT 鉴权中间件 - 校验 Supabase JWT Token

import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../shared/types/errors.js';
import { config } from '../config/index.js';

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('缺少访问令牌');
    }

    const token = authHeader.substring(7);

    // TODO: 使用 Supabase Admin API 校验 token
    // 目前先做基础校验
    if (token.length < 10) {
      throw new UnauthorizedError('无效令牌格式');
    }

    // 将 user 信息注入请求对象
    req.user = {
      id: 'temp-user-id',  // 实际应从 token 解析
      role: 'admin',
    };

    next();
  } catch (error) {
    next(error);
  }
}
