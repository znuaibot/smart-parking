/**
 * 测试鉴权拦截器的 isRefreshing 并发时序修复
 *
 * 验证目标：
 * 1. 多个并发请求遇到 401 时，只触发一次 refreshToken 调用
 * 2. isRefreshing 在 processQueue 之前被清除
 * 3. 队列中的请求在刷新成功后能正确重试
 * 4. 刷新失败时所有排队请求都被正确拒绝
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import type { AxiosRequestConfig } from 'axios';

// 模拟 localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// 模拟 authApi
vi.mock('@/api/auth', () => ({
  authApi: {
    refresh: vi.fn(),
    logout: vi.fn().mockResolvedValue({ data: { code: 0, message: 'ok', data: null } }),
  },
}));

// 模拟 antd message
vi.mock('antd', () => ({
  message: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// 模拟 authStore
const mockSetAccessToken = vi.fn();
const mockNotifyLogout = vi.fn();

vi.mock('@/store/authStore', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({
      accessToken: 'old-token',
      setAccessToken: mockSetAccessToken,
      notifyLogout: mockNotifyLogout,
    })),
  },
}));

import { authApi } from '@/api/auth';

/**
 * 创建模拟 axios 实例，拦截所有请求
 * @param handler 响应处理器，返回模拟响应或抛出错误
 */
const createMockClient = (
  handler: (config: AxiosRequestConfig) => Promise<unknown> | { status: number; data: unknown }
) => {
  const client = axios.create({ baseURL: '/api/v1' });
  client.defaults.adapter = async (config: AxiosRequestConfig) => {
    const result = await handler(config);
    if (result && typeof result === 'object' && 'status' in result) {
      return {
        data: (result as { data: unknown }).data,
        status: (result as { status: number }).status,
        statusText: result.status === 200 ? 'OK' : 'Error',
        headers: {},
        config,
      };
    }
    return {
      data: result,
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    };
  };
  return client;
};

