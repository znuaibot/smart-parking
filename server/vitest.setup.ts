// Vitest 环境变量注入
// 确保测试运行时 config 不会因缺少环境变量而失败

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key-min-20-chars!!';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key-min-20-chars!!';
process.env.DIRECT_DB_PASSWORD = process.env.DIRECT_DB_PASSWORD || 'test-password';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-min-20-chars!!';
process.env.SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || 'test-supabase-jwt-secret-min-32-chars-for-security!!';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
