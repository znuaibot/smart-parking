// JWT 鉴权中间件 - 使用 Supabase Admin API 校验 Token
// P0-A 修复：从 profiles 表获取真实角色，不信任 user_metadata
// P1-D 修复：banned_until 与当前时间比较

import { Request, Response, NextFunction } from 'express';
import { supabase } from '../shared/database/supabase.js';
import { UnauthorizedError, TokenExpiredError, AccountDisabledError, ForbiddenError } from '../shared/types/errors.js';
import { logger, logAuthEvent } from '../shared/utils/logger.js';
import { RedisTokenBlacklist } from '../shared/utils/redis.js';
import { pathToRegexp } from 'path-to-regexp';

// 公开路径白名单（不需要鉴权）- P2-H 修复：改用 path-to-regexp 精确匹配
const PUBLIC_PATTERNS = [
  /^\/health$/,
  /^\/ready$/,
  /^\/api\/v1\/auth\/login$/,
  /^\/api\/v1\/auth\/refresh$/,
].map(pattern => pathToRegexp(pattern));

/**
 * 鉴权中间件
 * 使用 Supabase Admin API 验证 JWT Token
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
      throw new UnauthorizedError('缺少访问令牌');
    }

    const token = authHeader.substring(7);

    // 检查 Token 是否在黑名单中（Redis）
    const redis = await RedisTokenBlacklist.getInstance();
    if (await redis.isBlacklisted(token)) {
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

    // P1-D 修复：banned_until 与当前时间比较（不是只判断字段存在）
    const isBanned = data.user.banned_until && new Date(data.user.banned_until) > new Date();
    if (isBanned) {
      throw new AccountDisabledError('账号已被封禁至 ' + data.user.banned_until);
    }

    // P0-A 修复：从 profiles 表获取真实角色，不信任 user_metadata
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, parking_id, is_active')
      .eq('id', data.user.id)
      .single();

    if (profileError || !profile) {
      // profiles 表中无记录，拒绝访问（不降级为 operator）
      logger.warn('User has no profile record', { userId: data.user.id });
      throw new ForbiddenError('用户档案不存在，请联系管理员');
    }

    // 检查 profiles 表中的用户状态
    if (!profile.is_active) {
      throw new AccountDisabledError('账号已被禁用，请联系管理员');
    }

    // 验证角色合法性
    const validRoles = ['superadmin', 'admin', 'operator', 'cashier'];
    if (!validRoles.includes(profile.role)) {
      logger.warn('Invalid role in profile', { role: profile.role, userId: data.user.id });
      throw new ForbiddenError('无效的用户角色');
    }

    // 将用户信息注入请求对象（从 profiles 表获取的真实角色）
    req.user = {
      id: data.user.id,
      role: profile.role,
      email: data.user.email || '',
      ...(profile.parking_id && { parkingId: profile.parking_id }),
    };

    logger.debug('User authenticated', {
      userId: data.user.id,
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

    const { data, error } = await supabase.auth.getUser(token);

    if (!error && data.user) {
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
