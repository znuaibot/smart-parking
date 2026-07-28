-- 停车场管理系统 - 初始数据库架构
-- 创建时间: 2024-01-01
-- 适配: Supabase PostgreSQL 15

-- 启用必要扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "timescaledb" WITH SCHEMA public;

-- 自定义枚举类型
CREATE TYPE parking_status AS ENUM ('active', 'inactive', 'suspended');
CREATE TYPE space_type AS ENUM ('normal', 'vip', 'disabled', 'charging');
CREATE TYPE space_status AS ENUM ('available', 'occupied', 'reserved', 'disabled');
CREATE TYPE vehicle_type AS ENUM ('small', 'large', 'new_energy', 'unknown');
CREATE TYPE record_status AS ENUM ('parked', 'exited', 'overstay', 'exception');
CREATE TYPE bill_status AS ENUM ('pending', 'paid', 'refunded', 'waived', 'disputed');
CREATE TYPE payment_method AS ENUM ('wechat', 'alipay', 'cash', 'card', 'free', 'month_card');
CREATE TYPE user_role AS ENUM ('superadmin', 'admin', 'operator', 'cashier');

-- 1. 停车场表
CREATE TABLE IF NOT EXISTS parkings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    address TEXT,
    contact_phone VARCHAR(20),
    total_spaces INT NOT NULL DEFAULT 0,
    available_spaces INT NOT NULL DEFAULT 0,
    status parking_status DEFAULT 'active',
    config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE parkings IS '停车场主表';

CREATE INDEX idx_parkings_status ON parkings(status);
CREATE INDEX idx_parkings_code ON parkings(code);

-- 2.5 用户资料表 (Supabase Auth 的扩展，用于 RBAC)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role user_role NOT NULL DEFAULT 'operator',
    parking_id UUID REFERENCES parkings(id),
    display_name VARCHAR(50),
    phone VARCHAR(20),
    avatar_url TEXT,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE profiles IS '用户资料表 - Supabase Auth 扩展，用于 RBAC 权限管理';

CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_parking ON profiles(parking_id);

-- 自动创建用户资料触发器
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, display_name, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
        COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'operator')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. 车位表
CREATE TABLE IF NOT EXISTS parking_spaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parking_id UUID NOT NULL REFERENCES parkings(id) ON DELETE CASCADE,
    code VARCHAR(20) NOT NULL,
    zone VARCHAR(10),
    floor INT DEFAULT 1,
    space_type space_type DEFAULT 'normal',
    status space_status DEFAULT 'available',
    current_plate VARCHAR(20),
    current_entry_id UUID,
    device_id VARCHAR(50),
    version INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(parking_id, code)
);

COMMENT ON TABLE parking_spaces IS '车位明细表';

CREATE INDEX idx_spaces_parking ON parking_spaces(parking_id);
CREATE INDEX idx_spaces_status ON parking_spaces(parking_id, status);
CREATE INDEX idx_spaces_zone ON parking_spaces(parking_id, zone);

-- 3. 车辆入场记录表（按月分区）
CREATE TABLE IF NOT EXISTS vehicle_entry_records (
    id UUID DEFAULT uuid_generate_v4(),
    parking_id UUID NOT NULL REFERENCES parkings(id),
    plate_number VARCHAR(20) NOT NULL,
    vehicle_type vehicle_type DEFAULT 'unknown',
    entry_time TIMESTAMPTZ NOT NULL,
    exit_time TIMESTAMPTZ,
    entry_gate_id VARCHAR(50),
    exit_gate_id VARCHAR(50),
    entry_image_url TEXT,
    exit_image_url TEXT,
    lpr_confidence DECIMAL(5,2),
    status record_status DEFAULT 'parked',
    operator_id UUID,
    remark TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, entry_time)
) PARTITION BY RANGE (entry_time);

COMMENT ON TABLE vehicle_entry_records IS '车辆进出记录表（按月分区）';

