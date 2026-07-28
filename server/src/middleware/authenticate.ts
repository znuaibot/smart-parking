// JWT 鉴权中间件 - 使用 Supabase Admin API 校验 Token
// P0 修复：替换占位逻辑，实现真正的 Token 验证 + 获取真实用户角色

import { Request, Response, NextFunction } from 'express';
import { supabase } from '../shared/database/supabase.js';
import { UnauthorizedError, TokenExpiredError, AccountDisabledError } from '../shared/types/errors.js';
import { logger } from '../shared/utils/logger.js';

// 公开路径白名单（不需要鉴权）
const PUBLIC_PATHS = [
  '/health',
  '/ready',
];

/**
 * 鉴权中间件
 * 使用 Supabase Admin API 验证 JWT Token，获取真实用户信息
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
      throw new UnauthorizedError('缺少访问令牌，请在 Authorization 头中提供 Bearer Token');
    }

    const token = authHeader.substring(7);

    // 基础格式校验
    if (token.length < 20) {
      throw new UnauthorizedError('无效令牌格式');
    }

    // 使用 Supabase Admin API 验证 Token（真正的验证）
    const { data, error } = await supabase.auth.admin.getUser(token);

    if (error) {
      logger.warn('Token verification failed', {
        error: error.message,
        requestId: req.requestId,
        ip: req.ip,
      });

      if (error.message?.includes('expired')) {
        throw new TokenExpiredError();
      }
      
      throw new UnauthorizedError('无效的访问令牌: ' + error.message);
    }

    if (!data || !data.user) {
      throw new UnauthorizedError('用户不存在或令牌已失效');
    }

    const user = data.user;

    // 检查用户是否被禁用（Supabase 的 banned_until 字段）
    if (user.banned_until) {
      throw new AccountDisabledError();
    }

    // 获取用户角色和停车场分配（从 profiles 表中查询）
    // 优先从 profiles 表获取精确角色和停车场，回退到 user_metadata
    let userRole: string = user.user_metadata?.role || 'operator';
    let userParkingId: string | undefined;
    
    try {
      // 尝试从 profiles 表获取最新角色和停车场
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, status, parking_id')
        .eq('id', user.id)
        .single();
      
      if (profile) {
        // 检查 profiles 表中的用户状态
        if (profile.status === 'disabled') {
          throw new AccountDisabledError();
        }
        userRole = profile.role;
        userParkingId = profile.parking_id || undefined;
      }
    } catch (profileError) {
      // profiles 表查询失败时，使用 user_metadata 中的角色
      logger.debug('Failed to fetch profile, using metadata role', { error: profileError });
    }

    // 将用户信息注入请求对象（包含 parkingId 用于后续权限校验）
    req.user = {
      id: user.id,
      role: userRole as 'superadmin' | 'admin' | 'operator' | 'cashier',
      email: user.email || '',
      ...(userParkingId && { parkingId: userParkingId }),
    };

    next();
  } catch (error) {
    next(error);
  }
}
