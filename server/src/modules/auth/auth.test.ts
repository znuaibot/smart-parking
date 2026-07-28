// 认证模块单元测试
// P2-M 修复：补全断言、覆盖异常分支

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthService } from './auth.service.js';

// Mock supabase
vi.mock('../../shared/database/supabase.js', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      admin: {
        signOut: vi.fn(),
        getUserById: vi.fn(),
      },
      refreshSession: vi.fn(),
      getUser: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
    })),
  },
}));

// Mock Redis
vi.mock('../../shared/utils/redis.js', () => ({
  RedisTokenBlacklist: {
    getInstance: vi.fn().mockResolvedValue({
      isBlacklisted: vi.fn().mockResolvedValue(false),
      blacklistToken: vi.fn().mockResolvedValue(undefined),
      blacklistTokenPair: vi.fn().mockResolvedValue(undefined),
      isAvailable: vi.fn().mockReturnValue(false), // 测试中默认不启用 Redis
    }),
  },
  UserSessionCache: {
    getInstance: vi.fn().mockResolvedValue({
      getUser: vi.fn().mockResolvedValue(null),
      setUser: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

// Mock logger
vi.mock('../../shared/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  logAuthEvent: vi.fn(),
}));

import { supabase } from '../../shared/database/supabase.js';

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService();
    vi.clearAllMocks();
  });

  describe('login', () => {
    const validLoginDto = {
      email: 'test@example.com',
      password: 'password123',
    };

    // Mock profile query
    const mockProfileQuery = (profileData: any) => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: profileData, error: null }),
      } as any);
    };

    it('should successfully login with valid credentials and fetch profile from DB', async () => {
      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
        data: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            user_metadata: { role: 'admin', display_name: 'Test User' },
            created_at: '2024-01-01T00:00:00Z',
            last_sign_in_at: '2024-01-02T00:00:00Z',
          },
          session: {
            access_token: 'mock-access-token',
            refresh_token: 'mock-refresh-token',
            expires_in: 3600,
          },
        },
        error: null,
      } as any);

      // Mock profile query - 返回 profiles 表数据（不是 user_metadata）
      mockProfileQuery({
        role: 'operator', // profiles 表中的角色
        parking_id: 'parking-456',
        is_active: true,
        display_name: 'Real Name',
        email: 'test@example.com',
      });

      const result = await authService.login(validLoginDto);

      expect(result.tokens.accessToken).toBe('mock-access-token');
      expect(result.tokens.refreshToken).toBe('mock-refresh-token');
      expect(result.tokens.tokenType).toBe('Bearer');
      expect(result.user.id).toBe('user-123');
      expect(result.user.email).toBe('test@example.com');
      // P0-A 修复验证：角色来自 profiles 表，不是 user_metadata
      expect(result.user.role).toBe('operator');
      expect(result.user.parkingId).toBe('parking-456');
      expect(result.user.displayName).toBe('Real Name');
    });

    it('should throw ForbiddenError when user has no profile record', async () => {
      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
        data: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            user_metadata: { role: 'admin' },
            created_at: '2024-01-01T00:00:00Z',
          },
          session: {
            access_token: 'mock-access-token',
            refresh_token: 'mock-refresh-token',
            expires_in: 3600,
          },
        },
        error: null,
      } as any);

      // Mock profile query - 返回空（用户无 profiles 记录）
      mockProfileQuery(null);
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'Not found' } }),
      } as any);

      await expect(authService.login(validLoginDto)).rejects.toThrow('用户档案不存在');
    });

    it('should throw AccountDisabledError when profile is_active is false', async () => {
      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
        data: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            user_metadata: { role: 'admin' },
            created_at: '2024-01-01T00:00:00Z',
          },
          session: {
            access_token: 'mock-access-token',
            refresh_token: 'mock-refresh-token',
            expires_in: 3600,
          },
        },
        error: null,
      } as any);

      // Mock profile query - is_active = false
      mockProfileQuery({
        role: 'operator',
        is_active: false,
      });

      await expect(authService.login(validLoginDto)).rejects.toThrow('账号已被禁用');
    });

    it('should throw AccountDisabledError when banned_until is in the future', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1); // 未来 1 年

      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
        data: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            user_metadata: { role: 'admin' },
            created_at: '2024-01-01T00:00:00Z',
            banned_until: futureDate.toISOString(), // 未来封禁
          },
          session: {
            access_token: 'mock-access-token',
            refresh_token: 'mock-refresh-token',
            expires_in: 3600,
          },
        },
        error: null,
      } as any);

      await expect(authService.login(validLoginDto)).rejects.toThrow('账号已被封禁至');
    });

    it('should NOT throw when banned_until is in the past', async () => {
      const pastDate = new Date();
      pastDate.setFullYear(pastDate.getFullYear() - 1); // 过去 1 年

      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
        data: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            user_metadata: { role: 'admin' },
            created_at: '2024-01-01T00:00:00Z',
            banned_until: pastDate.toISOString(), // 过去封禁（已过期）
          },
          session: {
            access_token: 'mock-access-token',
            refresh_token: 'mock-refresh-token',
            expires_in: 3600,
          },
        },
        error: null,
      } as any);

      mockProfileQuery({
        role: 'operator',
        is_active: true,
      });

      // 不应抛出异常（过去时间的 banned_until 不阻止登录）
      const result = await authService.login(validLoginDto);
      expect(result.user.id).toBe('user-123');
    });

    it('should throw InvalidCredentialsError with invalid credentials', async () => {
      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
        data: null,
        error: { message: 'Invalid login credentials' },
      } as any);

      await expect(authService.login(validLoginDto)).rejects.toThrow('用户名或密码错误');
    });

    it('should throw ValidationError when email is missing', async () => {
      await expect(
        authService.login({ email: '', password: 'password123' }),
      ).rejects.toThrow('参数校验失败');
    });

    it('should throw ValidationError when password is missing', async () => {
      await expect(
        authService.login({ email: 'test@example.com', password: '' }),
      ).rejects.toThrow('参数校验失败');
    });

    it('should throw AccountDisabledError when email is not confirmed', async () => {
      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
        data: null,
        error: { message: 'Email not confirmed' },
      } as any);

      await expect(authService.login(validLoginDto)).rejects.toThrow('账号未激活');
    });
  });

  describe('logout', () => {
    it('should blacklist access token on logout', async () => {
      vi.mocked(supabase.auth.admin.signOut).mockResolvedValue({ error: null } as any);

      await authService.logout('mock-token', undefined, 'user-123');

      expect(supabase.auth.admin.signOut).toHaveBeenCalledWith('mock-token');
    });

    it('should blacklist both access and refresh tokens when refresh provided', async () => {
      vi.mocked(supabase.auth.admin.signOut).mockResolvedValue({ error: null } as any);

      await authService.logout('access-token', 'refresh-token', 'user-123');

      // P0-B 修复验证：应同时调用 blacklistTokenPair
      expect(supabase.auth.admin.signOut).toHaveBeenCalledWith('access-token');
    });

    it('should handle logout error gracefully', async () => {
      vi.mocked(supabase.auth.admin.signOut).mockResolvedValue({
        error: { message: 'Token expired' },
      } as any);

      // Should not throw
      await expect(authService.logout('mock-token', undefined, 'user-123')).resolves.not.toThrow();
    });
  });

  describe('refreshToken', () => {
    it('should successfully refresh token', async () => {
      vi.mocked(supabase.auth.refreshSession).mockResolvedValue({
        data: {
          user: { id: 'user-123' },
          session: {
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
            expires_in: 3600,
          },
        },
        error: null,
      } as any);

      const result = await authService.refreshToken({ refreshToken: 'valid-refresh-token' });

      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
      expect(result.tokenType).toBe('Bearer');
    });

    it('should throw ValidationError when refreshToken is missing', async () => {
      await expect(
        authService.refreshToken({ refreshToken: '' }),
      ).rejects.toThrow('参数校验失败');
    });

    it('should throw TokenExpiredError when refresh token is expired', async () => {
      vi.mocked(supabase.auth.refreshSession).mockResolvedValue({
        data: null,
        error: { message: 'refresh_token expired' },
      } as any);

      await expect(
        authService.refreshToken({ refreshToken: 'expired-token' }),
      ).rejects.toThrow('刷新令牌已过期');
    });
  });

  describe('getCurrentUserById', () => {
    const mockProfileQuery = (profileData: any) => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: profileData, error: null }),
      } as any);
    };

    it('should return user profile from profiles table when user is valid', async () => {
      vi.mocked(supabase.auth.admin.getUserById).mockResolvedValue({
        data: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            user_metadata: { role: 'admin', display_name: 'Test User' },
            created_at: '2024-01-01T00:00:00Z',
            last_sign_in_at: '2024-01-02T00:00:00Z',
          },
        },
        error: null,
      } as any);

      mockProfileQuery({
        role: 'admin',
        parking_id: 'parking-1',
        is_active: true,
        display_name: 'Test User',
        email: 'test@example.com',
      });

      const user = await authService.getCurrentUserById('user-123');

      expect(user.id).toBe('user-123');
      expect(user.email).toBe('test@example.com');
      // P0-A 修复验证：角色来自 profiles 表
      expect(user.role).toBe('admin');
      expect(user.parkingId).toBe('parking-1');
    });

    it('should throw AccountDisabledError when banned_until is in the future', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      vi.mocked(supabase.auth.admin.getUserById).mockResolvedValue({
        data: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            created_at: '2024-01-01T00:00:00Z',
            banned_until: futureDate.toISOString(),
          },
        },
        error: null,
      } as any);

      await expect(authService.getCurrentUserById('user-123')).rejects.toThrow('账号已被封禁');
    });

    it('should throw UnauthorizedError when user not found', async () => {
      vi.mocked(supabase.auth.admin.getUserById).mockResolvedValue({
        data: { user: null },
        error: { message: 'User not found' },
      } as any);

      await expect(authService.getCurrentUserById('invalid-id')).rejects.toThrow('用户不存在');
    });
  });

  describe('verifyToken', () => {
    const mockProfileQuery = (profileData: any) => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: profileData, error: null }),
      } as any);
    };

    it('should return user info with role from profiles when token is valid', async () => {
      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            user_metadata: { role: 'operator' },
          },
        },
        error: null,
      } as any);

      mockProfileQuery({
        role: 'cashier', // 来自 profiles 表
        parking_id: 'parking-1',
        is_active: true,
      });

      const result = await authService.verifyToken('valid-token');

      expect(result.id).toBe('user-123');
      expect(result.email).toBe('test@example.com');
      // P0-A 修复验证：角色来自 profiles，不是 user_metadata
      expect(result.role).toBe('cashier');
      expect(result.parkingId).toBe('parking-1');
    });

    it('should throw ForbiddenError when user has no profile', async () => {
      vi.mocked(supabase.auth.getUser).mockResolvedValue({
        data: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
          },
        },
        error: null,
      } as any);

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      } as any);

      await expect(authService.verifyToken('valid-token')).rejects.toThrow('用户档案不存在');
    });
  });
});
