// 统计模块 - 业务逻辑层
// P1-C 修复：聚合改用数据库 RPC 函数，避免全量拉取到 Node 内存

import { statsRepository, RealtimeStats, DailyStats } from './stats.repository.js';
import { supabase } from '../../shared/database/supabase.js';
import { NotFoundError } from '../../shared/types/errors.js';
import { logger } from '../../shared/utils/logger.js';
import dayjs from 'dayjs';

// ==================== 类型定义 ====================

export interface RealtimeStatsResponse extends RealtimeStats {
  vehicleStats: {
    currentlyParked: number;
    todayEntries: number;
    todayExits: number;
  };
  revenue: {
    todayTotal: number;
    todayPaid: number;
    todayPending: number;
  };
}

export interface WeeklyStatsResult {
  parkingId: string;
  weekStart: string;
  weekEnd: string;
  totalEntries: number;
  totalExits: number;
  avgDurationMinutes: number;
  totalRevenue: number;
  avgEntriesPerDay: number;
  avgRevenuePerDay: number;
  peakDay: string;
  peakEntries: number;
  dailyBreakdown: DailyStats[];
}

// ==================== StatsService ====================

export class StatsService {
  /**
   * 获取实时余位统计
   * @param parkingId 停车场 ID
   */
  async getRealtimeStats(parkingId: string): Promise<RealtimeStatsResponse> {
    // 验证停车场是否存在
    const exists = await statsRepository.parkingExists(parkingId);
    if (!exists) {
      throw new NotFoundError('停车场', parkingId);
    }

    // 并行查询统计数据
    const [realtimeStats, vehicleStats, revenue] = await Promise.all([
      statsRepository.getRealtimeStats(parkingId),
      statsRepository.getVehicleStatsRealtime(parkingId),
      statsRepository.getTodayRevenue(parkingId),
    ]);

    if (!realtimeStats) {
      return {
        parkingId,
        parkingName: '',
        totalSpaces: 0,
        availableSpaces: 0,
        occupiedSpaces: 0,
        occupancyRate: 0,
        updatedAt: new Date().toISOString(),
        vehicleStats,
        revenue: {
          todayTotal: revenue.total,
          todayPaid: revenue.paid,
          todayPending: revenue.pending,
        },
      };
    }

    return {
      ...realtimeStats,
      vehicleStats,
      revenue: {
        todayTotal: revenue.total,
        todayPaid: revenue.paid,
        todayPending: revenue.pending,
      },
    };
  }

  /**
   * 获取日报统计
   * P1-C 修复：优先使用数据库 RPC 聚合计算
   * @param parkingId 停车场 ID
   * @param date 日期（YYYY-MM-DD），默认为今天
   */
  async getDailyStats(parkingId: string, date?: string): Promise<DailyStats> {
    // 验证停车场是否存在
    const exists = await statsRepository.parkingExists(parkingId);
    if (!exists) {
      throw new NotFoundError('停车场', parkingId);
    }

    const targetDate = date || dayjs().format('YYYY-MM-DD');

    // 验证日期格式
    if (!dayjs(targetDate, 'YYYY-MM-DD', true).isValid()) {
      throw new NotFoundError('无效的日期格式，请使用 YYYY-MM-DD');
    }

    // P1-C: 优先使用物化视图
    const stats = await statsRepository.getDailyStats(parkingId, targetDate);
    if (stats) return stats;

    // P1-C 修复：使用数据库 RPC 聚合（在数据库端计算，避免 OOM）
    const startOfDay = new Date(`${targetDate}T00:00:00Z`);
    const endOfDay = new Date(`${targetDate}T23:59:59Z`);

    const { data, error } = await supabase.rpc('calculate_daily_stats', {
      p_parking_id: parkingId,
      p_start_time: startOfDay.toISOString(),
      p_end_time: endOfDay.toISOString(),
    });

    if (error) {
      logger.error('Failed to calculate daily stats via RPC', { error: error.message, parkingId, targetDate });
      throw error;
    }

    if (!data || (Array.isArray(data) && data.length === 0)) {
      return {
        parkingId,
        statDate: targetDate,
        totalEntries: 0,
        totalExits: 0,
        avgDurationMinutes: 0,
        totalRevenue: 0,
        paidAmount: 0,
        pendingAmount: 0,
      };
    }

    const result = Array.isArray(data) ? data[0] : data;

    return {
      parkingId,
      statDate: targetDate,
      totalEntries: Number(result.total_entries) || 0,
      totalExits: Number(result.total_exits) || 0,
      avgDurationMinutes: Math.round(Number(result.avg_duration_minutes)) || 0,
      totalRevenue: Number(result.total_revenue) || 0,
      paidAmount: Number(result.total_revenue) || 0, // RPC 返回的是 paid revenue
      pendingAmount: 0,
    };
  }

