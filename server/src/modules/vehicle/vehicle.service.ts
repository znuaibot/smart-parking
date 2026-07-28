// 车辆进出模块 - 业务逻辑层
import { vehicleRepository, VehicleEntryRecord, Bill } from './vehicle.repository.js';
import { lprService } from './lpr.service.js';
import { parkingRepository } from '../parking/parking.repository.js';
import { spaceService } from '../parking/space.service.js';
import { VehicleEntryDTO, VehicleExitDTO, ListVehicleRecordsQuery, VehicleOngoingQuery } from './vehicle.dto.js';
import { NotFoundError, ConflictError, ServiceUnavailableError } from '../../shared/types/errors.js';
import { logger } from '../../shared/utils/logger.js';
import { config } from '../../config/index.js';

/**
 * 出场结果接口
 */
interface ExitResult {
  record: VehicleEntryRecord;
  bill: Bill;
}

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
   * 使用 RPC 在数据库事务中原子执行：
   * 1. 查 parked 记录 → 2. 计算时长和费用 → 3. 创建账单 → 4. 更新状态 → 5. 释放车位
   */
  async recordExit(dto: VehicleExitDTO): Promise<ExitResult> {
    // 1. 验证停车场是否存在
    const parking = await parkingRepository.findById(dto.parkingId);
    if (!parking) {
      throw new NotFoundError('停车场', dto.parkingId);
    }

    // 2. 使用 RPC 在数据库事务中执行全部出场操作
    const { data, error } = await vehicleRepository.executeVehicleExit({
      p_plate_number: dto.plateNumber,
      p_parking_id: dto.parkingId,
      p_exit_gate_id: dto.exitGateId || null,
      p_exit_image_url: dto.exitImageUrl || null,
      p_operator_id: dto.operatorId || null,
    });

    if (error) {
      // 处理 RPC 返回的业务错误
      if (error.message?.includes('NOT_FOUND')) {
        throw new NotFoundError(`未找到车牌 ${dto.plateNumber} 的在场记录`);
      }
      if (error.message?.includes('ALREADY_EXITED')) {
        throw new ConflictError('该车辆已出场');
      }
      logger.error('Vehicle exit RPC failed', { error: error.message, plateNumber: dto.plateNumber });
      throw error;
    }

    if (!data) {
      throw new NotFoundError(`未找到车牌 ${dto.plateNumber} 的在场记录`);
    }

    // 解析 RPC 返回的 JSON 结果
    let result: ExitResult;
    if (typeof data === 'string') {
      const parsed = JSON.parse(data);
      if (parsed.error) {
        throw new NotFoundError(parsed.message || '出场处理失败');
      }
      result = { record: parsed.record, bill: parsed.bill };
    } else if (typeof data === 'object' && data.error) {
      throw new NotFoundError(data.message || '出场处理失败');
    } else {
      result = data as ExitResult;
    }

    logger.info('Vehicle exit recorded (atomic)', {
      recordId: result.record.id,
      plateNumber: dto.plateNumber,
      durationMinutes: result.bill.duration_minutes,
      fee: result.bill.amount,
    });

    return result;
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
   * 释放记录关联的车位（备用方法）
   */
  async releaseSpaceForRecord(recordId: string): Promise<void> {
    try {
      const space = await vehicleRepository.findSpaceByEntryId(recordId);
      if (space) {
        await spaceService.releaseSpace(space.id);
      }
    } catch (error) {
      logger.warn('Failed to release space for record', { recordId, error });
    }
  }
}

// 单例导出
export const vehicleService = new VehicleService();
