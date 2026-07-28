// 统一配置管理 - 启动时 fail-fast 校验
// 包含数据库连接测试、Redis 健康检查

import { z } from 'zod';
import { logger } from '../shared/utils/logger.js';

// Redis 客户端（可选）
let redisClient: any = null;

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  
  // Supabase（@supabase/supabase-js 只需要 URL + Keys，不需要数据库密码）
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  SUPABASE_JWT_SECRET: z.string().min(32),
  
  // P1-G 修复：重命名为 DIRECT_DB_PASSWORD，仅用于直连 PostgreSQL 的场景
  // 若无直连 migrations/批量导入需求，可删除此变量
  DIRECT_DB_PASSWORD: z.string().optional(),
  
  // Redis (可选)
  REDIS_URL: z.string().url().optional(),
  REDIS_HOST: z.string().optional(),
  REDIS_PORT: z.coerce.number().optional(),
  REDIS_PASSWORD: z.string().optional(),
  
  // 外部服务
  LPR_API_URL: z.string().url().optional(),
  LPR_API_KEY: z.string().optional(),
  
  // 支付
  WECHAT_PAY_MCH_ID: z.string().optional(),
  WECHAT_PAY_API_KEY: z.string().optional(),
  ALIPAY_APP_ID: z.string().optional(),
  
  // CORS
  CORS_ORIGINS: z.string().default('http://localhost:5173').transform(s => s.split(',')),
  
  // 日志
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

// 解析并校验环境变量
export const config = EnvSchema.parse(process.env);

// 便捷访问器
export const isDev = config.NODE_ENV === 'development';
export const isProd = config.NODE_ENV === 'production';
export const isTest = config.NODE_ENV === 'test';

// 类型导出
export type Config = z.infer<typeof EnvSchema>;

/**
 * 测试数据库连接
 * @returns 连接是否成功
 */
export async function testDbConnection(): Promise<boolean> {
  const { testConnection } = await import('../shared/database/supabase.js');
  return testConnection();
}

/**
 * 获取 Redis 客户端（懒加载）
 */
export async function getRedisClient(): Promise<any> {
  if (redisClient) return redisClient;
  
  if (!config.REDIS_URL && !config.REDIS_HOST) {
    logger.warn('Redis is not configured');
    return null;
  }
  
  try {
    const Redis = (await import('ioredis')).default;
    redisClient = new Redis(config.REDIS_URL || {
      host: config.REDIS_HOST,
      port: config.REDIS_PORT || 6379,
      password: config.REDIS_PASSWORD,
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        if (times > 3) return null;
        return Math.min(times * 200, 1000);
      },
    });
    
    redisClient.on('connect', () => logger.info('Redis connected'));
    redisClient.on('error', (err: Error) => logger.error('Redis error', { error: err.message }));
    
    return redisClient;
  } catch (error: any) {
    logger.error('Failed to initialize Redis', { error: error.message });
    return null;
  }
}

/**
 * 测试 Redis 连接
 * @returns 连接是否成功
 */
export async function testRedisConnection(): Promise<boolean> {
  try {
    const redis = await getRedisClient();
    if (!redis) return false;
    
    const startTime = Date.now();
    await redis.ping();
    const duration = Date.now() - startTime;
    
    logger.info('Redis connection test succeeded', { duration: `${duration}ms` });
    return true;
  } catch (error: any) {
    logger.error('Redis connection test failed', { error: error.message });
    return false;
  }
}

/**
 * 关闭所有连接（优雅关闭用）
 */
export async function closeConnections(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    logger.info('Redis connection closed');
    redisClient = null;
  }
}
