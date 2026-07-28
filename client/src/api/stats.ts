import apiClient from './client';
import type { RealtimeStats, ApiResponse } from '@/types';

export const statsApi = {
  getRealtime(parkingId: string): Promise<ApiResponse<RealtimeStats>> {
    return apiClient.get(`/stats/realtime/${parkingId}`).then(res => res.data);
  },

  getDaily(parkingId: string): Promise<ApiResponse<unknown>> {
    return apiClient.get(`/stats/daily/${parkingId}`).then(res => res.data);
  },

  getWeekly(parkingId: string): Promise<ApiResponse<unknown>> {
    return apiClient.get(`/stats/weekly/${parkingId}`).then(res => res.data);
  },

  getMonthly(parkingId: string): Promise<ApiResponse<unknown>> {
    return apiClient.get(`/stats/monthly/${parkingId}`).then(res => res.data);
  },
};
