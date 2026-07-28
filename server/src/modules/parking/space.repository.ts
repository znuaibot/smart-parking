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
   * 批量创建车位（原子操作 + 编码冲突预校验）
   * P0 修复：使用数据库事务函数，预校验编码冲突，保证原子性
   * 
   * @param parkingId 停车场 ID
   * @param spaces 车位数组 [{code, zone?, floor?, space_type?}]
   */
  async batchCreate(
    parkingId: string,
    spaces: Array<{ code: string; zone?: string | null; floor?: number; space_type?: SpaceType }>,
  ): Promise<{ created: number; results: ParkingSpace[] }> {
    // 输入校验
    if (!spaces || spaces.length === 0) {
      throw new Error('车位列表不能为空');
    }
    if (spaces.length > 1000) {
      throw new Error('单次批量创建不能超过 1000 个车位');
    }

    // 转为 JSONB 数组传给 RPC
    const spacesJson = spaces.map(s => ({
      code: s.code,
      zone: s.zone || null,
      floor: s.floor || 1,
      space_type: s.space_type || 'normal',
    }));

    const { data, error } = await supabase.rpc('batch_create_spaces', {
      p_parking_id: parkingId,
      p_spaces: spacesJson as any,
    });

    if (error) {
      logger.error('Failed to batch create spaces', { error: error.message, parkingId, count: spaces.length });
      throw error;
    }

    const result = data as any;

    return {
      created: result?.created_count || 0,
      results: result?.spaces || [],
    };
  }

  /**
   * 乐观锁更新车位状态（使用数据库 RPC 实现安全的 CAS 操作）
   * P0 修复：使用预编译的 PostgreSQL 函数，避免动态 SQL 注入风险
   */
  async updateStatusAtomic(
    id: string,
    newStatus: SpaceStatus,
    expectedStatus: SpaceStatus,
    updates?: { currentPlate?: string | null; currentEntryId?: string | null },
  ): Promise<ParkingSpace | null> {
    const { data, error } = await supabase.rpc('update_space_status_optimistic', {
      p_space_id: id,
      p_expected_status: expectedStatus,
      p_new_status: newStatus,
      p_current_plate: updates?.currentPlate ?? null,
      p_current_entry_id: updates?.currentEntryId ?? null,
    });

    if (error) {
      logger.error('Failed to update space status atomically', { error: error.message, id });
      throw error;
    }

    // 解析 RPC 返回的 JSON 结果
    if (!data) {
      return null;
    }

    const result = data as any;
    if (result.success === false) {
      // 乐观锁冲突
      return null;
    }

    // 更新成功后，重新查询以获取完整的车位信息
    return this.findById(id);
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
   * 检查车位编码冲突（批量）
   * @returns 冲突的编码列表
   */
  async checkCodeConflicts(parkingId: string, codes: string[]): Promise<string[]> {
    if (!codes || codes.length === 0) {
      return [];
    }

    const { data, error } = await supabase
      .from(this.tableName)
      .select('code')
      .eq('parking_id', parkingId)
      .in('code', codes);

    if (error) {
      logger.error('Failed to check code conflicts', { error: error.message, parkingId });
      throw error;
    }

    return (data || []).map((row: { code: string }) => row.code);
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
