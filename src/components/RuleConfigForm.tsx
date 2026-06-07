'use client'

import { useEffect, useState } from 'react'
import { FIELD_DISPLAY_NAMES, MetaExtractor, ParsingConfig, ParsingRule, ShipmentData } from '@/types'
import { EDITABLE_FIELDS, RECEIVER_FIELDS, SKU_FIELDS, normalizeRuleConfig } from '@/utils/ruleConfig'

interface RuleConfigFormProps {
  rule: ParsingRule
  onChange: (config: ParsingConfig) => void
  onValidityChange?: (valid: boolean, message?: string) => void
  showAdvancedJson?: boolean
}

const CARD_FIELDS: (keyof NonNullable<ParsingConfig['card_receiver_offsets']>)[] = [
  'store_name',
  'receiver_name',
  'receiver_phone',
  'receiver_address',
]

export function RuleConfigForm({
  rule,
  onChange,
  onValidityChange,
  showAdvancedJson = true,
}: RuleConfigFormProps) {
  const config = normalizeRuleConfig(rule.config)
  const [jsonDraft, setJsonDraft] = useState(JSON.stringify(config, null, 2))
  const [jsonError, setJsonError] = useState<string | null>(null)

  useEffect(() => {
    setJsonDraft(JSON.stringify(normalizeRuleConfig(rule.config), null, 2))
    setJsonError(null)
    onValidityChange?.(true)
  }, [rule.config, onValidityChange])

  const commitConfig = (nextConfig: ParsingConfig) => {
    const normalized = normalizeRuleConfig(nextConfig)
    onChange(normalized)
    setJsonDraft(JSON.stringify(normalized, null, 2))
    setJsonError(null)
    onValidityChange?.(true)
  }

  const updateConfig = (patch: Partial<ParsingConfig>) => {
    commitConfig({ ...config, ...patch })
  }

  const updateNumber = (key: keyof ParsingConfig, value: string, min?: number) => {
    const parsed = value === '' ? undefined : Number(value)
    updateConfig({
      [key]: parsed === undefined ? undefined : Math.max(min ?? Number.NEGATIVE_INFINITY, parsed || 0),
    } as Partial<ParsingConfig>)
  }

  const updateStringArray = (key: keyof ParsingConfig, values: string[]) => {
    updateConfig({ [key]: values.filter(value => value.trim()) } as Partial<ParsingConfig>)
  }

  const updateFieldStringMap = (
    key: 'column_mappings' | 'free_text_item_fields',
    field: keyof ShipmentData,
    value: string
  ) => {
    const nextMap = { ...((config[key] || {}) as Record<string, string>) }
    if (value.trim()) {
      nextMap[field] = value
    } else {
      delete nextMap[field]
    }
    updateConfig({ [key]: nextMap } as Partial<ParsingConfig>)
  }

  const updateShipmentMap = (
    key: 'default_values' | 'static_fields',
    field: keyof ShipmentData,
    value: string
  ) => {
    const nextMap: Record<string, string | number> = { ...((config[key] || {}) as Record<string, string | number>) }
    if (value.trim()) {
      nextMap[field] = field === 'sku_quantity' ? Number(value) || 0 : value
    } else {
      delete nextMap[field]
    }
    updateConfig({ [key]: nextMap as Partial<ShipmentData> } as Partial<ParsingConfig>)
  }

  const updateTextReceiverPattern = (
    key: 'free_text_receiver_patterns' | 'free_text_receiver_patterns_before',
    field: keyof NonNullable<ParsingConfig['free_text_receiver_patterns']>,
    value: string
  ) => {
    const nextPatterns = { ...(config[key] || {}) }
    if (value.trim()) {
      nextPatterns[field] = value
    } else {
      delete nextPatterns[field]
    }
    updateConfig({ [key]: nextPatterns } as Partial<ParsingConfig>)
  }

  const updateSkuGroup = (field: keyof NonNullable<ParsingConfig['free_text_sku_fields']>, value: string) => {
    const nextFields = { ...(config.free_text_sku_fields || {}) }
    if (value === '') {
      delete nextFields[field]
    } else {
      nextFields[field] = Math.max(1, Number(value) || 1)
    }
    updateConfig({ free_text_sku_fields: nextFields })
  }

  const updateSkuGroupPerPattern = (
    patternIndex: number,
    field: keyof NonNullable<ParsingConfig['free_text_sku_fields']>,
    value: string
  ) => {
    const nextMap = { ...(config.free_text_sku_fields_per_pattern || {}) }
    const nextFields = { ...(nextMap[patternIndex] || {}) }
    if (value === '') {
      delete nextFields[field]
    } else {
      nextFields[field] = Math.max(1, Number(value) || 1)
    }
    nextMap[patternIndex] = nextFields
    updateConfig({ free_text_sku_fields_per_pattern: nextMap })
  }

  const updateSequenceItem = (patch: Partial<NonNullable<ParsingConfig['free_text_sequence_item']>>) => {
    updateConfig({
      free_text_sequence_item: {
        item_start_pattern: '',
        sku_code_pattern: '',
        ...(config.free_text_sequence_item || {}),
        ...patch,
      },
    })
  }

  const updateCardOffset = (
    field: keyof NonNullable<ParsingConfig['card_receiver_offsets']>,
    axis: 'r' | 'c',
    value: string
  ) => {
    const nextOffsets = { ...(config.card_receiver_offsets || {}) }
    const current = nextOffsets[field] || { r: 0, c: 0 }
    nextOffsets[field] = {
      ...current,
      [axis]: value === '' ? 0 : Number(value) || 0,
    }
    updateConfig({ card_receiver_offsets: nextOffsets })
  }

  const updateMetaExtractor = (index: number, patch: Partial<MetaExtractor>) => {
    const nextExtractors = [...(config.meta_extractors || [])]
    nextExtractors[index] = { ...nextExtractors[index], ...patch }
    updateConfig({ meta_extractors: nextExtractors })
  }

  const removeMetaExtractor = (index: number) => {
    updateConfig({ meta_extractors: (config.meta_extractors || []).filter((_, currentIndex) => currentIndex !== index) })
  }

  const addMetaExtractor = () => {
    updateConfig({
      meta_extractors: [
        ...(config.meta_extractors || []),
        { field: 'external_code', source_type: 'cell', coordinate: '' },
      ],
    })
  }

  const handleJsonChange = (value: string) => {
    setJsonDraft(value)
    try {
      const nextConfig = normalizeRuleConfig(JSON.parse(value))
      onChange(nextConfig)
      setJsonError(null)
      onValidityChange?.(true)
    } catch {
      const message = 'JSON 格式不正确，请修正后再保存或使用'
      setJsonError(message)
      onValidityChange?.(false, message)
    }
  }

  const isTextRule = rule.file_type === 'word' || rule.file_type === 'pdf' || rule.structure_type === 'free_text'

  return (
    <div className="space-y-4">
      <Section title="基础配置" description="适用于所有规则的通用解析参数。">
        <div className="grid gap-3 md:grid-cols-3">
          <NumberInput label="表头行索引（从 0 开始）" value={config.header_row_index} onChange={(value) => updateNumber('header_row_index', value, 0)} />
          <NumberInput label="数据开始行索引（从 0 开始）" value={config.data_start_row_index} onChange={(value) => updateNumber('data_start_row_index', value, 0)} />
          <NumberInput label="最少非空单元格数" value={config.min_filled_cells} onChange={(value) => updateNumber('min_filled_cells', value, 1)} />
          <TextInput label="结束标记" value={config.data_end_marker || ''} placeholder="如：合计" onChange={(value) => updateConfig({ data_end_marker: value || undefined })} />
          <TextInput label="Sheet 名称匹配正则" value={config.sheet_name_pattern || ''} placeholder="如：仓|订单" onChange={(value) => updateConfig({ sheet_name_pattern: value || undefined })} />
          <label className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={!!config.merge_sheets}
              onChange={(event) => updateConfig({ merge_sheets: event.target.checked || undefined })}
              className="h-4 w-4 rounded border-gray-300 text-[#0fc6c2] focus:ring-[#0fc6c2]"
            />
            多 Sheet 合并解析
          </label>
        </div>
      </Section>

      {!isTextRule && (
        <Section title="标准表格字段映射" description="填写源文件里的表头名称，系统会按表头取值。">
          <FieldTextGrid
            fields={EDITABLE_FIELDS}
            values={config.column_mappings || {}}
            placeholder="源文件列名"
            onChange={(field, value) => updateFieldStringMap('column_mappings', field, value)}
          />
        </Section>
      )}

      {rule.structure_type === 'matrix' && (
        <Section title="矩阵转置配置" description="适用于门店横向展开、SKU 纵向排列的表格。">
          <div className="grid gap-3 md:grid-cols-3">
            <NumberInput label="门店列开始索引" value={config.store_columns_start} onChange={(value) => updateNumber('store_columns_start', value, 0)} />
            <NumberInput label="门店列结束索引" value={config.store_columns_end} onChange={(value) => updateNumber('store_columns_end', value, 0)} />
            <NumberInput label="门店名称列索引" value={config.store_name_column} onChange={(value) => updateNumber('store_name_column', value, 0)} />
            <TextInput label="SKU 编码表头" value={config.sku_fields_mapping?.sku_code || ''} onChange={(value) => updateConfig({ sku_fields_mapping: { ...(config.sku_fields_mapping || {}), sku_code: value || undefined } })} />
            <TextInput label="SKU 名称表头" value={config.sku_fields_mapping?.sku_name || ''} onChange={(value) => updateConfig({ sku_fields_mapping: { ...(config.sku_fields_mapping || {}), sku_name: value || undefined } })} />
            <TextInput label="SKU 规格表头" value={config.sku_fields_mapping?.sku_spec || ''} onChange={(value) => updateConfig({ sku_fields_mapping: { ...(config.sku_fields_mapping || {}), sku_spec: value || undefined } })} />
            <TextInput label="复合单元格正则" value={config.composite_cell_pattern || ''} placeholder="如：(.+?)x(\\d+)" onChange={(value) => updateConfig({ composite_cell_pattern: value || undefined })} />
            <label className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={!!config.composite_cell_split}
                onChange={(event) => updateConfig({ composite_cell_split: event.target.checked || undefined })}
                className="h-4 w-4 rounded border-gray-300 text-[#0fc6c2] focus:ring-[#0fc6c2]"
              />
              复合单元格按换行拆分
            </label>
          </div>
        </Section>
      )}

      {rule.structure_type === 'card' && (
        <Section title="卡片式配置" description="适用于一个订单占一块区域，收货信息按相对位置读取。">
          <div className="grid gap-3 md:grid-cols-3">
            <TextInput label="卡片开始正则" value={config.card_start_pattern || ''} onChange={(value) => updateConfig({ card_start_pattern: value || undefined })} />
            <NumberInput label="表头相对行" value={config.card_table_header_relative_row} onChange={(value) => updateNumber('card_table_header_relative_row', value, 0)} />
            <NumberInput label="数据相对开始行" value={config.card_table_data_start_relative_row} onChange={(value) => updateNumber('card_table_data_start_relative_row', value, 0)} />
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {CARD_FIELDS.map((field) => (
              <div key={field} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                <div className="mb-2 text-sm font-medium text-gray-700">{FIELD_DISPLAY_NAMES[field] || field}</div>
                <div className="grid grid-cols-2 gap-2">
                  <NumberInput label="相对行 r" value={config.card_receiver_offsets?.[field]?.r} onChange={(value) => updateCardOffset(field, 'r', value)} />
                  <NumberInput label="相对列 c" value={config.card_receiver_offsets?.[field]?.c} onChange={(value) => updateCardOffset(field, 'c', value)} />
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {isTextRule && (
        <Section title="文本 / PDF 解析配置" description="通过正则识别收货信息和 SKU 明细。">
          <div className="grid gap-3 md:grid-cols-3">
            <TextInput label="订单分隔符" value={config.record_separator || ''} onChange={(value) => updateConfig({ record_separator: value || undefined })} />
            <TextInput label="PDF 页分隔符" value={config.pdf_page_separator || ''} onChange={(value) => updateConfig({ pdf_page_separator: value || undefined })} />
            <TextInput label="SKU 行正则" value={config.free_text_sku_pattern || ''} onChange={(value) => updateConfig({ free_text_sku_pattern: value || undefined })} />
          </div>
          <StringArrayEditor
            title="多个订单分隔符"
            values={config.record_separators || []}
            placeholder="如：---"
            onChange={(values) => updateStringArray('record_separators', values)}
          />
          <StringArrayEditor
            title="多个 SKU 行正则"
            values={config.free_text_sku_patterns || []}
            placeholder="如：(\\S+)\\s+(.+?)\\s+(\\d+)"
            onChange={(values) => updateStringArray('free_text_sku_patterns', values)}
          />
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium text-gray-700">收货信息正则（块内）</p>
            <FieldTextGrid
              fields={RECEIVER_FIELDS}
              values={config.free_text_receiver_patterns || {}}
              placeholder="如：收件人[:：]\\s*(.+)"
              onChange={(field, value) => updateTextReceiverPattern('free_text_receiver_patterns', field as keyof NonNullable<ParsingConfig['free_text_receiver_patterns']>, value)}
            />
          </div>
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium text-gray-700">收货信息正则（块前）</p>
            <FieldTextGrid
              fields={RECEIVER_FIELDS}
              values={config.free_text_receiver_patterns_before || {}}
              placeholder="如：门店[:：]\\s*(.+)"
              onChange={(field, value) => updateTextReceiverPattern('free_text_receiver_patterns_before', field as keyof NonNullable<ParsingConfig['free_text_receiver_patterns_before']>, value)}
            />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <TextInput label="键值项通用正则" value={config.free_text_item_pattern || ''} onChange={(value) => updateConfig({ free_text_item_pattern: value || undefined })} />
          </div>
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium text-gray-700">键值项字段正则</p>
            <FieldTextGrid
              fields={EDITABLE_FIELDS}
              values={config.free_text_item_fields || {}}
              placeholder="如：字段名[:：]\\s*(.+)"
              onChange={(field, value) => updateFieldStringMap('free_text_item_fields', field, value)}
            />
          </div>
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium text-gray-700">SKU 正则分组序号</p>
            <FieldNumberGrid
              fields={SKU_FIELDS}
              values={config.free_text_sku_fields || {}}
              onChange={(field, value) => updateSkuGroup(field as keyof NonNullable<ParsingConfig['free_text_sku_fields']>, value)}
            />
          </div>
          {(config.free_text_sku_patterns || []).length > 0 && (
            <div className="mt-4 space-y-3">
              <p className="text-sm font-medium text-gray-700">每个 SKU 正则的分组序号</p>
              {(config.free_text_sku_patterns || []).map((pattern, patternIndex) => (
                <div key={`${pattern}-${patternIndex}`} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <div className="mb-2 truncate text-xs text-gray-500">第 {patternIndex + 1} 个正则：{pattern}</div>
                  <FieldNumberGrid
                    fields={SKU_FIELDS}
                    values={config.free_text_sku_fields_per_pattern?.[patternIndex] || {}}
                    onChange={(field, value) => updateSkuGroupPerPattern(patternIndex, field as keyof NonNullable<ParsingConfig['free_text_sku_fields']>, value)}
                  />
                </div>
              ))}
            </div>
          )}
          <details className="mt-4 rounded-lg border border-gray-100 bg-gray-50">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-gray-700">连续多行 SKU 识别</summary>
            <div className="grid gap-3 border-t border-gray-100 p-3 md:grid-cols-3">
              <TextInput label="SKU 起始行正则" value={config.free_text_sequence_item?.item_start_pattern || ''} onChange={(value) => updateSequenceItem({ item_start_pattern: value })} />
              <TextInput label="SKU 编码正则" value={config.free_text_sequence_item?.sku_code_pattern || ''} onChange={(value) => updateSequenceItem({ sku_code_pattern: value })} />
              <NumberInput label="编码向后查找行数" value={config.free_text_sequence_item?.sku_code_lookahead} onChange={(value) => updateSequenceItem({ sku_code_lookahead: value === '' ? undefined : Math.max(0, Number(value) || 0) })} />
              <NumberInput label="名称偏移行" value={config.free_text_sequence_item?.sku_name_offset} onChange={(value) => updateSequenceItem({ sku_name_offset: value === '' ? undefined : Number(value) || 0 })} />
              <NumberInput label="规格最多读取行数" value={config.free_text_sequence_item?.sku_spec_max_lines} onChange={(value) => updateSequenceItem({ sku_spec_max_lines: value === '' ? undefined : Math.max(1, Number(value) || 1) })} />
              <label className="text-sm text-gray-700">
                数量策略
                <select
                  value={config.free_text_sequence_item?.quantity_strategy || ''}
                  onChange={(event) => updateSequenceItem({ quantity_strategy: (event.target.value || undefined) as 'last_number' | undefined })}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-[#0fc6c2]"
                >
                  <option value="">未设置</option>
                  <option value="last_number">取最后一个数字</option>
                </select>
              </label>
              <label className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={!!config.free_text_sequence_item?.sku_spec_between_name_and_quantity}
                  onChange={(event) => updateSequenceItem({ sku_spec_between_name_and_quantity: event.target.checked || undefined })}
                  className="h-4 w-4 rounded border-gray-300 text-[#0fc6c2] focus:ring-[#0fc6c2]"
                />
                名称与数量之间作为规格
              </label>
            </div>
            <div className="px-3 pb-3">
              <StringArrayEditor
                title="连续 SKU 跳过行正则"
                values={config.free_text_sequence_item?.skip_line_patterns || []}
                placeholder="如：^规格"
                onChange={(values) => updateSequenceItem({ skip_line_patterns: values })}
              />
            </div>
          </details>
        </Section>
      )}

      <Section title="默认值与固定值" description="识别不到时可补默认值；固定值会覆盖解析结果。">
        <p className="mb-2 text-sm font-medium text-gray-700">默认值</p>
        <FieldTextGrid
          fields={EDITABLE_FIELDS}
          values={(config.default_values || {}) as Record<string, string | number>}
          placeholder="可留空"
          onChange={(field, value) => updateShipmentMap('default_values', field, value)}
        />
        <p className="mb-2 mt-4 text-sm font-medium text-gray-700">固定值</p>
        <FieldTextGrid
          fields={EDITABLE_FIELDS}
          values={(config.static_fields || {}) as Record<string, string | number>}
          placeholder="可留空"
          onChange={(field, value) => updateShipmentMap('static_fields', field, value)}
        />
      </Section>

      <Section title="后处理规则" description="控制分组填充、跳过行以及字段延续。">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm text-gray-700">
            单号聚合字段
            <select
              value={config.group_by_field || ''}
              onChange={(event) => updateConfig({ group_by_field: (event.target.value || undefined) as keyof ShipmentData | undefined })}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-[#0fc6c2]"
            >
              <option value="">不聚合</option>
              {EDITABLE_FIELDS.map((field) => (
                <option key={field} value={field}>{FIELD_DISPLAY_NAMES[field] || field}</option>
              ))}
            </select>
          </label>
        </div>
        <CheckboxFieldGroup
          title="分组后填充字段"
          selected={config.group_fill_fields || []}
          onChange={(values) => updateConfig({ group_fill_fields: values })}
        />
        <CheckboxFieldGroup
          title="向下延续字段"
          selected={config.carry_forward_fields || []}
          onChange={(values) => updateConfig({ carry_forward_fields: values })}
        />
        <StringArrayEditor
          title="跳过行正则"
          values={config.skip_row_patterns || []}
          placeholder="如：^合计"
          onChange={(values) => updateStringArray('skip_row_patterns', values)}
        />
      </Section>

      <Section title="固定位置 / 正则元信息提取" description="适用于表格底部或固定单元格里的收货信息。">
        <div className="space-y-3">
          {(config.meta_extractors || []).map((extractor, index) => (
            <div key={index} className="grid gap-2 rounded-lg border border-gray-100 bg-gray-50 p-3 md:grid-cols-4">
              <label className="text-sm text-gray-700">
                字段
                <select
                  value={extractor.field}
                  onChange={(event) => updateMetaExtractor(index, { field: event.target.value as keyof ShipmentData })}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2"
                >
                  {EDITABLE_FIELDS.map((field) => (
                    <option key={field} value={field}>{FIELD_DISPLAY_NAMES[field] || field}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-gray-700">
                来源
                <select
                  value={extractor.source_type}
                  onChange={(event) => updateMetaExtractor(index, { source_type: event.target.value as MetaExtractor['source_type'] })}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2"
                >
                  <option value="cell">固定单元格</option>
                  <option value="search_regex">搜索正则</option>
                </select>
              </label>
              <TextInput label="坐标" value={extractor.coordinate || ''} placeholder="如：B2" onChange={(value) => updateMetaExtractor(index, { coordinate: value || undefined })} />
              <div className="flex gap-2">
                <TextInput label="正则" value={extractor.pattern || ''} placeholder="(.+)" onChange={(value) => updateMetaExtractor(index, { pattern: value || undefined })} />
                <button
                  type="button"
                  onClick={() => removeMetaExtractor(index)}
                  className="mt-6 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-500 hover:bg-red-50"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addMetaExtractor}
            className="rounded-lg border border-[#d0e8e8] px-3 py-2 text-sm text-[#0b6e6e] hover:bg-[#e8fafa]"
          >
            添加元信息提取器
          </button>
        </div>
      </Section>

      {showAdvancedJson && (
        <details className="rounded-xl border border-gray-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-700">
            高级 JSON 编辑（表单会自动同步）
          </summary>
          <div className="border-t border-gray-100 p-4">
            <textarea
              value={jsonDraft}
              onChange={(event) => handleJsonChange(event.target.value)}
              rows={10}
              className={`max-h-[45vh] min-h-56 w-full resize-y rounded-lg border px-3 py-2 font-mono text-sm focus:border-transparent focus:ring-2 focus:ring-[#0fc6c2] ${
                jsonError ? 'border-red-300 bg-red-50/40' : 'border-gray-300'
              }`}
              placeholder="{}"
            />
            <p className={`mt-1 text-xs ${jsonError ? 'text-red-500' : 'text-gray-500'}`}>
              {jsonError || '一般不用改这里；上面的表单会自动同步到底层 JSON。'}
            </p>
          </div>
        </details>
      )}
    </div>
  )
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-[#d0e8e8] bg-white p-4">
      <div className="mb-4">
        <h4 className="text-sm font-semibold text-gray-800">{title}</h4>
        {description && <p className="mt-1 text-xs text-gray-500">{description}</p>}
      </div>
      {children}
    </div>
  )
}

function TextInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string
  value: string
  placeholder?: string
  onChange: (value: string) => void
}) {
  return (
    <label className="text-sm text-gray-700">
      {label}
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-[#0fc6c2]"
        placeholder={placeholder}
      />
    </label>
  )
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string
  value?: number
  onChange: (value: string) => void
}) {
  return (
    <label className="text-sm text-gray-700">
      {label}
      <input
        type="number"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-[#0fc6c2]"
      />
    </label>
  )
}

function FieldTextGrid({
  fields,
  values,
  placeholder,
  onChange,
}: {
  fields: (keyof ShipmentData)[]
  values: Record<string, string | number | undefined>
  placeholder?: string
  onChange: (field: keyof ShipmentData, value: string) => void
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {fields.map((field) => (
        <TextInput
          key={field}
          label={FIELD_DISPLAY_NAMES[field] || field}
          value={String(values[field] ?? '')}
          placeholder={placeholder}
          onChange={(value) => onChange(field, value)}
        />
      ))}
    </div>
  )
}

function FieldNumberGrid({
  fields,
  values,
  onChange,
}: {
  fields: (keyof ShipmentData)[]
  values: Record<string, number | undefined>
  onChange: (field: keyof ShipmentData, value: string) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {fields.map((field) => (
        <NumberInput
          key={field}
          label={FIELD_DISPLAY_NAMES[field] || field}
          value={values[field]}
          onChange={(value) => onChange(field, value)}
        />
      ))}
    </div>
  )
}

function StringArrayEditor({
  title,
  values,
  placeholder,
  onChange,
}: {
  title: string
  values: string[]
  placeholder?: string
  onChange: (values: string[]) => void
}) {
  const safeValues = values.length > 0 ? values : ['']

  const updateValue = (index: number, value: string) => {
    const nextValues = [...safeValues]
    nextValues[index] = value
    onChange(nextValues)
  }

  const removeValue = (index: number) => {
    onChange(safeValues.filter((_, currentIndex) => currentIndex !== index))
  }

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700">{title}</p>
        <button
          type="button"
          onClick={() => onChange([...values, ''])}
          className="rounded-lg border border-[#d0e8e8] px-2 py-1 text-xs text-[#0b6e6e] hover:bg-[#e8fafa]"
        >
          添加
        </button>
      </div>
      <div className="space-y-2">
        {safeValues.map((value, index) => (
          <div key={index} className="flex gap-2">
            <input
              type="text"
              value={value}
              onChange={(event) => updateValue(index, event.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-[#0fc6c2]"
              placeholder={placeholder}
            />
            <button
              type="button"
              onClick={() => removeValue(index)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-500 hover:bg-gray-50"
            >
              删除
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function CheckboxFieldGroup({
  title,
  selected,
  onChange,
}: {
  title: string
  selected: (keyof ShipmentData)[]
  onChange: (values: (keyof ShipmentData)[]) => void
}) {
  const toggleField = (field: keyof ShipmentData, checked: boolean) => {
    if (checked) {
      onChange(Array.from(new Set([...selected, field])))
    } else {
      onChange(selected.filter(currentField => currentField !== field))
    }
  }

  return (
    <div className="mt-4">
      <p className="mb-2 text-sm font-medium text-gray-700">{title}</p>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {EDITABLE_FIELDS.map((field) => (
          <label key={field} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={selected.includes(field)}
              onChange={(event) => toggleField(field, event.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-[#0fc6c2] focus:ring-[#0fc6c2]"
            />
            {FIELD_DISPLAY_NAMES[field] || field}
          </label>
        ))}
      </div>
    </div>
  )
}
