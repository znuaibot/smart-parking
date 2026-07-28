// 监控指标工具
// P2-C 修复：添加关键操作指标记录
// 提供简单的内存指标收集，生产环境可对接 Prometheus/StatsD

interface MetricCounter {
  [key: string]: number;
}

interface MetricTiming {
  [key: string]: number[];
}

class MetricsCollector {
  private counters: MetricCounter = {};
  private timings: MetricTiming = {};

  /**
   * 计数器递增
   * @param name 指标名称
   * @param value 递增值（默认 1）
   */
  increment(name: string, value: number = 1): void {
    this.counters[name] = (this.counters[name] || 0) + value;
  }

  /**
   * 记录耗时（毫秒）
   * @param name 指标名称
   * @param durationMs 耗时
   */
  timing(name: string, durationMs: number): void {
    if (!this.timings[name]) {
      this.timings[name] = [];
    }
    this.timings[name].push(durationMs);
  }

  /**
   * 获取计数器值
   */
  getCount(name: string): number {
    return this.counters[name] || 0;
  }

  /**
   * 获取平均耗时
   */
  getAvgTiming(name: string): number {
    const values = this.timings[name];
    if (!values || values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * 获取所有指标快照
   */
  snapshot(): { counters: MetricCounter; timings: MetricTiming } {
    return {
      counters: { ...this.counters },
      timings: { ...this.timings },
    };
  }

  /**
   * 重置所有指标
   */
  reset(): void {
    this.counters = {};
    this.timings = {};
  }
}

// 单例导出
export const metrics = new MetricsCollector();

/**
 * 计时器辅助函数
 * 用法：
 *   const end = startTimer('vehicle.exit');
 *   // ... 业务逻辑
 *   end(); // 自动记录耗时
 */
export function startTimer(name: string): () => void {
  const start = Date.now();
  return () => {
    metrics.timing(name, Date.now() - start);
  };
}
