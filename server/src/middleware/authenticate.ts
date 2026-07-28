// JWT 鉴权中间件 - 使用 Supabase Admin API 校验 Token

import { Request, Response, NextFunction } from 'express';
import { supabase } from '../shared/database/supabase.js';
import { UnauthorizedError, TokenExpiredError } from '../shared/types/errors.js';
import { logger, logAuthEvent } from '../shared/utils/logger.js';
import { authService } from '../modules/auth/auth.service.js';

// 公开路径白名单（不需要鉴权）
const PUBLIC_PATHS = [
  '/health',
  '/ready',
  '/api/v1/auth/login',
  '/api/v1/auth/refresh',
];

/**
 * 鉴权中间件
 * 使用 Supabase Admin API 验证 JWT Token
 */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // 检查是否为白名单路径
    const isPublicPath = PUBLIC_PATHS.some(path => 
      req.originalUrl.startsWith(path) || req.originalUrl === path
    );
    
    if (isPublicPath) {
      return next();
    }

    // 获取 Authorization 头
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('缺少访问令牌');
    }

    const token = authHeader.substring(7);

    // 检查 Token 是否在黑名单中
    if (authService.isTokenBlacklisted(token)) {
      throw new UnauthorizedError('令牌已被注销，请重新登录');
    }

    // 使用 Supabase Admin API 验证 Token
    const { data, error } = await supabase.auth.getUser(token);

    if (error) {
      logger.warn('Token verification failed', {
        error: error.message,
        requestId: req.requestId,
        ip: req.ip,
      });

      if (error.message?.includes('expired')) {
        throw new TokenExpiredError();
      }
      
      logAuthEvent('failed', {
        ip: req.ip,
        reason: error.message,
      });
      
      throw new UnauthorizedError('无效的访问令牌');
    }

    if (!data.user) {
      throw new UnauthorizedError('用户不存在');
    }

    // 检查用户是否被禁用
    if (data.user.banned_until) {
      throw new UnauthorizedError('账号已被禁用，请联系管理员');
    }

    // 将用户信息注入请求对象
    const userRole = (data.user.user_metadata?.role || 'operator') as string;
    
    req.user = {
      id: data.user.id,
      role: userRole,
      email: data.user.email || '',
    };

    // 将用户信息附加到请求上下文，方便后续日志使用
    (req as any).userEmail = data.user.email;
    (req as any).userRole = userRole;

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * 可选鉴权中间件
 * 有 Token 则解析，没有也不阻止请求
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);

    if (authService.isTokenBlacklisted(token)) {
      return next();
    }

    const { data, error } = await supabase.auth.getUser(token);

    if (!error && data.user) {
      req.user = {
        id: data.user.id,
        role: data.user.user_metadata?.role || 'operator',
        email: data.user.email || '',
      };
    }

    next();
  } catch {
    // 可选鉴权失败不阻止请求
    next();
  }
}
