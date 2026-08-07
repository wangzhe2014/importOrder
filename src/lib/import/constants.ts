// src/lib/import/constants.ts
import { serverConfig } from '../server-env'

export const BATCH_SIZE = serverConfig.batchSize
export const WORKER_CONCURRENCY = serverConfig.workerConcurrency
export const STALE_BATCH_LOCK_MINUTES = serverConfig.staleBatchLockMinutes

export const IMPORT_QUEUE_NAME = 'import-batches'

export function buildUnitId(taskId: string, batchIndex: number): string {
  return `unit_${batchIndex.toString().padStart(3, '0')}`
}
