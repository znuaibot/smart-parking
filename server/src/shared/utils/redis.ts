// Redis 工具模块 - Token 黑名单（生产级实现）
// P0-B 修复：用 Redis 替代内存 Set，支持多实例共享和 TTL 自动过期

import { Redis } from 'ioredis';
import { config } from '../../config/index.js';
import { logger } from './logger.js';
import crypto from 'crypto';

// Redis key 前缀
const BLACKLIST_KEY_PREFIX = 'token:blacklist:';
const _USER_SESSIONS_PREFIX = 'user:sessions:';

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
   * 检查 Redis 是否可用
   */
  isAvailable(): boolean {
    return this.connected && this.configured;
  }

  /**
   * 将 Token 加入黑名单
   * @param token JWT Token
   * @param expiresIn 过期时间（秒）
   */
  async blacklist(token: string, expiresIn: number): Promise<void> {
    if (!this.client || !this.connected) return;

    try {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const key = `${BLACKLIST_KEY_PREFIX}${tokenHash}`;
      await this.client.setex(key, expiresIn, '1');
      logger.debug('Token blacklisted', { expiresIn });
    } catch (error: any) {
      logger.error('Failed to blacklist token', { error: error.message });
    }
  }

  /**
   * 检查 Token 是否在黑名单中
   */
  async isBlacklisted(token: string): Promise<boolean> {
    if (!this.client || !this.connected) return false;

    try {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const key = `${BLACKLIST_KEY_PREFIX}${tokenHash}`;
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error: any) {
      logger.error('Failed to check token blacklist', { error: error.message });
      return false;
    }
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.connected = false;
      RedisTokenBlacklist.instance = null;
    }
  }
}
