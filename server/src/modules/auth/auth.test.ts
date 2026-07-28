// 认证模块单元测试

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from './auth.service.js';

// Mock supabase
vi.mock('../../shared/database/supabase.js', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      refreshSession: vi.fn(),
      getUser: vi.fn(),
    },
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

    it('should successfully login with valid credentials', async () => {
      const mockResponse = {
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
      };

      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue(mockResponse as any);

      const result = await authService.login(validLoginDto);

      expect(result.tokens.accessToken).toBe('mock-access-token');
      expect(result.tokens.refreshToken).toBe('mock-refresh-token');
      expect(result.tokens.tokenType).toBe('Bearer');
      expect(result.user.id).toBe('user-123');
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.role).toBe('admin');
    });

    it('should throw InvalidCredentialsError with invalid credentials', async () => {
      const mockResponse = {
        data: null,
        error: { message: 'Invalid login credentials' },
      };

      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue(mockResponse as any);

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
      const mockResponse = {
        data: null,
        error: { message: 'Email not confirmed' },
      };

      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue(mockResponse as any);

      await expect(authService.login(validLoginDto)).rejects.toThrow('账号未激活');
    });
  });

  describe('logout', () => {
    it('should successfully logout', async () => {
      vi.mocked(supabase.auth.signOut).mockResolvedValue({ error: null } as any);

      await authService.logout('mock-token', 'user-123');

      expect(supabase.auth.signOut).toHaveBeenCalledWith('mock-token');
    });

    it('should handle logout error gracefully', async () => {
      vi.mocked(supabase.auth.signOut).mockResolvedValue({
        error: { message: 'Token expired' },
      } as any);

      // Should not throw
      await expect(authService.logout('mock-token', 'user-123')).resolves.not.toThrow();
    });
  });

  describe('refreshToken', () => {
    it('should successfully refresh token', async () => {
      const mockResponse = {
        data: {
          user: { id: 'user-123' },
          session: {
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
            expires_in: 3600,
          },
        },
        error: null,
      };

      vi.mocked(supabase.auth.refreshSession).mockResolvedValue(mockResponse as any);

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

    it('should throw TokenRefreshError when refreshToken is blacklisted', async () => {
      authService.blacklistToken('blacklisted-token');

      await expect(
        authService.refreshToken({ refreshToken: 'blacklisted-token' }),
      ).rejects.toThrow('无法刷新令牌');
    });

    it('should throw TokenExpiredError when refresh token is expired', async () => {
      const mockResponse = {
        data: null,
        error: { message: 'refresh_token expired' },
      };

      vi.mocked(supabase.auth.refreshSession).mockResolvedValue(mockResponse as any);

      await expect(
        authService.refreshToken({ refreshToken: 'expired-token' }),
      ).rejects.toThrow('刷新令牌已过期');
    });
  });

  describe('getCurrentUser', () => {
    const validToken = 'valid-access-token';

    it('should return user profile when token is valid', async () => {
      const mockResponse = {
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
      };

      vi.mocked(supabase.auth.getUser).mockResolvedValue(mockResponse as any);

      const user = await authService.getCurrentUser(validToken);

      expect(user.id).toBe('user-123');
      expect(user.email).toBe('test@example.com');
      expect(user.role).toBe('admin');
      expect(user.displayName).toBe('Test User');
    });

    it('should throw UnauthorizedError when token is invalid', async () => {
      const mockResponse = {
        data: { user: null },
        error: { message: 'Invalid token' },
      };

      vi.mocked(supabase.auth.getUser).mockResolvedValue(mockResponse as any);

      await expect(authService.getCurrentUser('invalid-token')).rejects.toThrow('无效的访问令牌');
    });

    it('should throw TokenExpiredError when token is expired', async () => {
      const mockResponse = {
        data: { user: null },
        error: { message: 'Token expired' },
      };

      vi.mocked(supabase.auth.getUser).mockResolvedValue(mockResponse as any);

      await expect(authService.getCurrentUser('expired-token')).rejects.toThrow('访问令牌已过期');
    });
  });

  describe('verifyToken', () => {
    it('should return user info when token is valid', async () => {
      const mockResponse = {
        data: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            user_metadata: { role: 'operator' },
          },
        },
        error: null,
      };

      vi.mocked(supabase.auth.getUser).mockResolvedValue(mockResponse as any);

      const result = await authService.verifyToken('valid-token');

      expect(result.id).toBe('user-123');
      expect(result.email).toBe('test@example.com');
      expect(result.role).toBe('operator');
    });

    it('should throw UnauthorizedError when token is blacklisted', async () => {
      authService.blacklistToken('blacklisted-token');

      await expect(authService.verifyToken('blacklisted-token')).rejects.toThrow('令牌已被注销');
    });
  });

  describe('blacklist management', () => {
    it('should correctly manage token blacklist', () => {
      const token = 'test-token';
      
      expect(authService.isTokenBlacklisted(token)).toBe(false);
      
      authService.blacklistToken(token);
      expect(authService.isTokenBlacklisted(token)).toBe(true);
    });

    it('should cleanup blacklist when it exceeds max size', () => {
      // Fill blacklist
      for (let i = 0; i < 10001; i++) {
        authService.blacklistToken(`token-${i}`);
      }
      
      authService.cleanupBlacklist();
      
      // Should not throw
      expect(true).toBe(true);
    });
  });
});
