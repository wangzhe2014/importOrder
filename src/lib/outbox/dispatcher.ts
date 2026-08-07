// src/lib/outbox/dispatcher.ts
// Outbox Dispatcher：轮询 event_outbox，把批次/任务事件投递到队列，更新投递状态。
// - pending -> 入队成功 -> sent
// - 入队失败 -> failed + retry_count + next_retry_at（后续重试）
// - 宕机恢复后在.ts 重启的轮询/cron 中继续投递
// 重复投递由 Worker 的 batches CAS 保证幂等。

import { supabaseAdmin } from '../supabase-server'
import { getQueue } from '../queue'
import { ImportBatchCreatedPayload, ImportEventType } from '@/types/async'

const POLL_MS = 500
const DISPATCH_TIMEOUT_MS = 10_000

interface OutboxRow {
  id: string
  event_type: string
  aggregate_id: string
  payload: Record<string, unknown>
  status: string
  retry_count: number
  next_retry_at?: string
}

let stopFlag = false
let timer: ReturnType<typeof setInterval> | null = null

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timeout after ${DISPATCH_TIMEOUT_MS}ms`)), DISPATCH_TIMEOUT_MS)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

export async function dispatchOutbox(limit = 20): Promise<number> {
  const now = new Date().toISOString()
  // 选取待投递事件（pending，或到期重试的 failed）
  const outboxResult = await withTimeout(Promise.resolve(supabaseAdmin
    .from('event_outbox')
    .select('id, event_type, aggregate_id, payload, status, retry_count, next_retry_at')
    .or(`status.eq.pending,and(status.eq.failed,next_retry_at.lte.${now})`)
    .order('created_at', { ascending: true })
    .limit(limit)), 'outbox select')
  const { data, error } = outboxResult as { data: OutboxRow[] | null; error: { message?: string } | null }

  if (error) throw error

  if (!data || data.length === 0) return 0

  let dispatched = 0
  for (const row of data) {
    const payload = (row.payload || {}) as Record<string, unknown>
    const traceId = String(payload.trace_id || row.aggregate_id || '')

    // 一个任务创建 events -> 只投递批次级事件给 Worker；任务级事件仅记录
    try {
      if (isBatchEvent(row.event_type)) {
        await withTimeout(getQueue().enqueue({
          event_type: row.event_type,
          payload: payload as unknown as ImportBatchCreatedPayload,
          trace_id: traceId,
        }), 'queue enqueue')
      }
      // 投递成功后标记 sent
      const markSentResult = await withTimeout(Promise.resolve(supabaseAdmin
        .from('event_outbox')
        .update({ status: 'sent', retry_count: (row.retry_count || 0) + 1, sent_at: now })
        .eq('id', row.id)), 'outbox mark sent') as { error: { message?: string } | null }
      const { error: markSentError } = markSentResult
      if (markSentError) throw markSentError
      dispatched++
    } catch (error) {
      console.error('[outbox] 投递失败', row.id, row.event_type, error)
      await withTimeout(Promise.resolve(supabaseAdmin
        .from('event_outbox')
        .update({
          status: 'failed',
          retry_count: (row.retry_count || 0) + 1,
          next_retry_at: new Date(Date.now() + (row.retry_count || 0) * 1000).toISOString(),
        })
        .eq('id', row.id)), 'outbox mark failed')
    }
  }
  return dispatched
}

function isBatchEvent(eventType: string): boolean {
  const batchEvents: ImportEventType[] = ['ImportBatchCreated']
  return batchEvents.includes(eventType as ImportEventType)
}

export function startOutboxPolling(): void {
  stopFlag = false
  const poll = async () => {
    if (stopFlag) return
    try {
      await dispatchOutbox(20)
    } catch (error) {
      console.error('[outbox] 轮询出错', error)
    } finally {
      if (!stopFlag) timer = setTimeout(poll, POLL_MS)
    }
  }
  timer = setTimeout(poll, POLL_MS)
}

export function stopOutboxPolling(): void {
  stopFlag = true
  if (timer) clearTimeout(timer)
  timer = null
}
