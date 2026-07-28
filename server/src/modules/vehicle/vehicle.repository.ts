// 车辆进出模块 - 数据访问层
import { supabase } from '../../shared/database/supabase.js';
import { logger } from '../../shared/utils/logger.js';

/**
 * 车辆进出记录状态
 */
export type RecordStatus = 'parked' | 'exited' | 'overstay' | 'exception';

/**
 * 车辆类型
 */
export type VehicleType = 'small' | 'large' | 'new_energy' | 'unknown';

/**
 * 车辆进出记录数据对象
 */
export interface VehicleEntryRecord {
  id: string;
  parking_id: string;
  plate_number: string;
  vehicle_type: VehicleType;
  entry_time: string;
  exit_time: string | null;
  entry_gate_id: string | null;
  exit_gate_id: string | null;
  entry_image_url: string | null;
  exit_image_url: string | null;
  lpr_confidence: number | null;
  status: RecordStatus;
  operator_id: string | null;
  remark: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * 账单数据对象
 */
export interface Bill {
  id: string;
  record_id: string;
  parking_id: string;
  plate_number: string;
  duration_minutes: number;
  amount: number;
  discount_amount: number;
  discount_reason: string | null;
  actual_amount: number;
  status: 'pending' | 'paid' | 'refunded' | 'waived' | 'disputed';
  paid_at: string | null;
  payment_method: string | null;
  transaction_id: string | null;
  operator_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * 车辆进出数据访问层
 */
export class VehicleRepository {
  private readonly recordsTable = 'vehicle_entry_records';
  private readonly billsTable = 'bills';

  /**
   * 创建入场记录
   * 注意：车位分配由数据库触发器自动完成
   */
  async createEntry(params: {
    parkingId: string;
    plateNumber: string;
    vehicleType: VehicleType;
    entryGateId?: string;
    entryImageUrl?: string;
    lprConfidence?: number;
    operatorId?: string;
    remark?: string;
  }): Promise<VehicleEntryRecord> {
    const { data, error } = await supabase
      .from(this.recordsTable)
      .insert({
        parking_id: params.parkingId,
        plate_number: params.plateNumber,
        vehicle_type: params.vehicleType,
        entry_time: new Date().toISOString(),
        entry_gate_id: params.entryGateId,
        entry_image_url: params.entryImageUrl,
        lpr_confidence: params.lprConfidence,
        status: 'parked',
        operator_id: params.operatorId,
        remark: params.remark,
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to create entry record', { error: error.message, params });
      throw error;
    }

    return data as VehicleEntryRecord;
  }

  /**
   * 根据 ID 查询记录
   */
  async findById(id: string): Promise<VehicleEntryRecord | null> {
    const { data, error } = await supabase
      .from(this.recordsTable)
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      logger.error('Failed to find record by id', { error: error.message, id });
      throw error;
    }

    return data as VehicleEntryRecord;
  }

  /**
   * 根据车牌和停车场查询在场的记录（parked 状态）
   */
  async findOngoingByPlate(plateNumber: string, parkingId?: string): Promise<VehicleEntryRecord | null> {
    let query = supabase
      .from(this.recordsTable)
      .select('*')
      .eq('plate_number', plateNumber)
      .eq('status', 'parked')
      .order('entry_time', { ascending: false });

    if (parkingId) {
      query = query.eq('parking_id', parkingId);
    }

    const { data, error } = await query.single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      logger.error('Failed to find ongoing record', { error: error.message, plateNumber });
      throw error;
    }

    return data as VehicleEntryRecord;
  }

