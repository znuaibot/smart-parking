// Redis 工具模块 - Token 黑名单（生产级实现）
// P0-B 修复：用 Redis 替代内存 Set，支持多实例共享和 TTL 自动过期

/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Redis from 'ioredis';
import { config } from '../../config/index.js';
import { logger } from './logger.js';
import crypto from 'crypto';

// 兼容 ioredis 默认导入（Vitest + Node 运行时通用）
type RedisClient = Redis.Redis;
const RedisClass = Redis as unknown as new (...args: any[]) => Redis.Redis;

// Redis key 前缀
const BLACKLIST_KEY_PREFIX = 'token:blacklist:';
const USER_SESSIONS_PREFIX = 'user:sessions:';

/**
 * Token 黑名单管理器
 * 使用 Redis 存储，TTL 自动过期
 */
export class RedisTokenBlacklist {
  private static instance: RedisTokenBlacklist | null = null;
  private client: RedisClient | null = null;
  private connected = false;
  private configured = false;

  private constructor() {}

  static async getInstance(): Promise<RedisTokenBlacklist> {
    if (!RedisTokenBlacklist.instance) {
      RedisTokenBlacklist.instance = new RedisTokenBlacklist();
      await RedisTokenBlacklist.instance.init();
    }
    return RedisTokenBlacklist.instance;
  }

  private async init(): Promise<void> {
    if (this.connected) return;

    try {
      if (config.REDIS_URL) {
        this.configured = true;
        this.client = new RedisClass(config.REDIS_URL, {
          maxRetriesPerRequest: 3,
          retryStrategy(times: number) {
            if (times > 3) return null;
            return Math.min(times * 200, 1000);
          },
        });
      } else if (config.REDIS_HOST) {
        this.configured = true;
        this.client = new RedisClass({
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

      this.client.on('error', (err: Error) => {
        logger.error('Redis error', { error: err.message });
        this.connected = false;
      });

      await this.client.ping();
      this.connected = true;
    } catch (error: any) {
      logger.error('Failed to initialize Redis', { error: error.message });
      this.client = null;
      this.connected = false;
    }
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async blacklistToken(token: string, ttlSeconds: number = 86400): Promise<void> {
    if (!this.connected || !this.client) {
      if (this.configured) {
        throw new Error('Redis 连接不可用，无法将 Token 加入黑名单');
      }
      logger.warn('Redis not configured, blacklist operation skipped (dev mode only)');
      return;
    }

    const key = BLACKLIST_KEY_PREFIX + this.hashToken(token);
    await this.client.setex(key, ttlSeconds, '1');
  }

  async isBlacklisted(token: string): Promise<boolean> {
    if (!this.connected || !this.client) {
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

  async blacklistTokenPair(
    accessToken: string,
    refreshToken: string,
    accessTtlSeconds: number = 3600,
    refreshTtlSeconds: number = 604800,
  ): Promise<void> {
    await Promise.all([
      this.blacklistToken(accessToken, accessTtlSeconds),
      this.blacklistToken(refreshToken, refreshTtlSeconds),
    ]);
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.connected = false;
      RedisTokenBlacklist.instance = null;
    }
  }

  isAvailable(): boolean {
    return this.connected;
  }
}

/**
 * 用户会话缓存
 */
export class UserSessionCache {
  private static instance: UserSessionCache | null = null;
  private client: RedisClient | null = null;
  private connected = false;
  private readonly CACHE_TTL = 120;

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
        this.client = new RedisClass(config.REDIS_URL);
      } else if (config.REDIS_HOST) {
        this.client = new RedisClass({
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

  async getUser(token: string): Promise<{ id: string; role: string; email: string } | null> {
    if (!this.connected || !this.client) return null;

    const key = `user:session:${crypto.createHash('sha256').update(token).digest('hex')}`;
    const cached = await this.client.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  async setUser(token: string, user: { id: string; role: string; email: string }): Promise<void> {
    if (!this.connected || !this.client) return;

    const key = `user:session:${crypto.createHash('sha256').update(token).digest('hex')}`;
    await this.client.setex(key, this.CACHE_TTL, JSON.stringify(user));
  }

  async invalidateUser(userId: string): Promise<void> {
    if (!this.connected || !this.client) return;
    logger.debug('User cache invalidation requested', { userId });
  }
}
