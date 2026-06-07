'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Copy, Trash2, Edit3, Sparkles, Check, X, RefreshCw, Eye, AlertTriangle, Info } from 'lucide-react'
import { ParsingRule, ShipmentData, FIELD_DISPLAY_NAMES } from '@/types'
import { parseExcelWithRule, parseTextWithRule } from '@/utils/ruleEngine'

const STRUCTURE_TYPE_LABELS: Record<ParsingRule['structure_type'], string> = {
  standard: '标准表格',
  matrix: '矩阵转置',
  card: '卡片式',
  free_text: '纯文本',
}

const AI_STATUS_LABELS: Record<string, string> = {
  confident: '确定',
  guessed: '推测',
  not_found: '未找到',
}

const EDITABLE_FIELDS: (keyof ShipmentData)[] = [
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

const COMMON_GROUP_FIELDS: (keyof ShipmentData)[] = [
  'external_code',
  'store_name',
  'receiver_name',
  'receiver_phone',
  'receiver_address',
]

function normalizeRuleConfig(config: unknown): ParsingRule['config'] {
  if (!config || typeof config !== 'object') return {}

  const normalized = { ...(config as ParsingRule['config']) }

  if (normalized.meta_extractors && !Array.isArray(normalized.meta_extractors)) {
    const rawExtractors = normalized.meta_extractors as unknown
    if (
      rawExtractors &&
      typeof rawExtractors === 'object' &&
      'field' in rawExtractors &&
      'source_type' in rawExtractors
    ) {
      normalized.meta_extractors = [rawExtractors as NonNullable<ParsingRule['config']['meta_extractors']>[number]]
    } else {
      normalized.meta_extractors = []
    }
  }

  if (normalized.free_text_sku_patterns && !Array.isArray(normalized.free_text_sku_patterns)) {
    normalized.free_text_sku_patterns = [String(normalized.free_text_sku_patterns)]
  }

  ;(['carry_forward_fields', 'group_fill_fields', 'skip_row_patterns', 'record_separators'] as const).forEach((key) => {
    const value = normalized[key] as unknown
    if (value !== undefined && !Array.isArray(value)) {
      normalized[key] = [String(value)] as never
    }
  })

  return normalized
}

interface RuleManagerProps {
  rules: ParsingRule[]
  fileType: 'excel' | 'word' | 'pdf'
  parsedData: {
    type: 'excel' | 'word' | 'pdf'
    sheets?: { name: string; data: string[][] }[]
    lines?: string[]
  } | null
  onRuleSelect: (rule: ParsingRule) => void
  onNewRule: (rule: ParsingRule) => void
  onRefresh: () => void
}

export function RuleManager({ rules, fileType, parsedData, onRuleSelect, onNewRule, onRefresh }: RuleManagerProps) {
  const [showNewRuleModal, setShowNewRuleModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedRuleForEdit, setSelectedRuleForEdit] = useState<ParsingRule | null>(null)
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiRule, setAiRule] = useState<ParsingRule | null>(null)
  const [aiMetadata, setAiMetadata] = useState<Record<string, { status: string; reason: string }>>({})
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiWarning, setAiWarning] = useState<string | null>(null)
  const [aiConfigDraft, setAiConfigDraft] = useState('')
  const [aiConfigError, setAiConfigError] = useState<string | null>(null)
  const [copiedRuleId, setCopiedRuleId] = useState<string | null>(null)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [previewData, setPreviewData] = useState<ShipmentData[]>([])
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const handleGenerateRule = useCallback(async () => {
    if (!parsedData) {
      setAiError('没有可分析的文件结构，请先上传文件')
      return
    }

    setAiGenerating(true)
    setAiRule(null)
    setAiMetadata({})
    setAiError(null)
    setAiWarning(null)
    setAiConfigDraft('')
    setAiConfigError(null)

    try {
      const response = await fetch('/api/generate-rule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(parsedData),
      })

      const result = await response.json()

      if (!response.ok || result.error) {
        console.error('Failed to generate rule:', result.error)
        setAiError(result.error || `规则生成接口异常：HTTP ${response.status}`)
        return
      }

      if (!result.rule) {
        setAiError('规则生成失败：接口没有返回规则内容')
        return
      }

      const generatedRule = {
        ...(result.rule as ParsingRule),
        config: normalizeRuleConfig((result.rule as ParsingRule).config),
      }
      setAiRule(generatedRule)
      setAiConfigDraft(JSON.stringify(generatedRule.config, null, 2))
      setAiConfigError(null)
      setAiMetadata(result.ai_metadata || {})
      setAiWarning(result.warning || null)
    } catch (error) {
      console.error('Failed to call AI:', error)
      setAiError(error instanceof Error ? error.message : 'AI 规则生成请求失败')
    } finally {
      setAiGenerating(false)
    }
  }, [parsedData])

  // 当规则列表为空且有解析数据时，自动打开新建规则弹窗并触发 AI 生成
  const [autoTriggered, setAutoTriggered] = useState(false)
  useEffect(() => {
    if (rules.length === 0 && parsedData && !autoTriggered && !showNewRuleModal) {
      setShowNewRuleModal(true)
      setAutoTriggered(true)
    }
  }, [rules.length, parsedData, autoTriggered, showNewRuleModal])

  // 当弹窗打开且没有 AI 结果时，自动触发
  const [autoGenerated, setAutoGenerated] = useState(false)
  useEffect(() => {
    if (showNewRuleModal && !aiRule && !aiGenerating && rules.length === 0 && !autoGenerated) {
      setAutoGenerated(true)
      handleGenerateRule()
    }
  }, [showNewRuleModal, aiRule, aiGenerating, rules.length, autoGenerated, handleGenerateRule])

  const handleSaveRule = async (rule: ParsingRule) => {
    try {
      const normalizedRule = { ...rule, config: normalizeRuleConfig(rule.config) }
      const response = await fetch('/api/rules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(normalizedRule),
      })

      const result = await response.json()
      if (result.success) {
        onRefresh()
      }
    } catch (error) {
      console.error('Failed to save rule:', error)
    }
  }

  const handleDeleteRule = async (ruleName: string) => {
    if (!confirm(`确定要删除规则 "${ruleName}" 吗？`)) return

    try {
      const response = await fetch(`/api/rules?name=${encodeURIComponent(ruleName)}`, {
        method: 'DELETE',
      })

      const result = await response.json()
      if (result.success) {
        onRefresh()
      }
    } catch (error) {
      console.error('Failed to delete rule:', error)
    }
  }

  const handleCopyRule = (rule: ParsingRule) => {
    const copiedRule: ParsingRule = {
      ...rule,
      id: undefined,
      name: `${rule.name} (副本)`,
      description: rule.description ? `${rule.description} (复制)` : undefined,
    }
    setSelectedRuleForEdit(copiedRule)
    setShowEditModal(true)
    setCopiedRuleId(rule.id || rule.name)
    setTimeout(() => setCopiedRuleId(null), 2000)
  }

  const handleApplyRule = (rule: ParsingRule) => {
    if (!parsedData) {
      setAiError('没有可用的样例数据，请先上传文件')
      return
    }

    const normalizedRule = { ...rule, config: normalizeRuleConfig(rule.config) }

    try {
      let results: ShipmentData[] = []
      if (normalizedRule.file_type === 'excel') {
        if (!parsedData.sheets) {
          setAiError('Excel 数据为空，无法使用此规则解析')
          return
        }
        results = parseExcelWithRule(parsedData.sheets, normalizedRule)
      } else {
        if (!parsedData.lines) {
          setAiError('文本数据为空，无法使用此规则解析')
          return
        }
        results = parseTextWithRule(parsedData.lines, normalizedRule)
      }

      if (results.length === 0) {
        setAiError('规则没有解析出任何数据，请先点击“试解析”查看原因，或调整上方规则表单')
        return
      }
    } catch (error) {
      setAiError(`规则预检失败：${error instanceof Error ? error.message : '未知错误'}`)
      return
    }

    onRuleSelect(normalizedRule)
    setShowNewRuleModal(false)
    setShowEditModal(false)
    setAiError(null)
    setAiWarning(null)
    setAiConfigError(null)
  }

  const closeNewRuleModal = () => {
    setShowNewRuleModal(false)
    setAiRule(null)
    setAiMetadata({})
    setAiError(null)
    setAiWarning(null)
    setAiConfigDraft('')
    setAiConfigError(null)
  }

  const handleTestParse = (rule: ParsingRule) => {
    if (!parsedData) {
      setPreviewError('没有可用的样例数据，请先上传文件')
      setPreviewData([])
      setShowPreviewModal(true)
      return
    }

    const normalizedRule = { ...rule, config: normalizeRuleConfig(rule.config) }

    setPreviewing(true)
    setPreviewError(null)
    setPreviewData([])

    try {
      let results: ShipmentData[]
      if (rule.file_type === 'excel') {
        if (!parsedData.sheets) {
          setPreviewError('Excel 数据为空')
          setShowPreviewModal(true)
          setPreviewing(false)
          return
        }
        results = parseExcelWithRule(parsedData.sheets, normalizedRule)
      } else {
        // word or pdf
        if (!parsedData.lines) {
          setPreviewError('文本数据为空')
          setShowPreviewModal(true)
          setPreviewing(false)
          return
        }
        results = parseTextWithRule(parsedData.lines, normalizedRule)
      }

      // 只显示前 20 行预览
      setPreviewData(results.slice(0, 20))
      if (results.length === 0) {
        setPreviewError('解析结果为空，请检查规则配置')
      }
    } catch (error: any) {
      setPreviewError(`解析出错: ${error?.message || '未知错误'}`)
    } finally {
      setPreviewing(false)
      setShowPreviewModal(true)
    }
  }

  const filteredRules = rules.filter(r => r.file_type === fileType)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#1d2129]">选择解析规则</h2>
          <p className="text-sm text-[#86909c] mt-1">
            当前文件类型：{fileType === 'excel' ? 'Excel' : fileType === 'word' ? 'Word' : 'PDF'}
          </p>
        </div>
        <button
          onClick={() => setShowNewRuleModal(true)}
          className="jt-btn-primary flex items-center gap-2 px-4 py-2"
        >
          <Plus className="w-5 h-5" />
          新建规则
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredRules.length === 0 ? (
          <div className="col-span-full p-12 text-center bg-white rounded-xl border border-dashed border-[#d0e8e8]">
            <div className="w-16 h-16 mx-auto mb-4 bg-[#e8fafa] rounded-full flex items-center justify-center">
              <Edit3 className="w-8 h-8 text-[#0fc6c2]" />
            </div>
            <p className="text-[#86909c] mb-4">暂无匹配的解析规则</p>
            <button
              onClick={() => setShowNewRuleModal(true)}
              className="jt-btn-primary px-6 py-2"
            >
              创建新规则
            </button>
          </div>
        ) : (
          filteredRules.map((rule) => (
            <div
              key={rule.id || rule.name}
              className="jt-card p-5 cursor-pointer hover:border-[#0fc6c2] group"
              onClick={() => onRuleSelect(rule)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    rule.structure_type === 'standard' ? 'bg-blue-100 text-blue-700' :
                    rule.structure_type === 'matrix' ? 'bg-purple-100 text-purple-700' :
                    rule.structure_type === 'card' ? 'bg-orange-100 text-orange-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    {rule.structure_type === 'standard' && '标准'}
                    {rule.structure_type === 'matrix' && '矩阵'}
                    {rule.structure_type === 'card' && '卡片'}
                    {rule.structure_type === 'free_text' && '文本'}
                  </span>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleCopyRule(rule) }}
                    className="p-1.5 text-gray-400 hover:text-[#0fc6c2] hover:bg-[#e8fafa] rounded transition-colors"
                    title="复制规则"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelectedRuleForEdit(rule); setShowEditModal(true) }}
                    className="p-1.5 text-gray-400 hover:text-[#0fc6c2] hover:bg-[#e8fafa] rounded transition-colors"
                    title="编辑规则"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteRule(rule.name) }}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                    title="删除规则"
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
                  <span>{rule.file_type.toUpperCase()} 文件</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleTestParse(rule) }}
                      className="p-1 text-[#86909c] hover:text-blue-500 hover:bg-blue-50 rounded transition-colors"
                      title="试解析"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <span>点击使用</span>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {showNewRuleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-3xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold text-[#1d2129]">新建解析规则</h3>
                <p className="text-sm text-[#86909c] mt-1">
                  AI 将自动分析文件结构并生成推荐规则
                </p>
              </div>
              <button
                onClick={closeNewRuleModal}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="mb-6">
                <button
                  onClick={handleGenerateRule}
                  disabled={aiGenerating}
                  className="w-full jt-btn-primary flex items-center justify-center gap-2 py-3"
                >
                  {aiGenerating ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      AI 分析中...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      智能分析文件并生成规则
                    </>
                  )}
                </button>
              </div>

              {aiError && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  {aiError}
                </div>
              )}

              {aiWarning && !aiError && (
                <div className="mb-4 rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-700">
                  {aiWarning}
                </div>
              )}

              {aiRule && (
                <div className="space-y-4">
                  <div className="p-4 bg-[#e8fafa] rounded-xl border border-[#d0e8e8]">
                    <div className="flex items-center gap-2 mb-2">
                      <Check className="w-5 h-5 text-[#0fc6c2]" />
                      <span className="font-medium text-[#0b6e6e]">AI 已生成推荐规则</span>
                    </div>
                    <p className="text-sm text-[#0b6e6e]">
                      {Object.keys(aiMetadata).length > 0 
                        ? '以下字段映射由 AI 分析得出，点击确认后可使用或进一步编辑'
                        : '规则已生成，可直接使用或进一步编辑'}
                    </p>
                  </div>

                  <div className="p-4 bg-gray-50 rounded-xl">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="font-medium text-gray-800">规则名称</span>
                      <input
                        type="text"
                        value={aiRule.name}
                        onChange={(e) => setAiRule({ ...aiRule, name: e.target.value })}
                        className="flex-1 px-3 py-1 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>
                    
                    <div className="mb-3">
                      <span className="font-medium text-gray-800 block mb-2">结构类型</span>
                      <select
                        value={aiRule.structure_type}
                        onChange={(e) => setAiRule({ ...aiRule, structure_type: e.target.value as ParsingRule['structure_type'] })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                      >
                        <option value="standard">{STRUCTURE_TYPE_LABELS.standard}</option>
                        <option value="matrix">{STRUCTURE_TYPE_LABELS.matrix}</option>
                        <option value="card">{STRUCTURE_TYPE_LABELS.card}</option>
                        <option value="free_text">{STRUCTURE_TYPE_LABELS.free_text}</option>
                      </select>
                    </div>

                    {aiMetadata && Object.keys(aiMetadata).length > 0 && (
                      <div className="mt-4">
                        <h4 className="text-sm font-medium text-gray-700 mb-2">AI 字段识别结果</h4>
                        <div className="space-y-2">
                          {Object.entries(aiMetadata).map(([field, info]) => (
                            <div key={field} className={`flex items-center justify-between p-2 rounded-lg ${
                              info.status === 'confident' ? 'bg-green-50' :
                              info.status === 'guessed' ? 'bg-yellow-50' : 'bg-gray-50'
                            }`}>
                              <span className="text-sm text-gray-700">{FIELD_DISPLAY_NAMES[field] || field}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                info.status === 'confident' ? 'bg-green-100 text-green-700' :
                                info.status === 'guessed' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-700'
                              }`}>
                                {AI_STATUS_LABELS[info.status] || info.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <RuleConfigForm
                      rule={aiRule}
                      onChange={(nextConfig) => {
                        const normalizedConfig = normalizeRuleConfig(nextConfig)
                        setAiRule({ ...aiRule, config: normalizedConfig })
                        setAiConfigDraft(JSON.stringify(normalizedConfig, null, 2))
                        setAiConfigError(null)
                      }}
                    />

                    <details className="mt-4 rounded-xl border border-gray-200 bg-white">
                      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-700">
                        高级 JSON 编辑（懂规则时再展开）
                      </summary>
                      <div className="border-t border-gray-100 p-4">
                        <textarea
                          value={aiConfigDraft}
                          onChange={(e) => {
                            const nextValue = e.target.value
                            setAiConfigDraft(nextValue)
                            try {
                              const config = normalizeRuleConfig(JSON.parse(nextValue))
                              setAiRule({ ...aiRule, config })
                              setAiConfigError(null)
                            } catch {
                              setAiConfigError('JSON 格式不正确，请修正后再试解析、保存或使用')
                            }
                          }}
                          rows={8}
                          className={`w-full px-3 py-2 border rounded-lg font-mono text-sm focus:ring-2 focus:ring-[#0fc6c2] focus:border-transparent ${
                            aiConfigError ? 'border-red-300 bg-red-50/40' : 'border-gray-200'
                          }`}
                        />
                        <p className={`mt-1 text-xs ${aiConfigError ? 'text-red-500' : 'text-gray-500'}`}>
                          {aiConfigError || '一般不用改这里；上面的表单会自动同步到 JSON。'}
                        </p>
                      </div>
                    </details>

                    <div className="flex gap-3 mt-4">
                      <button
                        onClick={() => handleTestParse(aiRule)}
                        disabled={!!aiConfigError}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                        试解析
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {!aiRule && !aiGenerating && (
                <div className="text-center py-12">
                  <div className="w-20 h-20 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                    <Sparkles className="w-10 h-10 text-gray-400" />
                  </div>
                  <p className="text-gray-500 mb-4">点击上方按钮，AI 将自动分析您上传的文件</p>
                  <p className="text-sm text-gray-400">
                    AI 将识别文件结构、字段位置，并生成一套解析规则供您使用
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={closeNewRuleModal}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              {aiRule && (
                <>
                  <button
                    onClick={() => { handleSaveRule(aiRule); closeNewRuleModal() }}
                    disabled={!!aiConfigError}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    保存规则
                  </button>
                  <button
                    onClick={() => handleApplyRule(aiRule)}
                    disabled={!!aiConfigError}
                    className="jt-btn-primary px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    使用此规则解析
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showEditModal && selectedRuleForEdit && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-3xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-[#1d2129]">编辑解析规则</h3>
              <button
                onClick={() => { setShowEditModal(false); setSelectedRuleForEdit(null) }}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">规则名称</label>
                <input
                  type="text"
                  value={selectedRuleForEdit.name}
                  onChange={(e) => setSelectedRuleForEdit({ ...selectedRuleForEdit, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0fc6c2] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                <textarea
                  value={selectedRuleForEdit.description || ''}
                  onChange={(e) => setSelectedRuleForEdit({ ...selectedRuleForEdit, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0fc6c2] focus:border-transparent"
                  placeholder="描述此规则适用的文件特征..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">文件类型</label>
                <select
                  value={selectedRuleForEdit.file_type}
                  onChange={(e) => setSelectedRuleForEdit({ ...selectedRuleForEdit, file_type: e.target.value as ParsingRule['file_type'] })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0fc6c2] focus:border-transparent"
                >
                  <option value="excel">Excel</option>
                  <option value="word">Word</option>
                  <option value="pdf">PDF</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">结构类型</label>
                <select
                  value={selectedRuleForEdit.structure_type}
                  onChange={(e) => setSelectedRuleForEdit({ ...selectedRuleForEdit, structure_type: e.target.value as ParsingRule['structure_type'] })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0fc6c2] focus:border-transparent"
                >
                  <option value="standard">标准表格</option>
                  <option value="matrix">矩阵转置</option>
                  <option value="card">卡片式</option>
                  <option value="free_text">纯文本</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">规则配置（JSON）</label>
                <textarea
                  value={JSON.stringify(selectedRuleForEdit.config, null, 2)}
                  onChange={(e) => {
                    try {
                      const config = JSON.parse(e.target.value)
                      setSelectedRuleForEdit({ ...selectedRuleForEdit, config })
                    } catch {
                      // Invalid JSON, keep previous value
                    }
                  }}
                  rows={10}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0fc6c2] focus:border-transparent font-mono text-sm"
                />
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => { setShowEditModal(false); setSelectedRuleForEdit(null) }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => handleTestParse(selectedRuleForEdit)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
              >
                <Eye className="w-4 h-4" />
                试解析
              </button>
              <button
                onClick={() => { handleSaveRule(selectedRuleForEdit); setShowEditModal(false); setSelectedRuleForEdit(null) }}
                className="jt-btn-primary px-4 py-2"
              >
                保存修改
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 试解析预览弹窗 */}
      {showPreviewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-5xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-blue-600" />
                <h3 className="text-xl font-bold text-[#1d2129]">试解析预览</h3>
              </div>
              <button
                onClick={() => { setShowPreviewModal(false); setPreviewError(null) }}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {previewing && (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-8 h-8 text-[#0fc6c2] animate-spin" />
                  <span className="ml-3 text-gray-600">正在解析...</span>
                </div>
              )}

              {previewError && !previewing && (
                <div className="p-4 bg-red-50 rounded-xl border border-red-200">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                    <span className="font-medium text-red-700">{previewError}</span>
                  </div>
                </div>
              )}

              {previewData.length > 0 && !previewing && (
                <div>
                  <div className="flex items-center gap-2 mb-3 p-3 bg-blue-50 rounded-lg">
                    <Info className="w-4 h-4 text-blue-600" />
                    <span className="text-sm text-blue-700">
                      解析成功！共 {previewData.length} 条记录
                      {previewData.length === 20 && '（仅显示前 20 条）'}
                    </span>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">#</th>
                          {Object.keys(previewData[0] || {})
                            .filter(key => key !== 'id' && key !== 'created_at' && previewData[0]?.[key as keyof ShipmentData] !== undefined)
                            .map((key) => (
                              <th key={key} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                                {FIELD_DISPLAY_NAMES[key] || key}
                              </th>
                            ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {previewData.map((row, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-sm text-gray-500">{idx + 1}</td>
                            {Object.keys(row).filter(key => key !== 'id' && key !== 'created_at').map((key) => (
                              <td key={key} className="px-3 py-2 text-sm text-gray-700 whitespace-nowrap max-w-[200px] truncate" title={String(row[key as keyof ShipmentData] ?? '')}>
                                {String(row[key as keyof ShipmentData] ?? '-')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function RuleConfigForm({
  rule,
  onChange,
}: {
  rule: ParsingRule
  onChange: (config: ParsingRule['config']) => void
}) {
  const config = rule.config
  const isTextRule = rule.file_type === 'word' || rule.file_type === 'pdf' || rule.structure_type === 'free_text'

  const updateConfig = (patch: Partial<ParsingRule['config']>) => {
    onChange({ ...config, ...patch })
  }

  const setRowIndex = (key: 'header_row_index' | 'data_start_row_index', value: string) => {
    updateConfig({ [key]: value === '' ? undefined : Math.max(0, Number(value) - 1) })
  }

  const setColumnMapping = (field: keyof ShipmentData, value: string) => {
    const nextMappings = { ...(config.column_mappings || {}) }
    if (value.trim()) {
      nextMappings[field] = value
    } else {
      delete nextMappings[field]
    }
    updateConfig({ column_mappings: nextMappings })
  }

  const setDefaultValue = (field: keyof ShipmentData, value: string) => {
    const nextDefaults: Record<string, string | number> = { ...(config.default_values || {}) }
    if (value.trim()) {
      nextDefaults[field] = field === 'sku_quantity' ? Number(value) || 0 : value
    } else {
      delete nextDefaults[field]
    }
    updateConfig({ default_values: nextDefaults as Partial<ShipmentData> })
  }

  const setReceiverPattern = (field: keyof ShipmentData, value: string) => {
    const nextPatterns = { ...(config.free_text_receiver_patterns || {}) }
    if (value.trim()) {
      nextPatterns[field as keyof NonNullable<ParsingRule['config']['free_text_receiver_patterns']>] = value
    } else {
      delete nextPatterns[field as keyof NonNullable<ParsingRule['config']['free_text_receiver_patterns']>]
    }
    updateConfig({ free_text_receiver_patterns: nextPatterns })
  }

  const setSkuFieldIndex = (field: keyof ShipmentData, value: string) => {
    const nextFields = { ...(config.free_text_sku_fields || {}) }
    const typedField = field as keyof NonNullable<ParsingRule['config']['free_text_sku_fields']>
    if (value === '') {
      delete nextFields[typedField]
    } else {
      nextFields[typedField] = Math.max(1, Number(value) || 1)
    }
    updateConfig({ free_text_sku_fields: nextFields })
  }

  const updateSequenceItem = (patch: Partial<NonNullable<ParsingRule['config']['free_text_sequence_item']>>) => {
    updateConfig({
      free_text_sequence_item: {
        item_start_pattern: '',
        sku_code_pattern: '',
        ...(config.free_text_sequence_item || {}),
        ...patch,
      },
    })
  }

  return (
    <div className="mt-4 rounded-xl border border-[#d0e8e8] bg-white p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-gray-800">可视化规则编辑</h4>
          <p className="mt-1 text-xs text-gray-500">
            优先改这里：填写表头名称、正则或默认值后，系统会自动同步到底层规则。
          </p>
        </div>
        <span className="rounded-full bg-[#e8fafa] px-3 py-1 text-xs font-medium text-[#0b6e6e]">
          {isTextRule ? '文本/PDF 规则' : 'Excel 规则'}
        </span>
      </div>

      {!isTextRule && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="text-sm text-gray-700">
              表头所在行
              <input
                type="number"
                min={1}
                value={config.header_row_index === undefined ? '' : config.header_row_index + 1}
                onChange={(e) => setRowIndex('header_row_index', e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-[#0fc6c2]"
                placeholder="如 1"
              />
            </label>
            <label className="text-sm text-gray-700">
              数据开始行
              <input
                type="number"
                min={1}
                value={config.data_start_row_index === undefined ? '' : config.data_start_row_index + 1}
                onChange={(e) => setRowIndex('data_start_row_index', e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-[#0fc6c2]"
                placeholder="如 2"
              />
            </label>
            <label className="text-sm text-gray-700">
              结束标记
              <input
                type="text"
                value={config.data_end_marker || ''}
                onChange={(e) => updateConfig({ data_end_marker: e.target.value || undefined })}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-[#0fc6c2]"
                placeholder="如 合计"
              />
            </label>
          </div>

          <label className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={!!config.merge_sheets}
              onChange={(e) => updateConfig({ merge_sheets: e.target.checked || undefined })}
              className="h-4 w-4 rounded border-gray-300 text-[#0fc6c2] focus:ring-[#0fc6c2]"
            />
            多 Sheet 合并解析
          </label>

          <div>
            <div className="mb-2 text-sm font-medium text-gray-700">字段对应的 Excel 表头</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {EDITABLE_FIELDS.map((field) => (
                <label key={field} className="text-sm text-gray-700">
                  {FIELD_DISPLAY_NAMES[field] || field}
                  <input
                    type="text"
                    value={config.column_mappings?.[field] || ''}
                    onChange={(e) => setColumnMapping(field, e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-[#0fc6c2]"
                    placeholder={`如：${FIELD_DISPLAY_NAMES[field] || field}`}
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="text-sm text-gray-700">
              单号聚合字段
              <select
                value={config.group_by_field || ''}
                onChange={(e) => updateConfig({ group_by_field: (e.target.value || undefined) as keyof ShipmentData | undefined })}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-[#0fc6c2]"
              >
                <option value="">不聚合</option>
                {COMMON_GROUP_FIELDS.map((field) => (
                  <option key={field} value={field}>{FIELD_DISPLAY_NAMES[field] || field}</option>
                ))}
              </select>
            </label>
            <label className="text-sm text-gray-700">
              每行至少有值的单元格数
              <input
                type="number"
                min={1}
                value={config.min_filled_cells ?? ''}
                onChange={(e) => updateConfig({ min_filled_cells: e.target.value === '' ? undefined : Math.max(1, Number(e.target.value) || 1) })}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-[#0fc6c2]"
                placeholder="默认 1"
              />
            </label>
          </div>
        </div>
      )}

      {isTextRule && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="text-sm text-gray-700">
              订单分隔符
              <input
                type="text"
                value={config.record_separator || ''}
                onChange={(e) => updateConfig({ record_separator: e.target.value || undefined })}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-[#0fc6c2]"
                placeholder="如：--------"
              />
            </label>
            <label className="text-sm text-gray-700">
              SKU 行正则
              <input
                type="text"
                value={config.free_text_sku_pattern || ''}
                onChange={(e) => updateConfig({ free_text_sku_pattern: e.target.value || undefined })}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-[#0fc6c2]"
                placeholder="如：(\\S+)\\s+(.+?)\\s+(\\d+)"
              />
            </label>
          </div>

          <div>
            <div className="mb-2 text-sm font-medium text-gray-700">收货信息识别正则</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {COMMON_GROUP_FIELDS.map((field) => (
                <label key={field} className="text-sm text-gray-700">
                  {FIELD_DISPLAY_NAMES[field] || field}
                  <input
                    type="text"
                    value={config.free_text_receiver_patterns?.[field as keyof NonNullable<ParsingRule['config']['free_text_receiver_patterns']>] || ''}
                    onChange={(e) => setReceiverPattern(field, e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-[#0fc6c2]"
                    placeholder={`如：${FIELD_DISPLAY_NAMES[field] || field}[:：]\\s*(.+)`}
                  />
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-medium text-gray-700">SKU 正则分组序号</div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {(['sku_code', 'sku_name', 'sku_spec', 'sku_quantity', 'remark'] as (keyof ShipmentData)[]).map((field) => (
                <label key={field} className="text-sm text-gray-700">
                  {FIELD_DISPLAY_NAMES[field] || field}
                  <input
                    type="number"
                    min={1}
                    value={config.free_text_sku_fields?.[field as keyof NonNullable<ParsingRule['config']['free_text_sku_fields']>] || ''}
                    onChange={(e) => setSkuFieldIndex(field, e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-[#0fc6c2]"
                    placeholder="1"
                  />
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-gray-500">例如正则里第 1 个括号是 SKU 编码，就填 1。</p>
          </div>

          <details className="rounded-lg border border-gray-100 bg-gray-50">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-gray-700">
              连续多行 SKU 识别设置
            </summary>
            <div className="grid grid-cols-1 gap-3 border-t border-gray-100 p-3 md:grid-cols-2">
              <label className="text-sm text-gray-700">
                SKU 起始行正则
                <input
                  type="text"
                  value={config.free_text_sequence_item?.item_start_pattern || ''}
                  onChange={(e) => updateSequenceItem({ item_start_pattern: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-[#0fc6c2]"
                  placeholder="如：^\\d+、"
                />
              </label>
              <label className="text-sm text-gray-700">
                SKU 编码正则
                <input
                  type="text"
                  value={config.free_text_sequence_item?.sku_code_pattern || ''}
                  onChange={(e) => updateSequenceItem({ sku_code_pattern: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-[#0fc6c2]"
                  placeholder="如：[A-Z0-9-]{6,}"
                />
              </label>
              <label className="text-sm text-gray-700">
                名称偏移行
                <input
                  type="number"
                  value={config.free_text_sequence_item?.sku_name_offset ?? ''}
                  onChange={(e) => updateSequenceItem({ sku_name_offset: e.target.value === '' ? undefined : Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-[#0fc6c2]"
                  placeholder="如 1"
                />
              </label>
              <label className="text-sm text-gray-700">
                规格最多读取行数
                <input
                  type="number"
                  min={1}
                  value={config.free_text_sequence_item?.sku_spec_max_lines ?? ''}
                  onChange={(e) => updateSequenceItem({ sku_spec_max_lines: e.target.value === '' ? undefined : Math.max(1, Number(e.target.value) || 1) })}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-[#0fc6c2]"
                  placeholder="如 1"
                />
              </label>
            </div>
          </details>
        </div>
      )}

      <div className="mt-4">
        <div className="mb-2 text-sm font-medium text-gray-700">默认值（识别不到时使用）</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {COMMON_GROUP_FIELDS.map((field) => (
            <label key={field} className="text-sm text-gray-700">
              {FIELD_DISPLAY_NAMES[field] || field}
              <input
                type="text"
                value={String(config.default_values?.[field] ?? '')}
                onChange={(e) => setDefaultValue(field, e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-[#0fc6c2]"
                placeholder="可留空"
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
