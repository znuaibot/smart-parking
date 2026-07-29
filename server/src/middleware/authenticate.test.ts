// 鉴权中间件单元测试
// P2-C 修复：测试 profiles 查询失败时的行为、banned_until 时间比较

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

// 使用 vi.hoisted 解决 vi.mock 提升问题
const { mockSupabase, mockQueryChain } = vi.hoisted(() => {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(),
  };
  return {
    mockQueryChain: chain,
    mockSupabase: {
      auth: {
        admin: {
          getUser: vi.fn(),
        },
      },
      from: vi.fn(() => chain),
    },
  };
});

vi.mock('../shared/database/supabase.js', () => ({
  supabase: mockSupabase,
  default: mockSupabase,
  getSupabase: () => mockSupabase,
  getAnonClient: () => mockSupabase,
}));

// Mock Redis 黑名单
vi.mock('../shared/utils/redis.js', () => ({
  RedisTokenBlacklist: {
    getInstance: vi.fn().mockResolvedValue({
      isBlacklisted: vi.fn().mockResolvedValue(false), // 测试中默认 token 不在黑名单
      blacklistToken: vi.fn().mockResolvedValue(undefined),
      blacklistTokenPair: vi.fn().mockResolvedValue(undefined),
      isAvailable: vi.fn().mockReturnValue(false),
    }),
  },
  UserSessionCache: {
    getInstance: vi.fn().mockResolvedValue({
      getUser: vi.fn().mockResolvedValue(null),
      setUser: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

// 导入被测函数（注意：mock 需要在导入前设置）
import { authenticate, requireRole, requireParkingAccess } from './authenticate.js';
import { ForbiddenError, AccountDisabledError, UnauthorizedError, TokenExpiredError } from '../shared/types/errors.js';

function createMockResponse() {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as Response;
}

function createMockNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

describe('authenticate middleware', () => {
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    res = createMockResponse();
    next = createMockNext();
    vi.clearAllMocks();
  });

  it('白名单路径应直接放行', async () => {
    const req = { path: '/health', originalUrl: '/health', headers: {} } as Request;
    await authenticate(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('缺少 Authorization 头应返回 401', async () => {
    const req = { path: '/api/test', originalUrl: '/api/test', headers: {} } as Request;
    await authenticate(req, res, next);
    expect(next).toHaveBeenCalled();
    const error = (next as any).mock.calls[0][0];
    expect(error).toBeInstanceOf(UnauthorizedError);
  });

  it('Token 过短应返回 401', async () => {
    const req = {
      path: '/api/test',
      originalUrl: '/api/test',
      headers: { authorization: 'Bearer short' },
    } as Request;
    await authenticate(req, res, next);
    expect(next).toHaveBeenCalled();
    const error = (next as any).mock.calls[0][0];
    expect(error).toBeInstanceOf(UnauthorizedError);
  });

  it('Token 验证失败应返回 401', async () => {
    mockSupabase.auth.admin.getUser.mockResolvedValue({
      data: null,
      error: { message: 'invalid token' },
    });

    const req = {
      path: '/api/test',
      originalUrl: '/api/test',
      headers: { authorization: 'Bearer validtoken123456789012345' },
    } as Request;

    await authenticate(req, res, next);
    expect(next).toHaveBeenCalled();
    const error = (next as any).mock.calls[0][0];
    expect(error).toBeInstanceOf(UnauthorizedError);
  });

  it('Token 过期应返回 TokenExpiredError', async () => {
    mockSupabase.auth.admin.getUser.mockResolvedValue({
      data: null,
      error: { message: 'token expired' },
    });

    const req = {
      path: '/api/test',
      originalUrl: '/api/test',
      headers: { authorization: 'Bearer validtoken123456789012345' },
    } as Request;

    await authenticate(req, res, next);
    expect(next).toHaveBeenCalled();
    const error = (next as any).mock.calls[0][0];
    expect(error).toBeInstanceOf(TokenExpiredError);
  });

  it('profiles 不存在时应返回 403（不回退 user_metadata）', async () => {
    mockSupabase.auth.admin.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@test.com', banned_until: null } },
      error: null,
    });
    mockQueryChain.single.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116' },
    });

    const req = {
      path: '/api/test',
      originalUrl: '/api/test',
      headers: { authorization: 'Bearer validtoken123456789012345' },
      ip: '127.0.0.1',
    } as Request;

    await authenticate(req, res, next);
    expect(next).toHaveBeenCalled();
    const error = (next as any).mock.calls[0][0];
    expect(error).toBeInstanceOf(ForbiddenError);
    expect(error.message).toContain('用户资料未找到');
  });

  it('banned_until 为过去时间时不应拦截', async () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString(); // 昨天
    mockSupabase.auth.admin.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@test.com', banned_until: pastDate } },
      error: null,
    });
    mockQueryChain.single.mockResolvedValue({
      data: { role: 'operator', is_active: true, parking_id: 'park-123' },
      error: null,
    });

    const req = {
      path: '/api/test',
      originalUrl: '/api/test',
      headers: { authorization: 'Bearer validtoken123456789012345' },
      ip: '127.0.0.1',
    } as Request;

    await authenticate(req, res, next);
    expect(next).toHaveBeenCalledWith(); // 无错误，直接放行
    expect((req as any).user).toEqual({
      id: 'user-123',
      role: 'operator',
      email: 'test@test.com',
      parkingId: 'park-123',
    });
  });

  it('banned_until 为未来时间时应拦截', async () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString(); // 明天
    mockSupabase.auth.admin.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@test.com', banned_until: futureDate } },
      error: null,
    });

    const req = {
      path: '/api/test',
      originalUrl: '/api/test',
      headers: { authorization: 'Bearer validtoken123456789012345' },
      ip: '127.0.0.1',
    } as Request;

    await authenticate(req, res, next);
    expect(next).toHaveBeenCalled();
    const error = (next as any).mock.calls[0][0];
    expect(error).toBeInstanceOf(AccountDisabledError);
  });
});

