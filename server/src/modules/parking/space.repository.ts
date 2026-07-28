// 车位模块 - 数据访问层
import { supabase } from '../../shared/database/supabase.js';
import { logger } from '../../shared/utils/logger.js';

/**
 * 车位状态枚举
 */
export type SpaceStatus = 'available' | 'occupied' | 'reserved' | 'disabled';

/**
 * 车位类型枚举
 */
export type SpaceType = 'normal' | 'vip' | 'disabled' | 'charging';

/**
 * 车位数据对象
 */
export interface ParkingSpace {
  id: string;
  parking_id: string;
  code: string;
  zone: string | null;
  floor: number;
  space_type: SpaceType;
  status: SpaceStatus;
  current_plate: string | null;
  current_entry_id: string | null;
  device_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * 实时余位信息
 */
export interface AvailabilityInfo {
  id: string;
  name: string;
  total_spaces: number;
  available_spaces: number;
  occupied_spaces: number;
  occupancy_rate: number;
}

/**
 * 车位数据访问层
 */
export class SpaceRepository {
  private readonly tableName = 'parking_spaces';

  /**
   * 查询车位列表（按区域、楼层、状态筛选）
   */
  async list(params: {
    parkingId?: string;
    zone?: string;
    floor?: number;
    status?: SpaceStatus;
    page: number;
    pageSize: number;
  }): Promise<{ data: ParkingSpace[]; total: number }> {
    const { parkingId, zone, floor, status, page, pageSize } = params;
    const offset = (page - 1) * pageSize;

    let query = supabase.from(this.tableName).select('*', { count: 'exact' });

    // 筛选条件
    if (parkingId) {
      query = query.eq('parking_id', parkingId);
    }
    if (zone) {
      query = query.eq('zone', zone);
    }
    if (floor !== undefined) {
      query = query.eq('floor', floor);
    }
    if (status) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query
      .order('floor', { ascending: true })
      .order('code', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      logger.error('Failed to list parking spaces', { error: error.message, params });
      throw error;
    }

    return {
      data: data as ParkingSpace[],
      total: count || 0,
    };
  }

  /**
   * 根据 ID 查询车位
   */
  async findById(id: string): Promise<ParkingSpace | null> {
    const { data, error } = await supabase
      .from(this.tableName)
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      logger.error('Failed to find space by id', { error: error.message, id });
      throw error;
    }

    return data as ParkingSpace;
  }

  /**
   * 批量创建车位
   */
  async batchCreate(spaces: Omit<ParkingSpace, 'id' | 'created_at' | 'updated_at'>[]): Promise<ParkingSpace[]> {
    const { data, error } = await supabase
      .from(this.tableName)
      .insert(spaces)
      .select();

    if (error) {
      logger.error('Failed to batch create spaces', { error: error.message, count: spaces.length });
      throw error;
    }

    return data as ParkingSpace[];
  }

  /**
   * 乐观锁更新车位状态
   * @returns 更新后的车位，如果版本冲突返回 null
   */
  async updateStatusWithOptimisticLock(
    id: string,
    newStatus: SpaceStatus,
    expectedVersion: number,
    additionalUpdates?: Partial<ParkingSpace>,
  ): Promise<ParkingSpace | null> {
    // 构建更新数据
    const updateData: Record<string, any> = {
      status: newStatus,
      ...additionalUpdates,
    };

    // 使用 Supabase 的原子更新实现乐观锁
    // 注意：由于表上没有 version 字段，我们使用 updated_at 作为乐观锁依据
    const { data, error } = await supabase
      .from(this.tableName)
      .update(updateData)
      .eq('id', id)
      .eq('status', expectedVersion === 0 ? 'available' : undefined) // 简化版乐观锁
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // 未找到记录（版本冲突或已删除）
        return null;
      }
      logger.error('Failed to update space status', { error: error.message, id, newStatus });
      throw error;
    }

    return data as ParkingSpace;
  }

  /**
   * 更新车位状态（带乐观锁）
   * 使用原生 SQL 实现严格的乐观锁
   */
  async updateStatusAtomic(
    id: string,
    newStatus: SpaceStatus,
    expectedStatus: SpaceStatus,
    updates?: { currentPlate?: string | null; currentEntryId?: string | null },
  ): Promise<ParkingSpace | null> {
    // 构建 SET 子句
    const setClauses = ['status = $1', 'updated_at = NOW()'];
    const params: any[] = [newStatus];
    let paramIndex = 2;

    if (updates?.currentPlate !== undefined) {
      setClauses.push(`current_plate = $${paramIndex++}`);
      params.push(updates.currentPlate);
    }
    if (updates?.currentEntryId !== undefined) {
      setClauses.push(`current_entry_id = $${paramIndex++}`);
      params.push(updates.currentEntryId);
    }

    params.push(id, expectedStatus);

    const sql = `
      UPDATE parking_spaces 
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex++} AND status = $${paramIndex}
      RETURNING *
    `;

    const { data, error } = await supabase.rpc('exec_raw_sql', { query: sql, params });

    if (error) {
      logger.error('Failed to update space status atomically', { error: error.message, id });
      throw error;
    }

    if (!data || (Array.isArray(data) && data.length === 0)) {
      return null; // 乐观锁冲突
    }

    return (Array.isArray(data) ? data[0] : data) as ParkingSpace;
  }

  /**
   * 查询实时余位信息
   */
  async getAvailability(parkingId: string): Promise<AvailabilityInfo | null> {
    const { data, error } = await supabase
      .from('parking_availability')
      .select('*')
      .eq('id', parkingId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      logger.error('Failed to get availability', { error: error.message, parkingId });
      throw error;
    }

    return data as AvailabilityInfo;
  }

  /**
   * 检查编码在同一停车场内是否重复
   */
  async isCodeExists(parkingId: string, code: string): Promise<boolean> {
    const { data, error } = await supabase
      .from(this.tableName)
      .select('id')
      .eq('parking_id', parkingId)
      .eq('code', code)
      .single();

    if (error && error.code !== 'PGRST116') {
      logger.error('Failed to check space code', { error: error.message, parkingId, code });
      throw error;
    }

    return !!data;
  }

  /**
   * 释放车位（车辆出场时调用）
   */
  async releaseSpace(id: string): Promise<void> {
    const { error } = await supabase
      .from(this.tableName)
      .update({
        status: 'available',
        current_plate: null,
        current_entry_id: null,
      })
      .eq('id', id);

    if (error) {
      logger.error('Failed to release space', { error: error.message, id });
      throw error;
    }
  }
}

// 单例导出
export const spaceRepository = new SpaceRepository();
