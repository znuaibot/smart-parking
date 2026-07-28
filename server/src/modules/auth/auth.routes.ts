// 认证模块路由
// P1-F 修复：添加登录限流、密码修改端点
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authController } from './auth.controller.js';
import { authenticate } from '../../middleware/authenticate.js';

export const authRouter = Router();

// P1-F: 登录限流（10 次/15 分钟/IP）
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分钟
  max: 10, // 最多 10 次
  message: {
    code: 'TOO_MANY_REQUESTS',
    message: '登录尝试次数过多，请 15 分钟后再试',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/v1/auth/login - 登录（通过 Supabase Auth，带限流）
authRouter.post('/login', loginLimiter, (req, res, next) => authController.login(req, res, next));

// POST /api/v1/auth/logout - 登出（需要认证）
authRouter.post('/logout', authenticate, (req, res, next) => authController.logout(req, res, next));

// POST /api/v1/auth/refresh - 刷新 Token
authRouter.post('/refresh', (req, res, next) => authController.refresh(req, res, next));

// GET /api/v1/auth/me - 获取当前用户（需要认证）
authRouter.get('/me', authenticate, (req, res, next) => authController.me(req, res, next));

// PUT /api/v1/auth/password - 修改密码（需要认证）
authRouter.put('/password', authenticate, (req, res, next) => authController.changePassword(req, res, next));
