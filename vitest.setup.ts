// Vitest 全局 setup - 注入测试环境变量
// 避免 config/index.ts 的 Zod schema 校验在测试环境失败

process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.HOST = '0.0.0.0';
process.env.LOG_LEVEL = 'error';
process.env.CORS_ORIGINS = '*';

// Supabase（config schema 必填字段，有最小长度要求）
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key-must-be-at-least-20-chars!!';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key-min-20-chars!!';
process.env.SUPABASE_JWT_SECRET = 'test-jwt-secret-minimum-32-characters-long!!';

// 数据库（可选但测试中可能需要）
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
