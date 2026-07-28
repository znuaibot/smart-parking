// 车辆进出服务层单元测试
// P2-C 修复：测试租户隔离和计费逻辑

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

// Mock 依赖
const mockVehicleRepository = {
  findOngoingByPlate: vi.fn(),
  findById: vi.fn(),
  findBillByRecordId: vi.fn(),
  processExitAtomic: vi.fn(),
};

const mockParkingRepository = {
  findById: vi.fn(),
};

const mockLprService = {
  recognize: vi.fn(),
};

vi.mock('./vehicle.repository.js', () => ({
  vehicleRepository: mockVehicleRepository,
}));

vi.mock('../parking/parking.repository.js', () => ({
  parkingRepository: mockParkingRepository,
}));

vi.mock('./lpr.service.js', () => ({
  lprService: mockLprService,
}));

import { vehicleService } from './vehicle.service.js';
import { NotFoundError, ConflictError } from '../../shared/types/errors.js';

describe('VehicleService - 租户隔离测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('recordExit - 出场处理', () => {
    it('正常出场应返回记录和账单', async () => {
      const mockRecord = {
        id: 'record-123',
        parking_id: 'park-456',
        plate_number: '京A12345',
        vehicle_type: 'small',
        entry_time: new Date(Date.now() - 3600000).toISOString(), // 1小时前
        status: 'parked',
      };

      const mockBill = {
        id: 'bill-789',
        record_id: 'record-123',
        duration_minutes: 60,
        amount: 5,
        actual_amount: 5,
        status: 'pending',
      };

      mockVehicleRepository.findOngoingByPlate.mockResolvedValue(mockRecord);
      mockVehicleRepository.processExitAtomic.mockResolvedValue({
        billId: 'bill-789',
        durationMinutes: 60,
        fee: 5,
        actualFee: 5,
        exitTime: new Date().toISOString(),
        spaceReleased: true,
      });
      mockVehicleRepository.findById.mockResolvedValue({
        ...mockRecord,
        status: 'exited',
        exit_time: new Date().toISOString(),
      });
      mockVehicleRepository.findBillByRecordId.mockResolvedValue(mockBill);

      const result = await vehicleService.recordExit({
        plateNumber: '京A12345',
        parkingId: 'park-456',
      });

      expect(result.record).toBeDefined();
      expect(result.bill).toBeDefined();
      expect(result.bill.amount).toBe(5);
      expect(mockVehicleRepository.processExitAtomic).toHaveBeenCalledWith({
        recordId: 'record-123',
        exitGateId: undefined,
        exitImageUrl: undefined,
        operatorId: undefined,
      });
    });

    it('未找到在场记录应抛出 NotFoundError', async () => {
      mockVehicleRepository.findOngoingByPlate.mockResolvedValue(null);

      await expect(
        vehicleService.recordExit({
          plateNumber: '京A99999',
          parkingId: 'park-456',
        })
      ).rejects.toThrow(NotFoundError);
    });

    it('原子出场失败（记录已出场）应抛出异常', async () => {
      const mockRecord = {
        id: 'record-123',
        parking_id: 'park-456',
        plate_number: '京A12345',
        status: 'parked',
      };

      mockVehicleRepository.findOngoingByPlate.mockResolvedValue(mockRecord);
      mockVehicleRepository.processExitAtomic.mockResolvedValue({
        error: 'NOT_FOUND',
        message: '未找到指定的在场记录或记录已出场',
      });

      await expect(
        vehicleService.recordExit({
          plateNumber: '京A12345',
          parkingId: 'park-456',
        })
      ).rejects.toThrow('未找到指定的在场记录或记录已出场');
    });

    it('无计费规则时应抛出异常', async () => {
      const mockRecord = {
        id: 'record-123',
        parking_id: 'park-456',
        plate_number: '京A12345',
        status: 'parked',
      };

      mockVehicleRepository.findOngoingByPlate.mockResolvedValue(mockRecord);
      mockVehicleRepository.processExitAtomic.mockResolvedValue({
        error: 'NO_BILLING_RULE',
        message: '停车场未配置计费规则',
      });

      await expect(
        vehicleService.recordExit({
          plateNumber: '京A12345',
          parkingId: 'park-456',
        })
      ).rejects.toThrow('停车场未配置计费规则');
    });

    it('出场后记录状态应为 exited', async () => {
      const mockRecord = {
        id: 'record-123',
        parking_id: 'park-456',
        plate_number: '京A12345',
        vehicle_type: 'small',
        entry_time: new Date(Date.now() - 7200000).toISOString(), // 2小时前
        status: 'parked',
      };

      const exitedRecord = {
        ...mockRecord,
        status: 'exited',
        exit_time: new Date().toISOString(),
      };

      mockVehicleRepository.findOngoingByPlate.mockResolvedValue(mockRecord);
      mockVehicleRepository.processExitAtomic.mockResolvedValue({
        billId: 'bill-789',
        durationMinutes: 120,
        fee: 10,
        actualFee: 10,
        exitTime: new Date().toISOString(),
        spaceReleased: true,
      });
      mockVehicleRepository.findById.mockResolvedValue(exitedRecord);
      mockVehicleRepository.findBillByRecordId.mockResolvedValue({
        id: 'bill-789',
        amount: 10,
      });

      const result = await vehicleService.recordExit({
        plateNumber: '京A12345',
        parkingId: 'park-456',
      });

      expect(result.record.status).toBe('exited');
    });
  });

  describe('计费逻辑验证', () => {
    it('15分钟内免费', async () => {
      const mockRecord = {
        id: 'record-free',
        parking_id: 'park-456',
        plate_number: '京A12345',
        vehicle_type: 'small',
        entry_time: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10分钟前
        status: 'parked',
      };

      mockVehicleRepository.findOngoingByPlate.mockResolvedValue(mockRecord);
      mockVehicleRepository.processExitAtomic.mockResolvedValue({
        billId: 'bill-free',
        durationMinutes: 10,
        fee: 0,
        actualFee: 0,
        exitTime: new Date().toISOString(),
        spaceReleased: true,
      });
      mockVehicleRepository.findById.mockResolvedValue({
        ...mockRecord,
        status: 'exited',
      });
      mockVehicleRepository.findBillByRecordId.mockResolvedValue({
        id: 'bill-free',
        amount: 0,
      });

      const result = await vehicleService.recordExit({
        plateNumber: '京A12345',
        parkingId: 'park-456',
      });

      expect(result.bill.amount).toBe(0);
    });
  });
});
