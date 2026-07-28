import apiClient from './client';
import type {
  ApiResponse,
  PaginationParams,
} from '@/types';

// 车辆入场请求
export interface VehicleEntryInput {
  parkingId: string;
  plateNumber?: string;
  vehicleType?: 'small' | 'large' | 'new_energy' | 'unknown';
  entryGateId?: string;
  entryImageUrl?: string;
  operatorId?: string;
  remark?: string;
}

// 车辆出场请求
export interface VehicleExitInput {
  parkingId: string;
  plateNumber: string;
  exitGateId?: string;
  exitImageUrl?: string;
  operatorId?: string;
}

// 入场记录
export interface VehicleRecord {
  id: string;
  parkingId: string;
  plateNumber: string;
  vehicleType: string;
  entryTime: string;
  exitTime?: string;
  entryGateId?: string;
  exitGateId?: string;
  entryImageUrl?: string;
  exitImageUrl?: string;
  status: 'parked' | 'exited' | 'overstay' | 'exception';
  lprConfidence?: number;
  operatorId?: string;
  remark?: string;
  createdAt: string;
  updatedAt: string;
}

// 账单
export interface Bill {
  id: string;
  recordId: string;
  parkingId: string;
  plateNumber: string;
  durationMinutes: number;
  amount: number;
  discountAmount: number;
  actualAmount: number;
  status: 'pending' | 'paid' | 'refunded' | 'waived' | 'disputed';
  paymentMethod?: 'wechat' | 'alipay' | 'cash' | 'card' | 'free' | 'month_card';
  paidAt?: string;
  transactionId?: string;
  operatorId?: string;
  createdAt: string;
  updatedAt: string;
}

// 出场响应
export interface VehicleExitResponse {
  record: VehicleRecord;
  bill: Bill;
}

// 记录列表参数
export interface VehicleRecordParams extends PaginationParams {
  parkingId?: string;
  plateNumber?: string;
  status?: 'parked' | 'exited' | 'overstay' | 'exception';
  startDate?: string;
  endDate?: string;
}

// 在场车辆查询参数
export interface VehicleOngoingParams {
  parkingId?: string;
  plateNumber?: string;
  page?: number;
  pageSize?: number;
}

export const vehicleApi = {
  // 记录车辆入场
  entry(data: VehicleEntryInput): Promise<ApiResponse<VehicleRecord>> {
    return apiClient.post('/vehicle-entry', data).then(res => res.data);
  },

  // 记录车辆出场
  exit(data: VehicleExitInput): Promise<ApiResponse<VehicleExitResponse>> {
    return apiClient.post('/vehicle-exit', data).then(res => res.data);
  },

  // 获取进出记录列表
  getRecords(params?: VehicleRecordParams): Promise<ApiResponse<{
    list: VehicleRecord[];
    total: number;
    page: number;
    pageSize: number;
  }>> {
    return apiClient.get('/vehicle-records', { params }).then(res => res.data);
  },

  // 获取记录详情
  getRecordById(id: string): Promise<ApiResponse<VehicleRecord>> {
    return apiClient.get(`/vehicle-records/${id}`).then(res => res.data);
  },

  // 查询在场车辆
  getOngoing(params: VehicleOngoingParams): Promise<ApiResponse<{
    list: VehicleRecord[];
    total: number;
  }>> {
    const { plateNumber, ...rest } = params;
    return apiClient.get(`/vehicles/${plateNumber}/ongoing`, { params: rest }).then(res => res.data);
  },
};
