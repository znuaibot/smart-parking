-- P2-A: 添加 billing_rules 变更历史表
-- 创建时间: 2024-01-04
-- 说明: 记录计费规则变更历史，便于财务审计

-- 1. 创建计费规则变更历史表
CREATE TABLE IF NOT EXISTS billing_rules_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_id UUID NOT NULL REFERENCES billing_rules(id) ON DELETE CASCADE,
    changed_by UUID,  -- 操作人 ID，NULL 表示系统操作
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    operation VARCHAR(20) NOT NULL,  -- CREATE, UPDATE, DELETE
    old_values JSONB,  -- 变更前的值
    new_values JSONB,  -- 变更后的值
    change_reason TEXT  -- 变更原因
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_billing_history_rule ON billing_rules_history(rule_id);
CREATE INDEX IF NOT EXISTS idx_billing_history_changed_at ON billing_rules_history(changed_at DESC);

COMMENT ON TABLE billing_rules_history IS '计费规则变更历史表，用于财务审计';

-- 2. 创建触发器：自动记录 billing_rules 的变更历史
CREATE OR REPLACE FUNCTION record_billing_rule_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 创建新规则
    IF TG_OP = 'INSERT' THEN
        INSERT INTO billing_rules_history (rule_id, changed_by, operation, new_values, change_reason)
        VALUES (
            NEW.id,
            NEW.created_by,
            'CREATE',
            to_jsonb(NEW),
            NEW.change_reason
        );
        RETURN NEW;
    END IF;

    -- 更新规则
    IF TG_OP = 'UPDATE' THEN
        INSERT INTO billing_rules_history (rule_id, changed_by, operation, old_values, new_values, change_reason)
        VALUES (
            NEW.id,
            NEW.updated_by,
            'UPDATE',
            to_jsonb(OLD),
            to_jsonb(NEW),
            NEW.change_reason
        );
        RETURN NEW;
    END IF;

    -- 删除规则
    IF TG_OP = 'DELETE' THEN
        INSERT INTO billing_rules_history (rule_id, operation, old_values)
        VALUES (
            OLD.id,
            'DELETE',
            to_jsonb(OLD)
        );
        RETURN OLD;
    END IF;
END;
$$;

-- 3. 添加触发器
DROP TRIGGER IF EXISTS trg_billing_rules_history ON billing_rules;
CREATE TRIGGER trg_billing_rules_history
    AFTER INSERT OR UPDATE OR DELETE ON billing_rules
    FOR EACH ROW
    EXECUTE FUNCTION record_billing_rule_changes();

COMMENT ON FUNCTION record_billing_rule_changes IS '自动记录计费规则变更到历史表';
