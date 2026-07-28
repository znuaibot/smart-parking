// 性能监控中间件 - 记录 API 响应时间、慢请求告警、请求统计
// 优化1：添加关键查询的性能指标

import { Request, Response, NextFunction } from 'express';
import { logger } from '../shared/utils/logger.js';

// 慢请求阈值（毫秒）
const SLOW_REQUEST_THRESHOLD = 1000;
// 极慢请求阈值（毫秒）
const VERY_SLOW_REQUEST_THRESHOLD = 3000;

// 性能指标存储（可用于后续导出到监控系统）
interface PerformanceMetrics {
  totalRequests: number;
  slowRequests: number;
  verySlowRequests: number;
  totalResponseTime: number;
  endpoints: Map<string, {
    count: number;
    totalTime: number;
    maxTime: number;
    minTime: number;
    errors: number;
  }>;
}

// 全局性能指标（单实例，生产环境可替换为 Redis/外部存储）
const metrics: PerformanceMetrics = {
  totalRequests: 0,
  slowRequests: 0,
  verySlowRequests: 0,
  totalResponseTime: 0,
  endpoints: new Map(),
};

/**
 * 性能监控中间件
 * 记录每个请求的响应时间，并在超过阈值时发出告警
 */
export function performanceMonitor(req: Request, res: Response, next: NextFunction) {
  const startTime = process.hrtime.bigint();
  const endpoint = `${req.method} ${req.route?.path || req.path}`;

  // 响应完成时记录性能数据
  res.on('finish', () => {
    const endTime = process.hrtime.bigint();
    const durationMs = Number(endTime - startTime) / 1_000_000; // 纳秒转毫秒

    // 更新全局指标
    metrics.totalRequests++;
    metrics.totalResponseTime += durationMs;

    if (durationMs >= VERY_SLOW_REQUEST_THRESHOLD) {
      metrics.verySlowRequests++;
    } else if (durationMs >= SLOW_REQUEST_THRESHOLD) {
      metrics.slowRequests++;
    }

    // 更新端点指标
    const endpointMetrics = metrics.endpoints.get(endpoint) || {
      count: 0,
      totalTime: 0,
      maxTime: 0,
      minTime: Infinity,
      errors: 0,
    };
    endpointMetrics.count++;
    endpointMetrics.totalTime += durationMs;
    endpointMetrics.maxTime = Math.max(endpointMetrics.maxTime, durationMs);
    endpointMetrics.minTime = Math.min(endpointMetrics.minTime, durationMs);
    if (res.statusCode >= 400) {
      endpointMetrics.errors++;
    }
    metrics.endpoints.set(endpoint, endpointMetrics);

    // 慢请求告警（记录结构化日志，便于后续接入告警系统）
    if (durationMs >= SLOW_REQUEST_THRESHOLD) {
      logger.warn('Slow request detected', {
        endpoint,
        durationMs: Math.round(durationMs * 100) / 100,
        statusCode: res.statusCode,
        ip: req.ip,
        userAgent: req.get('user-agent')?.substring(0, 100),
        threshold: durationMs >= VERY_SLOW_REQUEST_THRESHOLD ? 'VERY_SLOW' : 'SLOW',
      });
    }

    // 记录请求日志（与现有 Pino 日志集成）
    logger.debug('Request performance', {
      endpoint,
      durationMs: Math.round(durationMs * 100) / 100,
      statusCode: res.statusCode,
    });
  });

  next();
}

/**
 * 获取性能统计快照
 * 可用于暴露 /metrics 端点供 Prometheus 等监控系统采集
 */
export function getPerformanceMetrics() {
  const endpointStats: Record<string, {
    count: number;
    avgTimeMs: number;
    maxTimeMs: number;
    minTimeMs: number;
    errorRate: number;
  }> = {};

  metrics.endpoints.forEach((value, key) => {
    endpointStats[key] = {
      count: value.count,
      avgTimeMs: Math.round((value.totalTime / value.count) * 100) / 100,
      maxTimeMs: Math.round(value.maxTime * 100) / 100,
      minTimeMs: value.minTime === Infinity ? 0 : Math.round(value.minTime * 100) / 100,
      errorRate: Math.round((value.errors / value.count) * 10000) / 100,
    };
  });

  return {
    summary: {
      totalRequests: metrics.totalRequests,
      slowRequests: metrics.slowRequests,
      verySlowRequests: metrics.verySlowRequests,
      avgResponseTimeMs: metrics.totalRequests > 0
        ? Math.round((metrics.totalResponseTime / metrics.totalRequests) * 100) / 100
        : 0,
      slowRequestRate: metrics.totalRequests > 0
        ? Math.round((metrics.slowRequests / metrics.totalRequests) * 10000) / 100
        : 0,
    },
    endpoints: endpointStats,
  };
}

/**
 * 重置性能指标（用于测试或定期清理）
 */
export function resetPerformanceMetrics() {
  metrics.totalRequests = 0;
  metrics.slowRequests = 0;
  metrics.verySlowRequests = 0;
  metrics.totalResponseTime = 0;
  metrics.endpoints.clear();
}
