// 认证服务模块 - 处理登录、登出、Token 刷新等业务逻辑

import { supabase } from '../../shared/database/supabase.js';
import { config } from '../../config/index.js';
import { logger, logAuthEvent } from '../../shared/utils/logger.js';
import {
  InvalidCredentialsError,
  UnauthorizedError,
  TokenExpiredError,
  TokenRefreshError,
  AccountDisabledError,
  ValidationError,
  SupabaseError,
} from '../../shared/types/errors.js';

// ==================== 类型定义 ====================

export interface LoginDTO {
  email: string;
  password: string;
}

export interface RefreshTokenDTO {
  refreshToken: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

export interface UserProfile {
  id: string;
  email: string;
  role: 'superadmin' | 'admin' | 'operator' | 'cashier';
  displayName?: string;
  avatarUrl?: string;
  phone?: string;
  isActive: boolean;
  createdAt: string;
  lastSignInAt?: string;
}

export interface LoginResult {
  tokens: TokenPair;
  user: UserProfile;
}

// ==================== Token 黑名单（生产环境应使用 Redis）====================
const tokenBlacklist = new Set<string>();

// ==================== AuthService ====================

export class AuthService {
  /**
   * 用户登录
   * @param dto 登录参数
   * @param clientInfo 客户端信息（IP、User-Agent）
   */
  async login(dto: LoginDTO, clientInfo?: { ip?: string; userAgent?: string }): Promise<LoginResult> {
    const { email, password } = dto;

    // 参数校验
    if (!email || !password) {
      throw new ValidationError([
        { field: 'email', message: email ? '' : '邮箱不能为空' },
        { field: 'password', message: password ? '' : '密码不能为空' },
      ]);
    }

    try {
      // 调用 Supabase Auth 进行登录
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        logAuthEvent('failed', {
          email,
          ip: clientInfo?.ip,
          reason: error.message,
        });

        if (error.message.includes('Invalid login credentials')) {
          throw new InvalidCredentialsError();
        }
        if (error.message.includes('Email not confirmed')) {
          throw new AccountDisabledError('账号未激活，请先验证邮箱');
        }
        throw new SupabaseError('登录失败', { message: error.message });
      }

      if (!data.user || !data.session) {
        throw new InvalidCredentialsError();
      }

      // 检查用户是否被禁用
      if (data.user.banned_until) {
        throw new AccountDisabledError();
      }

      // 获取用户角色信息
      const userRole = (data.user.user_metadata?.role || 'operator') as UserProfile['role'];
      const displayName = data.user.user_metadata?.display_name as string | undefined;

      const userProfile: UserProfile = {
        id: data.user.id,
        email: data.user.email || email,
        role: userRole,
        displayName,
        avatarUrl: data.user.user_metadata?.avatar_url as string | undefined,
        phone: data.user.phone || undefined,
        isActive: !data.user.banned_until,
        createdAt: data.user.created_at,
        lastSignInAt: data.user.last_sign_in_at || undefined,
      };

      const tokens: TokenPair = {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresIn: data.session.expires_in,
        tokenType: 'Bearer',
      };

      logAuthEvent('login', {
        userId: data.user.id,
        email,
        ip: clientInfo?.ip,
      });

      return { tokens, user: userProfile };
    } catch (error: any) {
      if (error instanceof ValidationError || 
          error instanceof InvalidCredentialsError || 
          error instanceof AccountDisabledError) {
        throw error;
      }
      logger.error('Login failed', { error: error.message, email });
      throw new SupabaseError('登录过程发生错误', { message: error.message });
    }
  }

  /**
   * 用户登出
   * @param accessToken 访问令牌
   * @param userId 用户ID
   */
  async logout(accessToken: string, userId?: string): Promise<void> {
    try {
      // 将 Token 加入黑名单
      tokenBlacklist.add(accessToken);

      // 调用 Supabase Admin API 使 token 服务端失效
      const { error } = await supabase.auth.admin.signOut(accessToken);
      if (error) {
        logger.warn('Supabase signOut warning', { error: error.message });
      }

      logAuthEvent('logout', { userId });
    } catch (error: any) {
      logger.error('Logout error', { error: error.message, userId });
      // 登出失败不应阻止用户
    }
  }

