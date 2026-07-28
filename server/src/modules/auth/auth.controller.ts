// 认证控制器模块 - 处理 HTTP 请求和响应
// P1-E 修复：/me 直接返回 req.user，不重复调用 Supabase
// P1-F 修复：添加 Zod 输入校验

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authService, LoginDTO, RefreshTokenDTO, UserProfile } from './auth.service.js';
import { logger } from '../../shared/utils/logger.js';
import { UnauthorizedError, ValidationError } from '../../shared/types/errors.js';

// Zod schema 校验请求体（P1-F 修复）
const loginSchema = z.object({
  email: z.string().email('无效的邮箱格式'),
  password: z.string().min(6, '密码至少 6 位').max(128, '密码过长'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10, '刷新令牌无效'),
});

// 密码修改校验
const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, '原密码不能为空'),
  newPassword: z.string().min(6, '新密码至少 6 位').max(128, '新密码过长'),
});

// Request 类型已在 src/shared/types/express.d.ts 中全局声明

export class AuthController {
  /**
   * POST /api/v1/auth/login
   * 用户登录
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // P1-F: Zod 输入校验
      const validated = loginSchema.safeParse(req.body);
      if (!validated.success) {
        throw new ValidationError(
          validated.error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          }))
        );
      }

      const dto: LoginDTO = {
        email: validated.data.email.toLowerCase().trim(),
        password: validated.data.password,
      };

      const clientInfo = {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      };

      const result = await authService.login(dto, clientInfo);

      res.status(200).json({
        code: 'SUCCESS',
        message: '登录成功',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/logout
   * 用户登出
   */
  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authHeader = req.headers.authorization;
      let accessToken: string | undefined;
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        accessToken = authHeader.substring(7);
      }

      if (!accessToken) {
        throw new UnauthorizedError('缺少访问令牌');
      }

      const userId = req.user?.id;
      await authService.logout(accessToken, undefined, userId);

      res.status(200).json({
        code: 'SUCCESS',
        message: '登出成功',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/refresh
   * 刷新访问令牌
   */
  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // P1-F: Zod 输入校验
      const validated = refreshSchema.safeParse(req.body);
      if (!validated.success) {
        throw new ValidationError(
          validated.error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          }))
        );
      }

      const dto: RefreshTokenDTO = {
        refreshToken: validated.data.refreshToken,
      };

      const tokens = await authService.refreshToken(dto);

      res.status(200).json({
        code: 'SUCCESS',
        message: '令牌刷新成功',
        data: { tokens },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/auth/me
   * P1-E 修复：直接返回中间件注入的 req.user（无需二次查询）
   */
  async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('未认证');
      }

      // P1-E 修复：中间件已写入 req.user，直接返回（从 profiles 表获取）
      res.status(200).json({
        code: 'SUCCESS',
        message: '获取用户信息成功',
        data: {
          user: {
            id: req.user.id,
            email: req.user.email,
            role: req.user.role,
            parkingId: req.user.parkingId,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/v1/auth/password
   * 修改密码
   */
  async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('未认证');
      }

      const validated = changePasswordSchema.safeParse(req.body);
      if (!validated.success) {
        throw new ValidationError(
          validated.error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          }))
        );
      }

      await authService.changePassword(
        req.user.id,
        validated.data.oldPassword,
        validated.data.newPassword
      );

      res.status(200).json({
        code: 'SUCCESS',
        message: '密码修改成功',
      });
    } catch (error) {
      next(error);
    }
  }
}

// 单例导出
export const authController = new AuthController();
