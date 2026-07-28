-- P0 关键问题修复迁移
-- 创建时间: 2024-01-02
-- 包含: exec_raw_sql RPC、出场原子操作事务、乐观锁支持

-- ============================================================
-- 1. exec_raw_sql RPC - 安全的参数化 SQL 执行函数
-- 解决 P0-3: 出场流程需要原子操作 UPDATE ... RETURNING
-- ============================================================
CREATE OR REPLACE FUNCTION exec_raw_sql(query text, params jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER  -- 使用函数所有者权限执行
SET search_path = public  -- 防止 search_path 劫持
AS $$
DECLARE
    result jsonb;
    param_value text;
    param_index int := 0;
    final_query text;
BEGIN
    -- 安全校验：禁止多语句
    IF query ~ (';.*[A-Za-z]') THEN
        RAISE EXCEPTION 'Multiple statements are not allowed';
    END IF;

    -- 安全校验：只允许 SELECT/UPDATE/INSERT/DELETE/WITH
    IF query !~ ('^(SELECT|INSERT|UPDATE|DELETE|WITH)') THEN
        RAISE EXCEPTION 'Only SELECT, INSERT, UPDATE, DELETE, WITH statements are allowed. Got: %', left(query, 50);
    END IF;

    -- 安全校验：禁止危险关键字
    IF query ~* ('(DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|EXECUTE|EXEC|COPY|\\$\\$|pg_|set_config|setval|nextval)') THEN
        RAISE EXCEPTION 'Dangerous SQL keywords detected: %', query;
    END IF;

    -- 使用 jsonb_array_elements 处理参数（防 SQL 注入）
    final_query := query;

    -- 将 $1, $2... 替换为已转义的参数
    FOR param_index IN 1..jsonb_array_length(params) LOOP
        param_value := params->>(param_index - 1);
        -- 使用 quote_literal 防止注入
        final_query := regexp_replace(
            final_query,
            '\\$' || param_index,
            COALESCE(quote_literal(param_value), 'NULL'),
            'i'
        );
    END LOOP;

    -- 执行查询并返回 JSON 结果
    EXECUTE 'SELECT COALESCE(jsonb_agg(t)::jsonb, ''[]''::jsonb) FROM (' || final_query || ') t' INTO result;

    RETURN result;
END;
$$;

-- 限制只有 service_role 可以调用（防权限泄露）
REVOKE ALL ON FUNCTION exec_raw_sql(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION exec_raw_sql(text, jsonb) TO service_role;

COMMENT ON FUNCTION exec_raw_sql(text, jsonb) IS '安全的参数化 SQL 执行（仅限 service_role 使用）';


-- ============================================================
-- 2. 原子化出场事务函数
-- 解决 P0-4: 创建账单 + 更新记录 + 释放车位 在同一事务中
-- ============================================================
CREATE OR REPLACE FUNCTION process_vehicle_exit(
    p_record_id UUID,
    p_exit_time TIMESTAMPTZ DEFAULT NOW(),
    p_exit_gate_id VARCHAR DEFAULT NULL,
    p_exit_image_url TEXT DEFAULT NULL,
    p_operator_id UUID DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_record RECORD;
    v_duration_minutes INT;
    v_fee DECIMAL(10,2);
    v_actual_fee DECIMAL(10,2);
    v_space_id UUID;
    v_bill_id UUID;
    v_free_minutes INT;
    v_hourly_rate DECIMAL(10,2);
BEGIN
    -- 1. 查找并锁定出场记录（FOR UPDATE 防止并发）
    SELECT id, parking_id, plate_number, vehicle_type, entry_time, exit_time, status, remark
    INTO v_record
    FROM vehicle_entry_records
    WHERE id = p_record_id AND status = 'parked'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No active parking record found for id: %', p_record_id;
    END IF;

    -- 2. 检查是否已经出场（双重校验）
    IF v_record.exit_time IS NOT NULL THEN
        RAISE EXCEPTION 'Vehicle already exited at %', v_record.exit_time;
    END IF;

    -- 3. 计算停车时长（分钟）
    v_duration_minutes := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (p_exit_time - v_record.entry_time)) / 60));

    -- 4. 计算费用（简化计费）
    v_free_minutes := 15;  -- 免费时长
    v_hourly_rate := 5.00;  -- 每小时费率

    IF v_duration_minutes <= v_free_minutes THEN
        v_fee := 0;
    ELSE
        v_fee := CEIL((v_duration_minutes - v_free_minutes)::DECIMAL / 60) * v_hourly_rate;
    END IF;

    v_actual_fee := v_fee;  -- 简化版，无折扣

    -- 5. 创建账单
    INSERT INTO bills (
        record_id, parking_id, plate_number, duration_minutes,
        amount, actual_amount, status, operator_id
    ) VALUES (
        v_record.id, v_record.parking_id, v_record.plate_number,
        v_duration_minutes, v_fee, v_actual_fee, 'pending', p_operator_id
    ) RETURNING id INTO v_bill_id;

    -- 6. 更新出场记录（原子操作）
    UPDATE vehicle_entry_records
    SET
        exit_time = p_exit_time,
        exit_gate_id = p_exit_gate_id,
        exit_image_url = p_exit_image_url,
        status = 'exited',
        operator_id = COALESCE(p_operator_id, operator_id),
        updated_at = NOW()
    WHERE id = v_record.id;

    -- 7. 查找并释放关联的车位
    SELECT id INTO v_space_id
    FROM parking_spaces
    WHERE current_entry_id = v_record.id AND status = 'occupied'
    FOR UPDATE;

    IF v_space_id IS NOT NULL THEN
        UPDATE parking_spaces
        SET
            status = 'available',
            current_plate = NULL,
            current_entry_id = NULL,
            updated_at = NOW()
        WHERE id = v_space_id;
    END IF;

    -- 8. 返回结果
    RETURN jsonb_build_object(
        'bill_id', v_bill_id,
        'duration_minutes', v_duration_minutes,
        'fee', v_fee,
        'actual_fee', v_actual_fee,
        'exit_time', p_exit_time,
        'space_released', v_space_id IS NOT NULL
    );