-- 自动创建分区函数
CREATE OR REPLACE FUNCTION create_partition_if_needed()
RETURNS TRIGGER AS $$
DECLARE
    partition_date TEXT;
    partition_name TEXT;
    start_date DATE;
    end_date DATE;
BEGIN
    partition_date := to_char(NEW.entry_time, 'YYYY_MM');
    partition_name := 'vehicle_entry_records_' || partition_date;
    start_date := date_trunc('month', NEW.entry_time);
    end_date := start_date + interval '1 month';
    
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = partition_name) THEN
        EXECUTE format('CREATE TABLE %I PARTITION OF vehicle_entry_records FOR VALUES FROM (%L) TO (%L)', partition_name, start_date, end_date);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. 计费规则表
CREATE TABLE IF NOT EXISTS billing_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parking_id UUID NOT NULL REFERENCES parkings(id),
    name VARCHAR(100) NOT NULL,
    priority INT DEFAULT 0,
    vehicle_type vehicle_type DEFAULT 'all',
    time_period JSONB,
    free_minutes INT DEFAULT 15,
    first_hour_rate DECIMAL(10,2),
    subsequent_hour_rate DECIMAL(10,2),
    daily_cap DECIMAL(10,2),
    night_flat_rate DECIMAL(10,2),
    effective_from TIMESTAMPTZ,
    effective_to TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE billing_rules IS '计费规则配置表';

CREATE INDEX idx_rules_parking ON billing_rules(parking_id, status, priority DESC);

-- 5. 账单表
CREATE TABLE IF NOT EXISTS bills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    record_id UUID NOT NULL,
    parking_id UUID NOT NULL REFERENCES parkings(id),
    plate_number VARCHAR(20) NOT NULL,
    duration_minutes INT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    discount_reason VARCHAR(100),
    actual_amount DECIMAL(10,2) NOT NULL,
    status bill_status DEFAULT 'pending',
    paid_at TIMESTAMPTZ,
    payment_method payment_method,
    transaction_id VARCHAR(100),
    operator_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE bills IS '停车账单表';

CREATE INDEX idx_bills_record ON bills(record_id);
CREATE INDEX idx_bills_parking ON bills(parking_id, created_at DESC);
CREATE INDEX idx_bills_status ON bills(status, created_at DESC);
CREATE INDEX idx_bills_plate ON bills(plate_number);

