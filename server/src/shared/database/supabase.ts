// Supabase 客户端单例
// 提供两种客户端：
// 1. serviceRoleClient - 用于鉴权、RPC 调用等后台操作（绕过 RLS）
// 2. anonClient - 用于需要 RLS 保护的操作（使用用户 JWT）

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../../config/index.js';
import { logger } from '../../shared/utils/logger.js';

let serviceRoleClient: SupabaseClient | null = null;
let anonClient: SupabaseClient | null = null;

/**
 * 获取 Supabase Service Role 客户端
 * 用于：鉴权校验、RPC 调用等后台操作
 * ⚠️ 绕过所有 RLS，请确保只在可信的服务端代码中使用
 */
export function getSupabase(): SupabaseClient {
  if (!serviceRoleClient) {
    serviceRoleClient = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      db: {
        schema: 'public',
      },
    });
    logger.info('Supabase service role client initialized');
  }
  return serviceRoleClient;
}

/**
 * 获取 Supabase Anon 客户端（使用用户 JWT）
 * 用于：需要 RLS 保护的客户端查询
 * 受数据库行级安全策略约束
 */
export function getAnonClient(userToken?: string): SupabaseClient {
  if (!anonClient) {
    anonClient = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      db: {
        schema: 'public',
      },
      global: userToken
        ? { headers: { Authorization: `Bearer ${userToken}` } }
        : undefined,
    });
  } else if (userToken) {
    // 更新 token
    anonClient = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      db: {
        schema: 'public',
      },
      global: { headers: { Authorization: `Bearer ${userToken}` } },
    });
  }
  return anonClient;
}

/**
 * 重置客户端实例（用于测试）
 */
export function resetClients(): void {
  serviceRoleClient = null;
  anonClient = null;
}

// 便捷导出（默认使用 service role）
export const supabase = getSupabase();
export default supabase;