  /**
   * 查询在场记录列表
   */
  async listOngoing(params: {
    parkingId?: string;
    plateNumber?: string;
    page: number;
    pageSize: number;
  }): Promise<{ data: VehicleEntryRecord[]; total: number }> {
    const { parkingId, plateNumber, page, pageSize } = params;
    const offset = (page - 1) * pageSize;

    let query = supabase
      .from(this.recordsTable)
      .select('*', { count: 'exact' })
      .eq('status', 'parked');

    if (parkingId) {
      query = query.eq('parking_id', parkingId);
    }
    if (plateNumber) {
      query = query.eq('plate_number', plateNumber);
    }

    const { data, error, count } = await query
      .order('entry_time', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      logger.error('Failed to list ongoing records', { error: error.message, params });
      throw error;
    }

    return {
      data: data as VehicleEntryRecord[],
      total: count || 0,
    };
  }

  /**
   * 更新记录为出场状态
   */
  async updateToExited(
    id: string,
    params: {
      exitTime: string;
      exitGateId?: string;
      exitImageUrl?: string;
    },
  ): Promise<VehicleEntryRecord> {
    const { data, error } = await supabase
      .from(this.recordsTable)
      .update({
        exit_time: params.exitTime,
        exit_gate_id: params.exitGateId,
        exit_image_url: params.exitImageUrl,
        status: 'exited',
      })
      .eq('id', id)
      .eq('status', 'parked')
      .select()
      .single();

    if (error) {
      logger.error('Failed to update record to exited', { error: error.message, id });
      throw error;
    }

    return data as VehicleEntryRecord;
  }

  /**
   * 查询进出记录列表（分页、筛选）
   */
  async listRecords(params: {
    page: number;
    pageSize: number;
    parkingId?: string;
    plateNumber?: string;
    status?: RecordStatus;
    startDate?: string;
    endDate?: string;
  }): Promise<{ data: VehicleEntryRecord[]; total: number }> {
    const { page, pageSize, parkingId, plateNumber, status, startDate, endDate } = params;
    const offset = (page - 1) * pageSize;

    let query = supabase.from(this.recordsTable).select('*', { count: 'exact' });

    if (parkingId) query = query.eq('parking_id', parkingId);
    if (plateNumber) query = query.eq('plate_number', plateNumber);
    if (status) query = query.eq('status', status);
    if (startDate) query = query.gte('entry_time', startDate);
    if (endDate) query = query.lte('entry_time', endDate);

    const { data, error, count } = await query
      .order('entry_time', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      logger.error('Failed to list vehicle records', { error: error.message, params });
      throw error;
    }

    return {
      data: data as VehicleEntryRecord[],
      total: count || 0,
    };
  }

  /**
   * 创建账单
   */
  async createBill(params: {
    recordId: string;
    parkingId: string;
    plateNumber: string;
    durationMinutes: number;
    amount: number;
    discountAmount?: number;
    discountReason?: string;
    actualAmount: number;
    operatorId?: string;
  }): Promise<Bill> {
    const { data, error } = await supabase
      .from(this.billsTable)
      .insert({
        record_id: params.recordId,
        parking_id: params.parkingId,
        plate_number: params.plateNumber,
        duration_minutes: params.durationMinutes,
        amount: params.amount,
        discount_amount: params.discountAmount || 0,
        discount_reason: params.discountReason,
        actual_amount: params.actualAmount,
        status: 'pending',
        operator_id: params.operatorId,
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to create bill', { error: error.message, params });
      throw error;
    }

    return data as Bill;
  }

  /**
   * 查询账单详情
   */
  async findBillByRecordId(recordId: string): Promise<Bill | null> {
    const { data, error } = await supabase
      .from(this.billsTable)
      .select('*')
      .eq('record_id', recordId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      logger.error('Failed to find bill by record id', { error: error.message, recordId });
      throw error;
    }

    return data as Bill;
  }

  /**
   * 根据入场记录 ID 查找关联的车位
   */
  async findSpaceByEntryId(entryId: string): Promise<{ id: string; code: string } | null> {
    const { data, error } = await supabase
      .from('parking_spaces')
      .select('id, code')
      .eq('current_entry_id', entryId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      logger.error('Failed to find space by entry id', { error: error.message, entryId });
      throw error;
    }

    return data;
  }
}

// 单例导出
export const vehicleRepository = new VehicleRepository();
