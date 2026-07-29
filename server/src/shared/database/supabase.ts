// Supabase 客户端单例
// 使用 Service Role Key 进行服务端操作（绕过 RLS）
// 包含查询性能日志、错误重试逻辑和事务支持

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../../config/index.js';
import { logger } from '../../shared/utils/logger.js';
import { InternalError } from '../types/errors.js';

let supabaseInstance: SupabaseClient | null = null;

// 慢查询阈值（毫秒）
const SLOW_QUERY_THRESHOLD_MS = 1000;
// 最大重试次数
const MAX_RETRIES = 1;

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

/**
 * 判断是否为可重试的错误（网络错误）
 */
function isRetryableError(error: any): boolean {
  if (!error) return false;
  // 网络错误、超时错误、连接错误
  const retryableCodes = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'NETWORK_ERROR', 'CONNECT_ERROR'];
  if (error.code && retryableCodes.includes(error.code)) return true;
  // Supabase 特定错误
  if (error.message && (
    error.message.includes('network') ||
    error.message.includes('timeout') ||
    error.message.includes('connection')
  )) return true;
  return false;
}

/**
 * 带重试机制的 Supabase 查询包装器
 * @param queryFn 查询函数
 * @param queryName 查询名称（用于日志）
 * @returns 查询结果
 */
export async function withRetry<T>(
  queryFn: () => PromiseLike<{ data: T | null; error: any }>,
  queryName: string = 'unknown_query',
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const startTime = Date.now();
    try {
      const { data, error } = await queryFn();
      const duration = Date.now() - startTime;

      // 记录慢查询
      if (duration > SLOW_QUERY_THRESHOLD_MS) {
        logger.warn('Slow query detected', {
          query: queryName,
          duration: `${duration}ms`,
          attempt: attempt + 1,
        });
      } else {
        logger.debug('Query executed', {
          query: queryName,
          duration: `${duration}ms`,
        });
      }

      if (error) {
        throw error;
      }

      return data as T;
    } catch (error: any) {
      lastError = error;

      // 检查是否可重试
      if (attempt < MAX_RETRIES && isRetryableError(error)) {
        logger.warn('Retryable error, retrying...', {
          query: queryName,
          attempt: attempt + 1,
          error: error.message || error.code,
        });
        // 等待一小段时间后重试
        await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
        continue;
      }

      // 不可重试的错误或已达重试上限
      break;
    }
  }

  // 包装最终错误
  const wrappedError = new InternalError(
    `Supabase query failed: ${queryName} - ${lastError?.message || 'Unknown error'}`,
  );
  wrappedError.stack = lastError?.stack;
  throw wrappedError;
}

/**
 * 测试数据库连接
 */
export async function testConnection(): Promise<boolean> {
  try {
    const startTime = Date.now();
    const supabase = getSupabase();
    const { error } = await supabase
      .from('parkings')
      .select('id')
      .limit(1);
    const duration = Date.now() - startTime;

    if (error) {
      logger.error('Database connection test failed', { error: error.message });
      return false;
    }

    logger.info('Database connection test succeeded', { duration: `${duration}ms` });
    return true;
  } catch (error: any) {
    logger.error('Database connection test error', { error: error.message });
    return false;
  }
}

// 便捷导出
export const supabase = getSupabase();
export default supabase;

// 导出 Supabase TypeScript 类型
export type { SupabaseClient };
