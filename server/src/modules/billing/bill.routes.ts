// 账单模块路由
import { Router } from 'express';

export const billRouter = Router();

// GET /api/v1/bills - 账单列表
billRouter.get('/', (req, res) => {
  res.json({ message: 'list bills - 待实现' });
});

// GET /api/v1/bills/:id - 账单详情
billRouter.get('/:id', (req, res) => {
  res.json({ message: 'bill detail - 待实现' });
});

// POST /api/v1/bills/:id/pay - 发起支付
billRouter.post('/:id/pay', (req, res) => {
  res.json({ message: 'pay bill - 待实现' });
});

// POST /api/v1/payments/callback/wechat - 微信支付回调
billRouter.post('/callback/wechat', (req, res) => {
  res.json({ message: 'wechat callback - 待实现' });
});

// POST /api/v1/payments/callback/alipay - 支付宝回调
billRouter.post('/callback/alipay', (req, res) => {
  res.json({ message: 'alipay callback - 待实现' });
});
