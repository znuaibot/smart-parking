-- 添加业务 RPC 函数
-- 创建时间: 2024-01-02
-- 说明: 提供原子性出场操作、事务性批量创建车位等功能

-- 1. 原子性车辆出场函数
-- 在单个事务中执行：查记录 → 计算费用 → 创建账单 → 更新状态 → 释放车位
CREATE OR REPLACE FUNCTION process_vehicle_exit(
    p_plate_number VARCHAR,
    p_parking_id UUID,
    p_exit_gate_id VARCHAR DEFAULT NULL,
    p_exit_image_url TEXT DEFAULT NULL,
    p_operator_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER  -- 使用函数所有者权限执行
AS $$
DECLARE
    v_record RECORD;
    v_duration_minutes INTEGER;
    v_fee NUMERIC;
    v_bill_id UUID;
    v_space RECORD;
    v_result JSON;
BEGIN
    -- 1. 查找在场记录（使用 FOR UPDATE 锁定行，防止并发）
    SELECT * INTO v_record
    FROM vehicle_entry_records
    WHERE plate_number = p_plate_number
      AND parking_id = p_parking_id
      AND status = 'parked'
    ORDER BY entry_time DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'error', 'NOT_FOUND',
            'message', '未找到车牌 ' || p_plate_number || ' 的在场记录'
        );
    END IF;

    -- 2. 计算停车时长（分钟）
    v_duration_minutes := CEIL(EXTRACT(EPOCH FROM (NOW() - v_record.entry_time)) / 60);

    -- 3. 计算费用（简化版：前15分钟免费，之后每小时5元）
    IF v_duration_minutes <= 15 THEN
        v_fee := 0;
    ELSE
        v_fee := CEIL((v_duration_minutes - 15) / 60.0) * 5;
    END IF;

    -- 4. 创建账单
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

    -- 5. 更新记录状态为 exited
    UPDATE vehicle_entry_records
    SET exit_time = NOW(),
        exit_gate_id = p_exit_gate_id,
        exit_image_url = p_exit_image_url,
        status = 'exited',
        updated_at = NOW()
    WHERE id = v_record.id;

    -- 6. 释放关联的车位
    SELECT * INTO v_space
    FROM parking_spaces
    WHERE current_entry_id = v_record.id;

    IF FOUND THEN
        UPDATE parking_spaces
        SET status = 'available',
            current_plate = NULL,
            current_entry_id = NULL,
            updated_at = NOW()
        WHERE id = v_space.id;
    END IF;

    -- 7. 返回结果
    RETURN json_build_object(
        'record', (SELECT row_to_json(r) FROM vehicle_entry_records r WHERE id = v_record.id),
        'bill', (SELECT row_to_json(b) FROM bills b WHERE id = v_bill_id)
    );
END;
$$;

COMMENT ON FUNCTION process_vehicle_exit IS '原子性车辆出场操作（事务内执行）';

-- 2. 事务性批量创建车位函数
CREATE OR REPLACE FUNCTION batch_create_spaces(
    spaces_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_space JSONB;
    v_result JSONB := '[]'::JSONB;
    v_inserted JSONB;
BEGIN
    -- 遍历 JSONB 数组并插入
    FOR v_space IN SELECT * FROM jsonb_array_elements(spaces_data)
    LOOP
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
        ) VALUES (
            (v_space->>'parking_id')::UUID,
            v_space->>'code',
            v_space->>'zone',
            (v_space->>'floor')::INTEGER,
            COALESCE(v_space->>'space_type', 'normal'),
            'available',
            NULL,
            NULL,
            NULL
        )
        RETURNING row_to_json(parking_spaces.*) INTO v_inserted;

        v_result := v_result || v_inserted;
    END LOOP;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION batch_create_spaces IS '事务性批量创建车位';

-- 3. 检查车位编码冲突函数
CREATE OR REPLACE FUNCTION check_space_code_conflicts(
    p_parking_id UUID,
    p_codes TEXT[]
)
RETURNS TABLE(conflict_code TEXT)
LANGUAGE plpgsql
STABLE  -- 只读函数
AS $$
BEGIN
    RETURN QUERY
    SELECT ps.code::TEXT
    FROM parking_spaces ps
    WHERE ps.parking_id = p_parking_id
      AND ps.code = ANY(p_codes);
END;
$$;

COMMENT ON FUNCTION check_space_code_conflicts IS '检查车位编码是否冲突';

-- 4. 更新触发器：出场时自动释放车位
CREATE OR REPLACE FUNCTION release_space_on_exit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- 当记录状态从 parked 变为 exited 时，释放车位
    IF OLD.status = 'parked' AND NEW.status = 'exited' THEN
        UPDATE parking_spaces
        SET status = 'available',
            current_plate = NULL,
            current_entry_id = NULL,
            updated_at = NOW()
        WHERE current_entry_id = NEW.id;
    END IF;

    RETURN NEW;
END;
$$;

-- 如果触发器已存在则删除
DROP TRIGGER IF EXISTS trigger_release_space_on_exit ON vehicle_entry_records;

-- 创建新触发器
CREATE TRIGGER trigger_release_space_on_exit
    AFTER UPDATE OF status ON vehicle_entry_records
    FOR EACH ROW
    WHEN (OLD.status = 'parked' AND NEW.status = 'exited')
    EXECUTE FUNCTION release_space_on_exit();

COMMENT ON FUNCTION release_space_on_exit IS '车辆出场时自动释放车位';
