// 认证模块集成测试
// P2-B 修复：补充租户隔离和鉴权流程端到端测试

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

describe('AuthService Integration Tests', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService();
    vi.clearAllMocks();
  });

  describe('Tenant Isolation', () => {
    const mockProfileQuery = (profileData: any) => {
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: profileData, error: null }),
      } as any);
    };

    it('should allow user to access resources in their own parking', async () => {
      mockProfileQuery({
        role: 'operator',
        parking_id: 'parking-a',
        is_active: true,
      });

      const profile = await (authService as any).getProfileFromDB('user-123');
      expect(profile.parkingId).toBe('parking-a');
    });

    it('should identify user without parking assignment', async () => {
      mockProfileQuery({
        role: 'superadmin',
        parking_id: null, // superadmin 可能没有特定停车场
        is_active: true,
      });

      const profile = await (authService as any).getProfileFromDB('admin-123');
      expect(profile.parkingId).toBeUndefined();
      expect(profile.role).toBe('superadmin');
    });

    it('should include parkingId in login response for tenant isolation', async () => {
      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
        data: {
          user: {
            id: 'user-123',
            email: 'operator@parking.com',
            user_metadata: { role: 'admin' }, // 伪造的角色，应被忽略
            created_at: '2024-01-01T00:00:00Z',
          },
          session: {
            access_token: 'valid-token',
            refresh_token: 'valid-refresh',
            expires_in: 3600,
          },
        },
        error: null,
      } as any);

      mockProfileQuery({
        role: 'operator', // 真实角色
        parking_id: 'parking-456',
        is_active: true,
        display_name: 'Test Operator',
        email: 'operator@parking.com',
      });

      const result = await authService.login({
        email: 'operator@parking.com',
        password: 'password123',
      });

      // 验证角色来自 profiles 表，不是 user_metadata
      expect(result.user.role).toBe('operator');
      expect(result.user.parkingId).toBe('parking-456');
    });
  });

  describe('Token Lifecycle', () => {
    it('should handle complete token lifecycle: login -> refresh -> logout', async () => {
      // 1. Login
      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
        data: {
          user: { id: 'user-123', email: 'test@test.com' },
          session: {
            access_token: 'initial-access',
            refresh_token: 'initial-refresh',
            expires_in: 3600,
          },
        },
        error: null,
      } as any);

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { role: 'operator', parking_id: 'p1', is_active: true },
          error: null,
        }),
      } as any);

      const loginResult = await authService.login({
        email: 'test@test.com',
        password: 'password123',
      });
      expect(loginResult.tokens.accessToken).toBe('initial-access');

      // 2. Refresh
      vi.mocked(supabase.auth.refreshSession).mockResolvedValue({
        data: {
          user: { id: 'user-123' },
          session: {
            access_token: 'new-access',
            refresh_token: 'new-refresh',
            expires_in: 3600,
          },
        },
        error: null,
      } as any);

      const refreshResult = await authService.refreshToken({
        refreshToken: 'initial-refresh',
      });
      expect(refreshResult.accessToken).toBe('new-access');

      // 3. Logout
      vi.mocked(supabase.auth.admin.signOut).mockResolvedValue({ error: null } as any);
      await authService.logout('new-access', 'new-refresh', 'user-123');
      expect(supabase.auth.admin.signOut).toHaveBeenCalledWith('new-access');
    });
  });

  describe('Authentication Edge Cases', () => {
    it('should reject login when user has no profile record', async () => {
      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
        data: {
          user: { id: 'orphan-user', email: 'orphan@test.com' },
          session: { access_token: 'token', refresh_token: 'refresh', expires_in: 3600 },
        },
        error: null,
      } as any);

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116', message: 'Not found' },
        }),
      } as any);

      await expect(
        authService.login({ email: 'orphan@test.com', password: 'pass123' }),
      ).rejects.toThrow('用户档案不存在');
    });

    it('should reject login when profile is deactivated', async () => {
      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
        data: {
          user: { id: 'disabled-user', email: 'disabled@test.com' },
          session: { access_token: 'token', refresh_token: 'refresh', expires_in: 3600 },
        },
        error: null,
      } as any);

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { role: 'operator', is_active: false },
          error: null,
        }),
      } as any);

      await expect(
        authService.login({ email: 'disabled@test.com', password: 'pass123' }),
      ).rejects.toThrow('账号已被禁用');
    });

    it('should reject login when banned_until is in the future', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
        data: {
          user: {
            id: 'banned-user',
            email: 'banned@test.com',
            banned_until: futureDate.toISOString(),
          },
          session: { access_token: 'token', refresh_token: 'refresh', expires_in: 3600 },
        },
        error: null,
      } as any);

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { role: 'operator', is_active: true },
          error: null,
        }),
      } as any);

      await expect(
        authService.login({ email: 'banned@test.com', password: 'pass123' }),
      ).rejects.toThrow('账号已被封禁');
    });

    it('should reject invalid email format', async () => {
      await expect(
        authService.login({ email: 'not-an-email', password: 'password123' }),
      ).rejects.toThrow('参数校验失败');
    });

    it('should reject short password', async () => {
      await expect(
        authService.login({ email: 'test@test.com', password: '12345' }),
      ).rejects.toThrow('参数校验失败');
    });
  });

  describe('Concurrent Token Refresh', () => {
    it('should handle concurrent refresh requests', async () => {
      vi.mocked(supabase.auth.refreshSession).mockResolvedValue({
        data: {
          user: { id: 'user-123' },
          session: {
            access_token: 'refreshed-token',
            refresh_token: 'new-refresh-token',
            expires_in: 3600,
          },
        },
        error: null,
      } as any);

      // 模拟并发刷新请求
      const results = await Promise.all([
        authService.refreshToken({ refreshToken: 'old-refresh' }),
        authService.refreshToken({ refreshToken: 'old-refresh' }),
      ]);

      // 两个请求都应成功（各自获取新 token）
      expect(results[0].accessToken).toBe('refreshed-token');
      expect(results[1].accessToken).toBe('refreshed-token');
    });
  });
});
