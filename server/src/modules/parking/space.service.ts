// 车位模块 - 业务逻辑层
import { spaceRepository, ParkingSpace, SpaceStatus, SpaceType, AvailabilityInfo } from './space.repository.js';
import { parkingRepository } from './parking.repository.js';
import { NotFoundError, ConflictError } from '../../shared/types/errors.js';
import { logger } from '../../shared/utils/logger.js';

/**
 * 批量创建车位请求 DTO
 */
export interface BatchCreateSpaceDTO {
  zone: string;           // 区域，如 A, B, C
  floor?: number;         // 楼层，默认 1
  startNumber: number;    // 起始编号
  count: number;          // 创建数量
  spaceType?: SpaceType;  // 车位类型，默认 normal
  prefix?: string;        // 编号前缀，默认使用 zone
}

/**
 * 更新车位状态请求 DTO
 */
export interface UpdateSpaceStatusDTO {
  status: SpaceStatus;
  expectedStatus: SpaceStatus;  // 用于乐观锁校验
  currentPlate?: string | null;
  currentEntryId?: string | null;
}

/**
 * 车位业务服务
 */
export class SpaceService {
  /**
   * 获取车位列表（支持筛选）
   */
  async list(params: {
    parkingId?: string;
    zone?: string;
    floor?: number;
    status?: SpaceStatus;
    page: number;
    pageSize: number;
  }): Promise<{ data: ParkingSpace[]; total: number }> {
    return spaceRepository.list(params);
  }

  /**
   * 根据 ID 获取车位详情
   */
  async getById(id: string): Promise<ParkingSpace> {
    const space = await spaceRepository.findById(id);
    if (!space) {
      throw new NotFoundError('车位', id);
    }
    return space;
  }

  /**
   * 批量创建车位
   * 生成如 A-01-001, A-01-002 ... 的编号
   */
  async batchCreate(parkingId: string, dto: BatchCreateSpaceDTO): Promise<ParkingSpace[]> {
    // 检查停车场是否存在
    const parking = await parkingRepository.findById(parkingId);
    if (!parking) {
      throw new NotFoundError('停车场', parkingId);
    }

    const { zone, floor = 1, startNumber, count, spaceType = 'normal', prefix } = dto;

    if (count <= 0 || count > 1000) {
      throw new Error('批量创建数量必须在 1-1000 之间');
    }

    // 生成车位数据
    const spaceCodePrefix = prefix || zone;
    const spaces: Omit<ParkingSpace, 'id' | 'created_at' | 'updated_at'>[] = [];

    for (let i = 0; i < count; i++) {
      const number = startNumber + i;
      // 生成编号格式: A-01-001 (区域-楼层-序号)
      const code = `${spaceCodePrefix}-${String(floor).padStart(2, '0')}-${String(number).padStart(3, '0')}`;

      spaces.push({
        parking_id: parkingId,
        code,
        zone,
        floor,
        space_type: spaceType,
        status: 'available',
        current_plate: null,
        current_entry_id: null,
        device_id: null,
      });
    }

    logger.info('Batch creating spaces', { parkingId, zone, count });

    return spaceRepository.batchCreate(spaces);
  }

  /**
   * 更新车位状态（带乐观锁）
   */
  async updateStatus(id: string, dto: UpdateSpaceStatusDTO): Promise<ParkingSpace> {
    // 检查车位是否存在
    const existing = await spaceRepository.findById(id);
    if (!existing) {
      throw new NotFoundError('车位', id);
    }

    // 使用乐观锁更新
    const updated = await spaceRepository.updateStatusAtomic(
      id,
      dto.status,
      dto.expectedStatus,
      {
        currentPlate: dto.currentPlate,
        currentEntryId: dto.currentEntryId,
      },
    );

    if (!updated) {
      throw new ConflictError('车位状态已被其他操作修改，请刷新后重试');
    }

    logger.info('Space status updated', { id, oldStatus: dto.expectedStatus, newStatus: dto.status });

    return updated;
  }

  /**
   * 获取实时余位信息
   */
  async getAvailability(parkingId: string): Promise<AvailabilityInfo> {
    const availability = await spaceRepository.getAvailability(parkingId);
    if (!availability) {
      throw new NotFoundError('停车场', parkingId);
    }
    return availability;
  }

  /**
   * 释放车位（车辆出场时调用）
   */
  async releaseSpace(id: string): Promise<void> {
    const existing = await spaceRepository.findById(id);
    if (!existing) {
      throw new NotFoundError('车位', id);
    }

    await spaceRepository.releaseSpace(id);

    logger.info('Space released', { id });
  }
}

// 单例导出
export const spaceService = new SpaceService();
