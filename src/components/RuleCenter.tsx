'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { Copy, Edit3, FileStack, Layers3, Plus, RefreshCw, Sparkles, Trash2, X } from 'lucide-react'
import { ParsingRule } from '@/types'
import { RuleConfigForm } from '@/components/RuleConfigForm'
import { normalizeRuleConfig } from '@/utils/ruleConfig'

const STRUCTURE_TYPE_LABELS: Record<ParsingRule['structure_type'], string> = {
  standard: '标准表格',
  matrix: '矩阵转置',
  card: '卡片式',
  free_text: '纯文本',
}

const FILE_TYPE_LABELS: Record<ParsingRule['file_type'], string> = {
  excel: 'Excel',
  word: 'Word',
  pdf: 'PDF',
}

export function RuleCenter() {
  const [rules, setRules] = useState<ParsingRule[]>([])
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [showNewRuleModal, setShowNewRuleModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [deleteRuleName, setDeleteRuleName] = useState<string | null>(null)
  const [selectedRule, setSelectedRule] = useState<ParsingRule | null>(null)
  const [editOriginalName, setEditOriginalName] = useState('')
  const [newRule, setNewRule] = useState<ParsingRule>(createEmptyRule())

  const summary = useMemo(() => {
    const excelCount = rules.filter(rule => rule.file_type === 'excel').length
    const textCount = rules.filter(rule => rule.file_type === 'word' || rule.file_type === 'pdf').length
    const complexCount = rules.filter(rule => rule.structure_type !== 'standard').length
    return {
      total: rules.length,
      excelCount,
      textCount,
      complexCount,
    }
  }, [rules])

  useEffect(() => {
    fetchRules()
  }, [])

  const fetchRules = async () => {
    setLoading(true)
    setErrorMessage('')
    try {
      const response = await fetch('/api/rules')
      const data = await response.json()
      setRules(Array.isArray(data) ? data : data.rules || [])
    } catch (error) {
      console.error('Failed to fetch rules:', error)
      setErrorMessage('规则列表加载失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  const resetNewRule = () => {
    setNewRule(createEmptyRule())
  }

  const handleSaveRule = async (rule: ParsingRule) => {
    setErrorMessage('')
    const normalizedRule = { ...rule, config: normalizeRuleConfig(rule.config) }
    try {
      const response = await fetch('/api/rules', {
        method: normalizedRule.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...normalizedRule,
          originalName: normalizedRule.id ? editOriginalName || normalizedRule.name : undefined,
        }),
      })

      const result = await response.json()
      if (!response.ok || result.error) {
        setErrorMessage(result.error || '规则保存失败')
        return
      }

      await fetchRules()
      setShowNewRuleModal(false)
      setShowEditModal(false)
      setSelectedRule(null)
      setEditOriginalName('')
      resetNewRule()
    } catch (error) {
      console.error('Failed to save rule:', error)
      setErrorMessage('规则保存失败，请检查配置后重试')
    }
  }

  const handleDeleteRule = async (ruleName: string) => {
    setErrorMessage('')
    try {
      const response = await fetch(`/api/rules?name=${encodeURIComponent(ruleName)}`, {
        method: 'DELETE',
      })

      const result = await response.json()
      if (!response.ok || result.error) {
        setErrorMessage(result.error || '规则删除失败')
        return
      }

      await fetchRules()
      setDeleteRuleName(null)
    } catch (error) {
      console.error('Failed to delete rule:', error)
      setErrorMessage('规则删除失败，请稍后重试')
    }
  }

  const handleCopyRule = (rule: ParsingRule) => {
    const copiedRule: ParsingRule = {
      ...rule,
      id: undefined,
      is_builtin: false,
      name: `${rule.name}（副本）`,
      description: rule.description ? `${rule.description}（复制）` : undefined,
    }
    setSelectedRule(copiedRule)
    setEditOriginalName('')
    setShowEditModal(true)
  }

  const handleOpenNewModal = () => {
    resetNewRule()
    setShowNewRuleModal(true)
  }

  const handleOpenEditModal = (rule: ParsingRule) => {
    setSelectedRule(rule)
    setEditOriginalName(rule.name)
    setShowEditModal(true)
  }

  return (
    <div className="space-y-6">
      <div className="jt-panel p-5 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="mt-1 text-xl font-bold text-[#1d2129]">解析规则管理</h2>
            <p className="mt-2 text-sm text-[#86909c]">
              管理所有文件解析规则，支持创建、编辑、复制和删除。
            </p>
          </div>
          <button
            onClick={handleOpenNewModal}
            className="jt-btn-primary flex items-center justify-center gap-2 px-4 py-2"
          >
            <Plus className="h-5 w-5" />
            新建规则
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <RuleSummaryCard icon={FileStack} label="规则总数" value={summary.total} suffix="条" />
        <RuleSummaryCard icon={Layers3} label="Excel 规则" value={summary.excelCount} suffix="条" />
        <RuleSummaryCard icon={Sparkles} label="Word/PDF 规则" value={summary.textCount} suffix="条" />
        <RuleSummaryCard icon={Edit3} label="复杂结构规则" value={summary.complexCount} suffix="条" />
      </div>

      {loading ? (
        <div className="jt-panel flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-[#0fc6c2]" />
        </div>
      ) : rules.length === 0 ? (
        <div className="jt-panel border-dashed border-[#d0e8e8] py-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#e8fafa]">
            <Edit3 className="h-8 w-8 text-[#0fc6c2]" />
          </div>
          <p className="mb-4 text-[#86909c]">暂无解析规则</p>
          <button onClick={handleOpenNewModal} className="jt-btn-primary px-6 py-2">
            创建第一条规则
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rules.map((rule) => {
            const isBuiltIn = Boolean(rule.is_builtin)
            return (
            <div key={rule.id || rule.name} className="jt-card p-5">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                    rule.structure_type === 'standard'
                      ? 'bg-blue-100 text-blue-700'
                      : rule.structure_type === 'matrix'
                        ? 'bg-purple-100 text-purple-700'
                        : rule.structure_type === 'card'
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-green-100 text-green-700'
                  }`}>
                    {STRUCTURE_TYPE_LABELS[rule.structure_type]}
                  </span>
                  <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
                    {FILE_TYPE_LABELS[rule.file_type]}
                  </span>
                  {isBuiltIn && (
                    <span className="rounded-full bg-[#fff7e6] px-2 py-1 text-xs font-medium text-[#d46b08]">
                      内置
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <IconButton title="复制规则" onClick={() => handleCopyRule(rule)}>
                    <Copy className="h-4 w-4" />
                  </IconButton>
                  <IconButton title="编辑规则" onClick={() => handleOpenEditModal(rule)}>
                    <Edit3 className="h-4 w-4" />
                  </IconButton>
                  {!isBuiltIn && (
                    <IconButton title="删除规则" danger onClick={() => setDeleteRuleName(rule.name)}>
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  )}
                </div>
              </div>

              <h3 className="mb-2 font-semibold text-[#1d2129]">{rule.name}</h3>
              {rule.description && (
                <p className="line-clamp-2 text-sm text-[#86909c]">{rule.description}</p>
              )}

              <div className="mt-4 border-t border-gray-100 pt-4">
                <div className="flex items-center justify-between text-xs text-[#86909c]">
                  <span>{FILE_TYPE_LABELS[rule.file_type]} 文件</span>
                  <span>{Object.keys(rule.config || {}).length} 项配置</span>
                </div>
              </div>
            </div>
            )
          })}
        </div>
      )}

      {showNewRuleModal && (
        <RuleEditorModal
          title="新建解析规则"
          rule={newRule}
          onChange={setNewRule}
          onCancel={() => setShowNewRuleModal(false)}
          onSave={() => handleSaveRule(newRule)}
          saveDisabled={!newRule.name.trim()}
        />
      )}

      {showEditModal && selectedRule && (
        <RuleEditorModal
          title="编辑解析规则"
          rule={selectedRule}
          onChange={setSelectedRule}
          onCancel={() => {
            setShowEditModal(false)
            setSelectedRule(null)
            setEditOriginalName('')
          }}
          onSave={() => handleSaveRule(selectedRule)}
          saveDisabled={!selectedRule.name.trim()}
        />
      )}

      {deleteRuleName && (
        <ConfirmDeleteDialog
          ruleName={deleteRuleName}
          onCancel={() => setDeleteRuleName(null)}
          onConfirm={() => handleDeleteRule(deleteRuleName)}
        />
      )}

      <button
        onClick={fetchRules}
        disabled={loading}
        className="fixed bottom-6 right-6 z-40 grid h-12 w-12 place-items-center rounded-full bg-[#0fc6c2] text-white shadow-xl shadow-cyan-500/30 transition hover:bg-[#0bada9] disabled:cursor-not-allowed disabled:opacity-70"
        title="刷新规则"
      >
        <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
      </button>
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
  const [configError, setConfigError] = useState<string | null>(null)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 md:p-6">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 md:px-6">
          <h3 className="text-xl font-bold text-[#1d2129]">{title}</h3>
          <button
            onClick={onCancel}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 md:px-6">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">规则名称 *</label>
            <input
              type="text"
              value={rule.name}
              onChange={(event) => onChange({ ...rule, name: event.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-[#0fc6c2]"
              placeholder="请输入规则名称"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">描述</label>
            <textarea
              value={rule.description || ''}
              onChange={(event) => onChange({ ...rule, description: event.target.value })}
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-[#0fc6c2]"
              placeholder="描述此规则适用的文件特征"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">文件类型 *</label>
              <select
                value={rule.file_type}
                onChange={(event) => onChange({ ...rule, file_type: event.target.value as ParsingRule['file_type'] })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-[#0fc6c2]"
              >
                <option value="excel">Excel</option>
                <option value="word">Word</option>
                <option value="pdf">PDF</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">结构类型 *</label>
              <select
                value={rule.structure_type}
                onChange={(event) => onChange({ ...rule, structure_type: event.target.value as ParsingRule['structure_type'] })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-[#0fc6c2]"
              >
                <option value="standard">标准表格</option>
                <option value="matrix">矩阵转置</option>
                <option value="card">卡片式</option>
                <option value="free_text">纯文本</option>
              </select>
            </div>
          </div>

          <RuleConfigForm
            rule={rule}
            onChange={(nextConfig) => onChange({ ...rule, config: normalizeRuleConfig(nextConfig) })}
            onValidityChange={(valid, message) => setConfigError(valid ? null : (message || '规则配置格式不正确'))}
          />
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-100 px-5 py-4 md:px-6">
          <button
            onClick={onCancel}
            className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={onSave}
            disabled={saveDisabled || !!configError}
            className="jt-btn-primary px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            保存规则
          </button>
        </div>
      </div>
    </div>
  )
}

function IconButton({
  title,
  danger = false,
  onClick,
  children,
}: {
  title: string
  danger?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded p-1.5 transition-colors ${
        danger
          ? 'text-gray-400 hover:bg-red-50 hover:text-red-500'
          : 'text-gray-400 hover:bg-[#e8fafa] hover:text-[#0fc6c2]'
      }`}
      title={title}
    >
      {children}
    </button>
  )
}

function ConfirmDeleteDialog({
  ruleName,
  onCancel,
  onConfirm,
}: {
  ruleName: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500">
          <Trash2 className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-semibold text-[#1d2129]">删除解析规则</h3>
        <p className="mt-2 text-sm leading-6 text-[#667085]">
          确定要删除规则「{ruleName}」吗？删除后如果未同步到数据库，将无法在本地规则文件中恢复。
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-red-500 px-4 py-2 text-white transition-colors hover:bg-red-600"
          >
            确认删除
          </button>
        </div>
      </div>
    </div>
  )
}

function RuleSummaryCard({
  icon: Icon,
  label,
  value,
  suffix,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  value: number
  suffix: string
}) {
  return (
    <div className="rounded-xl border border-[#d0e8e8] bg-[#f7ffff] p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-[#667085]">{label}</span>
        <Icon className="h-4 w-4 text-[#0fc6c2]" />
      </div>
      <div className="mt-2 text-2xl font-semibold text-[#1d2129]">
        {value}
        <span className="ml-1 text-sm font-normal text-[#86909c]">{suffix}</span>
      </div>
    </div>
  )
}

function createEmptyRule(): ParsingRule {
  return {
    name: '',
    description: '',
    file_type: 'excel',
    structure_type: 'standard',
    config: {},
  }
}