-- 6. 操作日志表（按月分区）
CREATE TABLE IF NOT EXISTS operation_logs (
    id BIGSERIAL,
    user_id UUID,
    action VARCHAR(50) NOT NULL,
    target_type VARCHAR(50),
    target_id VARCHAR(50),
    detail JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

COMMENT ON TABLE operation_logs IS '操作审计日志表';

-- 7. 月卡/储值卡表
CREATE TABLE IF NOT EXISTS memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parking_id UUID NOT NULL REFERENCES parkings(id),
    user_id UUID NOT NULL,
    card_type VARCHAR(20) NOT NULL,  -- monthly/prepaid
    plate_number VARCHAR(20) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    balance DECIMAL(10,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_membership_user ON memberships(user_id);
CREATE INDEX idx_membership_plate ON memberships(plate_number);

-- 8. 预约记录表
CREATE TABLE IF NOT EXISTS reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parking_id UUID NOT NULL REFERENCES parkings(id),
    space_id UUID REFERENCES parking_spaces(id),
    user_id UUID NOT NULL,
    plate_number VARCHAR(20) NOT NULL,
    reserved_start TIMESTAMPTZ NOT NULL,
    reserved_end TIMESTAMPTZ NOT NULL,
    actual_entry TIMESTAMPTZ,
    actual_exit TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'pending',  -- pending/active/completed/cancelled
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reservation_space ON reservations(space_id, status);
CREATE INDEX idx_reservation_time ON reservations(parking_id, reserved_start);

-- 自动更新 updated_at 字段
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_parkings_updated_at BEFORE UPDATE ON parkings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_spaces_updated_at BEFORE UPDATE ON parking_spaces FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_records_updated_at BEFORE UPDATE ON vehicle_entry_records FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_bills_updated_at BEFORE UPDATE ON bills FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_memberships_updated_at BEFORE UPDATE ON memberships FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 车位状态变更触发器（自动更新停车场余位统计）
CREATE OR REPLACE FUNCTION update_parking_availability()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status != NEW.status THEN
        UPDATE parkings 
        SET available_spaces = (
            SELECT COUNT(*) FROM parking_spaces 
            WHERE parking_id = NEW.parking_id AND status = 'available'
        ),
        total_spaces = (
            SELECT COUNT(*) FROM parking_spaces 
            WHERE parking_id = NEW.parking_id
        ),
        updated_at = NOW()
        WHERE id = NEW.parking_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_availability 
AFTER UPDATE OF status ON parking_spaces 
FOR EACH ROW EXECUTE FUNCTION update_parking_availability();

-- 车辆入场自动分配车位触发器
CREATE OR REPLACE FUNCTION assign_space_on_entry()
RETURNS TRIGGER AS $$
DECLARE
    target_space_id UUID;
BEGIN
    -- 查找可用车位
    SELECT id INTO target_space_id FROM parking_spaces
    WHERE parking_id = NEW.parking_id AND status = 'available'
    ORDER BY floor, code
    LIMIT 1;
    
    IF target_space_id IS NOT NULL THEN
        -- 更新车位状态
        UPDATE parking_spaces
        SET status = 'occupied',
            current_plate = NEW.plate_number,
            current_entry_id = NEW.id,
            updated_at = NOW()
        WHERE id = target_space_id;
        
        -- 更新入场记录
        NEW.remark = COALESCE(NEW.remark, '') || auto_assigned_space;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_assign_space
BEFORE INSERT ON vehicle_entry_records
FOR EACH ROW EXECUTE FUNCTION assign_space_on_entry();

-- 启用行级安全 (RLS)
ALTER TABLE parkings ENABLE ROW LEVEL SECURITY;
ALTER TABLE parking_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_entry_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE operation_logs ENABLE ROW LEVEL SECURITY;

-- RLS 策略（示例：用户只能看到自己所属停车场的数据）
CREATE POLICY "Parkings are viewable by authenticated users" ON parkings
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Spaces are viewable by authenticated users" ON parking_spaces
    FOR SELECT USING (auth.role() = 'authenticated');

-- 统计视图（实时余位）
CREATE OR REPLACE VIEW parking_availability AS
SELECT 
    p.id,
    p.name,
    p.total_spaces,
    p.total_spaces - COUNT(ps.id) FILTER (WHERE ps.status = 'occupied') AS available_spaces,
    COUNT(ps.id) FILTER (WHERE ps.status = 'occupied') AS occupied_spaces,
    ROUND(COUNT(ps.id) FILTER (WHERE ps.status = 'occupied')::numeric / NULLIF(p.total_spaces, 0) * 100, 1) AS occupancy_rate
FROM parkings p
LEFT JOIN parking_spaces ps ON ps.parking_id = p.id
WHERE p.status = 'active'
GROUP BY p.id, p.name, p.total_spaces;

COMMENT ON VIEW parking_availability IS '实时车位余量表';

-- 物化视图（日报统计）
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_stats AS
SELECT 
    parking_id,
    DATE(entry_time) AS stat_date,
    COUNT(*) AS total_entries,
    AVG(EXTRACT(EPOCH FROM (exit_time - entry_time)) / 60) AS avg_duration_minutes,
    SUM(b.actual_amount) AS total_revenue
FROM vehicle_entry_records r
LEFT JOIN bills b ON b.record_id = r.id
WHERE exit_time IS NOT NULL
GROUP BY parking_id, DATE(entry_time)
WITH DATA;

CREATE UNIQUE INDEX idx_daily_stats ON daily_stats(parking_id, stat_date);

COMMENT ON MATERIALIZED VIEW daily_stats IS '每日统计物化视图（需定时刷新）';
