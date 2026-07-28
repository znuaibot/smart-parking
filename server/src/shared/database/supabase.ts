// Supabase 客户端单例
// 使用 Service Role Key 进行服务端操作（绕过 RLS）

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../../config/index.js';
import { logger } from '../../shared/utils/logger.js';

let supabaseInstance: SupabaseClient | null = null;

/**
 * 获取 Supabase 客户端（服务端）
 * 使用 Service Role Key，拥有完全权限
 * 仅在服务端使用，禁止暴露给客户端
 */
export function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    supabaseInstance = createClient(
      config.SUPABASE_URL,
      config.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
        db: {
          schema: 'public',
        },
      }
    );
    logger.info('Supabase client initialized (service role)');
  }
  return supabaseInstance;
}

// 便捷导出
export const supabase = getSupabase();
export default supabase;
