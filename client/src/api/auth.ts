import apiClient from './client';
import type { LoginRequest, LoginResponse, ApiResponse, User } from '@/types';

export const authApi = {
  login(data: LoginRequest): Promise<ApiResponse<LoginResponse>> {
    return apiClient.post('/auth/login', data).then(res => res.data);
  },

  logout(): Promise<ApiResponse<null>> {
    return apiClient.post('/auth/logout').then(res => res.data);
  },

  refresh(refreshToken: string): Promise<ApiResponse<{ accessToken: string; refreshToken: string }>> {
    return apiClient.post('/auth/refresh', { refreshToken }).then(res => res.data);
  },

  getCurrentUser(): Promise<ApiResponse<User>> {
    return apiClient.get('/auth/me').then(res => res.data);
  },

  changePassword(oldPassword: string, newPassword: string): Promise<ApiResponse<null>> {
    return apiClient.put('/auth/password', { oldPassword, newPassword }).then(res => res.data);
  },
};
