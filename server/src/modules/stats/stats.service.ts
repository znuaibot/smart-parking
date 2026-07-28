// 统计模块 - 业务逻辑层
// 处理统计分析的业务逻辑

import { statsRepository, RealtimeStats, DailyStats, WeeklyStats } from './stats.repository.js';
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

export interface WeeklyStatsResponse extends WeeklyStats {
  summary: {
    avgEntriesPerDay: number;
    avgRevenuePerDay: number;
    peakDay: string;
    peakEntries: number;
  };
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
      // 如果视图没有数据，返回基础数据
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

    const stats = await statsRepository.getDailyStats(parkingId, targetDate);

    // 如果没有物化视图数据，尝试实时计算
    if (!stats) {
      return this.computeDailyStatsRealtime(parkingId, targetDate);
    }

    return stats;
  }

  /**
   * 实时计算日报统计（物化视图没有数据时的降级方案）
   */
  private async computeDailyStatsRealtime(parkingId: string, date: string): Promise<DailyStats> {
    const startTime = new Date(`${date}T00:00:00Z`).toISOString();
    const endTime = new Date(`${date}T23:59:59Z`).toISOString();

    const { data: records } = await supabase
      .from('vehicle_entry_records')
      .select('entry_time, exit_time')
      .eq('parking_id', parkingId)
      .gte('entry_time', startTime)
      .lt('entry_time', endTime);

    const totalEntries = records?.length || 0;

    // 计算平均停车时长
    let avgDuration = 0;
    if (records && records.length > 0) {
      const durations = records
        .filter(r => r.exit_time)
        .map(r => {
          const entry = new Date(r.entry_time).getTime();
          const exit = new Date(r.exit_time).getTime();
          return (exit - entry) / 60000; // 转换为分钟
        });
      
      if (durations.length > 0) {
        avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      }
    }

    return {
      parkingId,
      statDate: date,
      totalEntries,
      totalExits: records?.filter(r => r.exit_time).length || 0,
      avgDurationMinutes: Math.round(avgDuration),
      totalRevenue: 0,
      paidAmount: 0,
      pendingAmount: 0,
    };
  }

  /**
   * 获取周报统计
   * @param parkingId 停车场 ID
   * @param weekStart 周开始日期（YYYY-MM-DD），默认为本周一
   */
  async getWeeklyStats(parkingId: string, weekStart?: string): Promise<WeeklyStatsResponse> {
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

    // 获取一周的日报数据
    const dailyStats = await statsRepository.getDailyStatsRange(parkingId, startDate, endDate);

    // 聚合周报数据
    const totalEntries = dailyStats.reduce((sum, d) => sum + d.totalEntries, 0);
    const totalRevenue = dailyStats.reduce((sum, d) => sum + d.totalRevenue, 0);
    const avgDuration = dailyStats.length > 0
      ? dailyStats.reduce((sum, d) => sum + d.avgDurationMinutes, 0) / dailyStats.length
      : 0;

    // 找出峰值日
    const peakDay = dailyStats.reduce((max, d) => 
      d.totalEntries > max.totalEntries ? d : max,
      { statDate: '-', totalEntries: 0 } as { statDate: string; totalEntries: number },
    );

    return {
      parkingId,
      weekStart: startDate,
      weekEnd: endDate,
      totalEntries,
      totalExits: dailyStats.reduce((sum, d) => sum + d.totalExits, 0),
      avgDurationMinutes: Math.round(avgDuration),
      totalRevenue,
      dailyBreakdown: dailyStats,
      summary: {
        avgEntriesPerDay: Math.round(totalEntries / 7),
        avgRevenuePerDay: Math.round(totalRevenue / 7 * 100) / 100,
        peakDay: peakDay.statDate,
        peakEntries: peakDay.totalEntries,
      },
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
