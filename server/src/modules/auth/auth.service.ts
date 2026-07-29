// 认证服务模块 - 处理登录、登出、Token 刷新等业务逻辑
// P0-A 修复：从 profiles 表获取真实角色
// P0-B 修复：Redis Token 黑名单
// P1-D 修复：banned_until 时间比较

import { supabase } from '../../shared/database/supabase.js';
import { config } from '../../config/index.js';
import { logger, logAuthEvent } from '../../shared/utils/logger.js';
import { RedisTokenBlacklist } from '../../shared/utils/redis.js';
import {
  InvalidCredentialsError,
  UnauthorizedError,
  TokenExpiredError,
  TokenRefreshError,
  AccountDisabledError,
  ValidationError,
  ForbiddenError,
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
  parkingId?: string;
  isActive: boolean;
  createdAt: string;
  lastSignInAt?: string;
}

export interface LoginResult {
  tokens: TokenPair;
  user: UserProfile;
}

// ==================== AuthService ====================

export class AuthService {
  private redisBlacklist: RedisTokenBlacklist | null = null;

  private async getRedis(): Promise<RedisTokenBlacklist | null> {
    if (!this.redisBlacklist) {
      this.redisBlacklist = await RedisTokenBlacklist.getInstance();
    }
    return this.redisBlacklist;
  }

  /**
   * 从 profiles 表获取用户角色（P0-A 修复）
   */
  private async getProfileFromDB(userId: string): Promise<{
    role: 'superadmin' | 'admin' | 'operator' | 'cashier';
    parkingId?: string;
    isActive: boolean;
    email?: string;
    displayName?: string;
    avatarUrl?: string;
    phone?: string;
  } | null> {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role, parking_id, is_active, display_name, avatar_url, phone, email')
      .eq('id', userId)
      .single();

    if (error) {
      logger.error('Failed to fetch profile', { error: error.message, userId });
      return null;
    }

    if (!profile) return null;

    return {
      role: profile.role as 'superadmin' | 'admin' | 'operator' | 'cashier',
      parkingId: profile.parking_id || undefined,
      isActive: profile.is_active,
      email: profile.email || undefined,
      displayName: profile.display_name || undefined,
      avatarUrl: profile.avatar_url || undefined,
      phone: profile.phone || undefined,
    };
  }

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

      // P1-D 修复：banned_until 与当前时间比较
      const isBanned = data.user.banned_until && new Date(data.user.banned_until) > new Date();
      if (isBanned) {
        throw new AccountDisabledError('账号已被封禁至 ' + data.user.banned_until);
      }

      // P0-A 修复：从 profiles 表获取真实角色信息
      const profile = await this.getProfileFromDB(data.user.id);
      if (!profile) {
        logger.warn('User logged in but no profile found', { userId: data.user.id });
        throw new ForbiddenError('用户档案不存在，请联系管理员');
      }

      // 检查 profiles 状态
      if (!profile.isActive) {
        throw new AccountDisabledError('账号已被禁用，请联系管理员');
      }

