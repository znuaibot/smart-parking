-- P2-A 修复：billing_rules 变更历史表
-- 创建时间: 2024-01-05
-- 问题：billing_rules 表仅存储当前规则，无法追溯历史变更，可能导致财务审计困难

-- ============================================================
-- 1. 创建计费规则变更历史表
-- ============================================================
CREATE TABLE IF NOT EXISTS billing_rules_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_id UUID NOT NULL REFERENCES billing_rules(id) ON DELETE CASCADE,
    parking_id UUID NOT NULL REFERENCES parkings(id),
    changed_by UUID,                          -- 操作人 ID
    changed_at TIMESTAMPTZ DEFAULT NOW(),     -- 变更时间
    change_type VARCHAR(20) NOT NULL,         -- INSERT / UPDATE / DELETE
    old_values JSONB,                         -- 变更前的值
    new_values JSONB,                         -- 变更后的值
    change_reason TEXT,                       -- 变更原因
    ip_address INET,                          -- 操作人 IP
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_billing_rules_history_rule ON billing_rules_history(rule_id);
CREATE INDEX idx_billing_rules_history_parking ON billing_rules_history(parking_id);
CREATE INDEX idx_billing_rules_history_changed_at ON billing_rules_history(changed_at DESC);
CREATE INDEX idx_billing_rules_history_change_type ON billing_rules_history(change_type);

COMMENT ON TABLE billing_rules_history IS '计费规则变更历史表 - 用于财务审计和变更追溯';

-- ============================================================
-- 2. 创建自动记录变更历史的触发器函数
-- ============================================================
CREATE OR REPLACE FUNCTION record_billing_rules_change()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
    v_change_type VARCHAR(20);
    v_old_values JSONB;
    v_new_values JSONB;
BEGIN
    -- 获取当前用户 ID（从 session 变量中）
    v_user_id := NULLIF(current_setting('app.current_user_id', true), '')::UUID;

    IF TG_OP = 'INSERT' THEN
        v_change_type := 'INSERT';
        v_old_values := NULL;
        v_new_values := to_jsonb(NEW);
    ELSIF TG_OP = 'UPDATE' THEN
        v_change_type := 'UPDATE';
        v_old_values := to_jsonb(OLD);
        v_new_values := to_jsonb(NEW);
    ELSIF TG_OP = 'DELETE' THEN
        v_change_type := 'DELETE';
        v_old_values := to_jsonb(OLD);
        v_new_values := NULL;
    END IF;

    -- 插入变更历史
    INSERT INTO billing_rules_history (
        rule_id,
        parking_id,
        changed_by,
        change_type,
        old_values,
        new_values,
        changed_at
    ) VALUES (
        COALESCE(NEW.id, OLD.id),
        COALESCE(NEW.parking_id, OLD.parking_id),
        v_user_id,
        v_change_type,
        v_old_values,
        v_new_values,
        NOW()
    );

    -- 返回适当值
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION record_billing_rules_change() IS '自动记录计费规则变更历史';

-- ============================================================
-- 3. 创建触发器
-- ============================================================
DROP TRIGGER IF EXISTS trigger_billing_rules_history ON billing_rules;
CREATE TRIGGER trigger_billing_rules_history
    AFTER INSERT OR UPDATE OR DELETE ON billing_rules
    FOR EACH ROW EXECUTE FUNCTION record_billing_rules_change();

-- ============================================================
-- 4. 授权
-- ============================================================
GRANT SELECT ON billing_rules_history TO service_role;
GRANT INSERT ON billing_rules_history TO service_role;
