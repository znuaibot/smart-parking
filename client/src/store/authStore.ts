import { create } from 'zustand';
import { authApi } from '@/api/auth';
import type { User } from '@/types';

const getUserFromStorage = (): User | null => {
  try {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  } catch (e) {
    console.error('Failed to parse user from localStorage', e);
    localStorage.removeItem('user');
    return null;
  }
};

const getAccessTokenFromStorage = (): string | null => {
  return localStorage.getItem('accessToken');
};

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  setUser: (user: User | null, token: string | null) => void;
  setAccessToken: (token: string) => void;
  logout: () => Promise<void>;
  notifyLogout: () => void;
}

export const useAuthStore = create<AuthState>((set, _get) => ({
  user: getUserFromStorage(),
  accessToken: getAccessTokenFromStorage(),
  isAuthenticated: !!getAccessTokenFromStorage(),

  setUser: (user, token) => {
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    } else {
      localStorage.removeItem('user');
    }
    if (token) {
      localStorage.setItem('accessToken', token);
    } else {
      localStorage.removeItem('accessToken');
    }
    set({ user, accessToken: token, isAuthenticated: !!token });
  },

  setAccessToken: (token: string) => {
    localStorage.setItem('accessToken', token);
    set({ accessToken: token, isAuthenticated: true });
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      // 后端登出失败也继续清理前端状态
    } finally {
      localStorage.removeItem('user');
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      set({ user: null, accessToken: null, isAuthenticated: false });
    }
  },

  // 401 拦截器中调用的轻量清理（无需请求后端）
  notifyLogout: () => {
    localStorage.removeItem('user');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    set({ user: null, accessToken: null, isAuthenticated: false });
  },
}));
