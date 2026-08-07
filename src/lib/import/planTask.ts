import { ImportBatchCreatedPayload, ImportTaskCreatedPayload } from '@/types/async'
import { ParsingConfig, ParsingRule } from '@/types'
import { supabaseAdmin } from '../supabase-server'
import { BATCH_SIZE, buildUnitId } from './constants'
import { writeTraceEvent } from '../trace'
import { claimDegradedNotification, ensureTaskSkuValidation, loadTaskParseContext, saveTaskParseArtifact } from './taskCache'
import { buildShardSheet } from './fileParser'
import { parseExcelWithRule, parseTextWithRule } from '@/utils/ruleEngine'

function toParsingRule(fileName: string, rule?: ImportTaskCreatedPayload['rule']): ParsingRule {
  return {
    name: fileName,
    file_type: rule?.file_type || 'excel',
    structure_type: (rule?.structure_type || 'standard') as ParsingRule['structure_type'],
    config: (rule?.config || {}) as ParsingConfig,
  }
}

export async function planImportTaskJob(job: { payload: ImportTaskCreatedPayload; trace_id?: string }): Promise<void> {
  const p = job.payload
  const trace_id = job.trace_id || p.trace_id || p.task_id
  try {

  const { data: task, error: taskError } = await supabaseAdmin
    .from('import_tasks')
    .select('status, total_batches')
    .eq('task_id', p.task_id)
    .maybeSingle()
  if (taskError) throw taskError
  if (!task) throw new Error(`Import task not found: ${p.task_id}`)
  if (Number(task.total_batches || 0) > 0) {
    await writeTraceEvent({
      trace_id,
      task_id: p.task_id,
      event_name: 'ImportTaskPlanSkipped',
      event_status: 'skipped',
      message: 'Task is already planned; duplicate planning event skipped.',
    })
    return
  }

  await writeTraceEvent({
    trace_id,
    task_id: p.task_id,
    event_name: 'ImportTaskPlanningStarted',
    event_status: 'processing',
    message: 'Planning started: counting rows and creating batch units.',
  })

  const parsingRule = toParsingRule(p.file_name, p.rule)
  const context = await loadTaskParseContext(p.task_id, p.file_ref, p.file_name, parsingRule)
  const source = context.source
  if (!source) throw new Error('Task parse context has no source data.')
  if (source.type === 'excel' && !context.primaryPlan) {
    await supabaseAdmin
      .from('import_tasks')
      .update({ status: 'failed', error_summary: 'Unable to determine the Excel header or data start row.', completed_at: new Date().toISOString() })
      .eq('task_id', p.task_id)
    throw new Error('Unable to determine the Excel header or data start row.')
  }

  const totalRows = source.type === 'excel'
    ? context.primaryPlan!.totalDataRows
    : source.lines.length

  const batchSize = p.batch_size || BATCH_SIZE
  const totalBatches = Math.max(1, Math.ceil(totalRows / batchSize))
  const batches = Array.from({ length: totalBatches }, (_, i) => ({
    task_id: p.task_id,
    unit_id: buildUnitId(p.task_id, i),
    batch_index: i + 1,
    start_row: i * batchSize + 1,
    end_row: Math.min(totalRows, (i + 1) * batchSize),
    status: 'pending',
  }))

  const batchRows: Record<string, ReturnType<typeof parseExcelWithRule>> = {}
  const skuCodes = new Set<string>()
  for (const batch of batches) {
    const rows = source.type === 'excel'
      ? parseExcelWithRule(
          buildShardSheet(source.sheets, parsingRule, context.primaryPlan!, batch.start_row - 1, batch.end_row),
          parsingRule
        )
      : parseTextWithRule(source.lines.slice(batch.start_row - 1, batch.end_row), parsingRule)
    batchRows[batch.unit_id] = rows
    rows.forEach((row) => {
      const sku = String(row.sku_code || '').trim()
      if (sku) skuCodes.add(sku)
    })
  }
  context.batchRows = batchRows
  context.skuCodes = Array.from(skuCodes)

  const skuResult = await ensureTaskSkuValidation(context)
  if (skuResult.degraded && claimDegradedNotification(context)) {
    await supabaseAdmin.rpc('mark_task_degraded', {
      p_task_id: p.task_id,
      p_reason: 'SKU master validation timed out or failed.',
    })
    await writeTraceEvent({
      trace_id,
      task_id: p.task_id,
      event_name: 'ImportTaskDegraded',
      event_status: 'degraded',
      message: 'SKU master validation skipped due to a timeout or database error.',
    })
  }

  const artifactRef = await saveTaskParseArtifact(p.task_id, context)

  const { error: batchError } = await supabaseAdmin.from('import_task_batches').insert(batches)
  if (batchError) throw batchError

  const { error: updateError } = await supabaseAdmin
    .from('import_tasks')
    .update({
      status: 'processing',
      total_rows: totalRows,
      total_batches: totalBatches,
      batch_size: batchSize,
    })
    .eq('task_id', p.task_id)
  if (updateError) throw updateError

  const queueRows = batches.map((batch) => ({
    queue_name: 'import-batches',
    event_type: 'ImportBatchCreated',
    payload: {
      task_id: p.task_id,
      unit_id: batch.unit_id,
      batch_index: batch.batch_index,
      start_row: batch.start_row,
      end_row: batch.end_row,
      file_ref: p.file_ref,
      artifact_ref: artifactRef,
      file_name: p.file_name,
      rule: p.rule,
      trace_id,
    } satisfies ImportBatchCreatedPayload,
    trace_id,
    status: 'queued',
  }))
  const { error: queueError } = await supabaseAdmin.from('event_queue').insert(queueRows)
  if (queueError) throw queueError

  await writeTraceEvent({
    trace_id,
    task_id: p.task_id,
    event_name: 'ImportTaskPlanned',
    event_status: 'ok',
    message: `Task planned: ${totalRows} rows in ${totalBatches} batches.`,
  })
  } catch (error) {
    const message = 'Task planning failed. Check the Trace event and server logs.'
    await supabaseAdmin
      .from('import_tasks')
      .update({ status: 'failed', error_summary: message, completed_at: new Date().toISOString() })
      .eq('task_id', p.task_id)
    await writeTraceEvent({
      trace_id,
      task_id: p.task_id,
      event_name: 'ImportTaskPlanningFailed',
      event_status: 'error',
      message,
    })
    throw error
  }
}