  /**
   * 刷新访问令牌
   * @param dto 包含 refreshToken
   */
  async refreshToken(dto: RefreshTokenDTO): Promise<TokenPair> {
    const { refreshToken } = dto;

    if (!refreshToken) {
      throw new ValidationError([
        { field: 'refreshToken', message: '刷新令牌不能为空' },
      ]);
    }

    // 检查 refreshToken 是否在黑名单中
    if (tokenBlacklist.has(refreshToken)) {
      throw new TokenRefreshError();
    }

    try {
      const { data, error } = await supabase.auth.refreshSession({
        refresh_token: refreshToken,
      });

      if (error) {
        if (error.message.includes('refresh_token') || error.message.includes('expired')) {
          throw new TokenExpiredError('刷新令牌已过期，请重新登录');
        }
        throw new TokenRefreshError();
      }

      if (!data.session) {
        throw new TokenRefreshError();
      }

      logAuthEvent('refresh', { userId: data.user?.id });

      return {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresIn: data.session.expires_in,
        tokenType: 'Bearer',
      };
    } catch (error: any) {
      if (error instanceof TokenExpiredError || error instanceof TokenRefreshError) {
        throw error;
      }
      logger.error('Token refresh failed', { error: error.message });
      throw new TokenRefreshError();
    }
  }

  /**
   * 获取当前用户信息
   * @param accessToken 访问令牌
   */
  async getCurrentUser(accessToken: string): Promise<UserProfile> {
    try {
      const { data, error } = await supabase.auth.getUser(accessToken);

      if (error || !data.user) {
        if (error?.message?.includes('expired')) {
          throw new TokenExpiredError();
        }
        throw new UnauthorizedError('无效的访问令牌');
      }

      const user = data.user;
      const userRole = (user.user_metadata?.role || 'operator') as UserProfile['role'];

      return {
        id: user.id,
        email: user.email || '',
        role: userRole,
        displayName: user.user_metadata?.display_name as string | undefined,
        avatarUrl: user.user_metadata?.avatar_url as string | undefined,
        phone: user.phone || undefined,
        isActive: !user.banned_until,
        createdAt: user.created_at,
        lastSignInAt: user.last_sign_in_at || undefined,
      };
    } catch (error: any) {
      if (error instanceof UnauthorizedError || error instanceof TokenExpiredError) {
        throw error;
      }
      logger.error('Get current user failed', { error: error.message });
      throw new UnauthorizedError('无法获取用户信息');
    }
  }

  /**
   * 验证 Token 并返回用户ID（中间件使用）
   * @param token 访问令牌
   */
  async verifyToken(token: string): Promise<{ id: string; role: string; email: string }> {
    // 检查黑名单
    if (tokenBlacklist.has(token)) {
      throw new UnauthorizedError('令牌已被注销');
    }

    try {
      const { data, error } = await supabase.auth.getUser(token);

      if (error || !data.user) {
        if (error?.message?.includes('expired')) {
          throw new TokenExpiredError();
        }
        throw new UnauthorizedError('无效的访问令牌');
      }

      return {
        id: data.user.id,
        role: data.user.user_metadata?.role || 'operator',
        email: data.user.email || '',
      };
    } catch (error: any) {
      if (error instanceof UnauthorizedError || error instanceof TokenExpiredError) {
        throw error;
      }
      logger.error('Token verification failed', { error: error.message });
      throw new UnauthorizedError('令牌验证失败');
    }
  }

  /**
   * 检查 Token 是否在黑名单中
   * @param token 令牌
   */
  isTokenBlacklisted(token: string): boolean {
    return tokenBlacklist.has(token);
  }

  /**
   * 将 Token 加入黑名单
   * @param token 令牌
   */
  blacklistToken(token: string): void {
    tokenBlacklist.add(token);
  }

  /**
   * 清理过期的黑名单令牌（建议定时任务调用）
   */
  cleanupBlacklist(): void {
    // 简单实现：限制黑名单大小
    if (tokenBlacklist.size > 10000) {
      const entries = Array.from(tokenBlacklist);
      const toRemove = entries.slice(0, entries.length - 5000);
      toRemove.forEach(token => tokenBlacklist.delete(token));
      logger.info('Token blacklist cleaned up', { removed: toRemove.length });
    }
  }
}

// 单例导出
export const authService = new AuthService();
