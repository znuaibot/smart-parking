// 统计模块 - 数据访问层
// 负责与 Supabase 数据库交互，查询统计相关数据

import { supabase, withRetry } from '../../shared/database/supabase.js';
import { logger, logDbQuery } from '../../shared/utils/logger.js';

// ==================== 类型定义 ====================

export interface RealtimeStats {
  parkingId: string;
  parkingName: string;
  totalSpaces: number;
  availableSpaces: number;
  occupiedSpaces: number;
  occupancyRate: number;
  updatedAt: string;
}

export interface DailyStats {
  parkingId: string;
  statDate: string;
  totalEntries: number;
  totalExits: number;
  avgDurationMinutes: number;
  totalRevenue: number;
  paidAmount: number;
  pendingAmount: number;
}

export interface WeeklyStats {
  parkingId: string;
  weekStart: string;
  weekEnd: string;
  totalEntries: number;
  totalExits: number;
  avgDurationMinutes: number;
  totalRevenue: number;
  dailyBreakdown: DailyStats[];
}

export interface MonthlyStats {
  parkingId: string;
  month: string;
  totalEntries: number;
  totalExits: number;
  avgDurationMinutes: number;
  totalRevenue: number;
  dailyBreakdown: DailyStats[];
}

// ==================== StatsRepository ====================

export class StatsRepository {
  /**
   * 获取实时余位统计（从 parking_availability 视图）
   */
  async getRealtimeStats(parkingId: string): Promise<RealtimeStats | null> {
    const startTime = Date.now();
    try {
      const result = await withRetry(
        () => supabase
          .from('parking_availability')
          .select('*')
          .eq('id', parkingId)
          .single(),
        'getRealtimeStats',
      );

      logDbQuery(
        { table: 'parking_availability', operation: 'select' },
        Date.now() - startTime,
        { rows: result ? 1 : 0 },
      );

      if (!result) return null;

      return {
        parkingId: result.id,
        parkingName: result.name,
        totalSpaces: result.total_spaces,
        availableSpaces: result.available_spaces,
        occupiedSpaces: result.occupied_spaces,
        occupancyRate: result.occupancy_rate,
        updatedAt: new Date().toISOString(),
      };
    } catch (error: any) {
      logDbQuery(
        { table: 'parking_availability', operation: 'select' },
        Date.now() - startTime,
        { error: error.message },
      );
      throw error;
    }
  }

  /**
   * 获取日报统计（从 daily_stats 物化视图）
   */
  async getDailyStats(parkingId: string, date: string): Promise<DailyStats | null> {
    const startTime = Date.now();
    try {
      const result = await withRetry(
        () => supabase
          .from('daily_stats')
          .select('*')
          .eq('parking_id', parkingId)
          .eq('stat_date', date)
          .single(),
        'getDailyStats',
      );

      logDbQuery(
        { table: 'daily_stats', operation: 'select' },
        Date.now() - startTime,
        { rows: result ? 1 : 0 },
      );

      if (!result) return null;

      return {
        parkingId: result.parking_id,
        statDate: result.stat_date,
        totalEntries: result.total_entries,
        totalExits: 0, // 从物化视图无法获取
        avgDurationMinutes: Math.round(result.avg_duration_minutes || 0),
        totalRevenue: result.total_revenue || 0,
        paidAmount: 0, // 需要额外查询
        pendingAmount: 0, // 需要额外查询
      };
    } catch (error: any) {
      logDbQuery(
        { table: 'daily_stats', operation: 'select' },
        Date.now() - startTime,
        { error: error.message },
      );
      throw error;
    }
  }

