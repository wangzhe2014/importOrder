import { ParsingConfig, ParsingRule, ShipmentData } from '@/types'

export const STRUCTURE_TYPE_LABELS: Record<ParsingRule['structure_type'], string> = {
  standard: '标准表格',
  matrix: '矩阵转置',
  card: '卡片式',
  free_text: '纯文本',
}

export const FILE_TYPE_LABELS: Record<ParsingRule['file_type'], string> = {
  excel: 'Excel',
  word: 'Word',
  pdf: 'PDF',
}

export const EDITABLE_FIELDS: (keyof ShipmentData)[] = [
  'external_code',
  'store_name',
  'receiver_name',
  'receiver_phone',
  'receiver_address',
  'sku_code',
  'sku_name',
  'sku_spec',
  'sku_quantity',
  'remark',
]

export const RECEIVER_FIELDS: (keyof ShipmentData)[] = [
  'external_code',
  'store_name',
  'receiver_name',
  'receiver_phone',
  'receiver_address',
]

export const SKU_FIELDS: (keyof ShipmentData)[] = [
  'sku_code',
  'sku_name',
  'sku_spec',
  'sku_quantity',
  'remark',
]

export function normalizeRuleConfig(config: unknown): ParsingConfig {
  if (!config || typeof config !== 'object') return {}

  const normalized = { ...(config as ParsingConfig) }

  if (normalized.meta_extractors && !Array.isArray(normalized.meta_extractors)) {
    const rawExtractors = normalized.meta_extractors as unknown
    if (
      rawExtractors &&
      typeof rawExtractors === 'object' &&
      'field' in rawExtractors &&
      'source_type' in rawExtractors
    ) {
      normalized.meta_extractors = [rawExtractors as NonNullable<ParsingConfig['meta_extractors']>[number]]
    } else {
      normalized.meta_extractors = []
    }
  }

  if (normalized.free_text_sku_patterns && !Array.isArray(normalized.free_text_sku_patterns)) {
    normalized.free_text_sku_patterns = [String(normalized.free_text_sku_patterns)]
  }

  ;([
    'carry_forward_fields',
    'group_fill_fields',
    'skip_row_patterns',
    'record_separators',
  ] as const).forEach((key) => {
    const value = normalized[key] as unknown
    if (value !== undefined && !Array.isArray(value)) {
      normalized[key] = [String(value)] as never
    }
  })

  return normalized
}
