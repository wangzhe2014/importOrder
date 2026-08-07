// src/lib/import/createTask.ts
// 上传即返回：预扫描行数、按处理单元划分批次，供上传接口组装并写入 Outbox。

import { ParsingRule } from '@/types'
import { parseFileBuffer, parseExcelBuffer, detectExtension } from './fileParser'
import { estimateExcelDataRows, ExcelParsePlan } from '@/utils/ruleEngine'
import { BATCH_SIZE, buildUnitId } from './constants'
import { ImportBatchCreatedPayload } from '@/types/async'
import { newTraceId } from '../trace'
import { saveUploadFile, SaveFileResult } from '../fileStorage'

export interface BatchPlan {
  batch_index: number
  unit_id: string
  start_row: number
  end_row: number
}

export interface TaskCreationPlan {
  task_id: string
  trace_id: string
  total_rows: number
  total_batches: number
  batch_size: number
  batches: BatchPlan[]
  file_ref: string
  rule: ImportBatchCreatedPayload['rule']
  primaryPlan: ExcelParsePlan | null
}

function buildRuleSnapshot(rule: ParsingRule): ImportBatchCreatedPayload['rule'] {
  return {
    file_type: rule.file_type,
    structure_type: rule.structure_type,
    config: (rule.config || {}) as Record<string, unknown>,
  }
}

export async function createTaskPlan(
  taskId: string,
  filename: string,
  file: File,
  rule: ParsingRule
): Promise<TaskCreationPlan> {
  const ext = detectExtension(filename)
  const buffer = Buffer.from(await file.arrayBuffer())
  const trace_id = newTraceId()

  const saved: SaveFileResult = await saveUploadFile(taskId, filename, buffer)

  let total_rows = 0
  let total_batches = 1
  let batches: BatchPlan[] = []
  let primaryPlan: ExcelParsePlan | null = null

  if (ext === 'xlsx' || ext === 'xls') {
    const parsed = await parseExcelBuffer(buffer)
    const plans = estimateExcelDataRows(parsed.sheets, rule)
    primaryPlan = plans.length > 0 ? plans[0] : null
    if (primaryPlan) {
      total_rows = primaryPlan.totalDataRows
      total_batches = Math.max(1, Math.ceil(total_rows / BATCH_SIZE))
    }
  } else {
    // word/pdf：以行数估算，作为单个处理单元
    const parsed = await parseFileBuffer(buffer, filename)
    total_rows = parsed.type === 'excel' ? parsed.sheets.reduce((a, s) => a + s.data.length, 0) : parsed.lines.length
    total_batches = 1
  }

  for (let i = 0; i < total_batches; i++) {
    const start = i * BATCH_SIZE + 1
    const end = Math.min(total_rows, (i + 1) * BATCH_SIZE)
    batches.push({
      batch_index: i + 1,
      unit_id: buildUnitId(taskId, i),
      start_row: start,
      end_row: end,
    })
  }

  return {
    task_id: taskId,
    trace_id,
    total_rows,
    total_batches,
    batch_size: BATCH_SIZE,
    batches,
    file_ref: saved.file_ref,
    rule: buildRuleSnapshot(rule),
    primaryPlan,
  }
}