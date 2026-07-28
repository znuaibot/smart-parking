import apiClient from './client';
import type {
  ParkingSpace,
  AvailabilityResponse,
  PaginationParams,
  SpaceStatus,
  ApiResponse,
} from '@/types';

export const spaceApi = {
  getList(params?: PaginationParams & { parkingId?: string; zone?: string; status?: string }): Promise<ApiResponse<{ list: ParkingSpace[]; total: number }>> {
    return apiClient.get('/parking-spaces', { params }).then(res => res.data);
  },

  update(id: string, data: { spaceType?: string; status?: SpaceStatus }): Promise<ApiResponse<null>> {
    return apiClient.put(`/parking-spaces/${id}`, data).then(res => res.data);
  },

  updateStatus(id: string, status: SpaceStatus): Promise<ApiResponse<null>> {
    return apiClient.put(`/parking-spaces/${id}/status`, { status }).then(res => res.data);
  },

  getAvailability(parkingId: string): Promise<ApiResponse<AvailabilityResponse>> {
    return apiClient.get(`/parking-spaces/${parkingId}/availability`).then(res => res.data);
  },
};
