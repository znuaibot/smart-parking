// 车辆进出模块 - 业务逻辑层
// P0 修复：出场流程原子化、移除未使用的冗余方法
// P2-C 修复：添加关键操作日志和监控指标
import { vehicleRepository, VehicleEntryRecord, Bill } from './vehicle.repository.js';
import { lprService, LPRResult } from './lpr.service.js';
import { parkingRepository } from '../parking/parking.repository.js';
import { VehicleEntryDTO, VehicleExitDTO, ListVehicleRecordsQuery, VehicleOngoingQuery } from './vehicle.dto.js';
import { NotFoundError, ConflictError, ForbiddenError } from '../../shared/types/errors.js';
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
    const startTime = Date.now();
    
    try {
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

        logger.info('Calling LPR service for plate recognition', { 
          parkingId: dto.parkingId,
          hasImage: true,
        });
        
        const lprResult = await lprService.recognize(dto.entryImageUrl);
        plateNumber = lprResult.plateNumber;
        lprConfidence = lprResult.confidence;
        vehicleType = lprResult.vehicleType || vehicleType;

        logger.info('LPR recognition result', { 
          plateNumber, 
          confidence: lprConfidence,
          vehicleType,
        });
      }

      // 3. 检查是否重复入场（同车牌 + parked 状态）
      const existingRecord = await vehicleRepository.findOngoingByPlate(plateNumber, dto.parkingId);
      if (existingRecord) {
        logger.warn('Duplicate entry attempt', { 
          plateNumber, 
          parkingId: dto.parkingId,
          existingRecordId: existingRecord.id,
        });
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

      // P2-C: 记录成功日志和性能指标
      const duration = Date.now() - startTime;
      logger.info('Vehicle entry recorded successfully', {
        recordId: record.id,
        plateNumber,
        parkingId: dto.parkingId,
        vehicleType,
        durationMs: duration,
        lprUsed: !dto.plateNumber,
      });

      return record;
    } catch (error) {
      // P2-C: 记录失败日志
      const duration = Date.now() - startTime;
      logger.error('Vehicle entry failed', {
        plateNumber: dto.plateNumber,
        parkingId: dto.parkingId,
        durationMs: duration,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * 记录车辆出场（原子化操作）
   * P0 修复：使用数据库事务函数保证创建账单+更新记录+释放车位的原子性
   * 
   * 1. 查找同车牌的 parked 记录（防重复出场）
   * 2. 调用原子化 RPC 处理出场（创建账单 + 更新记录 + 释放车位）
   */
  async recordExit(dto: VehicleExitDTO): Promise<{ record: VehicleEntryRecord; bill: Bill }> {
    const startTime = Date.now();
    
    try {
      // 1. 查找在场记录（先查询用于返回和校验）
      const record = await vehicleRepository.findOngoingByPlate(dto.plateNumber, dto.parkingId);
      if (!record) {
        logger.warn('Exit attempt for non-existent record', {
          plateNumber: dto.plateNumber,
          parkingId: dto.parkingId,
        });
        throw new NotFoundError(`未找到车牌 ${dto.plateNumber} 的在场记录`);
      }

      // 2. 使用原子化 RPC 处理出场（创建账单、更新记录、释放车位在同一事务中）
      // 如果此步骤失败（如已有出场记录），数据库会回滚所有操作
      const result = await vehicleRepository.processExitAtomic({
        recordId: record.id,
        exitGateId: dto.exitGateId,
        exitImageUrl: dto.exitImageUrl,
        operatorId: dto.operatorId,
      });

      // 3. 查询更新后的记录和账单用于返回
      const updatedRecord = await vehicleRepository.findById(record.id);
      const bill = await vehicleRepository.findBillByRecordId(record.id);

      if (!updatedRecord || !bill) {
        throw new Error('出场处理完成后无法查询到记录或账单');
      }

      // P2-C: 记录成功日志和计费详情
      const duration = Date.now() - startTime;
      logger.info('Vehicle exit recorded successfully', {
        recordId: record.id,
        plateNumber: dto.plateNumber,
        parkingId: dto.parkingId,
        durationMinutes: result.durationMinutes,
        fee: result.fee,
        billId: result.billId,
        spaceReleased: result.spaceReleased,
        durationMs: duration,
      });

      return { record: updatedRecord, bill };
    } catch (error) {
      // P2-C: 记录失败日志
      const duration = Date.now() - startTime;
      logger.error('Vehicle exit failed', {
        plateNumber: dto.plateNumber,
        parkingId: dto.parkingId,
        durationMs: duration,
        error: (error as Error).message,
      });
      throw error;
    }
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
}

// 单例导出
export const vehicleService = new VehicleService();
