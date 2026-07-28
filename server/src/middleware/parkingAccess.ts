// P0-5: 业务级停车场访问权限校验
// 
// 问题：Supabase Service Role Key 完全绕过 RLS，使得数据库 RLS 策略形同虚设
// 解决：在应用层添加业务级权限校验，确保用户只能访问其有权限的停车场数据

import { Request, Response, NextFunction } from 'express';
import { supabase } from '../shared/database/supabase.js';
import { ForbiddenError, UnauthorizedError } from '../shared/types/errors.js';
import { logger } from '../shared/utils/logger.js';

/**
 * 检查用户对指定停车场的访问权限（供代码中直接调用）
 */
export async function checkParkingAccess(userId: string, userRole: string, targetParkingId: string): Promise<boolean> {
  // 超级管理员和管理员可以访问所有停车场
  if (userRole === 'superadmin' || userRole === 'admin') {
    return true;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('parking_id, role')
    .eq('id', userId)
    .single();

  if (!profile) return false;

  return profile.parking_id === targetParkingId;
}

/**
 * 停车场访问权限中间件工厂
 * 确保当前用户只能操作自己有权限的停车场数据
 * 
 * 使用方式：
 * - requireParkingAccess() - 从 req.params.parkingId 获取停车场 ID
 * - requireParkingAccess('parkingId') - 从指定参数名获取
 * - requireParkingAccessFromBody('parkingId') - 从请求体获取
 */
export function requireParkingAccess(paramName: string = 'parkingId') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // 1. 检查用户是否已认证
      if (!req.user) {
        throw new UnauthorizedError('请先登录');
      }

      const user = req.user;
      const userRole = user.role as string;

      // 2. 超级管理员和管理员可以访问所有停车场
      if (userRole === 'superadmin' || userRole === 'admin') {
        return next();
      }

      // 3. 获取目标停车场 ID（从 params 或 body）
      const targetParkingId = req.params[paramName] || req.body[paramName] || req.query[paramName];

      if (!targetParkingId) {
        // 如果没有指定停车场 ID，允许通过（后续由 RLS 或查询结果控制）
        return next();
      }

      // 4. 优先使用 req.user 中已有的 parkingId，否则查询数据库
      let userParkingId = user.parkingId;

      if (!userParkingId && userRole !== 'superadmin' && userRole !== 'admin') {
        const { data: profile } = await supabase
          .from('profiles')
          .select('parking_id')
          .eq('id', user.id)
          .single();

        userParkingId = profile?.parking_id || undefined;
      }

      // 5. 校验用户是否属于目标停车场
      if (!userParkingId) {
        logger.warn('User has no parking assignment', { userId: user.id, targetParkingId });
        throw new ForbiddenError('您未被分配到任何停车场，无法执行此操作');
      }

      if (userParkingId !== targetParkingId) {
        logger.warn('Cross-parking access denied', {
          userId: user.id,
          userParkingId,
          targetParkingId,
        });
        throw new ForbiddenError('您没有权限访问该停车场的数据');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * 从请求体获取停车场 ID 的权限校验
 */
export function requireParkingAccessFromBody(fieldName: string = 'parkingId') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('请先登录');
      }

      const user = req.user;
      const userRole = user.role as string;

      // 超级管理员和管理员可以访问所有停车场
      if (userRole === 'superadmin' || userRole === 'admin') {
        return next();
      }

      const targetParkingId = req.body[fieldName];

      if (!targetParkingId) {
        return next();
      }

      // 优先使用 req.user 中已有的 parkingId，避免重复查询
      let userParkingId = user.parkingId;

      if (!userParkingId) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('parking_id')
          .eq('id', user.id)
          .single();

        userParkingId = profile?.parking_id || undefined;
      }

      if (!userParkingId || userParkingId !== targetParkingId) {
        logger.warn('Cross-parking access denied (from body)', {
          userId: user.id,
          userParkingId,
          targetParkingId,
        });
        throw new ForbiddenError('您没有权限访问该停车场的数据');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
