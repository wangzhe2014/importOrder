// src/lib/queue/bullmq.ts
// BullMQ 生产/消费适配器。Redis 用 Upstash（rediss://）或本地 Redis。
// 注意：BullMQ 要求 maxRetriesPerRequest: null。

import { Queue, Worker } from 'bullmq'
import Redis from 'ioredis'
import { serverConfig } from '../server-env'
import { IMPORT_QUEUE_NAME, ImportQueue, QueueJob, BatchProcessor } from './types'

let connection: Redis | null = null
let producer: Queue | null = null
let worker: Worker | null = null

function getConnection(): Redis {
  if (!connection) {
    connection = new Redis(serverConfig.redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      retryStrategy: (times: number) => Math.min(times * 200, 2000),
    })
  }
  return connection
}

export const bullmqQueue: ImportQueue = {
  backend: 'bullmq',

  async enqueue(job: Omit<QueueJob, 'id'>) {
    if (!producer) {
      producer = new Queue(IMPORT_QUEUE_NAME, { connection: getConnection() })
    }
    await producer.add(
      job.event_type,
      {
        ...job.payload,
        queue_trace_id: job.trace_id || null,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 500,
        removeOnFail: 1000,
      }
    )
  },

  async startWorker(processor: BatchProcessor, concurrency: number) {
    worker = new Worker(
      IMPORT_QUEUE_NAME,
      (job) => {
        const payload = job.data
        return processor({
          id: String(job.id),
          event_type: job.name,
          payload,
          trace_id: payload.queue_trace_id || undefined,
        })
      },
      { connection: getConnection(), concurrency }
    )
  },

  async stopWorker() {
    await worker?.close()
    worker = null
  },
}
