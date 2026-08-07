// src/lib/import/processBatch.ts
// Worker 处理单个处理单元（Job）的核心逻辑：
// 认领(CAS) -> 分片解析 -> SKU 批量校验(可降级) -> 行级校验 -> 批量 UPSERT -> 错误/性能日志 -> 原子聚合
// 幂等：批次 CAS 认领 + 唯一业务键 UPSERT + 账本式聚合，天然防重复累计。

import { supabaseAdmin } from '../supabase-server'
import { QueueJob } from '../queue/types'
import { ShipmentData, ParsingRule, ParsingConfig } from '@/types'
import { ImportBatchCreatedPayload, ERROR_CODES, ImportTaskError } from '@/types/async'
import { STALE_BATCH_LOCK_MINUTES } from './constants'
import { buildShardSheet } from './fileParser'
import { parseExcelWithRule, parseTextWithRule } from '@/utils/ruleEngine'
import { validateRow } from '@/utils/validator'
import { writeTraceEvent } from '../trace'
import { loadTaskParseContext } from './taskCache'

const MAX_BATCH_RETRIES = 3
const UPSERT_CHUNK = 500

interface ErrorEntry {
  task_id: string
  unit_id: string
  batch_index?: number
  row_number: number
  field_name?: string
  raw_value?: string
  error_code: string
  error_reason: string
  trace_id: string
}

function toParsingRule(fileName: string, rule?: ImportBatchCreatedPayload['rule']): ParsingRule {
  return {
    name: fileName,
    file_type: rule?.file_type || 'excel',
    structure_type: (rule?.structure_type || 'standard') as ParsingRule['structure_type'],
    config: (rule?.config || {}) as ParsingConfig,
  }
}

function maskSensitive(field: string | undefined, value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value)
  const f = field || ''
  if (f.includes('phone') && raw.length >= 7) {
    return raw.slice(0, 3) + '****' + raw.slice(-4)
  }
  if (f.toLowerCase().includes('address')) {
    return raw.length > 12 ? `${raw.slice(0, 6)}****${raw.slice(-4)}` : raw
  }
  return raw
}

function mapValidationCode(message: string): string {
  if (message.includes('电话格式')) return ERROR_CODES.PHONE_INVALID
  if (message.includes('数量必须为正数') || message.includes('正数')) return ERROR_CODES.QUANTITY_INVALID
  return ERROR_CODES.REQUIRED_MISSING
}

function validationErrorReason(errorCode: string, field: string): string {
  if (errorCode === ERROR_CODES.PHONE_INVALID) return `Invalid phone number format for ${field}.`
  if (errorCode === ERROR_CODES.QUANTITY_INVALID) return `Quantity must be a positive number for ${field}.`
  return `Required or invalid value for ${field}.`
}

function makeError(
  task_id: string,
  unit_id: string,
  batch_index: number | undefined,
  row_number: number,
  field_name: string | undefined,
  raw_value: unknown,
  error_code: string,
  error_reason: string,
  trace_id: string
): ErrorEntry {
  return {
    task_id,
    unit_id,
    batch_index,
    row_number,
    field_name: field_name || undefined,
    raw_value: maskSensitive(field_name, raw_value),
    error_code,
    error_reason,
    trace_id,
  }
}

