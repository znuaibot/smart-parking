import apiClient from './client';
import type {
  Parking,
  ParkingDetail,
  ParkingCreateInput,
  ParkingUpdateInput,
  ParkingSpace,
  PaginatedResponse,
  PaginationParams,
  ParkingStatus,
  ApiResponse,
} from '@/types';

export const parkingApi = {
  getList(params?: PaginationParams & { keyword?: string; status?: ParkingStatus }): Promise<ApiResponse<PaginatedResponse<Parking>>> {
    return apiClient.get('/parkings', { params }).then(res => res.data);
  },

  getById(id: string): Promise<ApiResponse<ParkingDetail>> {
    return apiClient.get(`/parkings/${id}`).then(res => res.data);
  },

  create(data: ParkingCreateInput): Promise<ApiResponse<Parking>> {
    return apiClient.post('/parkings', data).then(res => res.data);
  },

  update(id: string, data: ParkingUpdateInput): Promise<ApiResponse<Parking>> {
    return apiClient.put(`/parkings/${id}`, data).then(res => res.data);
  },

  delete(id: string): Promise<ApiResponse<null>> {
    return apiClient.delete(`/parkings/${id}`).then(res => res.data);
  },

  getSpaces(
    id: string,
    params?: { zone?: string; status?: string; floor?: number }
  ): Promise<ApiResponse<{ list: ParkingSpace[]; total: number }>> {
    return apiClient.get(`/parkings/${id}/spaces`, { params }).then(res => res.data);
  },

  batchCreateSpaces(
    id: string,
    data: { count: number; zone: string; floor: number; spaceType: string }
  ): Promise<ApiResponse<{ created: number }>> {
    return apiClient.post(`/parkings/${id}/spaces/batch`, data).then(res => res.data);
  },
};