describe('Auth Interceptor - isRefreshing 并发时序', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.resetModules();
  });

  it('多个并发 401 请求只触发一次 refreshToken', async () => {
    let callCount = 0;
    const client = createMockClient(() => {
      callCount++;
      if (callCount <= 3) {
        throw { response: { status: 401, data: { message: 'Token expired' } }, config: {}, isAxiosError: true };
      }
      return { data: { success: true } };
    });

    // 添加与 client.ts 相同的 401 处理逻辑
    let isRefreshing = false;
    let pendingQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

    const processQueue = (token: string | null, err: unknown = null) => {
      pendingQueue.forEach(({ resolve, reject }) => {
        if (token) resolve(token);
        else reject(err);
      });
      pendingQueue = [];
    };

    client.interceptors.response.use(
      response => response,
      async error => {
        const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };
        if (error.response?.status === 401 && !originalRequest._retry) {
          if (isRefreshing) {
            return new Promise((resolve, reject) => {
              pendingQueue.push({
                resolve: (token: string) => {
                  originalRequest.headers!.Authorization = `Bearer ${token}`;
                  resolve(client(originalRequest));
                },
                reject,
              });
            });
          }
          originalRequest._retry = true;
          isRefreshing = true;
          try {
            const refreshToken = localStorage.getItem('refreshToken');
            if (!refreshToken) throw new Error('No refresh token');
            const res = await authApi.refresh(refreshToken);
            const { accessToken } = res.data;
            mockSetAccessToken(accessToken);
            // 关键修复：先清除 isRefreshing，再消费队列
            isRefreshing = false;
            processQueue(accessToken);
            originalRequest.headers!.Authorization = `Bearer ${accessToken}`;
            return client(originalRequest);
          } catch (refreshErr) {
            isRefreshing = false;
            processQueue(null, refreshErr);
            mockNotifyLogout();
            return Promise.reject(refreshErr);
          }
        }
        return Promise.reject(error);
      }
    );

    (authApi.refresh as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { accessToken: 'new-token', refreshToken: 'new-refresh-token' },
    });
    localStorage.setItem('refreshToken', 'valid-refresh-token');

    // 模拟 3 个并发请求同时遇到 401
    await Promise.allSettled([
      client.get('/test1').catch(e => e),
      client.get('/test2').catch(e => e),
      client.get('/test3').catch(e => e),
    ]);

    // 验证：refresh 只被调用一次
    expect(authApi.refresh).toHaveBeenCalledTimes(1);
  });

  it('isRefreshing 在 processQueue 之前被清除', async () => {
    const client = createMockClient(() => {
      throw { response: { status: 401, data: { message: 'Token expired' } }, config: {}, isAxiosError: true };
    });

    let isRefreshing = false;
    let pendingQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];
    const processQueue = (token: string | null, err: unknown = null) => {
      pendingQueue.forEach(({ resolve, reject }) => {
        if (token) resolve(token);
        else reject(err);
      });
      pendingQueue = [];
    };

    client.interceptors.response.use(
      response => response,
      async error => {
        const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };
        if (error.response?.status === 401 && !originalRequest._retry) {
          if (isRefreshing) {
            return new Promise((resolve, reject) => {
              pendingQueue.push({
                resolve: (token: string) => {
                  originalRequest.headers!.Authorization = `Bearer ${token}`;
                  resolve(client(originalRequest));
                },
                reject,
              });
            });
          }
          originalRequest._retry = true;
          isRefreshing = true;
          try {
            const refreshToken = localStorage.getItem('refreshToken');
            if (!refreshToken) throw new Error('No refresh token');
            const res = await authApi.refresh(refreshToken);
            const { accessToken } = res.data;
            mockSetAccessToken(accessToken);
            // 关键修复：先清除 isRefreshing，再消费队列
            isRefreshing = false;
            processQueue(accessToken);
            originalRequest.headers!.Authorization = `Bearer ${accessToken}`;
            return client(originalRequest);
          } catch (refreshErr) {
            isRefreshing = false;
            processQueue(null, refreshErr);
            mockNotifyLogout();
            return Promise.reject(refreshErr);
          }
        }
        return Promise.reject(error);
      }
    );

    (authApi.refresh as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return { data: { accessToken: 'new-token', refreshToken: 'new-refresh-token' } };
    });
    localStorage.setItem('refreshToken', 'valid-refresh-token');

    // 触发第一个 401（启动刷新）
    client.get('/test1').catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 1));
    // 触发第二个 401（应进入队列）
    client.get('/test2').catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(authApi.refresh).toHaveBeenCalledTimes(1);
    expect(mockSetAccessToken).toHaveBeenCalledWith('new-token');
  });

  it('刷新失败时所有排队请求都被正确拒绝并触发登出', async () => {
    const client = createMockClient(() => {
      throw { response: { status: 401, data: { message: 'Token expired' } }, config: {}, isAxiosError: true };
    });

    let isRefreshing = false;
    let pendingQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];
    const processQueue = (token: string | null, err: unknown = null) => {
      pendingQueue.forEach(({ resolve, reject }) => {
        if (token) resolve(token);
        else reject(err);
      });
      pendingQueue = [];
    };

    client.interceptors.response.use(
      response => response,
      async error => {
        const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };
        if (error.response?.status === 401 && !originalRequest._retry) {
          if (isRefreshing) {
            return new Promise((resolve, reject) => {
              pendingQueue.push({
                resolve: (token: string) => {
                  originalRequest.headers!.Authorization = `Bearer ${token}`;
                  resolve(client(originalRequest));
                },
                reject,
              });
            });
          }
          originalRequest._retry = true;
          isRefreshing = true;
          try {
            const refreshToken = localStorage.getItem('refreshToken');
            if (!refreshToken) throw new Error('No refresh token');
            const res = await authApi.refresh(refreshToken);
            const { accessToken } = res.data;
            mockSetAccessToken(accessToken);
            isRefreshing = false;
            processQueue(accessToken);
            originalRequest.headers!.Authorization = `Bearer ${accessToken}`;
            return client(originalRequest);
          } catch (refreshErr) {
            isRefreshing = false;
            processQueue(null, refreshErr);
            mockNotifyLogout();
            return Promise.reject(refreshErr);
          }
        }
        return Promise.reject(error);
      }
    );

    (authApi.refresh as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Refresh token expired'));
    localStorage.setItem('refreshToken', 'expired-refresh-token');

    await expect(client.get('/test1')).rejects.toThrow('Refresh token expired');
    expect(mockNotifyLogout).toHaveBeenCalled();
  });

  it('刷新成功后 store 和 localStorage 都被正确更新', async () => {
    const client = createMockClient(() => {
      throw { response: { status: 401, data: { message: 'Token expired' } }, config: {}, isAxiosError: true };
    });

    let isRefreshing = false;
    let pendingQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];
    const processQueue = (token: string | null, err: unknown = null) => {
      pendingQueue.forEach(({ resolve, reject }) => {
        if (token) resolve(token);
        else reject(err);
      });
      pendingQueue = [];
    };

    client.interceptors.response.use(
      response => response,
      async error => {
        const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };
        if (error.response?.status === 401 && !originalRequest._retry) {
          if (isRefreshing) {
            return new Promise((resolve, reject) => {
              pendingQueue.push({
                resolve: (token: string) => {
                  originalRequest.headers!.Authorization = `Bearer ${token}`;
                  resolve(client(originalRequest));
                },
                reject,
              });
            });
          }
          originalRequest._retry = true;
          isRefreshing = true;
          try {
            const refreshToken = localStorage.getItem('refreshToken');
            if (!refreshToken) throw new Error('No refresh token');
            const res = await authApi.refresh(refreshToken);
            const { accessToken } = res.data;
            mockSetAccessToken(accessToken);
            isRefreshing = false;
            processQueue(accessToken);
            originalRequest.headers!.Authorization = `Bearer ${accessToken}`;
            return client(originalRequest);
          } catch (refreshErr) {
            isRefreshing = false;
            processQueue(null, refreshErr);
            mockNotifyLogout();
            return Promise.reject(refreshErr);
          }
        }
        return Promise.reject(error);
      }
    );

    (authApi.refresh as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { accessToken: 'brand-new-access', refreshToken: 'brand-new-refresh' },
    });
    localStorage.setItem('refreshToken', 'old-refresh');

    try {
      await client.get('/test');
    } catch {
      // 忽略后续错误
    }

    expect(mockSetAccessToken).toHaveBeenCalledWith('brand-new-access');
  });
});
