-- 内置解析规则入库脚本
-- 执行方式：在 Supabase SQL Editor 中运行本文件。
-- 说明：可重复执行；同名规则会被更新，并标记为内置规则。

ALTER TABLE parsing_rules
ADD COLUMN IF NOT EXISTS is_builtin BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN parsing_rules.is_builtin IS '是否为系统内置规则，内置规则不允许删除';

INSERT INTO parsing_rules (name, description, file_type, structure_type, rule_config, is_builtin)
VALUES
(
  '标准表格 + 尾部收货信息',
  '适用于前部是 SKU 明细、尾部独立行存放单号和收货人信息的 Excel 出库单。',
  'excel',
  'standard',
  $${
    "header_row_index": 3,
    "data_start_row_index": 4,
    "data_end_marker": "合计",
    "column_mappings": {
      "sku_code": "物品编码",
      "sku_name": "物品名称",
      "sku_spec": "规格型号",
      "sku_quantity": "发货数量"
    },
    "meta_extractors": [
      { "field": "store_name", "source_type": "cell", "coordinate": "B2" },
      { "field": "external_code", "source_type": "cell", "coordinate": "B8" },
      { "field": "receiver_name", "source_type": "cell", "coordinate": "B9" },
      { "field": "receiver_phone", "source_type": "cell", "coordinate": "E9" },
      { "field": "receiver_address", "source_type": "cell", "coordinate": "N9" }
    ],
    "skip_row_patterns": ["合计", "总计"],
    "min_filled_cells": 2
  }$$::jsonb,
  TRUE
),
(
  '标准明细 + 单号聚合',
  '适用于每行都有门店和配送单号的明细表，按配送单号自然聚合展示。',
  'excel',
  'standard',
  $${
    "header_row_index": 1,
    "data_start_row_index": 2,
    "column_mappings": {
      "external_code": "配送单号",
      "store_name": "收货机构",
      "receiver_name": "收货人",
      "receiver_phone": "收货电话",
      "receiver_address": "收货地址",
      "sku_code": "物品编码*",
      "sku_name": "物品名称",
      "sku_spec": "规格型号",
      "sku_quantity": "发货数量*"
    },
    "group_by_field": "external_code",
    "group_fill_fields": ["store_name", "receiver_name", "receiver_phone", "receiver_address"],
    "skip_row_patterns": ["合计", "总计"],
    "min_filled_cells": 4
  }$$::jsonb,
  TRUE
),
(
  '矩阵转置 + 门店列',
  '适用于 SKU 为纵向行、门店为横向列的 Excel 矩阵，下单数量大于 0 时展开为 SKU 明细。',
  'excel',
  'matrix',
  $${
    "header_row_index": 0,
    "data_start_row_index": 1,
    "store_columns_start": 13,
    "store_columns_end": 17,
    "sku_fields_mapping": {
      "sku_code": "外部商品编码",
      "sku_name": "SKU名称",
      "sku_spec": "规格"
    },
    "skip_row_patterns": ["合计", "总计"],
    "min_filled_cells": 4
  }$$::jsonb,
  TRUE
),
(
  '多 Sheet 合并 + 标题门店',
  '适用于每个 Sheet 是一个门店出库单的 Excel 文件，从 Sheet 标题提取门店并合并所有 Sheet。',
  'excel',
  'standard',
  $${
    "merge_sheets": true,
    "header_row_index": 3,
    "data_start_row_index": 4,
    "data_end_marker": "合计",
    "column_mappings": {
      "sku_code": "物品编码",
      "sku_name": "物品名称",
      "sku_spec": "规格型号",
      "sku_quantity": "出库数量",
      "remark": "备注"
    },
    "meta_extractors": [
      { "field": "store_name", "source_type": "search_regex", "pattern": "^(.+?)出库单$" }
    ],
    "skip_row_patterns": ["合计", "总计"],
    "min_filled_cells": 2
  }$$::jsonb,
  TRUE
),
(
  '卡片式调拨记录',
  '适用于纵向堆叠的调拨卡片，每个卡片内有独立收货信息和 SKU 小表。',
  'excel',
  'card',
  $${
    "card_start_pattern": "^▶\\s*调拨记录",
    "card_receiver_offsets": {
      "store_name": { "r": 1, "c": 1 },
      "receiver_name": { "r": 1, "c": 3 },
      "receiver_phone": { "r": 1, "c": 5 },
      "receiver_address": { "r": 2, "c": 1 }
    },
    "card_table_header_relative_row": 3,
    "card_table_data_start_relative_row": 4,
    "column_mappings": {
      "sku_code": "物品编码",
      "sku_name": "物品名称",
      "sku_spec": "规格",
      "sku_quantity": "数量"
    },
    "skip_row_patterns": ["合计", "总计"],
    "min_filled_cells": 2
  }$$::jsonb,
  TRUE
),
(
  'PDF 序列明细 + 文本收货信息',
  '适用于 PDF 抽取后每个 SKU 被拆成多行文本的配送单，通过序号、SKU 编码和最后数量行识别明细。',
  'pdf',
  'free_text',
  $${
    "free_text_receiver_patterns": {
      "external_code": "单据编号：\\s*(.+)",
      "store_name": "收货机构：\\s*(.+)",
      "receiver_name": "收货人：\\s*(.+)",
      "receiver_phone": "收货电话：\\s*(.+)",
      "receiver_address": "收货地址：\\s*(.+)"
    },
    "free_text_sequence_item": {
      "item_start_pattern": "^\\d+$",
      "sku_code_pattern": "^ZBWP\\d+$",
      "sku_code_lookahead": 3,
      "sku_name_offset": 1,
      "quantity_strategy": "last_number",
      "sku_spec_between_name_and_quantity": true,
      "sku_spec_max_lines": 1,
      "skip_line_patterns": ["^物品类别$", "^物品编码$", "^物品名称$", "^规格型号$", "^订货单位$", "^发货数量$", "^备注$", "^第\\d+页", "^页$"]
    }
  }$$::jsonb,
  TRUE
)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  file_type = EXCLUDED.file_type,
  structure_type = EXCLUDED.structure_type,
  rule_config = EXCLUDED.rule_config,
  is_builtin = TRUE;
