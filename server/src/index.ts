// 停车场管理系统 - 后端服务入口
// 架构分层: Controller → Service → Repository

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config, isTest } from './config/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestId } from './middleware/requestId.js';
import { authenticate } from './middleware/authenticate.js';
import { rateLimiter } from './middleware/rateLimiter.js';

// 路由导入
import { authRouter } from './modules/auth/auth.routes.js';
import { parkingRouter } from './modules/parking/parking.routes.js';
import { spaceRouter } from './modules/parking/space.routes.js';
import { vehicleRouter } from './modules/vehicle/vehicle.routes.js';
import { billingRouter } from './modules/billing/billing.routes.js';
import { billRouter } from './modules/billing/bill.routes.js';
import { statsRouter } from './modules/stats/stats.routes.js';

const app = express();

// ==================== 全局中间件 ====================
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({
  origin: config.CORS_ORIGINS,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestId);
app.use(morgan(isTest ? 'dev' : 'combined'));
app.use(rateLimiter);

// ==================== 健康检查 ====================
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    requestId: req.requestId,
  });
});

app.get('/ready', async (req, res) => {
  // TODO: 检查数据库连接
  res.json({ status: 'ready' });
});

// ==================== API 路由 ====================
const API_PREFIX = '/api/v1';

// 公开路由（无需鉴权）
app.use(`${API_PREFIX}/auth`, authRouter);

// 受保护路由（需要鉴权）
app.use(`${API_PREFIX}/parkings`, authenticate, parkingRouter);
app.use(`${API_PREFIX}/parking-spaces`, authenticate, spaceRouter);
app.use(`${API_PREFIX}/vehicles`, authenticate, vehicleRouter);
app.use(`${API_PREFIX}/vehicle-entry`, authenticate, vehicleRouter);
app.use(`${API_PREFIX}/vehicle-exit`, authenticate, vehicleRouter);
app.use(`${API_PREFIX}/vehicle-records`, authenticate, vehicleRouter);
app.use(`${API_PREFIX}/billing-rules`, authenticate, billingRouter);
app.use(`${API_PREFIX}/billing`, authenticate, billingRouter);
app.use(`${API_PREFIX}/bills`, authenticate, billRouter);
app.use(`${API_PREFIX}/stats`, authenticate, statsRouter);

// ==================== 错误处理 ====================
app.use(notFoundHandler);
app.use(errorHandler);

// ==================== 启动服务 ====================
const server = app.listen(config.PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║     🚗  智能停车服务 - Smart Parking Server           ║
║                                                       ║
║   Environment: ${config.NODE_ENV.padEnd(36)} ║
║   Port:        ${config.PORT.toString().padEnd(36)} ║
║   API:         http://localhost:${config.PORT}/api/v1${' '.repeat(13)}║
╚═══════════════════════════════════════════════════════╝
  `);
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;
