'use client'

import { useEffect, useState } from 'react'
import { Activity, AlertTriangle, Database, Gauge } from 'lucide-react'

interface Summary {
  throughput: { minute: string; count: number }[]
  queue_depth: { pending_batches: number; pending_rows: number; queue_available: boolean; threshold: number }
  stage_durations: Record<string, { p50: number; p95: number; p99: number }>
  error_distribution: { error_code: string; error_reason: string; count: number }[]
  slow_batches: { task_id: string; unit_id: string; total_duration_ms: number }[]
}

export function ImportMonitorPanel() {
  const [summary, setSummary] = useState<Summary | null>(null)

  useEffect(() => {
    const load = async () => {
      const response = await fetch('/api/import-monitor/summary', { cache: 'no-store' })
      if (response.ok) setSummary(await response.json())
    }
    void load()
    const timer = window.setInterval(() => void load(), 5000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="space-y-5">
      <header>
        <p className="jt-eyebrow">Operations</p>
        <h1 className="text-2xl font-semibold">导入监控</h1>
      </header>

      {!summary ? (
        <section className="jt-panel p-6">正在加载监控数据...</section>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Kpi icon={Activity} label="最近 5 分钟入库" value={summary.throughput.reduce((sum, item) => sum + item.count, 0)} />
            <Kpi icon={Database} label="队列积压批次" value={summary.queue_depth.pending_batches} tone={summary.queue_depth.pending_rows > summary.queue_depth.threshold ? 'warn' : 'normal'} />
            <Kpi icon={Gauge} label="积压行数" value={summary.queue_depth.pending_rows} tone={summary.queue_depth.pending_rows > summary.queue_depth.threshold ? 'warn' : 'normal'} />
            <Kpi icon={AlertTriangle} label="错误类型数" value={summary.error_distribution.length} tone={summary.error_distribution.length ? 'warn' : 'normal'} />
          </div>

          <section className="jt-panel p-5">
            <h2 className="mb-4 font-semibold">阶段耗时（毫秒）</h2>
            <div className="grid gap-3 md:grid-cols-4">
              {Object.entries(summary.stage_durations).map(([stage, values]) => (
                <div className="rounded-lg border border-[#e5e6eb] p-4" key={stage}>
                  <p className="font-medium">{stage}</p>
                  <p className="mt-2 text-sm text-[#667085]">P50 {values.p50} · P95 {values.p95} · P99 {values.p99}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="jt-panel p-5">
              <h2 className="mb-4 font-semibold">错误分布</h2>
              {summary.error_distribution.map((item) => (
                <div className="flex justify-between border-b border-[#f0f1f3] py-2 text-sm" key={item.error_code}>
                  <span>{item.error_code} {item.error_reason}</span>
                  <strong>{item.count}</strong>
                </div>
              ))}
              {summary.error_distribution.length === 0 && <p className="text-sm text-[#98a2b3]">暂无错误</p>}
            </section>

            <section className="jt-panel p-5">
              <h2 className="mb-4 font-semibold">慢批次 TOP 10</h2>
              {summary.slow_batches.map((item) => (
                <div className="flex justify-between border-b border-[#f0f1f3] py-2 text-sm" key={`${item.task_id}-${item.unit_id}`}>
                  <span>{item.task_id} / {item.unit_id}</span>
                  <strong>{item.total_duration_ms}ms</strong>
                </div>
              ))}
              {summary.slow_batches.length === 0 && <p className="text-sm text-[#98a2b3]">暂无数据</p>}
            </section>
          </div>
        </>
      )}
    </div>
  )
}

function Kpi({ icon: Icon, label, value, tone = 'normal' }: { icon: typeof Activity; label: string; value: number; tone?: 'normal' | 'warn' }) {
  return (
    <div className={`jt-panel p-4 ${tone === 'warn' ? 'border-amber-300 bg-amber-50' : ''}`}>
      <div className="flex items-center justify-between text-sm text-[#667085]">
        <span>{label}</span>
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-3 text-2xl font-semibold">{value}</p>
    </div>
  )
}
