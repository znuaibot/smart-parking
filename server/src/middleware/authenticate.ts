// JWT 鉴权中间件 - 使用 Supabase Admin API 校验 Token
// P0 修复：替换占位逻辑，实现真正的 Token 验证 + 获取真实用户角色
// P1 修复：profiles 查询失败时拒绝访问，不再回退到 user_metadata

import { Request, Response, NextFunction } from 'express';
import { supabase } from '../shared/database/supabase.js';
import { UnauthorizedError, ForbiddenError, TokenExpiredError, AccountDisabledError } from '../shared/types/errors.js';
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
        ip: req.ip,
      });

      if (error.message?.includes('expired')) {
        throw new TokenExpiredError();
      }
      
      throw new UnauthorizedError('无效的访问令牌');
    }

    if (!data || !data.user) {
      throw new UnauthorizedError('用户不存在或令牌已失效');
    }

    const user = data.user;

    // 检查用户是否被禁用（Supabase 的 banned_until 字段）
    if (user.banned_until) {
      throw new AccountDisabledError();
    }

    // 从 profiles 表获取用户角色和停车场分配
    // ⚠️ P1 修复：profiles 不存在时拒绝访问，不回退到 user_metadata
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, status, parking_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      logger.warn('User profile not found, access denied', {
        userId: user.id,
        ip: req.ip,
      });
      throw new ForbiddenError('用户资料未找到，请联系管理员');
    }

    // 检查 profiles 表中的用户状态
    if (profile.status === 'disabled') {
      throw new AccountDisabledError();
    }

    // 验证角色合法性
    const allowedRoles = ['superadmin', 'admin', 'operator', 'cashier'];
    if (!allowedRoles.includes(profile.role)) {
      throw new ForbiddenError('无效的用户角色');
    }

    // 将用户信息注入请求对象（包含 parkingId 用于后续权限校验）
    req.user = {
      id: user.id,
      role: profile.role as 'superadmin' | 'admin' | 'operator' | 'cashier',
      email: user.email || '',
      parkingId: profile.parking_id || undefined,
    };

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * 角色权限校验中间件工厂
 * @param allowedRoles 允许访问的角色列表
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('未认证'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new ForbiddenError(`需要 ${allowedRoles.join('/')} 权限`));
    }

    next();
  };
}

/**
 * 停车场权限校验中间件
 * 校验当前用户是否有权限操作指定的停车场
 */
export function requireParkingAccess(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) {
    return next(new UnauthorizedError('未认证'));
  }

  // superadmin 和 admin 可以操作所有停车场
  if (req.user.role === 'superadmin' || req.user.role === 'admin') {
    return next();
  }

  // 从请求中获取 parkingId
  const parkingId = req.params.id || req.params.parkingId || req.body.parkingId || req.query.parkingId;

  if (!parkingId) {
    return next(new ForbiddenError('缺少停车场 ID'));
  }

  // 检查用户是否属于该停车场
  if (req.user.parkingId && req.user.parkingId !== parkingId) {
    return next(new ForbiddenError('无权操作此停车场'));
  }

  next();
}