      const userProfile: UserProfile = {
        id: data.user.id,
        email: profile.email || data.user.email || email,
        role: profile.role,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        phone: profile.phone,
        parkingId: profile.parkingId,
        isActive: profile.isActive,
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
          error instanceof AccountDisabledError ||
          error instanceof ForbiddenError) {
        throw error;
      }
      logger.error('Login failed', { error: error.message, email });
      throw new SupabaseError('登录过程发生错误', { message: error.message });
    }
  }

  /**
   * 用户登出
   * @param accessToken 访问令牌
   * @param refreshToken 刷新令牌（可选，用于同时黑名单）
   * @param userId 用户ID
   */
  async logout(accessToken: string, refreshToken?: string, userId?: string): Promise<void> {
    try {
      // P0-B 修复：使用 Redis 黑名单，同时黑名单 access + refresh
      const redis = await this.getRedis();
      if (redis && redis.isAvailable()) {
        if (refreshToken) {
          await redis.blacklist(accessToken, 3600);
          await redis.blacklist(refreshToken, 604800);
        } else {
          await redis.blacklist(accessToken, 3600);
        }
      }

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

    // P0-B 修复：检查 refreshToken 是否在黑名单中
    const redis = await this.getRedis();
    if (redis && redis.isAvailable() && await redis.isBlacklisted(refreshToken)) {
      throw new TokenRefreshError('刷新令牌已被使用或已过期');
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

      // P0-B 修复：刷新成功后，旧 refreshToken 立即入黑名单
      if (redis && redis.isAvailable()) {
        await redis.blacklist(refreshToken, 604800); // 7 天 TTL
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
   * 获取当前用户信息（P0-A 修复：从 profiles 表获取）
   * @param userId 用户 ID（从 req.user.id 获取）
   */
  async getCurrentUserById(userId: string): Promise<UserProfile> {
    // 从 Supabase Auth 获取基础信息
    const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(userId);

    if (authError || !authUser.user) {
      throw new UnauthorizedError('用户不存在');
    }

    const user = authUser.user;

    // P1-D 修复：banned_until 与当前时间比较
    const isBanned = user.banned_until && new Date(user.banned_until) > new Date();
    if (isBanned) {
      throw new AccountDisabledError('账号已被封禁');
    }

    // P0-A 修复：从 profiles 表获取真实角色
    const profile = await this.getProfileFromDB(userId);
    if (!profile) {
      throw new ForbiddenError('用户档案不存在，请联系管理员');
    }

    if (!profile.isActive) {
      throw new AccountDisabledError('账号已被禁用，请联系管理员');
    }

    return {
      id: user.id,
      email: user.email || '',
      role: profile.role,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      phone: profile.phone,
      parkingId: profile.parkingId,
      isActive: profile.isActive,
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at || undefined,
    };
  }

  /**
   * 验证 Token 并返回用户信息（中间件使用）
   * P0-A 修复：从 profiles 表获取角色
   * @param token 访问令牌
   */
  async verifyToken(token: string): Promise<{ id: string; role: string; email: string; parkingId?: string }> {
    // P0-B 修复：检查 Redis 黑名单
    const redis = await this.getRedis();
    if (redis && redis.isAvailable() && await redis.isBlacklisted(token)) {
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

      // P0-A 修复：从 profiles 表获取角色
      const profile = await this.getProfileFromDB(data.user.id);
      if (!profile) {
        throw new ForbiddenError('用户档案不存在');
      }

      if (!profile.isActive) {
        throw new AccountDisabledError();
      }

      return {
        id: data.user.id,
        role: profile.role,
        email: data.user.email || '',
        parkingId: profile.parkingId,
      };
    } catch (error: any) {
      if (error instanceof UnauthorizedError || error instanceof TokenExpiredError || error instanceof ForbiddenError) {
        throw error;
      }
      logger.error('Token verification failed', { error: error.message });
      throw new UnauthorizedError('令牌验证失败');
    }
  }

  /**
   * 修改密码
   * @param userId 用户 ID
   * @param oldPassword 原密码
   * @param newPassword 新密码
   */
  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    try {
      // 先验证原密码（通过 Supabase 登录验证）
      const { data: authUser } = await supabase.auth.admin.getUserById(userId);
      if (!authUser.user?.email) {
        throw new UnauthorizedError('用户不存在');
      }

      // 验证原密码
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: authUser.user.email,
        password: oldPassword,
      });

      if (signInError) {
        throw new InvalidCredentialsError('原密码错误');
      }

      // 更新密码
      const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
        password: newPassword,
      });

      if (updateError) {
        throw new SupabaseError('密码修改失败', { message: updateError.message });
      }

      logAuthEvent('password_change', { userId });
    } catch (error: any) {
      if (error instanceof InvalidCredentialsError || error instanceof UnauthorizedError) {
        throw error;
      }
      logger.error('Change password failed', { error: error.message, userId });
      throw new SupabaseError('密码修改失败', { message: error.message });
    }
  }
}

// 单例导出
export const authService = new AuthService();
