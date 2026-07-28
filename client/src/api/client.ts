import axios from 'axios';
import type { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import { message } from 'antd';
import { authApi } from './auth';
import { useAuthStore } from '@/store/authStore';

const apiClient: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// 标志：是否正在刷新 Token
let isRefreshing = false;
// 等待刷新完成的请求队列
let pendingQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

// 消费队列
const processQueue = (token: string | null, err: unknown = null) => {
  pendingQueue.forEach(({ resolve, reject }) => {
    if (token) {
      resolve(token);
    } else {
      reject(err);
    }
  });
  pendingQueue = [];
};

// 请求拦截器 - 添加 Token（从 authStore 同步）
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = useAuthStore.getState().accessToken;
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  error => Promise.reject(error)
);

// 响应拦截器
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async error => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // 401 处理：尝试静默刷新 Token
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // 已在刷新中，排队等待
        return new Promise((resolve, reject) => {
          pendingQueue.push({
            resolve: (token: string) => {
              originalRequest.headers!.Authorization = `Bearer ${token}`;
              resolve(apiClient(originalRequest));
            },
            reject,
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        const res = await authApi.refresh(refreshToken);
        const { accessToken, refreshToken: newRefreshToken } = res.data;

        // 更新 store 和 localStorage
        useAuthStore.getState().setAccessToken(accessToken);
        localStorage.setItem('refreshToken', newRefreshToken);

        // 先清除 isRefreshing 标志，再消费队列
        // 确保队列中的请求执行时如果再次遇到 401，能正常进入新的刷新流程
        isRefreshing = false;

        // 消费队列中的请求
        processQueue(accessToken);

        // 重试原请求
        originalRequest.headers!.Authorization = `Bearer ${accessToken}`;
        return apiClient(originalRequest);
      } catch (refreshErr) {
        // 刷新失败，先清除标志
        isRefreshing = false;
        // 消费队列（传递错误）
        processQueue(null, refreshErr);
        useAuthStore.getState().notifyLogout();
        // 使用软跳转（通知路由）
        window.dispatchEvent(new CustomEvent('auth:logout'));
        return Promise.reject(refreshErr);
      }
    }

    // 其他错误（500/403/400）全局兜底提示
    const skipGlobalError = (originalRequest as unknown as { skipGlobalError?: boolean }).skipGlobalError;
    if (!skipGlobalError && error.response) {
      const msg = error.response.data?.message || error.message || '请求失败';
      message.error(msg);
    }

    return Promise.reject(error);
  }
);

export default apiClient;
