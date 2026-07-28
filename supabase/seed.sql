-- 种子数据 - 用于本地开发和测试
-- 执行方式: supabase db reset 或 supabase seed

-- 1. 插入测试停车场
INSERT INTO parkings (id, name, code, address, total_spaces, available_spaces, status) VALUES
    ('11111111-1111-1111-1111-111111111111', '中关村购物中心停车场', 'ZGC-001', '北京市海淀区中关村大街1号', 500, 500, 'active'),
    ('22222222-2222-2222-2222-222222222222', '望京SOHO停车场', 'WJ-001', '北京市朝阳区望京街10号', 300, 300, 'active'),
    ('33333333-3333-3333-3333-333333333333', '测试小型停车场', 'TEST-001', '测试地址', 50, 50, 'active');

-- 2. 批量生成车位
DO $$
DECLARE
    target_parking_id UUID := '33333333-3333-3333-3333-333333333333';
    zone_list TEXT[] := ARRAY['A', 'B', 'C'];
    i INT;
    zone TEXT;
    floor_num INT;
    space_num INT;
BEGIN
    FOR i IN 1..50 LOOP
        zone := zone_list[1 + (i-1) / 20];
        floor_num := 1;
        space_num := ((i-1) % 20) + 1;
        
        INSERT INTO parking_spaces (parking_id, code, zone, floor, space_type, status)
        VALUES (
            target_parking_id,
            zone || '-' || LPAD(floor_num::TEXT, 2, '0') || '-' || LPAD(space_num::TEXT, 3, '0'),
            zone || '区',
            floor_num,
            CASE WHEN i <= 5 THEN 'vip' WHEN i <= 10 THEN 'charging' ELSE 'normal' END,
            'available'
        );
    END LOOP;
END$$;

-- 3. 插入默认计费规则
INSERT INTO billing_rules (parking_id, name, priority, free_minutes, first_hour_rate, subsequent_hour_rate, daily_cap, status, effective_from) VALUES
    ('33333333-3333-3333-3333-333333333333', '工作日标准', 10, 15, 5.00, 3.00, 50.00, 'active', '2024-01-01'),
    ('33333333-3333-3333-3333-333333333333', '周末标准', 5, 15, 6.00, 4.00, 60.00, 'active', '2024-01-01'),
    ('33333333-3333-3333-3333-333333333333', '夜间一口价', 1, NULL, NULL, NULL, 10.00, 'active', '2024-01-01');

-- 4. 插入测试操作日志
INSERT INTO operation_logs (action, target_type, target_id, detail, created_at) VALUES
    ('system_init', 'parking', '33333333-3333-3333-3333-333333333333', '{"message": "系统初始化完成"}', NOW());
