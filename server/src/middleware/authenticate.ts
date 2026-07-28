// JWT 鉴权中间件 - 校验 Supabase JWT Token 并查询真实用户角色

import { Request, Response, NextFunction } from 'express';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UnauthorizedError, ForbiddenError } from '../shared/types/errors.js';
import { config } from '../config/index.js';
import { logger } from '../shared/utils/logger.js';

// Supabase Admin 客户端（用于校验 token，service role 仅此用途）
let adminClient: SupabaseClient | null = null;

function getAdminClient(): SupabaseClient {
  if (!adminClient) {
    adminClient = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return adminClient;
}

/**
 * 已认证的用户信息
 */
export interface AuthUser {
  id: string;
  email?: string;
  role: 'admin' | 'operator' | 'viewer';
  parkingId?: string;
}

// 扩展 Express Request 类型
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * JWT 鉴权中间件
 * 1. 校验 Bearer Token
 * 2. 通过 Supabase API 验证 token 有效性
 * 3. 从 profiles 表查询用户角色和所属停车场
 */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('缺少访问令牌');
    }

    const token = authHeader.substring(7);

    // 基础格式校验
    if (token.length < 20) {
      throw new UnauthorizedError('无效令牌格式');
    }

    // 使用 Supabase Admin API 校验 token 并获取用户信息
    const { data, error } = await getAdminClient().auth.getUser(token);

    if (error || !data.user) {
      throw new UnauthorizedError('令牌无效或已过期');
    }

    const userId = data.user.id;

    // 从 profiles 表查询用户角色和权限
    const { data: profile, error: profileError } = await getAdminClient()
      .from('profiles')
      .select('id, role, parking_id')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      // 用户没有 profile 记录，默认为 viewer 角色
      logger.warn('User has no profile record', { userId });
      req.user = {
        id: userId,
        email: data.user.email,
        role: 'viewer',
      };
    } else {
      req.user = {
        id: profile.id,
        email: data.user.email,
        role: profile.role,
        parkingId: profile.parking_id,
      };
    }

    next();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      next(error);
    } else {
      logger.error('Authentication error', { error });
      next(new UnauthorizedError('认证失败'));
    }
  }
}

/**
 * 角色权限校验中间件工厂
 * @param allowedRoles 允许访问的角色列表
 */
export function requireRole(...allowedRoles: AuthUser['role'][]) {
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

  // admin 可以操作所有停车场
  if (req.user.role === 'admin') {
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
