// src/lib/queue/index.ts
// 队列统一入口：优先 BullMQ（有 Redis），未配置时用 DB 兜底队列。

import { serverConfig, isQueueConfigured } from '../server-env'
import { bullmqQueue } from './bullmq'
import { dbQueue } from './db'
import { ImportQueue } from './types'

function resolveBackend(): ImportQueue {
  if (serverConfig.queueBackend === 'bullmq') return bullmqQueue
  if (serverConfig.queueBackend === 'db') return dbQueue
  return isQueueConfigured() ? bullmqQueue : dbQueue
}

let cached: ImportQueue | null = null

export function getQueue(): ImportQueue {
  if (!cached) cached = resolveBackend()
  return cached
}

export function queueBackendName(): string {
  return getQueue().backend
}
