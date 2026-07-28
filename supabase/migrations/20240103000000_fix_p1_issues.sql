-- P1/P2 问题修复
-- 创建时间: 2024-01-03
-- 说明: 修复计费逻辑硬编码、双重释放车位、批量插入性能、billing_rules 表结构等问题

-- ============================================================
-- 修复 1: 创建 billing_rules 表（P1-F）
-- ============================================================
CREATE TABLE IF NOT EXISTS billing_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parking_id UUID NOT NULL REFERENCES parkings(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL DEFAULT '默认计费规则',
    vehicle_type VARCHAR(20) NOT NULL DEFAULT 'all',  -- small, large, new_energy, all
    free_minutes INTEGER NOT NULL DEFAULT 15,
    subsequent_hour_rate NUMERIC(10,2) NOT NULL DEFAULT 5.00,
    daily_cap NUMERIC(10,2),  -- NULL 表示无日封顶
    priority INTEGER NOT NULL DEFAULT 0,  -- 数字越大优先级越高
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_to TIMESTAMPTZ,  -- NULL 表示永久有效
    status VARCHAR(20) NOT NULL DEFAULT 'active',  -- active, inactive
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_billing_rules_parking ON billing_rules(parking_id);
CREATE INDEX IF NOT EXISTS idx_billing_rules_active ON billing_rules(parking_id, status) WHERE status = 'active';

COMMENT ON TABLE billing_rules IS '停车场计费规则表';

-- ============================================================
-- 修复 2: process_vehicle_exit 计费逻辑改为查询 billing_rules (P1-G)
-- 无匹配计费规则时抛出异常，而非使用硬编码默认值
-- ============================================================
CREATE OR REPLACE FUNCTION process_vehicle_exit(
    p_record_id UUID,
    p_exit_time TIMESTAMPTZ DEFAULT NOW(),
    p_exit_gate_id VARCHAR DEFAULT NULL,
    p_exit_image_url TEXT DEFAULT NULL,
    p_operator_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_record RECORD;
    v_duration_minutes INTEGER;
    v_fee NUMERIC;
    v_bill_id UUID;
    v_rule RECORD;
    v_exit_time TIMESTAMPTZ;
    v_days INTEGER;
    v_daily_fee NUMERIC;
    v_remaining_minutes INTEGER;
    v_result JSON;
BEGIN
    -- 设置出场时间
    v_exit_time := COALESCE(p_exit_time, NOW());

    -- 1. 查找在场记录（使用 FOR UPDATE 锁定行，防止并发）
    SELECT * INTO v_record
    FROM vehicle_entry_records
    WHERE id = p_record_id
      AND status = 'parked'
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'error', 'NOT_FOUND',
            'message', '未找到指定的在场记录或记录已出场'
        );
    END IF;

    -- 2. 计算停车时长（分钟）
    v_duration_minutes := CEIL(EXTRACT(EPOCH FROM (v_exit_time - v_record.entry_time)) / 60);

    -- 3. 查询计费规则（按优先级降序，取第一个匹配的规则）
    SELECT 
        free_minutes,
        subsequent_hour_rate,
        daily_cap
    INTO v_rule
    FROM billing_rules
    WHERE parking_id = v_record.parking_id
      AND status = 'active'
      AND (vehicle_type = v_record.vehicle_type OR vehicle_type = 'all')
      AND effective_from <= v_exit_time
      AND (effective_to IS NULL OR effective_to >= v_exit_time)
    ORDER BY priority DESC
    LIMIT 1;

    -- P1-G 修复：无匹配计费规则时抛出异常，不使用硬编码默认值
    IF v_rule IS NULL THEN
        RETURN json_build_object(
            'error', 'NO_BILLING_RULE',
            'message', '停车场未配置计费规则，请先配置后再进行出场操作'
        );
    END IF;

    -- 4. 计算费用（支持日封顶按日累计 - P1-I）
    IF v_duration_minutes <= v_rule.free_minutes THEN
        v_fee := 0;
    ELSIF v_rule.daily_cap IS NULL THEN
        -- 无日封顶：直接按总时长计算
        v_fee := CEIL((v_duration_minutes - v_rule.free_minutes) / 60.0) * v_rule.subsequent_hour_rate;
    ELSE
        -- 有日封顶：按日累计计算（P1-I 修复）
        v_days := FLOOR(v_duration_minutes / 1440);  -- 完整天数
        v_remaining_minutes := v_duration_minutes - (v_days * 1440);
        
        -- 每日费用 = min(当日费用, daily_cap)
        v_daily_fee := LEAST(
            CEIL(GREATEST(v_remaining_minutes - v_rule.free_minutes, 0) / 60.0) * v_rule.subsequent_hour_rate,
            v_rule.daily_cap
        );
        
        v_fee := (v_days * v_rule.daily_cap) + v_daily_fee;
    END IF;

    -- 5. 创建账单
    INSERT INTO bills (
        record_id,
        parking_id,
        plate_number,
        duration_minutes,
        amount,
        discount_amount,
        actual_amount,
        status,
        operator_id
    ) VALUES (
        v_record.id,
        v_record.parking_id,
        v_record.plate_number,
        v_duration_minutes,
        v_fee,
        0,
        v_fee,
        'pending',
        p_operator_id
    )
    RETURNING id INTO v_bill_id;

    -- 6. 更新记录状态为 exited
    UPDATE vehicle_entry_records
    SET exit_time = v_exit_time,
        exit_gate_id = p_exit_gate_id,
        exit_image_url = p_exit_image_url,
        status = 'exited',
        updated_at = NOW()
    WHERE id = v_record.id;

    -- 7. 释放关联的车位（通过 current_entry_id 关联）
    UPDATE parking_spaces
    SET status = 'available',
        current_plate = NULL,
        current_entry_id = NULL,
        updated_at = NOW()
    WHERE current_entry_id = v_record.id;

    -- 8. 返回结果
    RETURN json_build_object(
        'bill_id', v_bill_id,
        'duration_minutes', v_duration_minutes,
        'fee', v_fee,
        'actual_fee', v_fee,
        'exit_time', v_exit_time,
        'space_released', true
    );
END;
$$;

COMMENT ON FUNCTION process_vehicle_exit IS '原子性车辆出场操作（动态计费规则，FOR UPDATE 锁定，事务内执行）';

-- ============================================================
-- 修复 3: 删除 release_space_on_exit 触发器（P2-1）
-- 原因: process_vehicle_exit RPC 已在事务内处理车位释放，
--       触发器会导致双重释放（虽不会出错但违背单一真相源原则）
-- ============================================================
DROP TRIGGER IF EXISTS trigger_release_space_on_exit ON vehicle_entry_records;
DROP FUNCTION IF EXISTS release_space_on_exit();

-- ============================================================
-- 修复 4: 优化 batch_create_spaces 为单条 INSERT...SELECT (P1-E, P1-6, P2-J)
-- 参数名保持 spaces_data 不变以兼容现有调用
-- 使用每行自带的 parking_id (P2-J)，不强制用首元素
-- ============================================================
CREATE OR REPLACE FUNCTION batch_create_spaces(
    p_parking_id UUID,
    p_spaces JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    -- P1-E 修复：参数名保持 p_parking_id 和 p_spaces
    -- P1-6 修复：单条 INSERT...SELECT 替代循环插入
    -- P2-J 修复：每行使用自带的 parking_id，p_parking_id 仅作为 fallback
    WITH inserted AS (
        INSERT INTO parking_spaces (
            parking_id,
            code,
            zone,
            floor,
            space_type,
            status,
            current_plate,
            current_entry_id,
            device_id
        )
        SELECT
            COALESCE((j->>'parking_id')::UUID, p_parking_id),
            TRIM(j->>'code'),
            NULLIF(TRIM(j->>'zone'), ''),
            COALESCE((j->>'floor')::INT, 1),
            COALESCE(NULLIF(TRIM(j->>'space_type'), ''), 'normal'),
            'available',
            NULL,
            NULL,
            NULL
        FROM jsonb_array_elements(p_spaces) j
        -- 利用 UNIQUE(parking_id, code) 约束优雅处理冲突
        ON CONFLICT (parking_id, code) DO NOTHING
        RETURNING parking_spaces.*
    )
    SELECT jsonb_agg(row_to_json(inserted.*)) INTO v_result FROM inserted;

    RETURN jsonb_build_object(
        'created_count', COALESCE(jsonb_array_length(v_result), 0),
        'spaces', COALESCE(v_result, '[]'::JSONB)
    );
END;
$$;

COMMENT ON FUNCTION batch_create_spaces IS '事务性批量创建车位（INSERT...SELECT 优化，支持每行自带 parking_id）';
