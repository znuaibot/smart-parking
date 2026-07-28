// 停车场模块 - 数据访问层
import { supabase } from '../../shared/database/supabase.js';
import { logger } from '../../shared/utils/logger.js';

/**
 * 停车场数据对象类型
 */
export interface Parking {
  id: string;
  name: string;
  code: string;
  address: string | null;
  contact_phone: string | null;
  total_spaces: number;
  available_spaces: number;
  status: 'active' | 'inactive' | 'suspended';
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
}

/**
 * 分页查询结果
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * 停车场数据访问层
 */
export class ParkingRepository {
  private readonly tableName = 'parkings';

  /**
   * 查询停车场列表（分页、搜索、筛选）
   */
  async list(params: {
    page: number;
    pageSize: number;
    keyword?: string;
    status?: string;
  }): Promise<PaginatedResult<Parking>> {
    const { page, pageSize, keyword, status } = params;
    const offset = (page - 1) * pageSize;

    // 构建查询
    let query = supabase.from(this.tableName).select('*', { count: 'exact' });

    // 关键字搜索（名称或编码）
    if (keyword) {
      query = query.or(`name.ilike.%${keyword}%,code.ilike.%${keyword}%`);
    }

    // 状态筛选
    if (status) {
      query = query.eq('status', status);
    }

    // 分页和排序
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      logger.error('Failed to list parkings', { error: error.message, params });
      throw error;
    }

    return {
      data: data as Parking[],
      total: count || 0,
      page,
      pageSize,
    };
  }

  /**
   * 根据 ID 查询停车场
   */
  async findById(id: string): Promise<Parking | null> {
    const { data, error } = await supabase
      .from(this.tableName)
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // 未找到记录
        return null;
      }
      logger.error('Failed to find parking by id', { error: error.message, id });
      throw error;
    }

    return data as Parking;
  }

  /**
   * 根据编码查询停车场（用于唯一性校验）
   */
  async findByCode(code: string): Promise<Parking | null> {
    const { data, error } = await supabase
      .from(this.tableName)
      .select('*')
      .eq('code', code)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      logger.error('Failed to find parking by code', { error: error.message, code });
      throw error;
    }

    return data as Parking;
  }

  /**
   * 创建停车场
   */
  async create(params: {
    name: string;
    code: string;
    address?: string;
    totalSpaces: number;
    contactPhone?: string;
    config?: Record<string, any>;
  }): Promise<Parking> {
    const { data, error } = await supabase
      .from(this.tableName)
      .insert({
        name: params.name,
        code: params.code,
        address: params.address,
        total_spaces: params.totalSpaces,
        contact_phone: params.contactPhone,
        available_spaces: params.totalSpaces,
        config: params.config || {},
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to create parking', { error: error.message, params });
      throw error;
    }

    return data as Parking;
  }

  /**
   * 更新停车场（部分更新）
   */
  async update(
    id: string,
    params: {
      name?: string;
      address?: string;
      contactPhone?: string;
      totalSpaces?: number;
      status?: string;
      config?: Record<string, any>;
    },
  ): Promise<Parking> {
    // 构建更新对象（仅包含有值的字段）
    const updateData: Record<string, any> = {};
    if (params.name !== undefined) updateData.name = params.name;
    if (params.address !== undefined) updateData.address = params.address;
    if (params.contactPhone !== undefined) updateData.contact_phone = params.contactPhone;
    if (params.totalSpaces !== undefined) updateData.total_spaces = params.totalSpaces;
    if (params.status !== undefined) updateData.status = params.status;
    if (params.config !== undefined) updateData.config = params.config;

    const { data, error } = await supabase
      .from(this.tableName)
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Failed to update parking', { error: error.message, id, params });
      throw error;
    }

    return data as Parking;
  }

  /**
   * 软删除停车场（设置 status='inactive'）
   */
  async softDelete(id: string): Promise<void> {
    const { error } = await supabase
      .from(this.tableName)
      .update({ status: 'inactive' })
      .eq('id', id);

    if (error) {
      logger.error('Failed to soft delete parking', { error: error.message, id });
      throw error;
    }
  }

  /**
   * 检查编码是否已存在
   */
  async isCodeExists(code: string, excludeId?: string): Promise<boolean> {
    let query = supabase.from(this.tableName).select('id').eq('code', code);

    if (excludeId) {
      query = query.neq('id', excludeId);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Failed to check code existence', { error: error.message, code });
      throw error;
    }

    return data.length > 0;
  }
}

// 单例导出
export const parkingRepository = new ParkingRepository();
