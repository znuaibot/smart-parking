-- P2-C 修复：补全 daily_stats 物化视图缺失字段
-- 创建时间: 2024-01-04
-- 问题：原物化视图缺少 total_exits、paid_amount、pending_amount 字段，导致数据不完整

-- ============================================================
-- 1. 删除旧物化视图并重建（添加缺失字段）
-- ============================================================
DROP MATERIALIZED VIEW IF EXISTS daily_stats;

CREATE MATERIALIZED VIEW daily_stats AS
SELECT 
    r.parking_id,
    DATE(r.entry_time) AS stat_date,
    COUNT(*) AS total_entries,
    COUNT(r.exit_time) AS total_exits,  -- P2-C 修复：添加 total_exits
    ROUND(AVG(
        CASE
            WHEN r.exit_time IS NOT NULL AND r.entry_time IS NOT NULL
            THEN EXTRACT(EPOCH FROM (r.exit_time - r.entry_time)) / 60
            ELSE NULL
        END
    )::NUMERIC, 1) AS avg_duration_minutes,
    COALESCE(SUM(b.actual_amount) FILTER (WHERE b.status = 'paid'), 0) AS total_revenue,
    COALESCE(SUM(b.actual_amount) FILTER (WHERE b.status = 'paid'), 0) AS paid_amount,  -- P2-C 修复：添加 paid_amount
    COALESCE(SUM(b.actual_amount) FILTER (WHERE b.status = 'pending'), 0) AS pending_amount  -- P2-C 修复：添加 pending_amount
FROM vehicle_entry_records r
LEFT JOIN bills b ON b.record_id = r.id
GROUP BY r.parking_id, DATE(r.entry_time)
WITH DATA;

-- 重建唯一索引
CREATE UNIQUE INDEX idx_daily_stats ON daily_stats(parking_id, stat_date);

COMMENT ON MATERIALIZED VIEW daily_stats IS '每日统计物化视图（含 total_exits/paid_amount/pending_amount，需定时刷新）';

-- ============================================================
-- 2. 创建刷新物化视图的函数和定时任务
-- ============================================================
CREATE OR REPLACE FUNCTION refresh_daily_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY daily_stats;
END;
$$;

COMMENT ON FUNCTION refresh_daily_stats() IS '刷新每日统计物化视图（使用 CONCURRENTLY 避免锁表）';

-- 授权
GRANT EXECUTE ON FUNCTION refresh_daily_stats() TO service_role;
GRANT SELECT ON daily_stats TO service_role;
