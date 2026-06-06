'use client'

import { useState, useEffect } from 'react'
import { Plus, Copy, Trash2, Edit3, X, RefreshCw } from 'lucide-react'
import { FIELD_DISPLAY_NAMES, ParsingConfig, ParsingRule, ShipmentData } from '@/types'

const VISUAL_MAPPING_FIELDS: (keyof ShipmentData)[] = [
  'external_code',
  'store_name',
  'receiver_name',
  'receiver_phone',
  'receiver_address',
  'sku_code',
  'sku_name',
  'sku_quantity',
  'sku_spec',
  'remark',
]

export function RuleCenter() {
  const [rules, setRules] = useState<ParsingRule[]>([])
  const [loading, setLoading] = useState(false)
  const [showNewRuleModal, setShowNewRuleModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedRule, setSelectedRule] = useState<ParsingRule | null>(null)
  const [newRule, setNewRule] = useState<ParsingRule>({
    name: '',
    description: '',
    file_type: 'excel',
    structure_type: 'standard',
    config: {}
  })

  useEffect(() => {
    fetchRules()
  }, [])

  const fetchRules = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/rules')
      const data = await response.json()
      setRules(Array.isArray(data) ? data : (data.rules || []))
    } catch (error) {
      console.error('Failed to fetch rules:', error)
    } finally {
      setLoading(false)
    }
  }

  const resetNewRule = () => {
    setNewRule({
      name: '',
      description: '',
      file_type: 'excel',
      structure_type: 'standard',
      config: {}
    })
  }

  const handleSaveRule = async (rule: ParsingRule) => {
    try {
      const response = await fetch('/api/rules', {
        method: rule.id ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(rule),
      })

      const result = await response.json()
      if (result.success) {
        fetchRules()
        setShowNewRuleModal(false)
        setShowEditModal(false)
        setSelectedRule(null)
        resetNewRule()
      }
    } catch (error) {
      console.error('Failed to save rule:', error)
    }
  }

  const handleDeleteRule = async (ruleName: string) => {
    if (!confirm(`纭畾瑕佸垹闄よ鍒?"${ruleName}" 鍚楋紵`)) return

    try {
      const response = await fetch(`/api/rules?name=${encodeURIComponent(ruleName)}`, {
        method: 'DELETE',
      })

      const result = await response.json()
      if (result.success) {
        fetchRules()
      }
    } catch (error) {
      console.error('Failed to delete rule:', error)
    }
  }

  const handleCopyRule = (rule: ParsingRule) => {
    const copiedRule: ParsingRule = {
      ...rule,
      id: undefined,
      name: `${rule.name} (鍓湰)`,
      description: rule.description ? `${rule.description} (澶嶅埗)` : undefined,
    }
    setSelectedRule(copiedRule)
    setShowEditModal(true)
  }

  const handleOpenNewModal = () => {
    resetNewRule()
    setShowNewRuleModal(true)
  }

  const handleOpenEditModal = (rule: ParsingRule) => {
    setSelectedRule(rule)
    setShowEditModal(true)
  }

  const structureTypeLabels: Record<string, string> = {
    standard: '标准表格',
    matrix: '矩阵转置',
    card: '卡片式',
    free_text: '纯文本',
  }

  const fileTypeLabels: Record<string, string> = {
    excel: 'Excel',
    word: 'Word',
    pdf: 'PDF'
  }

  return (
    <div className="space-y-6">
      <div className="jt-panel p-5 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="jt-eyebrow">Rule Center</p>
            <h2 className="mt-1 text-xl font-bold text-[#1d2129]">瑙ｆ瀽瑙勫垯绠＄悊</h2>
            <p className="mt-2 text-sm text-[#86909c]">
              绠＄悊鎵€鏈夋枃浠惰В鏋愯鍒欙紝鏀寔鍒涘缓銆佺紪杈戙€佸鍒跺拰鍒犻櫎銆?
            </p>
          </div>
          <button
            onClick={handleOpenNewModal}
            className="jt-btn-primary flex items-center justify-center gap-2 px-4 py-2"
          >
            <Plus className="w-5 h-5" />
            鏂板缓瑙勫垯
          </button>
        </div>
      </div>

      {loading ? (
        <div className="jt-panel flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 text-[#0fc6c2] animate-spin" />
        </div>
      ) : rules.length === 0 ? (
        <div className="jt-panel text-center py-12 border-dashed border-[#d0e8e8]">
          <div className="w-16 h-16 mx-auto mb-4 bg-[#e8fafa] rounded-full flex items-center justify-center">
            <Edit3 className="w-8 h-8 text-[#0fc6c2]" />
          </div>
          <p className="text-[#86909c] mb-4">鏆傛棤瑙ｆ瀽瑙勫垯</p>
          <button
            onClick={handleOpenNewModal}
            className="jt-btn-primary px-6 py-2"
          >
            鍒涘缓绗竴鏉¤鍒?
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {rules.map((rule) => (
            <div
              key={rule.id || rule.name}
              className="jt-card p-5"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    rule.structure_type === 'standard' ? 'bg-blue-100 text-blue-700' :
                    rule.structure_type === 'matrix' ? 'bg-purple-100 text-purple-700' :
                    rule.structure_type === 'card' ? 'bg-orange-100 text-orange-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    {structureTypeLabels[rule.structure_type]}
                  </span>
                  <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                    {fileTypeLabels[rule.file_type]}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleCopyRule(rule)}
                    className="p-1.5 text-gray-400 hover:text-[#0fc6c2] hover:bg-[#e8fafa] rounded transition-colors"
                    title="澶嶅埗瑙勫垯"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleOpenEditModal(rule)}
                    className="p-1.5 text-gray-400 hover:text-[#0fc6c2] hover:bg-[#e8fafa] rounded transition-colors"
                    title="缂栬緫瑙勫垯"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteRule(rule.name)}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                    title="鍒犻櫎瑙勫垯"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <h3 className="font-semibold text-[#1d2129] mb-2">{rule.name}</h3>
              {rule.description && (
                <p className="text-sm text-[#86909c] line-clamp-2">{rule.description}</p>
              )}

              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center justify-between text-xs text-[#86909c]">
                  <span>{rule.file_type.toUpperCase()} 鏂囦欢</span>
                  <span>{Object.keys(rule.config).length} 项配置</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNewRuleModal && (
        <RuleEditorModal
          title="鏂板缓瑙ｆ瀽瑙勫垯"
          rule={newRule}
          onChange={setNewRule}
          onCancel={() => setShowNewRuleModal(false)}
          onSave={() => handleSaveRule(newRule)}
          saveDisabled={!newRule.name}
        />
      )}

      {showEditModal && selectedRule && (
        <RuleEditorModal
          title="缂栬緫瑙ｆ瀽瑙勫垯"
          rule={selectedRule}
          onChange={setSelectedRule}
          onCancel={() => { setShowEditModal(false); setSelectedRule(null) }}
          onSave={() => handleSaveRule(selectedRule)}
        />
      )}
    </div>
  )
}

function RuleEditorModal({
  title,
  rule,
  onChange,
  onCancel,
  onSave,
  saveDisabled = false,
}: {
  title: string
  rule: ParsingRule
  onChange: (rule: ParsingRule) => void
  onCancel: () => void
  onSave: () => void
  saveDisabled?: boolean
}) {
  const config = rule.config || {}
  const updateConfig = (patch: Partial<ParsingConfig>) => {
    onChange({ ...rule, config: { ...config, ...patch } })
  }
  const updateOptionalNumber = (key: keyof ParsingConfig, value: string) => {
    updateConfig({ [key]: value === '' ? undefined : Number(value) } as Partial<ParsingConfig>)
  }
  const updateColumnMapping = (field: keyof ShipmentData, value: string) => {
    const columnMappings = { ...(config.column_mappings || {}) }

    if (value.trim()) {
      columnMappings[field] = value
    } else {
      delete columnMappings[field]
    }

    updateConfig({ column_mappings: columnMappings })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-2xl mx-4">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-[#1d2129]">{title}</h3>
          <button
            onClick={onCancel}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">瑙勫垯鍚嶇О *</label>
            <input
              type="text"
              value={rule.name}
              onChange={(e) => onChange({ ...rule, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0fc6c2] focus:border-transparent"
              placeholder="杈撳叆瑙勫垯鍚嶇О"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">鎻忚堪</label>
            <textarea
              value={rule.description || ''}
              onChange={(e) => onChange({ ...rule, description: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0fc6c2] focus:border-transparent"
              placeholder="鎻忚堪姝よ鍒欓€傜敤鐨勬枃浠剁壒寰?.."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">鏂囦欢绫诲瀷 *</label>
              <select
                value={rule.file_type}
                onChange={(e) => onChange({ ...rule, file_type: e.target.value as ParsingRule['file_type'] })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0fc6c2] focus:border-transparent"
              >
                <option value="excel">Excel</option>
                <option value="word">Word</option>
                <option value="pdf">PDF</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">缁撴瀯绫诲瀷 *</label>
              <select
                value={rule.structure_type}
                onChange={(e) => onChange({ ...rule, structure_type: e.target.value as ParsingRule['structure_type'] })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0fc6c2] focus:border-transparent"
              >
                <option value="standard">标准表格</option>
                <option value="matrix">矩阵转置</option>
                <option value="card">卡片式</option>
                <option value="free_text">纯文本</option>
              </select>
            </div>
          </div>

          <div className="rounded-xl border border-[#d0e8e8] bg-[#f7ffff] p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-[#0b6e6e]">常用配置</p>
                <p className="text-xs text-[#667085]">优先用表单配置，复杂场景可继续编辑下方 JSON。</p>
              </div>
              {rule.file_type === 'excel' && (
                <label className="flex items-center gap-2 text-sm text-[#4e5969]">
                  <input
                    type="checkbox"
                    checked={Boolean(config.merge_sheets)}
                    onChange={(event) => updateConfig({ merge_sheets: event.target.checked })}
                    className="rounded border-gray-300 text-[#0fc6c2] focus:ring-[#0fc6c2]"
                  />
                  合并多个 Sheet
                </label>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="text-sm text-[#4e5969]">
                表头行号
                <input
                  type="number"
                  min={0}
                  value={config.header_row_index ?? ''}
                  onChange={(event) => updateOptionalNumber('header_row_index', event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-[#0fc6c2]"
                  placeholder="如 0"
                />
              </label>
              <label className="text-sm text-[#4e5969]">
                数据起始行号
                <input
                  type="number"
                  min={0}
                  value={config.data_start_row_index ?? ''}
                  onChange={(event) => updateOptionalNumber('data_start_row_index', event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-[#0fc6c2]"
                  placeholder="如 1"
                />
              </label>
              <label className="text-sm text-[#4e5969]">
                结束标记
                <input
                  type="text"
                  value={config.data_end_marker || ''}
                  onChange={(event) => updateConfig({ data_end_marker: event.target.value || undefined })}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-[#0fc6c2]"
                  placeholder="如 合计"
                />
              </label>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-sm font-medium text-[#4e5969]">字段映射</p>
              <div className="grid gap-3 md:grid-cols-2">
                {VISUAL_MAPPING_FIELDS.map((field) => (
                  <label key={field} className="text-sm text-[#4e5969]">
                    {FIELD_DISPLAY_NAMES[field] || field}
                    <input
                      type="text"
                      value={config.column_mappings?.[field] || ''}
                      onChange={(event) => updateColumnMapping(field, event.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-[#0fc6c2]"
                      placeholder="源文件列名"
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">规则配置（JSON）</label>
            <textarea
              value={JSON.stringify(rule.config, null, 2)}
              onChange={(e) => {
                try {
                  const config = JSON.parse(e.target.value)
                  onChange({ ...rule, config })
                } catch {
                  // Invalid JSON, keep previous value
                }
              }}
              rows={8}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0fc6c2] focus:border-transparent font-mono text-sm"
              placeholder="{}"
            />
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            鍙栨秷
          </button>
          <button
            onClick={onSave}
            disabled={saveDisabled}
            className="jt-btn-primary px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            淇濆瓨瑙勫垯
          </button>
        </div>
      </div>
    </div>
  )
}

