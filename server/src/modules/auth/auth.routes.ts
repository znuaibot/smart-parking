// 认证模块路由
import { Router } from 'express';

export const authRouter = Router();

// POST /api/v1/auth/login - 登录（通过 Supabase Auth）
authRouter.post('/login', (req, res) => {
  res.json({ message: 'login endpoint - 待实现' });
});

// POST /api/v1/auth/logout - 登出
authRouter.post('/logout', (req, res) => {
  res.json({ message: 'logout endpoint - 待实现' });
});

// POST /api/v1/auth/refresh - 刷新 Token
authRouter.post('/refresh', (req, res) => {
  res.json({ message: 'refresh endpoint - 待实现' });
});

// GET /api/v1/auth/me - 获取当前用户
authRouter.get('/me', (req, res) => {
  res.json({ message: 'me endpoint - 待实现' });
});

// PUT /api/v1/auth/password - 修改密码
authRouter.put('/password', (req, res) => {
  res.json({ message: 'password endpoint - 待实现' });
});