export async function processBatchJob(job: QueueJob): Promise<void> {
  const p = job.payload as ImportBatchCreatedPayload
  const { task_id, unit_id, batch_index, start_row, end_row, file_ref, artifact_ref, file_name } = p
  const trace_id = job.trace_id || task_id
  const parsingRule = toParsingRule(file_name, p.rule)

  // 1) CAS 认领处理单元（防重复消费）
  const claimRes = await supabaseAdmin.rpc('claim_batch', {
    p_task_id: task_id,
    p_unit_id: unit_id,
    p_lock_timeout_minutes: STALE_BATCH_LOCK_MINUTES,
  })
  if (claimRes.error) {
    console.error('[processBatch] claim 失败', task_id, unit_id, claimRes.error)
    throw claimRes.error
  }
  if (!claimRes.data) {
    // 已被处理或正在被其他 Worker 处理 -> 幂等快速返回
    await writeTraceEvent({
      trace_id,
      task_id,
      unit_id,
      batch_index,
      event_name: 'ImportBatchSkipped',
      event_status: 'skipped',
      message: `Batch ${unit_id} is already processed or locked; skipped idempotently.`,
    })
    return
  }
  const claimed = claimRes.data as { retry_count: number }

  await writeTraceEvent({
    trace_id,
    task_id,
    unit_id,
    batch_index,
    event_name: 'ImportBatchStarted',
    event_status: 'processing',
    message: `Batch ${unit_id} started for rows ${start_row}-${end_row}; attempt ${claimed.retry_count}.`,
  })

  const t0 = Date.now()
  let parseMs = 0
  let ruleMs = 0
  let validateMs = 0
  let insertMs = 0
  let successRows: ShipmentData[] = []
  let errorEntries: ErrorEntry[] = []
  let finalized = false

  const finalize = async (batchStatus: string, success: number, failed: number) => {
    if (finalized) return
    finalized = true
    const totalMs = Date.now() - t0
    try {
      await supabaseAdmin.from('batch_performance_log').insert({
        task_id,
        unit_id,
        batch_index,
        parse_duration_ms: parseMs,
        rule_duration_ms: ruleMs,
        validate_duration_ms: validateMs,
        insert_duration_ms: insertMs,
        total_duration_ms: totalMs,
        rows_processed: success + failed,
        status: batchStatus,
        trace_id,
      })
    } catch (e) {
      console.error('[processBatch] 写性能日志失败', e)
    }
    const agg = await supabaseAdmin.rpc('complete_batch', {
      p_task_id: task_id,
      p_unit_id: unit_id,
      p_status: batchStatus,
      p_rows_success: success,
      p_rows_failed: failed,
    })
    if (agg.error) throw agg.error

    await writeTraceEvent({
      trace_id,
      task_id,
      unit_id,
      batch_index,
      event_name: batchStatus === 'succeeded' ? 'ImportBatchSucceeded' : 'ImportBatchFailed',
      event_status: batchStatus,
      message: `Batch ${unit_id} completed: ${success} succeeded, ${failed} failed, ${totalMs}ms total.`,
    })
  }

  const failAndMaybeRetry = async (message: string) => {
    console.error('[processBatch] 系统级失败', task_id, unit_id, message)
    await writeTraceEvent({
      trace_id,
      task_id,
      unit_id,
      batch_index,
      event_name: 'ImportBatchFailed',
      event_status: 'error',
      message,
    })
    if (claimed.retry_count < MAX_BATCH_RETRIES) {
      // 重置为 pending，让队列重试（重试次数已计）
      await supabaseAdmin
        .from('import_task_batches')
        .update({ status: 'pending', locked_at: null })
        .eq('task_id', task_id)
        .eq('unit_id', unit_id)
      throw new Error(message)
    }
    await finalize('failed', 0, 0)
  }

  try {
    // 2) 读取文件 + 分片/整文件解析
    const parseStart = Date.now()
    let context: Awaited<ReturnType<typeof loadTaskParseContext>>
    try {
      context = await loadTaskParseContext(task_id, file_ref, file_name, parsingRule, artifact_ref)
    } catch (e) {
      console.error('[processBatch] failed to load task parse context', task_id, unit_id, e)
      return failAndMaybeRetry('Unable to load the task parse context.')
    }
    let parsedRows: ShipmentData[]

    const materializedRows = context.batchRows?.[unit_id]
    if (materializedRows) {
      parsedRows = materializedRows
      parseMs = Date.now() - parseStart
      ruleMs = 0
    } else {
      const source = context.source
      if (!source) {
        return failAndMaybeRetry('Task artifact has no materialized batch rows.')
      }
      const ruleStart = Date.now()
      if (source.type === 'excel') {
        const plan = context.primaryPlan
        if (!plan) {
          return failAndMaybeRetry('Unable to determine the Excel header or data start row.')
        }
        const shardSheets = buildShardSheet(
          source.sheets,
          parsingRule,
          plan,
          start_row - 1,
          end_row
        )
        parsedRows = parseExcelWithRule(shardSheets, parsingRule)
      } else {
        parsedRows = parseTextWithRule(source.lines.slice(start_row - 1, end_row), parsingRule)
      }
      parseMs = ruleStart - parseStart
      ruleMs = Date.now() - ruleStart
    }

    const validateStart = Date.now()
    // 4) 行级校验：格式 + 批内重复
    const items = parsedRows.map((row, i) => ({
      data: row,
      globalRow: start_row + i,
    }))

    // 4.1 批内重复（external_code + sku_code）
    const dupRows = new Set<number>()
    const seen = new Map<string, number>()
    for (const item of items) {
      const code = String(item.data.external_code || '').trim()
      const sku = String(item.data.sku_code || '').trim()
      if (!code || !sku) continue
      const key = `${code}::${sku}`
      if (seen.has(key)) {
        dupRows.add(item.globalRow)
        errorEntries.push(
            makeError(task_id, unit_id, batch_index, item.globalRow, 'external_code', code, ERROR_CODES.EXTERNAL_CODE_DUPLICATE, `Duplicate external code and SKU; first seen at row ${seen.get(key)}.`, trace_id)
        )
      } else {
        seen.set(key, item.globalRow)
      }
    }

    // 4.2 逐行格式校验
    for (const item of items) {
      if (dupRows.has(item.globalRow)) continue
      const errs = validateRow(item.data, item.globalRow)
      let rowHasError = errs.length > 0

      for (const e of errs) {
        const rawField = item.data[e.field as keyof ShipmentData]
        const errorCode = mapValidationCode(e.message)
        errorEntries.push(
          makeError(task_id, unit_id, batch_index, item.globalRow, e.field, rawField, errorCode, validationErrorReason(errorCode, e.field), trace_id)
        )
      }

      if (!rowHasError) {
        successRows.push(item.data)
      }
    }
    validateMs = Date.now() - validateStart

    // 5) 批量 UPSERT 成功行（幂等业务键 external_code+sku_code+line_no）
    const upsertStart = Date.now()
    const finalSuccess: ShipmentData[] = []
    const upsertPairs: { data: ShipmentData; globalRow: number }[] = []
    items.forEach((item) => {
      if (dupRows.has(item.globalRow)) return
      if (successRows.includes(item.data)) {
        upsertPairs.push(item)
      }
    })

    for (let i = 0; i < upsertPairs.length; i += UPSERT_CHUNK) {
      const chunk = upsertPairs.slice(i, i + UPSERT_CHUNK)
      const rows = chunk.map(({ data, globalRow }) => ({
        external_code: data.external_code || null,
        store_name: data.store_name || '',
        receiver_name: data.receiver_name || '',
        receiver_phone: data.receiver_phone || '',
        receiver_address: data.receiver_address || '',
        sku_code: data.sku_code,
        sku_name: data.sku_name,
        sku_quantity: data.sku_quantity,
        sku_spec: data.sku_spec || '',
        remark: data.remark || '',
        line_no: globalRow,
      }))
      const { error } = await supabaseAdmin
        .from('shipments')
        .upsert(rows, { onConflict: 'external_code,sku_code,line_no' })
      if (error) {
        // 整块失败 -> 记为 E007 数据库写入失败
        chunk.forEach(({ data, globalRow }) => {
          errorEntries.push(
            makeError(task_id, unit_id, batch_index, globalRow, undefined, data.external_code, ERROR_CODES.DB_WRITE_FAILED, 'Database write failed. Check server logs for details.', trace_id)
          )
        })
      } else {
        finalSuccess.push(...chunk.map(({ data }) => data))
      }
    }
    insertMs = Date.now() - upsertStart

    // 6) 写入错误明细（批量）
    if (errorEntries.length > 0) {
      const errInsertRows: ImportTaskError[] = errorEntries.map((e) => ({ ...e }))
      await supabaseAdmin.from('import_task_errors').insert(errInsertRows)
    }

    // 7) 聚合收尾
    const successCount = finalSuccess.length
    const failedCount = errorEntries.length
    await finalize(successCount > 0 || failedCount > 0 ? 'succeeded' : 'succeeded', successCount, failedCount)
    // 说明：批次只要正常走完（即使 100% 失败行）都记为 succeeded，终态由失败行数决定
  } catch (error) {
    if (!finalized) {
      console.error('[processBatch] unhandled batch error', task_id, unit_id, error)
      await failAndMaybeRetry('Batch processing failed. Check server logs for details.')
    } else {
      throw error
    }
  }
}