  /**
   * 获取指定日期范围的日报数据
   */
  async getDailyStatsRange(
    parkingId: string,
    startDate: string,
    endDate: string,
  ): Promise<DailyStats[]> {
    const startTime = Date.now();
    try {
      const results = await withRetry(
        () => supabase
          .from('daily_stats')
          .select('*')
          .eq('parking_id', parkingId)
          .gte('stat_date', startDate)
          .lte('stat_date', endDate)
          .order('stat_date', { ascending: true }),
        'getDailyStatsRange',
      );

      logDbQuery(
        { table: 'daily_stats', operation: 'select_range' },
        Date.now() - startTime,
        { rows: results?.length || 0 },
      );

      if (!results || results.length === 0) return [];

      return results.map(r => ({
        parkingId: r.parking_id,
        statDate: r.stat_date,
        totalEntries: r.total_entries,
        totalExits: 0,
        avgDurationMinutes: Math.round(r.avg_duration_minutes || 0),
        totalRevenue: r.total_revenue || 0,
        paidAmount: 0,
        pendingAmount: 0,
      }));
    } catch (error: any) {
      logDbQuery(
        { table: 'daily_stats', operation: 'select_range' },
        Date.now() - startTime,
        { error: error.message },
      );
      throw error;
    }
  }

  /**
   * 从车辆入场记录表获取实时统计
   */
  async getVehicleStatsRealtime(parkingId: string): Promise<{
    currentlyParked: number;
    todayEntries: number;
    todayExits: number;
  }> {
    const startTime = Date.now();
    const today = new Date().toISOString().split('T')[0];

    try {
      // 获取当前在场车辆数
      const { count: parkedCount } = await supabase
        .from('vehicle_entry_records')
        .select('*', { count: 'exact', head: true })
        .eq('parking_id', parkingId)
        .eq('status', 'parked');

      // 获取今日入场数
      const { count: todayEntryCount } = await supabase
        .from('vehicle_entry_records')
        .select('*', { count: 'exact', head: true })
        .eq('parking_id', parkingId)
        .gte('entry_time', `${today}T00:00:00Z`)
        .lt('entry_time', `${today}T23:59:59Z`);

      // 获取今日离场数
      const { count: todayExitCount } = await supabase
        .from('vehicle_entry_records')
        .select('*', { count: 'exact', head: true })
        .eq('parking_id', parkingId)
        .eq('status', 'exited')
        .gte('exit_time', `${today}T00:00:00Z`)
        .lt('exit_time', `${today}T23:59:59Z`);

      logDbQuery(
        { table: 'vehicle_entry_records', operation: 'count_stats' },
        Date.now() - startTime,
      );

      return {
        currentlyParked: parkedCount || 0,
        todayEntries: todayEntryCount || 0,
        todayExits: todayExitCount || 0,
      };
    } catch (error: any) {
      logDbQuery(
        { table: 'vehicle_entry_records', operation: 'count_stats' },
        Date.now() - startTime,
        { error: error.message },
      );
      throw error;
    }
  }

  /**
   * 获取今日收入统计
   */
  async getTodayRevenue(parkingId: string): Promise<{
    total: number;
    paid: number;
    pending: number;
  }> {
    const startTime = Date.now();
    const today = new Date().toISOString().split('T')[0];

    try {
      const { data: paidBills } = await supabase
        .from('bills')
        .select('actual_amount')
        .eq('parking_id', parkingId)
        .eq('status', 'paid')
        .gte('created_at', `${today}T00:00:00Z`)
        .lt('created_at', `${today}T23:59:59Z`);

      const { data: pendingBills } = await supabase
        .from('bills')
        .select('actual_amount')
        .eq('parking_id', parkingId)
        .eq('status', 'pending')
        .gte('created_at', `${today}T00:00:00Z`)
        .lt('created_at', `${today}T23:59:59Z`);

      const paid = (paidBills || []).reduce((sum, b) => sum + Number(b.actual_amount), 0);
      const pending = (pendingBills || []).reduce((sum, b) => sum + Number(b.actual_amount), 0);

      logDbQuery(
        { table: 'bills', operation: 'revenue_stats' },
        Date.now() - startTime,
      );

      return {
        total: paid + pending,
        paid,
        pending,
      };
    } catch (error: any) {
      logDbQuery(
        { table: 'bills', operation: 'revenue_stats' },
        Date.now() - startTime,
        { error: error.message },
      );
      throw error;
    }
  }

  /**
   * 验证停车场是否存在
   */
  async parkingExists(parkingId: string): Promise<boolean> {
    const { data } = await supabase
      .from('parkings')
      .select('id')
      .eq('id', parkingId)
      .single();
    
    return !!data;
  }
}

// 单例导出
export const statsRepository = new StatsRepository();
