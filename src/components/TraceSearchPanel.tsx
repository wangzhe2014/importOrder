'use client'

import { FormEvent, useState } from 'react'
import { Search } from 'lucide-react'

interface TraceEvent {
  occurred_at?: string
  event_name: string
  event_status?: string
  message?: string
  unit_id?: string
  batch_index?: number
}

export function TraceSearchPanel() {
  const [traceId, setTraceId] = useState('')
  const [events, setEvents] = useState<TraceEvent[]>([])
  const [message, setMessage] = useState('')

  async function search(event: FormEvent) {
    event.preventDefault()
    if (!traceId.trim()) return
    const response = await fetch(`/api/traces/${encodeURIComponent(traceId.trim())}`)
    const data = await response.json()
    if (!response.ok) {
      setMessage(data.error || '查询失败')
      setEvents([])
      return
    }
    setMessage('')
    setEvents(data.events || [])
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="jt-eyebrow">Observability</p>
        <h1 className="text-2xl font-semibold">Trace 检索</h1>
      </header>

      <section className="jt-panel p-5">
        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={search}>
          <input
            className="flex-1 rounded-lg border border-[#d0d5dd] px-3 py-2"
            value={traceId}
            onChange={(event) => setTraceId(event.target.value)}
            placeholder="输入 trace_id"
          />
          <button className="rounded-lg bg-[#0fc6c2] px-4 py-2 font-medium text-white" type="submit">
            <Search className="mr-1 inline h-4 w-4" />检索
          </button>
        </form>
        {message && <p className="mt-3 text-sm text-red-700">{message}</p>}
      </section>

      <section className="jt-panel p-5">
        <div className="space-y-3">
          {events.map((item, index) => (
            <div className="relative border-l-2 border-[#0fc6c2] pl-4" key={`${item.occurred_at}-${index}`}>
              <p className="text-xs text-[#98a2b3]">{item.occurred_at ? new Date(item.occurred_at).toLocaleString() : '-'} · {item.event_status || '-'}</p>
              <p className="font-medium">{item.event_name}</p>
              <p className="text-sm text-[#667085]">{item.message || ''}</p>
              {item.unit_id && <p className="text-xs text-[#98a2b3]">批次：{item.unit_id} / {item.batch_index || '-'}</p>}
            </div>
          ))}
          {events.length === 0 && <p className="text-sm text-[#98a2b3]">输入 Trace ID 后查看链路时间线</p>}
        </div>
      </section>
    </div>
  )
}
