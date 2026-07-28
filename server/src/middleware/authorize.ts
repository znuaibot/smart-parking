// RBAC 权限中间件 - 基于角色的访问控制

import { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from '../shared/types/errors.js';
import { logger } from '../shared/utils/logger.js';

// ==================== 类型定义 ====================

// 用户角色枚举（与数据库 user_role 枚举对应）
export type UserRole = 'superadmin' | 'admin' | 'operator' | 'cashier';

// 权限枚举
export type Permission =
  // 停车场管理
  | 'parking:create'
  | 'parking:read'
  | 'parking:update'
  | 'parking:delete'
  // 车位管理
  | 'space:create'
  | 'space:read'
  | 'space:update'
  | 'space:delete'
  // 车辆管理
  | 'vehicle:entry'
  | 'vehicle:exit'
  | 'vehicle:read'
  // 计费管理
  | 'billing:create'
  | 'billing:read'
  | 'billing:update'
  | 'billing:delete'
  // 账单管理
  | 'bill:read'
  | 'bill:pay'
  | 'bill:refund'
  // 统计报表
  | 'stats:read'
  | 'stats:export'
  // 用户管理
  | 'user:create'
  | 'user:read'
  | 'user:update'
  | 'user:delete'
  // 系统设置
  | 'system:config'
  | 'system:logs';

// 角色层级（数字越大权限越高）
const ROLE_HIERARCHY: Record<UserRole, number> = {
  cashier: 1,
  operator: 2,
  admin: 3,
  superadmin: 4,
};

// 角色权限映射
const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  superadmin: [
    'parking:create', 'parking:read', 'parking:update', 'parking:delete',
    'space:create', 'space:read', 'space:update', 'space:delete',
    'vehicle:entry', 'vehicle:exit', 'vehicle:read',
    'billing:create', 'billing:read', 'billing:update', 'billing:delete',
    'bill:read', 'bill:pay', 'bill:refund',
    'stats:read', 'stats:export',
    'user:create', 'user:read', 'user:update', 'user:delete',
    'system:config', 'system:logs',
  ],
  admin: [
    'parking:create', 'parking:read', 'parking:update',
    'space:create', 'space:read', 'space:update',
    'vehicle:entry', 'vehicle:exit', 'vehicle:read',
    'billing:create', 'billing:read', 'billing:update',
    'bill:read', 'bill:pay', 'bill:refund',
    'stats:read', 'stats:export',
    'user:read', 'user:update',
  ],
  operator: [
    'parking:read',
    'space:read',
    'vehicle:entry', 'vehicle:exit', 'vehicle:read',
    'billing:read',
    'bill:read', 'bill:pay',
    'stats:read',
  ],
  cashier: [
    'parking:read',
    'space:read',
    'vehicle:read',
    'bill:read', 'bill:pay',
  ],
};

// ==================== RBAC 中间件 ====================

/**
 * 角色权限校验中间件
 * @param requiredRole 最低要求的角色
 * 
 * 使用方式：
 * - authorize('admin') - 仅 admin 及以上角色可访问
 * - authorize('superadmin') - 仅超级管理员可访问
 */
export function authorize(requiredRole: UserRole) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // 检查用户是否已认证
      if (!req.user) {
        throw new UnauthorizedError('请先登录');
      }

      const userRole = req.user.role as UserRole;
      const userRoleLevel = ROLE_HIERARCHY[userRole];
      const requiredRoleLevel = ROLE_HIERARCHY[requiredRole];

      if (userRoleLevel === undefined) {
        logger.warn('Unknown user role', { role: userRole, userId: req.user.id });
        throw new ForbiddenError('未知的用户角色');
      }

      // 检查角色级别是否足够
      if (userRoleLevel < requiredRoleLevel) {
        logger.warn('Insufficient role level', {
          userId: req.user.id,
          userRole,
          requiredRole,
          url: req.originalUrl,
        });
        throw new ForbiddenError(`需要 ${requiredRole} 或更高权限`);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * 权限校验中间件（细粒度）
 * @param permissions 所需权限列表
 * @param mode 校验模式：'all' 需要所有权限，'any' 需要任一权限
 * 
 * 使用方式：
 * - authorizePermissions(['parking:create'])
 * - authorizePermissions(['parking:read', 'space:read'], 'any')
 */
export function authorizePermissions(
  permissions: Permission[],
  mode: 'all' | 'any' = 'all',
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('请先登录');
      }

      const userRole = req.user.role as UserRole;
      const userPermissions = ROLE_PERMISSIONS[userRole] || [];

      let hasPermission: boolean;

      if (mode === 'all') {
        // 需要所有权限
        hasPermission = permissions.every(p => userPermissions.includes(p));
      } else {
        // 需要任一权限
        hasPermission = permissions.some(p => userPermissions.includes(p));
      }

      if (!hasPermission) {
        logger.warn('Permission denied', {
          userId: req.user.id,
          userRole,
          requiredPermissions: permissions,
          url: req.originalUrl,
        });
        throw new ForbiddenError('权限不足');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * 资源所有者校验中间件
 * 检查当前用户是否为资源所有者或管理员
 * 
 * 使用方式：
 * - authorizeOwner(() => req.params.userId)
 */
export function authorizeOwner(getOwnerId: (req: Request) => string | undefined) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('请先登录');
      }

      const ownerId = getOwnerId(req);
      const userRole = req.user.role as UserRole;

      // 管理员可以访问任何资源
      if (userRole === 'superadmin' || userRole === 'admin') {
        return next();
      }

      // 检查是否为资源所有者
      if (ownerId && req.user.id !== ownerId) {
        throw new ForbiddenError('只能操作自己的资源');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * 超级管理员快捷中间件
 */
export const requireSuperAdmin = authorize('superadmin');

/**
 * 管理员快捷中间件
 */
export const requireAdmin = authorize('admin');

/**
 * 操作员快捷中间件
 */
export const requireOperator = authorize('operator');

// 导出工具函数
export { ROLE_HIERARCHY, ROLE_PERMISSIONS };