END;
$$;

COMMENT ON FUNCTION process_vehicle_exit(UUID, TIMESTAMPTZ, VARCHAR, TEXT, UUID) IS '原子化处理车辆出场（创建账单、更新记录、释放车位）';


-- ============================================================
-- 3. 批量创建车位安全函数
-- 解决 P0-6: 原子性 + 编码冲突预校验
-- ============================================================
CREATE OR REPLACE FUNCTION batch_create_spaces(
    p_parking_id UUID,
    p_spaces jsonb  -- [{code, zone, floor, space_type}]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_space jsonb;
    v_code TEXT;
    v_zone VARCHAR;
    v_floor INT;
    v_space_type TEXT;
    v_created_count INT := 0;
    v_duplicate_codes TEXT := '';
    v_valid_types TEXT[] := ARRAY['normal', 'vip', 'disabled', 'charging'];
    v_results jsonb := '[]'::jsonb;
BEGIN
    -- 验证停车场存在
    IF NOT EXISTS (SELECT 1 FROM parkings WHERE id = p_parking_id) THEN
        RAISE EXCEPTION 'Parking not found: %', p_parking_id;
    END IF;

    -- 预校验：收集所有编码，检查批量内重复
    FOR v_space IN SELECT * FROM jsonb_array_elements(p_spaces) LOOP
        v_code := TRIM(v_space->>'code');
        IF v_code = '' OR v_code IS NULL THEN
            RAISE EXCEPTION 'Space code cannot be empty';
        END IF;
        -- 检查批量内重复
        IF (SELECT COUNT(*) FROM jsonb_array_elements(p_spaces) j WHERE TRIM(j->>'code') = v_code) > 1 THEN
            IF v_duplicate_codes = '' OR NOT v_duplicate_codes ~ ('(^|,)' || v_code || '(,|$)') THEN
                v_duplicate_codes := CASE WHEN v_duplicate_codes = '' THEN v_code ELSE v_duplicate_codes || ',' || v_code END;
            END IF;
        END IF;
    END LOOP;

    IF v_duplicate_codes != '' THEN
        RAISE EXCEPTION 'Duplicate codes in batch: %', v_duplicate_codes;
    END IF;

    -- 检查与现有记录冲突
    SELECT STRING_AGG(s.code, ', ') INTO v_duplicate_codes
    FROM jsonb_array_elements(p_spaces) s
    WHERE EXISTS (
        SELECT 1 FROM parking_spaces ps
        WHERE ps.parking_id = p_parking_id
        AND ps.code = TRIM(s->>'code')
    );

    IF v_duplicate_codes IS NOT NULL THEN
        RAISE EXCEPTION 'Codes already exist in parking: %', v_duplicate_codes;
    END IF;

    -- 批量插入
    FOR v_space IN SELECT * FROM jsonb_array_elements(p_spaces) LOOP
        v_code := TRIM(v_space->>'code');
        v_zone := NULLIF(TRIM(v_space->>'zone'), '');
        v_floor := COALESCE((v_space->>'floor')::INT, 1);
        v_space_type := COALESCE(NULLIF(TRIM(v_space->>'space_type'), ''), 'normal');

        -- 校验 space_type
        IF NOT v_space_type = ANY(v_valid_types) THEN
            RAISE EXCEPTION 'Invalid space_type: %. Valid values: %', v_space_type, v_valid_types;
        END IF;

        BEGIN
            INSERT INTO parking_spaces (
                parking_id, code, zone, floor, space_type, status
            ) VALUES (
                p_parking_id, v_code, v_zone, v_floor, v_space_type, 'available'
            );
            v_created_count := v_created_count + 1;
        EXCEPTION
            WHEN unique_violation THEN
                RAISE EXCEPTION 'Unique violation for code: %', v_code;
        END;
    END LOOP;

    -- 更新停车位统计
    UPDATE parkings
    SET total_spaces = (SELECT COUNT(*) FROM parking_spaces WHERE parking_id = p_parking_id),
        available_spaces = (SELECT COUNT(*) FROM parking_spaces WHERE parking_id = p_parking_id AND status = 'available'),
        updated_at = NOW()
    WHERE id = p_parking_id;

    RETURN jsonb_build_object(
        'created_count', v_created_count,
        'parking_id', p_parking_id,
        'total_spaces', (SELECT COUNT(*) FROM parking_spaces WHERE parking_id = p_parking_id)
    );
END;
$$;

COMMENT ON FUNCTION batch_create_spaces(UUID, jsonb) IS '原子化批量创建车位（预校验编码冲突）';


-- ============================================================
-- 4. 乐观锁更新车位状态函数
-- 解决并发更新车位时的竞态条件
-- ============================================================
CREATE OR REPLACE FUNCTION update_space_status_optimistic(
    p_space_id UUID,
    p_expected_status space_status,
    p_new_status space_status,
    p_current_plate VARCHAR DEFAULT NULL,
    p_current_entry_id UUID DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_affected INT;
BEGIN
    -- 原子更新（CAS 操作：Compare-And-Swap）
    UPDATE parking_spaces
    SET
        status = p_new_status,
        current_plate = p_current_plate,
        current_entry_id = p_current_entry_id,
        updated_at = NOW()
    WHERE id = p_space_id AND status = p_expected_status;

    GET DIAGNOSTICS v_affected = ROW_COUNT;

    IF v_affected = 0 THEN
        -- 获取当前状态用于错误信息
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'optimistic_lock_conflict',
            'message', 'Space status was modified by another transaction'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'space_id', p_space_id,
        'new_status', p_new_status
    );
END;
$$;

COMMENT ON FUNCTION update_space_status_optimistic(UUID, space_status, space_status, VARCHAR, UUID) IS '乐观锁更新车位状态（CAS 原子操作）';


-- ============================================================
-- 5. 授权
-- ============================================================
GRANT EXECUTE ON FUNCTION process_vehicle_exit(UUID, TIMESTAMPTZ, VARCHAR, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION batch_create_spaces(UUID, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION update_space_status_optimistic(UUID, space_status, space_status, VARCHAR, UUID) TO service_role;
