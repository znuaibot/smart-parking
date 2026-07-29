// JWT 鉴权中间件 - 使用 Supabase Admin API 校验 Token
// P0 修复：替换占位逻辑，实现真正的 Token 验证 + 获取真实用户角色
// P1 修复：profiles 查询失败时拒绝访问，不再回退到 user_metadata
// P2-H 修复：改用 path-to-regexp 精确匹配白名单
// P2-I 修复：集成 Redis Token 黑名单
// P2-J 修复：添加 optionalAuth 中间件

import { Request, Response, NextFunction } from 'express';
import { supabase } from '../shared/database/supabase.js';
import { UnauthorizedError, TokenExpiredError, AccountDisabledError, ForbiddenError } from '../shared/types/errors.js';
import { logger, logAuthEvent } from '../shared/utils/logger.js';
import { RedisTokenBlacklist } from '../shared/utils/redis.js';

// 公开路径白名单（不需要鉴权）- 使用 RegExp 精确匹配
const PUBLIC_PATTERNS = [
  /^\/health$/,
  /^\/ready$/,
  /^\/api\/v1\/auth\/login$/,
  /^\/api\/v1\/auth\/refresh$/,
];

/**
 * 鉴权中间件
 * 使用 Supabase Admin API 验证 JWT Token，获取真实用户信息
 */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // 检查是否为白名单路径（精确匹配）
    const isPublicPath = PUBLIC_PATTERNS.some(pattern => pattern.test(req.path));
    
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

    // P2-I 修复：检查 Token 是否在黑名单中（Redis）
    const redis = await RedisTokenBlacklist.getInstance();
    if (await redis.isBlacklisted(token)) {
      logAuthEvent('failed', {
        ip: req.ip,
        reason: 'Token 已被注销',
      });
      throw new UnauthorizedError('令牌已被注销，请重新登录');
    }

    // 使用 Supabase Admin API 验证 Token（真正的验证）
    // 注意：Supabase v2 中 admin 端点类型可能不完整，使用类型断言兼容
    const { data, error } = await (supabase.auth.admin as any).getUser(token);

    if (error) {
      logger.warn('Token verification failed', {
        error: error.message,
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

    if (!data || !data.user) {
      throw new UnauthorizedError('用户不存在或令牌已失效');
    }

    const user = data.user;

    // P1-D 修复：banned_until 与当前时间比较（不是只判断字段存在）
    if (user.banned_until) {
      const bannedUntil = new Date(user.banned_until);
      if (bannedUntil > new Date()) {
        throw new AccountDisabledError('账号已被封禁至 ' + user.banned_until);
      }
    }

    // 从 profiles 表获取用户角色和停车场分配
    // ⚠️ P1 修复：profiles 不存在时拒绝访问，不回退到 user_metadata
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, status, parking_id, is_active')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      logger.warn('User profile not found, access denied', {
        userId: user.id,
        ip: req.ip,
      });
      throw new ForbiddenError('用户资料未找到，请联系管理员');
    }

    // 检查 profiles 表中的用户状态（使用 is_active 字段）
    if (profile.is_active === false || profile.status === 'disabled') {
      throw new AccountDisabledError('账号已被禁用，请联系管理员');
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

    logger.debug('User authenticated', {
      userId: user.id,
      role: profile.role,
      requestId: req.requestId,
    });

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * 可选鉴权中间件
 * 有 Token 则解析，没有也不阻止请求
 * P2-J 修复：添加 optionalAuth 用于需要识别用户但不需要强制登录的场景
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);

    const redis = await RedisTokenBlacklist.getInstance();
    if (await redis.isBlacklisted(token)) {
      return next();
    }

    const { data, error } = await (supabase.auth.admin as any).getOptionalUser(token);

    if (!error && data?.user) {
      // 从 profiles 表获取角色
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, parking_id')
        .eq('id', data.user.id)
        .single();

      req.user = {
        id: data.user.id,
        role: profile?.role || 'operator',
        email: data.user.email || '',
        ...(profile?.parking_id && { parkingId: profile.parking_id }),
      };
    }

    next();
  } catch {
    // 可选鉴权失败不阻止请求
    next();
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
 * P0-A 修复：显式拒绝 parkingId 为空的非管理员用户，防止短路绕过
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

  // P0-A 修复：显式拒绝 parkingId 为空的非管理员用户
  // 防止 cashier/operator 未分配停车场时短路放行
  if (!req.user.parkingId) {
    return next(new ForbiddenError('用户未分配停车场，无权操作'));
  }

  // 检查用户是否属于该停车场
  if (req.user.parkingId !== parkingId) {
    return next(new ForbiddenError('无权操作此停车场'));
  }

  next();
}
