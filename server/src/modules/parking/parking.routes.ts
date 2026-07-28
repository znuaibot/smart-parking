// 停车场模块路由
import { Router } from 'express';

export const parkingRouter = Router();

// GET /api/v1/parkings
parkingRouter.get('/', (req, res) => {
  res.json({ message: 'list parkings - 待实现' });
});

// POST /api/v1/parkings
parkingRouter.post('/', (req, res) => {
  res.json({ message: 'create parking - 待实现' });
});

// GET /api/v1/parkings/:id
parkingRouter.get('/:id', (req, res) => {
  res.json({ message: 'get parking - 待实现' });
});

// PUT /api/v1/parkings/:id
parkingRouter.put('/:id', (req, res) => {
  res.json({ message: 'update parking - 待实现' });
});

// DELETE /api/v1/parkings/:id
parkingRouter.delete('/:id', (req, res) => {
  res.json({ message: 'delete parking - 待实现' });
});

// GET /api/v1/parkings/:id/spaces
parkingRouter.get('/:id/spaces', (req, res) => {
  res.json({ message: 'list spaces - 待实现' });
});

// POST /api/v1/parkings/:id/spaces/batch
parkingRouter.post('/:id/spaces/batch', (req, res) => {
  res.json({ message: 'batch create spaces - 待实现' });
});