  /**
   * 获取周报统计
   * P1-C 修复：使用数据库 RPC 聚合
   * @param parkingId 停车场 ID
   * @param weekStart 周开始日期（YYYY-MM-DD），默认为本周一
   */
  async getWeeklyStats(parkingId: string, weekStart?: string): Promise<WeeklyStatsResult> {
    // 验证停车场是否存在
    const exists = await statsRepository.parkingExists(parkingId);
    if (!exists) {
      throw new NotFoundError('停车场', parkingId);
    }

    const startDate = weekStart || dayjs().startOf('week').format('YYYY-MM-DD');
    const endDate = dayjs(startDate).add(6, 'day').format('YYYY-MM-DD');

    // 验证日期格式
    if (!dayjs(startDate, 'YYYY-MM-DD', true).isValid()) {
      throw new NotFoundError('无效的日期格式，请使用 YYYY-MM-DD');
    }

    // P1-C 修复：使用数据库 RPC 聚合（在数据库端计算）
    const { data, error } = await supabase.rpc('calculate_weekly_stats', {
      p_parking_id: parkingId,
      p_week_start: startDate,
    });

    if (error) {
      logger.error('Failed to calculate weekly stats via RPC', { error: error.message, parkingId, startDate });
      throw error;
    }

    if (!data || (Array.isArray(data) && data.length === 0)) {
      return {
        parkingId,
        weekStart: startDate,
        weekEnd: endDate,
        totalEntries: 0,
        totalExits: 0,
        avgDurationMinutes: 0,
        totalRevenue: 0,
        avgEntriesPerDay: 0,
        avgRevenuePerDay: 0,
        peakDay: '-',
        peakEntries: 0,
        dailyBreakdown: [],
      };
    }

    const result = Array.isArray(data) ? data[0] : data;

    return {
      parkingId,
      weekStart: startDate,
      weekEnd: endDate,
      totalEntries: Number(result.total_entries) || 0,
      totalExits: Number(result.total_exits) || 0,
      avgDurationMinutes: Math.round(Number(result.avg_duration_minutes)) || 0,
      totalRevenue: Number(result.total_revenue) || 0,
      avgEntriesPerDay: Math.round(Number(result.avg_entries_per_day)) || 0,
      avgRevenuePerDay: Number(result.avg_revenue_per_day) || 0,
      peakDay: result.peak_day || '-',
      peakEntries: Number(result.peak_entries) || 0,
      dailyBreakdown: [], // 详细日数据可通过批量日期查询获取
    };
  }

  /**
   * 获取月报统计
   * @param parkingId 停车场 ID
   * @param month 月份（YYYY-MM），默认为本月
   */
  async getMonthlyStats(parkingId: string, month: string): Promise<DailyStats[]> {
    // 验证停车场是否存在
    const exists = await statsRepository.parkingExists(parkingId);
    if (!exists) {
      throw new NotFoundError('停车场', parkingId);
    }

    const targetMonth = month || dayjs().format('YYYY-MM');

    // 验证月份格式
    if (!dayjs(targetMonth, 'YYYY-MM', true).isValid()) {
      throw new NotFoundError('无效的月份格式，请使用 YYYY-MM');
    }

    const startDate = `${targetMonth}-01`;
    const endDate = dayjs(startDate).endOf('month').format('YYYY-MM-DD');

    return statsRepository.getDailyStatsRange(parkingId, startDate, endDate);
  }
}

// 单例导出
export const statsService = new StatsService();
