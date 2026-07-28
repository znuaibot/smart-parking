// Redis 工具模块 - Token 黑名单（生产级实现）
// P0-B 修复：用 Redis 替代内存 Set，支持多实例共享和 TTL 自动过期

import Redis from 'ioredis';
import { config } from '../../config/index.js';
import { logger } from './logger.js';
import crypto from 'crypto';

// Redis key 前缀
const BLACKLIST_KEY_PREFIX = 'token:blacklist:';
const USER_SESSIONS_PREFIX = 'user:sessions:';

/**
 * Token 黑名单管理器
 * 使用 Redis 存储，TTL 自动过期
 */
export class RedisTokenBlacklist {
  private static instance: RedisTokenBlacklist | null = null;
  private client: Redis | null = null;
  private connected = false;
  private configured = false; // 标记是否配置了 Redis

  private constructor() {}

  /**
   * 获取单例实例
   */
  static async getInstance(): Promise<RedisTokenBlacklist> {
    if (!RedisTokenBlacklist.instance) {
      RedisTokenBlacklist.instance = new RedisTokenBlacklist();
      await RedisTokenBlacklist.instance.init();
    }
    return RedisTokenBlacklist.instance;
  }

  /**
   * 初始化 Redis 连接
   */
  private async init(): Promise<void> {
    if (this.connected) return;

    try {
      if (config.REDIS_URL) {
        this.configured = true;
        this.client = new Redis(config.REDIS_URL, {
          maxRetriesPerRequest: 3,
          retryStrategy(times: number) {
            if (times > 3) return null;
            return Math.min(times * 200, 1000);
          },
        });
      } else if (config.REDIS_HOST) {
        this.configured = true;
        this.client = new Redis({
          host: config.REDIS_HOST,
          port: config.REDIS_PORT || 6379,
          password: config.REDIS_PASSWORD,
          maxRetriesPerRequest: 3,
          retryStrategy(times: number) {
            if (times > 3) return null;
            return Math.min(times * 200, 1000);
          },
        });
      } else {
        logger.warn('Redis not configured, token blacklist disabled (dev mode)');
        return;
      }

      this.client.on('connect', () => {
        this.connected = true;
        logger.info('Redis connected');
      });

      this.client.on('error', (err) => {
        logger.error('Redis error', { error: err.message });
        this.connected = false;
      });

      // 测试连接
      await this.client.ping();
      this.connected = true;
    } catch (error: any) {
      logger.error('Failed to initialize Redis', { error: error.message });
      this.client = null;
      this.connected = false;
    }
  }

  /**
   * 生成 token 摘要（不存储完整 token）
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * 将 Token 加入黑名单
   * @param token JWT Token
   * @param ttlSeconds TTL（秒），默认 24 小时
   * @throws ServiceUnavailableError 当 Redis 配置了但连接失败时抛出
   */
  async blacklistToken(token: string, ttlSeconds: number = 86400): Promise<void> {
    if (!this.connected || !this.client) {
      // P2-A 修复：Redis 配置了但连接失败时，不能静默跳过黑名单操作
      // 抛出异常让调用方感知，避免已注销 token 仍可使用
      if (this.configured) {
        throw new Error('Redis 连接不可用，无法将 Token 加入黑名单');
      }
      // Redis 未配置时的降级处理（仅开发环境）
      logger.warn('Redis not configured, blacklist operation skipped (dev mode only)');
      return;
    }

    const key = BLACKLIST_KEY_PREFIX + this.hashToken(token);
    await this.client.setex(key, ttlSeconds, '1');
  }

  /**
   * 检查 Token 是否在黑名单中
   * P2-A 修复：Redis 不可用时返回 true（安全默认：假设 token 可能被黑名单）
   */
  async isBlacklisted(token: string): Promise<boolean> {
    if (!this.connected || !this.client) {
      // Redis 配置了但连接失败时，返回 true（安全默认值）
      // 宁可拒绝合法请求，也不能放行可能已注销的 token
      if (this.configured) {
        logger.warn('Redis unavailable, assuming token is blacklisted (fail-closed)');
        return true;
      }
      return false;
    }

    const key = BLACKLIST_KEY_PREFIX + this.hashToken(token);
    const result = await this.client.exists(key);
    return result === 1;
  }

  /**
   * 同时黑名单 Access Token 和 Refresh Token
   */
  async blacklistTokenPair(
    accessToken: string,
    refreshToken: string,
    accessTtlSeconds: number = 3600,    // access token 默认 1 小时
    refreshTtlSeconds: number = 604800,  // refresh token 默认 7 天
  ): Promise<void> {
    await Promise.all([
      this.blacklistToken(accessToken, accessTtlSeconds),
      this.blacklistToken(refreshToken, refreshTtlSeconds),
    ]);
  }

  /**
   * 关闭连接（优雅关闭）
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.connected = false;
      RedisTokenBlacklist.instance = null;
    }
  }

  /**
   * 判断 Redis 是否可用
   */
  isAvailable(): boolean {
    return this.connected;
  }
}

/**
 * 用户会话缓存（P2-I：getUser 缓存）
 */
export class UserSessionCache {
  private static instance: UserSessionCache | null = null;
  private client: Redis | null = null;
  private connected = false;
  private readonly CACHE_TTL = 120; // 2 分钟缓存

  static async getInstance(): Promise<UserSessionCache> {
    if (!UserSessionCache.instance) {
      UserSessionCache.instance = new UserSessionCache();
      await UserSessionCache.instance.init();
    }
    return UserSessionCache.instance;
  }

  private async init(): Promise<void> {
    try {
      if (config.REDIS_URL) {
        this.client = new Redis(config.REDIS_URL);
      } else if (config.REDIS_HOST) {
        this.client = new Redis({
          host: config.REDIS_HOST,
          port: config.REDIS_PORT || 6379,
          password: config.REDIS_PASSWORD,
        });
      } else {
        return;
      }
      this.connected = true;
    } catch {
      this.client = null;
      this.connected = false;
    }
  }

  /**
   * 获取缓存的用户信息
   */
  async getUser(token: string): Promise<{ id: string; role: string; email: string } | null> {
    if (!this.connected || !this.client) return null;

    const key = `user:session:${crypto.createHash('sha256').update(token).digest('hex')}`;
    const cached = await this.client.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  /**
   * 设置用户缓存
   */
  async setUser(token: string, user: { id: string; role: string; email: string }): Promise<void> {
    if (!this.connected || !this.client) return;

    const key = `user:session:${crypto.createHash('sha256').update(token).digest('hex')}`;
    await this.client.setex(key, this.CACHE_TTL, JSON.stringify(user));
  }

  /**
   * 清除用户缓存
   */
  async invalidateUser(userId: string): Promise<void> {
    if (!this.connected || !this.client) return;
    // 在实际应用中，可以维护一个 userId → token 的映射来精确清除
    logger.debug('User cache invalidation requested', { userId });
  }
}
