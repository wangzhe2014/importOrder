-- Supabase 初始化脚本
-- 创建解析规则表和发货单表(V2 schema)

-- ============================================================
-- parsing_rules 表
-- ============================================================
CREATE TABLE IF NOT EXISTS parsing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    file_type TEXT NOT NULL,
    structure_type TEXT NOT NULL,
    rule_config JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE parsing_rules IS '文件解析规则配置表';
COMMENT ON COLUMN parsing_rules.name IS '规则名称（唯一）';
COMMENT ON COLUMN parsing_rules.file_type IS '文件类型（如 excel, csv）';
COMMENT ON COLUMN parsing_rules.structure_type IS '结构类型';
COMMENT ON COLUMN parsing_rules.rule_config IS '规则配置（JSON 格式）';

-- ============================================================
-- shipments 表 (V2 schema)
-- ============================================================
CREATE TABLE IF NOT EXISTS shipments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_code TEXT,
    store_name TEXT,
    receiver_name TEXT,
    receiver_phone TEXT,
    receiver_address TEXT,
    sku_code TEXT NOT NULL,
    sku_name TEXT NOT NULL,
    sku_quantity INTEGER NOT NULL CHECK (sku_quantity > 0),
    sku_spec TEXT,
    remark TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE shipments IS '发货单表 (V2 schema)';
COMMENT ON COLUMN shipments.external_code IS '外部单号';
COMMENT ON COLUMN shipments.store_name IS '店铺名称';
COMMENT ON COLUMN shipments.receiver_name IS '收货人姓名';
COMMENT ON COLUMN shipments.receiver_phone IS '收货人电话';
COMMENT ON COLUMN shipments.receiver_address IS '收货地址';
COMMENT ON COLUMN shipments.sku_code IS 'SKU 编码';
COMMENT ON COLUMN shipments.sku_name IS 'SKU 名称';
COMMENT ON COLUMN shipments.sku_quantity IS 'SKU 数量（必须大于 0）';
COMMENT ON COLUMN shipments.sku_spec IS 'SKU 规格';
COMMENT ON COLUMN shipments.remark IS '备注';

-- ============================================================
-- 索引
-- ============================================================

-- parsing_rules 索引
CREATE INDEX IF NOT EXISTS idx_parsing_rules_name ON parsing_rules(name);

-- shipments 索引
CREATE INDEX IF NOT EXISTS idx_shipments_external_code ON shipments(external_code);
CREATE INDEX IF NOT EXISTS idx_shipments_receiver_name ON shipments(receiver_name);
CREATE INDEX IF NOT EXISTS idx_shipments_store_name ON shipments(store_name);
CREATE INDEX IF NOT EXISTS idx_shipments_created_at ON shipments(created_at);
