// 统一配置管理 - 启动时 fail-fast 校验

import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  
  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  SUPABASE_JWT_SECRET: z.string().min(32),
  
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
