// src/worker/index.ts
// 常驻 Worker 进程：消费导入批次队列 + 投递 Outbox + 恢复卡死批次。
// 启动：npm run worker  (tsx src/worker/index.ts)

import { getQueue, queueBackendName } from '../lib/queue'
import { processBatchJob } from '../lib/import/processBatch'
import { planImportTaskJob } from '../lib/import/planTask'
import { startOutboxPolling, stopOutboxPolling } from '../lib/outbox/dispatcher'
import { supabaseAdmin } from '../lib/supabase-server'
import { serverConfig } from '../lib/server-env'
import { STALE_BATCH_LOCK_MINUTES } from '../lib/import/constants'

let shuttingDown = false

// 周期性恢复卡死批次（长时间 processing -> pending）
const RECOVER_MS = 30_000

async function recoverStale() {
  try {
    const { error } = await supabaseAdmin.rpc('recover_stale_batches', {
      p_lock_timeout_minutes: STALE_BATCH_LOCK_MINUTES,
    })
    if (error) console.error('[worker] recover_stale_batches 失败', error)
  } catch (e) {
    console.error('[worker] recover 失败', e)
  }
}

async function main() {
  console.log(`[worker] 启动 - 队列后端: ${queueBackendName()}`)
  console.log(`[worker] Worker 并发: ${serverConfig.workerConcurrency}, 批次大小: ${serverConfig.batchSize}`)

  // Outbox 投递（本地模式内嵌轮询；Serverless 下由 /api/cron/outbox 触发）
  startOutboxPolling()

  // 队列消费
  await getQueue().startWorker(async (job) => {
    if (job.event_type === 'ImportTaskCreated') {
      return planImportTaskJob(job as Parameters<typeof planImportTaskJob>[0])
    }
    return processBatchJob(job as Parameters<typeof processBatchJob>[0])
  }, serverConfig.workerConcurrency)

  // 卡死批次恢复
  setInterval(recoverStale, RECOVER_MS).unref()

  console.log('[worker] 就绪，等待任务...')
}

async function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  stopOutboxPolling()
  await getQueue().stopWorker()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

main().catch((err) => {
  console.error('[worker] 启动失败', err)
  process.exit(1)
})
