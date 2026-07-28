// 认证模块路由
import { Router } from 'express';
import { authController } from './auth.controller.js';
import { authenticate } from '../../middleware/authenticate.js';

export const authRouter = Router();

// POST /api/v1/auth/login - 登录（通过 Supabase Auth）
authRouter.post('/login', (req, res, next) => authController.login(req, res, next));

// POST /api/v1/auth/logout - 登出（需要认证）
authRouter.post('/logout', authenticate, (req, res, next) => authController.logout(req, res, next));

// POST /api/v1/auth/refresh - 刷新 Token
authRouter.post('/refresh', (req, res, next) => authController.refresh(req, res, next));

// GET /api/v1/auth/me - 获取当前用户（需要认证）
authRouter.get('/me', authenticate, (req, res, next) => authController.me(req, res, next));
