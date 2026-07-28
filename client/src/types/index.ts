// 用户角色
export type UserRole = 'superadmin' | 'admin' | 'operator' | 'cashier';

// 用户信息
export interface User {
  id: string;
  username: string;
  role: UserRole;
}

// 登录请求
export interface LoginRequest {
  username: string;
  password: string;
}

// 登录响应
export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

// 停车场状态
export type ParkingStatus = 'active' | 'inactive' | 'suspended';

// 停车场
export interface Parking {
  id: string;
  name: string;
  code: string;
  address: string;
  contactPhone?: string;
  totalSpaces: number;
  availableSpaces: number;
  status: ParkingStatus;
  createdAt: string;
  updatedAt: string;
}

// 停车场详情
export interface ParkingDetail extends Parking {
  recentStats?: {
    todayEntry: number;
    todayRevenue: number;
  };
}

// 创建停车场输入
export interface ParkingCreateInput {
  name: string;
  code: string;
  address?: string;
  contactPhone?: string;
  totalSpaces?: number;
}

// 更新停车场输入
export interface ParkingUpdateInput {
  name?: string;
  address?: string;
  contactPhone?: string;
  status?: ParkingStatus;
}

// 车位类型
export type SpaceType = 'normal' | 'vip' | 'disabled' | 'charging';

// 车位状态
export type SpaceStatus = 'available' | 'occupied' | 'reserved' | 'disabled';

// 车位
export interface ParkingSpace {
  id: string;
  parkingId: string;
  code: string;
  zone: string;
  floor: number;
  spaceType: SpaceType;
  status: SpaceStatus;
  currentPlate?: string;
  currentEntryId?: string;
  deviceId?: string;
}

// 余位统计
export interface AvailabilityResponse {
  total: number;
  available: number;
  occupied: number;
  reserved: number;
  disabled: number;
}

// 实时统计
export interface RealtimeStats {
  parkingId: string;
  timestamp: string;
  totalSpaces: number;
  occupied: number;
  available: number;
  occupancyRate: number;
  todayEntry: number;
  todayExit: number;
  todayRevenue: number;
  zoneStats: Array<{
    zone: string;
    total: number;
    available: number;
  }>;
}

// 分页参数
export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

// 分页响应
export interface PaginatedResponse<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

// API 响应
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}
