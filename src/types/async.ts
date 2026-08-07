// src/types/async.ts
// 异步事件驱动重构相关类型定义

export type TaskStatus = 'pending' | 'processing' | 'completed' | 'partial_success' | 'failed'
export type BatchStatus = 'pending' | 'processing' | 'succeeded' | 'failed'
export type OutboxStatus = 'pending' | 'sent' | 'failed'

export const ERROR_CODES = {
  SKU_NOT_FOUND: 'E001',
  REQUIRED_MISSING: 'E002',
  PHONE_INVALID: 'E003',
  QUANTITY_INVALID: 'E004',
  EXTERNAL_CODE_DUPLICATE: 'E005',
  RULE_MAPPING_FAILED: 'E006',
  DB_WRITE_FAILED: 'E007',
  FILE_FORMAT_UNSUPPORTED: 'E008',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

export interface ImportTask {
  id?: string
  task_id: string
  file_name: string
  file_ref?: string
  rule_id?: string
  rule_name?: string
  status: TaskStatus
  total_rows: number
  processed_rows: number
  success_rows: number
  failed_rows: number
  total_batches: number
  completed_batches: number
  batch_size: number
  degraded: boolean
  degraded_note?: string
  trace_id?: string
  error_summary?: string
  created_at?: string
  completed_at?: string
}

export interface ImportTaskBatch {
  id?: string
  task_id: string
  unit_id: string
  batch_index: number
  start_row: number
  end_row: number
  status: BatchStatus
  retry_count: number
  locked_at?: string
  completed_at?: string
  created_at?: string
}

export interface ImportTaskError {
  id?: string
  task_id: string
  unit_id?: string
  batch_index?: number
  row_number: number
  field_name?: string
  raw_value?: string
  error_code?: string
  error_reason?: string
  trace_id?: string
  created_at?: string
}

export interface BatchPerformanceLog {
  id?: string
  task_id: string
  unit_id?: string
  batch_index?: number
  parse_duration_ms?: number
  rule_duration_ms?: number
  validate_duration_ms?: number
  insert_duration_ms?: number
  total_duration_ms?: number
  rows_processed?: number
  status?: string
  trace_id?: string
  created_at?: string
}

// 事件信封（对齐考试 §9.1）
export type ImportEventType =
  | 'ImportTaskCreated'
  | 'ImportBatchCreated'
  | 'ImportBatchStarted'
  | 'ImportBatchSucceeded'
  | 'ImportBatchFailed'
  | 'ImportTaskCompleted'
  | 'ImportTaskPartialSuccess'
  | 'ImportTaskDegraded'

export interface EventEnvelope<T = Record<string, unknown>> {
  event_id: string
  event_type: ImportEventType | string
  schema_version: number
  aggregate_id: string
  trace_id: string
  occurred_at: string
  payload: T
}

export interface ImportBatchCreatedPayload {
  task_id: string
  unit_id: string
  batch_index: number
  start_row: number
  end_row: number
  file_ref: string
  artifact_ref?: string
  file_name: string
  trace_id?: string
  rule?: {
    file_type: 'excel' | 'word' | 'pdf'
    structure_type: string
    config: Record<string, unknown>
  }
}

export interface ImportTaskCreatedPayload {
  task_id: string
  file_ref: string
  file_name: string
  trace_id: string
  batch_size: number
  rule?: {
    file_type: 'excel' | 'word' | 'pdf'
    structure_type: string
    config: Record<string, unknown>
  }
}

export interface UploadTaskResponse {
  task_id: string
  trace_id: string
  status: TaskStatus
  total_rows: number
  total_batches: number
  batch_size: number
}

export interface TaskProgressResponse {
  task_id: string
  file_name?: string
  status: TaskStatus
  total_rows: number
  processed_rows: number
  success_rows: number
  failed_rows: number
  total_batches: number
  completed_batches: number
  degraded: boolean
  degraded_note?: string
  throughput_per_min?: number
  eta_seconds?: number
  error_summary?: string
  trace_id?: string
  created_at?: string
  completed_at?: string
}

// 监控聚合
export interface MonitorSummary {
  throughput: { minute: string; count: number }[]
  queue_depth: { pending_batches: number; pending_rows: number; queue_available: boolean; threshold: number }
  stage_durations: {
    parse: { p50: number; p95: number; p99: number }
    rule: { p50: number; p95: number; p99: number }
    validate: { p50: number; p95: number; p99: number }
    insert: { p50: number; p95: number; p99: number }
  }
  error_distribution: { error_code: string; error_reason: string; count: number }[]
  slow_batches: { task_id: string; unit_id: string; total_duration_ms: number }[]
  recent_tasks: { task_id: string; file_name: string; status: string; created_at: string }[]
  failed_task_trend: { date: string; count: number }[]
}

export interface TraceTimelineEvent {
  id?: string
  trace_id: string
  task_id?: string
  unit_id?: string
  batch_index?: number
  event_name: string
  event_status?: string
  message?: string
  occurred_at?: string
}

// 校验降级上下文
export interface ValidationContext {
  degraded: boolean
  degraded_reason?: string
  skuValid: Set<string>
}
