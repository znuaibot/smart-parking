// 认证控制器模块 - 处理 HTTP 请求和响应

import { Request, Response, NextFunction } from 'express';
import { authService, LoginDTO, RefreshTokenDTO } from './auth.service.js';
import { logger } from '../../shared/utils/logger.js';
import { UnauthorizedError } from '../../shared/types/errors.js';

export class AuthController {
  /**
   * POST /api/v1/auth/login
   * 用户登录
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto: LoginDTO = {
        email: req.body.email,
        password: req.body.password,
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
      await authService.logout(accessToken, userId);

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
      const dto: RefreshTokenDTO = {
        refreshToken: req.body.refreshToken,
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
   * 获取当前用户信息
   */
  async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authHeader = req.headers.authorization;
      let accessToken: string | undefined;
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        accessToken = authHeader.substring(7);
      }

      if (!accessToken) {
        throw new UnauthorizedError('缺少访问令牌');
      }

      const user = await authService.getCurrentUser(accessToken);

      res.status(200).json({
        code: 'SUCCESS',
        message: '获取用户信息成功',
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }
}

// 单例导出
export const authController = new AuthController();
