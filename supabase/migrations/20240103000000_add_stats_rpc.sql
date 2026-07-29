-- P1-C 修复：统计聚合改用数据库 RPC，避免全量拉取到 Node 内存
-- 创建时间: 2024-01-03

-- ============================================================
-- 1. 日报统计聚合函数
-- ============================================================
CREATE OR REPLACE FUNCTION calculate_daily_stats(
    p_parking_id UUID,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ
)
RETURNS TABLE(
    total_entries BIGINT,
    total_exits BIGINT,
    avg_duration_minutes NUMERIC,
    peak_hour INT,
    total_revenue NUMERIC
)
LANGUAGE sql
STABLE  -- 只读函数，允许缓存
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        COUNT(*) AS total_entries,
        COUNT(exit_time) AS total_exits,
        ROUND(AVG(
            CASE
                WHEN exit_time IS NOT NULL AND entry_time IS NOT NULL
                THEN EXTRACT(EPOCH FROM (exit_time - entry_time)) / 60
                ELSE NULL
            END
        )::NUMERIC, 1) AS avg_duration_minutes,
        MODE() WITHIN GROUP (ORDER BY EXTRACT(HOUR FROM entry_time)::INT) AS peak_hour,
        COALESCE((
            SELECT SUM(actual_amount)
            FROM bills
            WHERE parking_id = p_parking_id
            AND created_at >= p_start_time
            AND created_at < p_end_time
            AND status = 'paid'
        ), 0) AS total_revenue
    FROM vehicle_entry_records
    WHERE parking_id = p_parking_id
    AND entry_time >= p_start_time
    AND entry_time < p_end_time;
$$;

COMMENT ON FUNCTION calculate_daily_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ) IS '计算指定日期范围的聚合统计（在数据库端执行，避免 OOM）';


-- ============================================================
-- 2. 周报统计聚合函数
-- ============================================================
CREATE OR REPLACE FUNCTION calculate_weekly_stats(
    p_parking_id UUID,
    p_week_start DATE
)
RETURNS TABLE(
    total_entries BIGINT,
    total_exits BIGINT,
    avg_duration_minutes NUMERIC,
    total_revenue NUMERIC,
    avg_entries_per_day NUMERIC,
    avg_revenue_per_day NUMERIC,
    peak_day DATE,
    peak_entries BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH daily AS (
        SELECT
            DATE(entry_time) AS day,
            COUNT(*) AS entries,
            COUNT(exit_time) AS exits,
            AVG(
                CASE
                    WHEN exit_time IS NOT NULL AND entry_time IS NOT NULL
                    THEN EXTRACT(EPOCH FROM (exit_time - entry_time)) / 60
                    ELSE NULL
                END
            ) AS avg_dur
        FROM vehicle_entry_records
        WHERE parking_id = p_parking_id
        AND entry_time >= p_week_start::TIMESTAMPTZ
        AND entry_time < (p_week_start + INTERVAL '7 days')::TIMESTAMPTZ
        GROUP BY DATE(entry_time)
    ),
    revenue AS (
        SELECT
            SUM(actual_amount) AS total_rev
        FROM bills
        WHERE parking_id = p_parking_id
        AND created_at >= p_week_start::TIMESTAMPTZ
        AND created_at < (p_week_start + INTERVAL '7 days')::TIMESTAMPTZ
        AND status = 'paid'
    )
    SELECT
        COALESCE(SUM(d.entries), 0) AS total_entries,
        COALESCE(SUM(d.exits), 0) AS total_exits,
        ROUND(AVG(d.avg_dur)::NUMERIC, 1) AS avg_duration_minutes,
        COALESCE((SELECT total_rev FROM revenue), 0) AS total_revenue,
        ROUND(AVG(d.entries)::NUMERIC, 1) AS avg_entries_per_day,
        ROUND(COALESCE((SELECT total_rev FROM revenue), 0) / 7, 2) AS avg_revenue_per_day,
        (SELECT day FROM daily ORDER BY entries DESC LIMIT 1) AS peak_day,
        (SELECT entries FROM daily ORDER BY entries DESC LIMIT 1) AS peak_entries
    FROM daily d;
$$;

COMMENT ON FUNCTION calculate_weekly_stats(UUID, DATE) IS '计算指定周的聚合统计（在数据库端执行）';


-- ============================================================
-- 3. 授权
-- ============================================================
GRANT EXECUTE ON FUNCTION calculate_daily_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION calculate_weekly_stats(UUID, DATE) TO service_role;
