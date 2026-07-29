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
   * 转义 ILIKE 搜索中的特殊字符，防止 SQL 注入
   * PostgREST 的 ilike 使用 % 和 _ 作为通配符，需要转义
   */
  private escapeIlikePattern(input: string): string {
    // 转义 PostgREST/PostgreSQL ILIKE 特殊字符：% _ \
    return input
      .replace(/\\/g, '\\\\')  // 先转义反斜杠
      .replace(/%/g, '\\%')    // 转义 %
      .replace(/_/g, '\\_');   // 转义 _
  }

  /**
   * 安全地构建 ILIKE 搜索条件
   * @param keyword 搜索关键词
   * @returns PostgREST or 查询字符串
   */
  private buildSafeIlikeFilter(keyword: string): string {
    // 1. 清理输入：移除控制字符，限制长度
    const sanitized = keyword
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x1F\x7F]/g, '')  // 移除控制字符
      .trim()
      .substring(0, 100);  // 限制长度为 100 字符

    if (!sanitized) {
      return '';
    }

    // 2. 转义 ILIKE 特殊字符
    const escaped = this.escapeIlikePattern(sanitized);

    // 3. 构建安全的 or 条件（使用转义后的精确匹配）
    return `name.ilike.*${escaped}%,code.ilike.*${escaped}%`;
  }

  /**
   * 查询停车场列表（分页、搜索、筛选）
   * P0 修复：使用参数化搜索防止 SQL 注入
   */
  async list(params: {
    page: number;
    pageSize: number;
    keyword?: string;
    status?: string;
  }): Promise<PaginatedResult<Parking>> {
    const { page, pageSize, keyword, status } = params;
    const offset = (page - 1) * pageSize;

    // 参数校验
    if (page < 1 || pageSize < 1 || pageSize > 100) {
      throw new Error('无效的分页参数');
    }

    // 构建查询
    let query = supabase.from(this.tableName).select('*', { count: 'exact' });

    // 关键字搜索（安全版本，已防止 SQL 注入）
    if (keyword && keyword.trim()) {
      const safeFilter = this.buildSafeIlikeFilter(keyword);
      if (safeFilter) {
        query = query.or(safeFilter);
      }
    }

    // 状态筛选（白名单校验防止注入）
    const ALLOWED_STATUSES = ['active', 'inactive', 'suspended'];
    if (status && ALLOWED_STATUSES.includes(status)) {
      query = query.eq('status', status);
    }

    // 分页和排序
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      logger.error('Failed to list parkings', { error: error.message, params: { page, pageSize, status } });
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
