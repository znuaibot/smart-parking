// 停车场模块 - 业务逻辑层
import { parkingRepository, Parking, PaginatedResult } from './parking.repository.js';
import { CreateParkingDTO, UpdateParkingDTO, ListParkingQuery } from './parking.dto.js';
import { NotFoundError, ConflictError } from '../../shared/types/errors.js';
import { logger } from '../../shared/utils/logger.js';

/**
 * 停车场业务服务
 */
export class ParkingService {
  /**
   * 获取停车场列表（分页）
   */
  async list(query: ListParkingQuery): Promise<PaginatedResult<Parking>> {
    return parkingRepository.list({
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword,
      status: query.status,
    });
  }

  /**
   * 获取停车场详情
   */
  async getById(id: string): Promise<Parking> {
    const parking = await parkingRepository.findById(id);
    if (!parking) {
      throw new NotFoundError('停车场', id);
    }
    return parking;
  }

  /**
   * 创建停车场
   */
  async create(dto: CreateParkingDTO): Promise<Parking> {
    // 校验编码唯一性
    const exists = await parkingRepository.isCodeExists(dto.code);
    if (exists) {
      throw new ConflictError(`停车场编码 ${dto.code} 已存在`);
    }

    logger.info('Creating parking', { name: dto.name, code: dto.code });

    return parkingRepository.create({
      name: dto.name,
      code: dto.code,
      address: dto.address,
      totalSpaces: dto.totalSpaces,
      contactPhone: dto.contactPhone,
      config: dto.config,
    });
  }

  /**
   * 更新停车场信息
   */
  async update(id: string, dto: UpdateParkingDTO): Promise<Parking> {
    // 检查是否存在
    const existing = await parkingRepository.findById(id);
    if (!existing) {
      throw new NotFoundError('停车场', id);
    }

    logger.info('Updating parking', { id, updates: dto });

    return parkingRepository.update(id, {
      name: dto.name,
      address: dto.address,
      contactPhone: dto.contactPhone,
      totalSpaces: dto.totalSpaces,
      status: dto.status,
      config: dto.config,
    });
  }

  /**
   * 软删除停车场
   */
  async delete(id: string): Promise<void> {
    // 检查是否存在
    const existing = await parkingRepository.findById(id);
    if (!existing) {
      throw new NotFoundError('停车场', id);
    }

    logger.info('Soft deleting parking', { id });

    await parkingRepository.softDelete(id);
  }
}

// 单例导出
export const parkingService = new ParkingService();