describe('requireParkingAccess middleware', () => {
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    res = createMockResponse();
    next = createMockNext();
    vi.clearAllMocks();
  });

  it('superadmin 应直接放行', () => {
    const req = {
      user: { id: 'user-1', role: 'superadmin', parkingId: undefined },
      params: { id: 'park-999' },
    } as unknown as Request;

    requireParkingAccess(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('admin 应直接放行', () => {
    const req = {
      user: { id: 'user-1', role: 'admin', parkingId: undefined },
      params: {},
      query: {},
      body: { parkingId: 'park-999' },
    } as unknown as Request;

    requireParkingAccess(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('parkingId 为空时应返回 403 (P0-A 修复)', () => {
    const req = {
      user: { id: 'user-1', role: 'operator', parkingId: undefined },
      params: {},
      query: {},
      body: {},
    } as unknown as Request;

    requireParkingAccess(req, res, next);
    expect(next).toHaveBeenCalled();
    const error = (next as any).mock.calls[0][0];
    expect(error).toBeInstanceOf(ForbiddenError);
    expect(error.message).toContain('缺少停车场 ID');
  });

  it('cashier 未分配停车场时应返回 403 (P0-A 修复)', () => {
    const req = {
      user: { id: 'user-1', role: 'cashier', parkingId: undefined },
      params: { id: 'park-123' },
      query: {},
      body: {},
    } as unknown as Request;

    requireParkingAccess(req, res, next);
    expect(next).toHaveBeenCalled();
    const error = (next as any).mock.calls[0][0];
    expect(error).toBeInstanceOf(ForbiddenError);
    expect(error.message).toContain('用户未分配停车场');
  });

  it('operator 操作其他停车场应返回 403', () => {
    const req = {
      user: { id: 'user-1', role: 'operator', parkingId: 'park-456' },
      params: { id: 'park-123' },
      query: {},
      body: {},
    } as unknown as Request;

    requireParkingAccess(req, res, next);
    expect(next).toHaveBeenCalled();
    const error = (next as any).mock.calls[0][0];
    expect(error).toBeInstanceOf(ForbiddenError);
    expect(error.message).toContain('无权操作此停车场');
  });

  it('operator 操作所属停车场应放行', () => {
    const req = {
      user: { id: 'user-1', role: 'operator', parkingId: 'park-123' },
      params: { id: 'park-123' },
      query: {},
      body: {},
    } as unknown as Request;

    requireParkingAccess(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });
});
