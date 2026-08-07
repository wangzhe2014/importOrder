// src/lib/trace.ts
// 全链路 trace 事件写入（可观测性：链路时间线）

import { supabaseAdmin } from './supabase-server'

export interface TraceEventInput {
  trace_id: string
  task_id?: string
  unit_id?: string
  batch_index?: number
  event_name: string
  event_status?: string
  message?: string
}

export async function writeTraceEvent(input: TraceEventInput): Promise<void> {
  try {
    await supabaseAdmin.from('trace_events').insert({
      trace_id: input.trace_id,
      task_id: input.task_id || null,
      unit_id: input.unit_id || null,
      batch_index: input.batch_index ?? null,
      event_name: input.event_name,
      event_status: input.event_status || null,
      message: input.message || null,
    })
  } catch (error) {
    // 观测链路不能影响主链路成功
    console.error('[trace] 写入 trace 事件失败', error)
  }
}

export function newTraceId(): string {
  return `trace_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}