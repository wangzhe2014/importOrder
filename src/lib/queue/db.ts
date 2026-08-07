// src/lib/queue/db.ts
// DB 轮询兜底队列（无 Redis 时使用）：event_queue 表 + 常驻轮询。
// 跨进程可见，仍满足"队列/等效异步任务系统 + 可重试 + 状态记录"要求。

import { supabaseAdmin } from '../supabase-server'
import { IMPORT_QUEUE_NAME, ImportQueue, QueueJob, BatchProcessor } from './types'

const POLL_MS = 200
const CLAIM_LIMIT = 10
const QUERY_TIMEOUT_MS = 10_000

let stopFlag = false
let timer: ReturnType<typeof setInterval> | null = null

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timeout after ${QUERY_TIMEOUT_MS}ms`)), QUERY_TIMEOUT_MS)
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

export const dbQueue: ImportQueue = {
  backend: 'db',

  async enqueue(job: Omit<QueueJob, 'id'>) {
    await supabaseAdmin.from('event_queue').insert({
      queue_name: IMPORT_QUEUE_NAME,
      event_type: job.event_type,
      payload: job.payload,
      trace_id: job.trace_id || null,
      status: 'queued',
    })
  },

  async startWorker(processor: BatchProcessor, _concurrency: number) {
    stopFlag = false
    const workerId = Math.random().toString(36).slice(2, 10)
    const poll = async () => {
      if (stopFlag) return
      try {
        // 1. 取出 queued 任务 id
        const { data: queued, error: queuedError } = await withTimeout(Promise.resolve(supabaseAdmin
          .from('event_queue')
          .select('id, event_type, payload, trace_id, retry_count')
          .eq('queue_name', IMPORT_QUEUE_NAME)
          .eq('status', 'queued')
          .order('created_at', { ascending: true })
          .limit(CLAIM_LIMIT)), 'event_queue select')
        if (queuedError) throw queuedError

        if (queued && queued.length > 0) {
          const ids = queued.map((row) => row.id)
          // 2. CAS 认领（仅 status=queued 可成功）
          const { data: claimed, error: claimError } = await withTimeout(Promise.resolve(supabaseAdmin
            .from('event_queue')
            .update({ status: 'claimed', locked_at: new Date().toISOString() })
            .eq('queue_name', IMPORT_QUEUE_NAME)
            .eq('status', 'queued')
            .in('id', ids)
            .select('id, event_type, payload, trace_id, retry_count')), 'event_queue claim')
          if (claimError) throw claimError
          // 3. 并发处理认领到的任务
          if (claimed && claimed.length > 0) {
            await Promise.allSettled(
              claimed.map(async (row) => {
                const job: QueueJob = {
                  id: String(row.id),
                  event_type: row.event_type,
                  payload: row.payload as QueueJob['payload'],
                  trace_id: row.trace_id || undefined,
                }
                try {
                  await processor(job)
                  await supabaseAdmin
                    .from('event_queue')
                    .update({ status: 'done', done_at: new Date().toISOString() })
                    .eq('id', row.id)
                } catch (error) {
                  console.error(`[db-queue] worker-${workerId} 任务处理失败`, job.id, error)
                  const nextRetry = (row.retry_count || 0) + 1
                  if (nextRetry >= 3) {
                    await supabaseAdmin
                      .from('event_queue')
                      .update({ status: 'done', retry_count: nextRetry, done_at: new Date().toISOString() })
                      .eq('id', row.id)
                  } else {
                    await supabaseAdmin
                      .from('event_queue')
                      .update({ status: 'queued', retry_count: nextRetry })
                      .eq('id', row.id)
                  }
                }
              })
            )
          }
        }
      } catch (error) {
        console.error('[db-queue] 轮询出错', error)
      } finally {
        if (!stopFlag) {
          timer = setTimeout(poll, POLL_MS)
        }
      }
    }
    timer = setTimeout(poll, POLL_MS)
  },

  async stopWorker() {
    stopFlag = true
    if (timer) clearTimeout(timer)
    timer = null
  },
}
