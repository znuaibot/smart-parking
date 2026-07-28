// 计费规则模块路由
import { Router } from 'express';

export const billingRouter = Router();

// GET /api/v1/billing-rules
billingRouter.get('/', (req, res) => {
  res.json({ message: 'list billing rules - 待实现' });
});

// POST /api/v1/billing-rules
billingRouter.post('/', (req, res) => {
  res.json({ message: 'create billing rule - 待实现' });
});

// PUT /api/v1/billing-rules/:id
billingRouter.put('/:id', (req, res) => {
  res.json({ message: 'update billing rule - 待实现' });
});

// POST /api/v1/billing/calculate - 试算费用
billingRouter.post('/calculate', (req, res) => {
  res.json({ message: 'calculate billing - 待实现' });
});
