// 车辆进出模块 - 业务逻辑层
import { vehicleRepository, VehicleEntryRecord, Bill } from './vehicle.repository.js';
import { lprService, LPRResult } from './lpr.service.js';
import { parkingRepository } from '../parking/parking.repository.js';
import { spaceService } from '../parking/space.service.js';
import { VehicleEntryDTO, VehicleExitDTO, ListVehicleRecordsQuery, VehicleOngoingQuery } from './vehicle.dto.js';
import { NotFoundError, ConflictError } from '../../shared/types/errors.js';
import { logger } from '../../shared/utils/logger.js';

/**
 * 车辆业务服务
 * 负责处理车辆入场、出场等核心逻辑
 */
export class VehicleService {
  /**
   * 记录车辆入场
   * 支持手动录入车牌和自动 LPR 识别
   */
  async recordEntry(dto: VehicleEntryDTO): Promise<VehicleEntryRecord> {
    // 1. 验证停车场是否存在
    const parking = await parkingRepository.findById(dto.parkingId);
    if (!parking) {
      throw new NotFoundError('停车场', dto.parkingId);
    }

    let plateNumber = dto.plateNumber;
    let lprConfidence: number | undefined;
    let vehicleType = dto.vehicleType;

    // 2. 如果未提供车牌，调用 LPR 识别
    if (!plateNumber) {
      if (!dto.entryImageUrl) {
        throw new Error('请提供车牌号码或入场图片');
      }

      logger.info('Calling LPR service for plate recognition', { parkingId: dto.parkingId });
      const lprResult = await lprService.recognize(dto.entryImageUrl);
      plateNumber = lprResult.plateNumber;
      lprConfidence = lprResult.confidence;
      vehicleType = lprResult.vehicleType || vehicleType;

      logger.info('LPR recognition result', { plateNumber, confidence: lprConfidence });
    }

    // 3. 检查是否重复入场（同车牌 + parked 状态）
    const existingRecord = await vehicleRepository.findOngoingByPlate(plateNumber, dto.parkingId);
    if (existingRecord) {
      throw new ConflictError(`车辆 ${plateNumber} 已在停车场内，请勿重复入场`);
    }

    // 4. 创建入场记录（触发器会自动分配车位）
    const record = await vehicleRepository.createEntry({
      parkingId: dto.parkingId,
      plateNumber,
      vehicleType,
      entryGateId: dto.entryGateId,
      entryImageUrl: dto.entryImageUrl,
      lprConfidence,
      operatorId: dto.operatorId,
      remark: dto.remark,
    });

    logger.info('Vehicle entry recorded', {
      recordId: record.id,
      plateNumber,
      parkingId: dto.parkingId,
    });

    return record;
  }

  /**
   * 记录车辆出场
   * 1. 查找同车牌的 parked 记录
   * 2. 计算停车时长
   * 3. 计算费用
   * 4. 创建待支付账单
   * 5. 更新记录状态为 exited
   * 6. 触发器释放车位
   */
  async recordExit(dto: VehicleExitDTO): Promise<{ record: VehicleEntryRecord; bill: Bill }> {
    // 1. 查找在场记录
    const record = await vehicleRepository.findOngoingByPlate(dto.plateNumber, dto.parkingId);
    if (!record) {
      throw new NotFoundError(`未找到车牌 ${dto.plateNumber} 的在场记录`);
    }

    // 2. 计算停车时长
    const entryTime = new Date(record.entry_time);
    const exitTime = new Date();
    const durationMs = exitTime.getTime() - entryTime.getTime();
    const durationMinutes = Math.ceil(durationMs / (1000 * 60));

    // 3. 计算费用（简化版，实际应根据计费规则）
    const fee = this.calculateFee(durationMinutes, record.vehicle_type);

    // 4. 创建账单
    const bill = await vehicleRepository.createBill({
      recordId: record.id,
      parkingId: record.parking_id,
      plateNumber: record.plate_number,
      durationMinutes,
      amount: fee,
      actualAmount: fee,
      operatorId: dto.operatorId,
    });

    // 5. 更新记录状态为 exited
    const updatedRecord = await vehicleRepository.updateToExited(record.id, {
      exitTime: exitTime.toISOString(),
      exitGateId: dto.exitGateId,
      exitImageUrl: dto.exitImageUrl,
    });

    // 6. 释放车位（触发器会自动处理，但这里也可以手动触发）
    // 查找并释放关联的车位
    await this.releaseSpaceForRecord(record.id);

    logger.info('Vehicle exit recorded', {
      recordId: record.id,
      plateNumber: dto.plateNumber,
      durationMinutes,
      fee,
    });

    return { record: updatedRecord, bill };
  }

  /**
   * 查询在场车辆
   */
  async getOngoingVehicles(query: VehicleOngoingQuery): Promise<{ data: any[]; total: number }> {
    return vehicleRepository.listOngoing({
      parkingId: query.parkingId,
      plateNumber: query.plateNumber,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  /**
   * 查询进出记录列表
   */
  async listRecords(query: ListVehicleRecordsQuery): Promise<{ data: VehicleEntryRecord[]; total: number }> {
    return vehicleRepository.listRecords({
      page: query.page,
      pageSize: query.pageSize,
      parkingId: query.parkingId,
      plateNumber: query.plateNumber,
      status: query.status,
      startDate: query.startDate,
      endDate: query.endDate,
    });
  }

  /**
   * 根据 ID 查询进出记录
   */
  async getRecordById(id: string): Promise<VehicleEntryRecord> {
    const record = await vehicleRepository.findById(id);
    if (!record) {
      throw new NotFoundError('进出记录', id);
    }
    return record;
  }

  /**
   * 计算停车费用（简化版）
   * 实际项目中应根据计费规则计算
   */
  private calculateFee(durationMinutes: number, vehicleType: string): number {
    // 简化计费逻辑：前15分钟免费，之后每小时5元
    const freeMinutes = 15;
    const hourlyRate = 5;

    if (durationMinutes <= freeMinutes) {
      return 0;
    }

    const chargeableMinutes = durationMinutes - freeMinutes;
    const hours = Math.ceil(chargeableMinutes / 60);
    return hours * hourlyRate;
  }

  /**
   * 释放记录关联的车位
   */
  private async releaseSpaceForRecord(recordId: string): Promise<void> {
    try {
      // 查找关联的车位（通过 current_entry_id）
      const space = await vehicleRepository.findSpaceByEntryId(recordId);
      if (space) {
        await spaceService.releaseSpace(space.id);
      }
    } catch (error) {
      // 车位释放失败不应影响出场流程
      logger.warn('Failed to release space for record', { recordId, error });
    }
  }
}

// 单例导出
export const vehicleService = new VehicleService();
