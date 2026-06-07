'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import type { ComponentType } from 'react'
import {
  Activity,
  Database,
  FileStack,
  Layers3,
  List,
  Menu,
  PackageCheck,
  Settings,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'
import { FileUploader } from '@/components/FileUploader'
import { DataPreview } from '@/components/DataPreview'
import { ShipmentList } from '@/components/ShipmentList'
import { ProgressModal } from '@/components/ProgressModal'
import { ResultModal } from '@/components/ResultModal'
import { RuleManager } from '@/components/RuleManager'
import { RuleCenter } from '@/components/RuleCenter'
import { PreviewRow, ParsingRule, ShipmentData, ImportResult, FIELD_DISPLAY_NAMES } from '@/types'
import { validateAll, hasErrors, getAllErrors } from '@/utils/validator'
import { parseExcelWithRule, parseTextWithRule } from '@/utils/ruleEngine'

type AppState = 'upload' | 'select-rule' | 'preview' | 'result' | 'shipments'
type ParsedFileData = {
  type: 'excel' | 'word' | 'pdf'
  fileName?: string
  sheets?: { name: string; data: string[][] }[]
  lines?: string[]
}

const PREVIEW_FIELDS: (keyof ShipmentData)[] = [
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

function normalizePreviewValue(value: unknown) {
  if (value === undefined || value === null) return ''
  if (typeof value === 'number') return value

  const text = String(value).trim()
  if (text.toLowerCase() === 'undefined' || text.toLowerCase() === 'null') return ''
  return text
}

function normalizeParsedShipments(rows: Partial<ShipmentData>[]): Partial<ShipmentData>[] {
  return rows.map((row) => {
    const normalized: Record<string, string | number> = {}

    PREVIEW_FIELDS.forEach((field) => {
      const value = normalizePreviewValue(row[field])
      if (field === 'sku_quantity') {
        normalized[field] = value === '' ? 0 : Number(value) || 0
      } else {
        normalized[field] = value as string
      }
    })

    return normalized as Partial<ShipmentData>
  })
}

const workflowSteps = [
  { id: 'upload', label: '上传文件', icon: Upload },
  { id: 'select-rule', label: '配置规则', icon: Sparkles },
  { id: 'preview', label: '校验预览', icon: ShieldCheck },
  { id: 'result', label: '提交入库', icon: Database },
]

export default function Home() {
  const [appState, setAppState] = useState<AppState>('upload')
  const [currentFile, setCurrentFile] = useState<File | null>(null)
  const [parsedData, setParsedData] = useState<ParsedFileData | null>(null)
  const [rules, setRules] = useState<ParsingRule[]>([])
  const [selectedRule, setSelectedRule] = useState<ParsingRule | null>(null)
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([])
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('')
  const [uploadProgress, setUploadProgress] = useState({ progress: 0, current: 0, total: 0 })
  const [fileParseError, setFileParseError] = useState('')
  const [activeTab, setActiveTab] = useState<'upload' | 'shipments' | 'rules'>('upload')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const duplicateCheckRequestRef = useRef(0)

  const fetchRules = useCallback(async () => {
    try {
      const response = await fetch('/api/rules')
      const data = await response.json()
      setRules(Array.isArray(data) ? data : (data.rules || []))
    } catch (error) {
      console.error('Failed to fetch rules:', error)
    }
  }, [])

  useEffect(() => {
    fetchRules()
  }, [fetchRules])

  const resetImport = useCallback(() => {
    setAppState('upload')
    setCurrentFile(null)
    setParsedData(null)
    setSelectedRule(null)
    setPreviewRows([])
    setImportResult(null)
    setFileParseError('')
  }, [])

  const applyDatabaseDuplicates = useCallback(async (rows: PreviewRow[]) => {
    const duplicateCodes = Array.from(
      new Set(rows.map((row) => String(row.external_code || '').trim()).filter(Boolean))
    )
    const duplicateItems = rows
      .map((row) => ({
        external_code: String(row.external_code || '').trim(),
        sku_code: String(row.sku_code || '').trim(),
      }))
      .filter((item) => item.external_code && item.sku_code)

    const uniqueItems = Array.from(
      new Map(duplicateItems.map((item) => [`${item.external_code}::${item.sku_code}`, item])).values()
    )

    if (uniqueItems.length === 0 && duplicateCodes.length === 0) {
      return rows.map((row) =>
        row.duplicateSource === 'database'
          ? { ...row, isDuplicate: false, duplicateWith: undefined, duplicateSource: undefined }
          : row
      )
    }

    try {
      const duplicateItemKeys = new Set<string>()
      const duplicateExternalCodes = new Set<string>()
      const chunkSize = 200

      for (let start = 0; start < uniqueItems.length; start += chunkSize) {
        const chunk = uniqueItems.slice(start, start + chunkSize)
        const params = new URLSearchParams({ check_duplicate_items: JSON.stringify(chunk) })
        const response = await fetch(`/api/shipments?${params.toString()}`)

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const data = await response.json()
        if (Array.isArray(data)) {
          data.forEach((key) => duplicateItemKeys.add(String(key).trim()))
        }
      }

      for (let start = 0; start < duplicateCodes.length; start += chunkSize) {
        const chunk = duplicateCodes.slice(start, start + chunkSize)
        const params = new URLSearchParams({ check_duplicates: chunk.join(',') })
        const response = await fetch(`/api/shipments?${params.toString()}`)

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const data = await response.json()
        if (Array.isArray(data)) {
          data.forEach((code) => duplicateExternalCodes.add(String(code).trim()))
        }
      }

      return rows.map((row) => {
        const code = String(row.external_code || '').trim()
        const skuCode = String(row.sku_code || '').trim()
        const key = `${code}::${skuCode}`

        if (code && duplicateExternalCodes.has(code)) {
          return {
            ...row,
            isDuplicate: true,
            duplicateSource: 'database' as const,
            duplicateWith: '数据库已有相同外部编码',
          }
        }

        if (code && skuCode && duplicateItemKeys.has(key)) {
          return {
            ...row,
            isDuplicate: true,
            duplicateSource: 'database' as const,
            duplicateWith: '数据库已有相同外部编码+SKU',
          }
        }

        return row.duplicateSource === 'database'
          ? { ...row, isDuplicate: false, duplicateWith: undefined, duplicateSource: undefined }
          : row
      })
    } catch (error) {
      console.warn('Failed to check existing duplicates:', error)
      return rows
    }
  }, [])

  const buildValidatedPreviewRows = useCallback(async (rows: Partial<ShipmentData>[]) => {
    const normalizedRows = normalizeParsedShipments(rows)
    const validationRows = validateAll(normalizedRows)
    return applyDatabaseDuplicates(validationRows)
  }, [applyDatabaseDuplicates])

  const handleFileSelect = useCallback(async (file: File) => {
    setCurrentFile(file)
    setFileParseError('')
    setLoading(true)
    setLoadingMessage('正在抽取文件结构...')
    setUploadProgress({ progress: 12, current: 0, total: 0 })

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/parse-file', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok || data.error) {
        setFileParseError(data.error || '文件解析失败')
        setLoading(false)
        return
      }

      setParsedData(data)
      setUploadProgress({ progress: 100, current: 0, total: 0 })
      setLoading(false)
      setAppState('select-rule')
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '未知错误'
      setFileParseError(`文件上传失败: ${errorMsg}`)
      setLoading(false)
    }
  }, [])

  const executeParse = useCallback((rule: ParsingRule) => {
    setLoading(true)
    setLoadingMessage('正在执行规则引擎...')
    setUploadProgress({ progress: 20, current: 0, total: 0 })

    setTimeout(async () => {
      try {
        let results: ShipmentData[] = []

        if (parsedData?.type === 'excel' && parsedData.sheets) {
          results = parseExcelWithRule(parsedData.sheets, rule)
        } else if ((parsedData?.type === 'word' || parsedData?.type === 'pdf') && parsedData.lines) {
          results = parseTextWithRule(parsedData.lines, rule)
        }

        if (results.length === 0) {
          setImportResult({
            success: 0,
            failed: 0,
            failedRows: [],
            error: '规则没有解析出任何数据，请返回规则配置页调整规则后再试',
            failedReasons: [{ message: '解析结果为空' }],
          })
          setPreviewRows([])
          setAppState('result')
          return
        }

        setLoadingMessage('正在校验重复数据...')
        setUploadProgress({ progress: 72, current: results.length, total: results.length })
        const validatedRows = await buildValidatedPreviewRows(results)
        setPreviewRows(validatedRows)
        setUploadProgress({ progress: 100, current: results.length, total: results.length })
        setAppState('preview')
      } catch (error) {
        const message = error instanceof Error ? error.message : '未知错误'
        setImportResult({
          success: 0,
          failed: 0,
          failedRows: [],
          error: `规则解析失败：${message}`,
          failedReasons: [{ message }],
        })
        setPreviewRows([])
        setAppState('result')
      } finally {
        setLoading(false)
      }
    }, 240)
  }, [buildValidatedPreviewRows, parsedData])

  const handleRuleSelect = useCallback((rule: ParsingRule) => {
    setSelectedRule(rule)
    executeParse(rule)
  }, [executeParse])

  const handleRowsChange = useCallback((rows: PreviewRow[]) => {
    const requestId = duplicateCheckRequestRef.current + 1
    duplicateCheckRequestRef.current = requestId
    setPreviewRows(rows)
  }, [])

  const handleSubmit = useCallback(async () => {
    setImportResult(null)
    setLoading(true)
    setLoadingMessage('正在提交前校验...')
    setUploadProgress({ progress: 10, current: previewRows.length, total: previewRows.length })

    const latestRows = await buildValidatedPreviewRows(previewRows)

    if (hasErrors(latestRows)) {
      setPreviewRows(latestRows)
      const failedReasons = getAllErrors(latestRows).map((error) => ({
        rowIndex: error.rowIndex,
        message: `${FIELD_DISPLAY_NAMES[error.field] || error.field}：${error.message}`,
      }))

      setImportResult({
        success: 0,
        failed: latestRows.length,
        failedRows: failedReasons.map((reason) => reason.rowIndex || 0),
        error: '存在校验错误或重复外部编码，请先修正后再提交',
        failedReasons,
      })
      setLoading(false)
      setAppState('result')
      return
    }

    setLoadingMessage('正在提交运单数据...')
    setUploadProgress({ progress: 35, current: 0, total: latestRows.length })

    const shipments: ShipmentData[] = latestRows
      .filter((row) => row.errors.length === 0 && !row.isDuplicate)
      .map((row) => ({
        external_code: row.external_code,
        store_name: row.store_name,
        receiver_name: row.receiver_name,
        receiver_phone: row.receiver_phone,
        receiver_address: row.receiver_address,
        sku_code: row.sku_code,
        sku_name: row.sku_name,
        sku_quantity: row.sku_quantity,
        sku_spec: row.sku_spec,
        remark: row.remark,
      }))

    try {
      setUploadProgress({ progress: 55, current: 0, total: shipments.length })
      const response = await fetch('/api/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(shipments),
      })

      const result = await response.json()
      const completedCount = Number(result.success || 0) + Number(result.failed || 0)
      setUploadProgress({
        progress: 90,
        current: Math.min(completedCount || shipments.length, shipments.length),
        total: shipments.length,
      })
      if (!response.ok || result.error) {
        const message = result.error || result.message || `提交接口返回异常：HTTP ${response.status}`
        setImportResult({
          success: result.success || 0,
          failed: result.failed || shipments.length,
          failedRows: result.failedRows || [],
          error: message,
          failedReasons: result.failedReasons || [{ message }],
        })
      } else {
        setImportResult(result)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '网络异常或服务不可用'
      setImportResult({
        success: 0,
        failed: shipments.length,
        failedRows: [],
        error: `提交请求失败：${message}`,
        failedReasons: [{ message: `提交请求失败：${message}` }],
      })
    } finally {
      setUploadProgress({ progress: 100, current: shipments.length, total: shipments.length })
      window.setTimeout(() => {
        setLoading(false)
        setAppState('result')
      }, 260)
    }
  }, [applyDatabaseDuplicates, previewRows])

  const handleBackToRules = useCallback(() => {
    setAppState('select-rule')
    setPreviewRows([])
  }, [])

  const navItems = [
    { id: 'upload', label: '智能导入', icon: Upload },
    { id: 'shipments', label: '运单列表', icon: List },
    { id: 'rules', label: '规则中心', icon: Settings },
  ]

  const currentStepIndex = useMemo(() => {
    if (appState === 'result') return 3
    return Math.max(0, workflowSteps.findIndex((step) => step.id === appState))
  }, [appState])

  const errorCount = useMemo(() => getAllErrors(previewRows).length, [previewRows])
  const parsedSourceCount = useMemo(() => {
    if (!parsedData) return 0
    if (parsedData.type === 'excel') {
      return parsedData.sheets?.reduce((total, sheet) => total + sheet.data.length, 0) || 0
    }
    return parsedData.lines?.length || 0
  }, [parsedData])

  const handleNavClick = (id: string) => {
    if (id === 'upload') {
      setActiveTab('upload')
      resetImport()
    } else if (id === 'shipments') {
      setActiveTab('shipments')
    } else if (id === 'rules') {
      setActiveTab('rules')
    }
    setSidebarOpen(false)
  }

  const renderWorkspace = () => {
    if (activeTab === 'shipments') {
      return <ShipmentList />
    }

    if (activeTab === 'rules') {
      return <RuleCenter />
    }

    if (appState === 'upload') {
      return (
        <section className="jt-panel p-5 md:p-8">
          <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="jt-eyebrow">Universal Import</p>
              <h2 className="text-2xl font-semibold text-[#1d2129]">上传订单文件</h2>
              <p className="mt-2 text-sm text-[#667085]">
                支持 Excel、Word、PDF。上传后先选择或生成规则，再执行解析。
              </p>
            </div>
            <div className="rounded-full border border-[#d0e8e8] bg-[#f4ffff] px-4 py-2 text-sm text-[#0b6e6e]">
              手动选规则 · AI 辅助生成 · 可试解析
            </div>
          </div>
          <FileUploader onFileSelect={handleFileSelect} loading={loading} error={fileParseError} />
        </section>
      )
    }

    if (appState === 'select-rule') {
      return (
        <section className="space-y-4">
          <button onClick={resetImport} className="jt-link-button">
            返回重新上传
          </button>
          <RuleManager
            rules={rules}
            fileType={parsedData?.type || 'excel'}
            parsedData={parsedData}
            onRuleSelect={handleRuleSelect}
            onNewRule={handleRuleSelect}
            onRefresh={fetchRules}
          />
        </section>
      )
    }

    if (appState === 'preview') {
      return (
        <section className="space-y-4">
          <button onClick={handleBackToRules} className="jt-link-button">
            返回选择规则
          </button>
          {selectedRule && (
            <div className="jt-panel flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm text-[#667085]">当前规则</p>
                <h3 className="font-semibold text-[#1d2129]">{selectedRule.name}</h3>
              </div>
              <span className="w-fit rounded-full bg-[#e8fafa] px-3 py-1 text-xs font-medium text-[#0b6e6e]">
                {selectedRule.structure_type === 'standard' && '标准表格'}
                {selectedRule.structure_type === 'matrix' && '矩阵转置'}
                {selectedRule.structure_type === 'card' && '卡片式'}
                {selectedRule.structure_type === 'free_text' && '纯文本'}
              </span>
            </div>
          )}
          <DataPreview
            rows={previewRows}
            onRowsChange={handleRowsChange}
            onSubmit={handleSubmit}
            hasErrors={hasErrors(previewRows)}
          />
        </section>
      )
    }

    return (
      <section className="jt-panel p-8 text-center">
        <PackageCheck className="mx-auto mb-3 h-10 w-10 text-[#0fc6c2]" />
        <h2 className="text-xl font-semibold text-[#1d2129]">提交结果已生成</h2>
        <p className="mt-2 text-sm text-[#667085]">可继续上传新文件，或前往运单列表查看历史记录。</p>
      </section>
    )
  }

  return (
    <div className="min-h-screen bg-[#f5f8fb] text-[#1d2129]">
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity md:hidden ${
          sidebarOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setSidebarOpen(false)}
      />

      <aside
        className={`fixed left-0 top-0 z-50 flex h-screen w-72 flex-col border-r border-[#e5e6eb] bg-white/95 shadow-xl shadow-cyan-950/5 backdrop-blur transition-transform md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="border-b border-[#e5e6eb] p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#0fc6c2] text-lg font-bold text-white shadow-lg shadow-cyan-500/20">
                JT
              </div>
              <div>
                <h1 className="text-lg font-semibold">鲸天万能导入</h1>
                <p className="text-xs text-[#86909c]">智能多格式批量下单</p>
              </div>
            </div>
            <button className="rounded-lg p-2 md:hidden" onClick={() => setSidebarOpen(false)}>
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <nav className="flex-1 p-4">
          <div className="mb-3 px-3 text-xs font-medium uppercase tracking-wide text-[#98a2b3]">Navigation</div>
          <ul className="space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = activeTab === item.id
              return (
                <li key={item.id}>
                  <button
                    onClick={() => handleNavClick(item.id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition ${
                      isActive
                        ? 'bg-[#0fc6c2] text-white shadow-lg shadow-cyan-500/20'
                        : 'text-[#4e5969] hover:bg-[#e8fafa] hover:text-[#0b6e6e]'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    {item.label}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="m-4 rounded-2xl border border-[#d0e8e8] bg-[#f4ffff] p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#0b6e6e]">
            <Activity className="h-4 w-4" />
            V2 规则引擎
          </div>
          <p className="text-xs leading-5 text-[#667085]">规则可复用，AI 只生成规则，用户确认后执行。</p>
        </div>
      </aside>

      <main className="md:pl-72">
        <header className="sticky top-0 z-30 border-b border-[#e5e6eb] bg-white/85 px-4 py-3 backdrop-blur md:px-8">
          <div className="flex items-center justify-between gap-4">
            <button className="rounded-lg p-2 md:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="h-6 w-6" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="jt-eyebrow">ZTO Cold Chain · Whale Sky Style</p>
              <h2 className="truncate text-lg font-semibold md:text-xl">智能导入控制台</h2>
            </div>
            <div className="hidden items-center gap-2 rounded-full border border-[#d0e8e8] bg-[#f4ffff] px-4 py-2 text-sm text-[#0b6e6e] md:flex">
              <Sparkles className="h-4 w-4" />
              AI Rule Copilot
            </div>
          </div>
        </header>

        <div className="space-y-6 p-4 md:p-8">
          {activeTab === 'upload' && (
            <section className="jt-hero-panel overflow-hidden p-5 md:p-6">
              <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
                <div>
                  <p className="jt-eyebrow">智能多格式批量下单系统</p>
                  <h1 className="mt-2 text-2xl font-semibold tracking-normal text-[#101828] md:text-3xl">
                    用规则引擎接住复杂文件，用 AI 加速规则配置
                  </h1>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-[#667085]">
                    Excel、Word、PDF 均先抽取原始结构，再由用户手动选择规则或生成新规则，确保可解释、可复用、可验收。
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <MetricCard icon={Layers3} label="规则数量" value={rules.length} />
                  <MetricCard icon={FileStack} label="原始行数" value={parsedSourceCount} />
                  <MetricCard icon={PackageCheck} label="预览明细" value={previewRows.length} />
                  <MetricCard icon={ShieldCheck} label="待修正错误" value={errorCount} tone={errorCount > 0 ? 'danger' : 'normal'} />
                </div>
              </div>
            </section>
          )}

          {activeTab === 'upload' && (
            <section className="jt-panel p-4 md:p-5">
              <div className="grid gap-3 md:grid-cols-4">
                {workflowSteps.map((step, index) => {
                  const Icon = step.icon
                  const isDone = index < currentStepIndex
                  const isActive = index === currentStepIndex
                  return (
                    <div
                      key={step.id}
                      className={`rounded-xl border p-4 transition ${
                        isActive
                          ? 'border-[#0fc6c2] bg-[#e8fafa]'
                          : isDone
                            ? 'border-[#d0e8e8] bg-white'
                            : 'border-[#eef0f3] bg-[#fbfcfd]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`grid h-9 w-9 place-items-center rounded-lg ${
                          isActive || isDone ? 'bg-[#0fc6c2] text-white' : 'bg-[#eef2f6] text-[#98a2b3]'
                        }`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-xs text-[#98a2b3]">Step {index + 1}</p>
                          <p className="text-sm font-semibold text-[#1d2129]">{step.label}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {currentFile && activeTab === 'upload' && (
            <div className="jt-panel flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm text-[#667085]">当前文件</p>
                <h3 className="font-semibold text-[#1d2129]">{currentFile.name}</h3>
              </div>
              <span className="w-fit rounded-full bg-[#e8fafa] px-3 py-1 text-xs font-medium text-[#0b6e6e]">
                {(currentFile.size / 1024 / 1024).toFixed(2)} MB
              </span>
            </div>
          )}

          {renderWorkspace()}
        </div>
      </main>

      {loading && (
        <ProgressModal
          progress={uploadProgress.progress}
          current={uploadProgress.current}
          total={uploadProgress.total}
          message={loadingMessage}
        />
      )}

      {importResult && (
        <ResultModal
          result={importResult}
          onClose={resetImport}
          onRetry={handleSubmit}
        />
      )}
    </div>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone = 'normal',
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  value: number
  tone?: 'normal' | 'danger'
}) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[#667085]">{label}</span>
        <Icon className={`h-4 w-4 ${tone === 'danger' ? 'text-[#f04438]' : 'text-[#0fc6c2]'}`} />
      </div>
      <p className={`mt-2 text-2xl font-semibold ${tone === 'danger' ? 'text-[#b42318]' : 'text-[#1d2129]'}`}>
        {value}
      </p>
    </div>
  )
}
