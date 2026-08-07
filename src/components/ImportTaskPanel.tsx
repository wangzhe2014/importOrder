'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Download, ExternalLink, RefreshCw } from 'lucide-react'

interface TaskData {
  task_id: string
  file_name: string
  status: string
  total_rows: number
  processed_rows: number
  success_rows: number
  failed_rows: number
  total_batches: number
  completed_batches: number
  degraded: boolean
  degraded_note?: string
  throughput_per_min: number
  eta_seconds?: number | null
  trace_id?: string
  error_summary?: string
  recent_errors?: { row_number: number; field_name?: string; error_code?: string; error_reason?: string }[]
}

interface ErrorRow {
  row_number: number
  batch_index?: number
  field_name?: string
  raw_value?: string
  error_code?: string
  error_reason?: string
}

export function ImportTaskPanel({ taskId, onBack }: { taskId: string; onBack?: () => void }) {
  const [task, setTask] = useState<TaskData | null>(null)
  const [errors, setErrors] = useState<ErrorRow[]>([])
  const [errorCode, setErrorCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  const isFinished = task && ['completed', 'partial_success', 'failed'].includes(task.status)

  async function loadTask() {
    try {
      const response = await fetch(`/api/import-tasks/${taskId}`, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '任务查询失败')
      setTask(data)
      setErrorMessage('')
    } catch (error) {
      setErrorMessage((error as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function loadErrors() {
    const query = new URLSearchParams({ page: '1', page_size: '50' })
    if (errorCode) query.set('error_code', errorCode)
    const response = await fetch(`/api/import-tasks/${taskId}/errors?${query.toString()}`, { cache: 'no-store' })
    const data = await response.json()
    if (response.ok) setErrors(data.data || [])
  }

  useEffect(() => {
    void loadTask()
    void loadErrors()
    const timer = window.setInterval(() => {
      void loadTask()
      void loadErrors()
    }, 2000)
    return () => window.clearInterval(timer)
  }, [taskId, errorCode])

  const progress = useMemo(() => {
    if (!task || task.total_rows <= 0) return 0
    return Math.min(100, Math.round((task.processed_rows / task.total_rows) * 100))
  }, [task])

  return (
    <section className="jt-panel space-y-5 p-5 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="jt-eyebrow">Import Task</p>
          <h2 className="text-xl font-semibold text-[#1d2129]">{task?.file_name || '导入任务'}</h2>
          <p className="mt-1 text-sm text-[#667085]">任务 ID：{taskId} · Trace ID：{task?.trace_id || '-'}</p>
        </div>
        <div className="flex items-center gap-2">
          {onBack && (
            <button className="jt-link-button" onClick={onBack}>返回</button>
          )}
          <button className="jt-link-button" onClick={() => void loadTask()} title="刷新任务">
            <RefreshCw className="mr-1 inline h-4 w-4" />刷新
          </button>
          {task?.trace_id && (
            <a className="jt-link-button" href={`/traces?trace_id=${encodeURIComponent(task.trace_id)}`}>
              <ExternalLink className="mr-1 inline h-4 w-4" />查看 Trace
            </a>
          )}
        </div>
      </header>

      {loading && !task && <p className="py-6 text-center text-sm text-[#98a2b3]">正在加载任务...</p>}
      {!loading && !task && <p className="py-6 text-center text-sm text-red-700">{errorMessage || '任务不存在'}</p>}

      {task && (
        <>
          <div className="flex items-center justify-between">
            <span className="font-semibold">{task.status}{isFinished ? ' · 已完成' : ' · 处理中'}</span>
            <span className="text-sm text-[#667085]">{progress}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-[#e5e6eb]">
            <div className="h-full bg-[#0fc6c2] transition-all" style={{ width: `${progress}%` }} />
          </div>

          {task.degraded && (
            <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <span>SKU 校验已降级：{task.degraded_note || '本次导入未经过商品主数据完整校验，数据需要后续复核。'}</span>
            </div>
          )}

          {task.status === 'pending' && (
            <div className="rounded-xl border border-[#d0e8e8] bg-[#f4ffff] p-4 text-sm text-[#0b6e6e]">
              任务已创建，等待 Worker 处理。若长时间停留在 pending，请确认后台 Worker 服务已启动。
            </div>
          )}

          {task.error_summary && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{task.error_summary}</div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-6">
            <Metric label="总行数" value={task.total_rows} />
            <Metric label="已处理" value={task.processed_rows} />
            <Metric label="成功" value={task.success_rows} />
            <Metric label="失败" value={task.failed_rows} />
            <Metric label="批次" value={`${task.completed_batches}/${task.total_batches}`} />
            <Metric label="吞吐/分钟" value={task.throughput_per_min} />
          </div>
          <p className="mt-4 text-sm text-[#667085]">
            预计剩余：{task.eta_seconds == null ? '-' : `${task.eta_seconds} 秒`}
          </p>
        </>
      )}

      {task && (
        <div className="mt-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold text-[#1d2129]">错误明细</h3>
            <div className="flex gap-2">
              <select className="rounded-lg border border-[#d0d5dd] bg-white px-3 py-2 text-sm" value={errorCode} onChange={(event) => setErrorCode(event.target.value)}>
                <option value="">全部错误</option>
                <option value="E001">E001 SKU 不存在</option>
                <option value="E002">E002 必填缺失</option>
                <option value="E003">E003 电话错误</option>
                <option value="E004">E004 数量错误</option>
                <option value="E005">E005 编码重复</option>
                <option value="E007">E007 写入失败</option>
              </select>
              <a className="jt-link-button" href={`/api/import-tasks/${task.task_id}/errors?format=csv`}>
                <Download className="mr-1 inline h-4 w-4" />导出
              </a>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#e5e6eb] text-[#667085]">
                  <th className="p-2">行号</th>
                  <th className="p-2">字段</th>
                  <th className="p-2">错误码</th>
                  <th className="p-2">原因</th>
                  <th className="p-2">原始值</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((row, index) => (
                  <tr key={`${row.row_number}-${row.error_code}-${index}`} className="border-b border-[#f0f1f3]">
                    <td className="p-2">{row.row_number}</td>
                    <td className="p-2">{row.field_name || '-'}</td>
                    <td className="p-2">{row.error_code || '-'}</td>
                    <td className="p-2">{row.error_reason || '-'}</td>
                    <td className="p-2">{row.raw_value || '-'}</td>
                  </tr>
                ))}
                {errors.length === 0 && (
                  <tr><td className="p-4 text-center text-[#98a2b3]" colSpan={5}>暂无错误</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-lg bg-[#f8fafc] p-3"><p className="text-xs text-[#667085]">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>
}