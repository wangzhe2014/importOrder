// src/lib/queue/types.ts
import type { ImportBatchCreatedPayload, ImportTaskCreatedPayload } from '@/types/async'

export const IMPORT_QUEUE_NAME = 'import-batches'

export interface QueueJob {
  id: string
  event_type: string
  payload: ImportBatchCreatedPayload | ImportTaskCreatedPayload
  trace_id?: string
}

export type BatchProcessor = (job: QueueJob) => Promise<void>

export interface ImportQueue {
  enqueue(job: Omit<QueueJob, 'id'>): Promise<void>
  startWorker(processor: BatchProcessor, concurrency: number): Promise<void>
  stopWorker(): Promise<void>
  readonly backend: string
}
