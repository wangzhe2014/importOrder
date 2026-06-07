// src/types/index.ts

export interface ShipmentData {
  id?: string
  external_code: string        // 外部编码 (optional)
  store_name: string           // 收货门店 (A组)
  receiver_name: string        // 收件人姓名 (B组)
  receiver_phone: string       // 收件人电话 (B组)
  receiver_address: string     // 收件人地址 (B组)
  sku_code: string             // SKU物品编码 (required)
  sku_name: string             // SKU物品名称 (required)
  sku_quantity: number         // SKU发货数量 (required, positive)
  sku_spec: string             // SKU规格型号 (optional)
  remark: string               // 备注 (optional)
  created_at?: string

  // V1 Compatibility properties
  sender_name?: string
  sender_phone?: string
  sender_address?: string
  weight?: number
  quantity?: number
  temperature?: string
}

export interface ParsingRule {
  id?: string
  name: string
  description?: string
  file_type: 'excel' | 'word' | 'pdf'
  structure_type: 'standard' | 'matrix' | 'card' | 'free_text'
  config: ParsingConfig
  created_at?: number
  is_builtin?: boolean
}

export interface ParsingConfig {
  // Excel configurations
  merge_sheets?: boolean
  sheet_name_pattern?: string
  
  // Table indices
  header_row_index?: number
  data_start_row_index?: number
  data_end_marker?: string // Row value indicating end of SKU table, e.g. "合计"
  
  // Matrix configurations
  store_columns_start?: number
  store_columns_end?: number
  store_name_column?: number
  sku_fields_mapping?: {
    sku_code?: string // column header name
    sku_name?: string
    sku_spec?: string
  }
  composite_cell_split?: boolean // split cell by \n
  composite_cell_pattern?: string // regex to match sku and qty, e.g. "(.+?)x(\\d+)"
  
  // Card layout configurations
  card_start_pattern?: string // regex to identify card header, e.g. "▶ 调拨记录"
  card_receiver_offsets?: {
    store_name?: { r: number; c: number } // relative cell coordinate from card start
    receiver_name?: { r: number; c: number }
    receiver_phone?: { r: number; c: number }
    receiver_address?: { r: number; c: number }
  }
  card_table_header_relative_row?: number
  card_table_data_start_relative_row?: number
  
  // Free text configurations (Word/PDF)
  record_separator?: string // separator line, e.g. "━━━"
  record_separators?: string[] // array of multiple separators, e.g. ['━━━', '===', '---']
  pdf_page_separator?: string // page boundary marker, e.g. "--- Page Break ---", "\f"
  free_text_receiver_patterns?: {
    store_name?: string // regex pattern
    receiver_name?: string
    receiver_phone?: string
    receiver_address?: string
    external_code?: string
  }
  free_text_receiver_patterns_before?: {
    store_name?: string // regex pattern to match before block lines
    receiver_name?: string
    receiver_phone?: string
    receiver_address?: string
    external_code?: string
  }
  free_text_item_pattern?: string // pattern for "编号:值" format, e.g. "收件人:\\s*(.+)"
  free_text_item_fields?: { [field: string]: string } // field -> key regex, e.g. { receiver_name: "收件人[:：]\\s*(.+)" }
  free_text_sku_pattern?: string // regex to extract SKU row, e.g. "(\\w+)\\s*\\|\\s*(.+?)\\s*\\|\\s*(.+?)\\s*\\|\\s*(\\d+)"
  free_text_sku_patterns?: string[] // multiple SKU patterns for different item formats
  free_text_sku_fields?: {
    sku_code?: number // regex capture group index
    sku_name?: number
    sku_spec?: number
    sku_quantity?: number
    remark?: number
  }
  free_text_sku_fields_per_pattern?: { // different capture group indices per pattern index
    [patternIndex: number]: {
      sku_code?: number
      sku_name?: number
      sku_spec?: number
      sku_quantity?: number
      remark?: number
    }
  }
  free_text_sequence_item?: {
    item_start_pattern: string
    sku_code_pattern: string
    sku_code_lookahead?: number
    sku_name_offset?: number
    quantity_strategy?: 'last_number'
    sku_spec_between_name_and_quantity?: boolean
    sku_spec_max_lines?: number
    skip_line_patterns?: string[]
  }

  // General field mappings from columns for standard tables
  column_mappings?: {
    [key: string]: string // Maps target field (e.g. 'sku_code') to header column name
  }

  // Generic defaults and post processing
  default_values?: Partial<ShipmentData>
  static_fields?: Partial<ShipmentData>
  carry_forward_fields?: (keyof ShipmentData)[]
  group_by_field?: keyof ShipmentData
  group_fill_fields?: (keyof ShipmentData)[]
  skip_row_patterns?: string[]
  min_filled_cells?: number
  
  // General bottom/fixed metadata extractors
  meta_extractors?: MetaExtractor[]
}

export interface MetaExtractor {
  field: keyof ShipmentData
  source_type: 'cell' | 'search_regex'
  coordinate?: string // e.g. 'B2' (1-indexed) or 'A9'
  pattern?: string // e.g. '收货人：(.+)'
}

export interface ImportError {
  rowIndex: number
  field: string
  message: string
}

export interface PreviewRow extends ShipmentData {
  rowIndex: number
  errors: ImportError[]
  isDuplicate: boolean
  duplicateWith?: number | string
  duplicateSource?: 'batch' | 'database'
}

export interface TemplateMatch {
  templateName: string
  confidence: number
  mappings: {
    [key: string]: string
  }
}

export interface ImportResult {
  success: number
  failed: number
  failedRows: number[]
  message?: string
  error?: string
  failedReasons?: {
    rowIndex?: number
    message: string
  }[]
}

export const REQUIRED_FIELDS: (keyof ShipmentData)[] = [
  'sku_code',
  'sku_name',
  'sku_quantity'
]

export const FIELD_DISPLAY_NAMES: Record<string, string> = {
  external_code: '外部编码',
  store_name: '收货门店',
  receiver_name: '收件人姓名',
  receiver_phone: '收件人电话',
  receiver_address: '收件人地址',
  sku_code: 'SKU物品编码',
  sku_name: 'SKU物品名称',
  sku_quantity: 'SKU发货数量',
  sku_spec: 'SKU规格型号',
  remark: '备注',
}
