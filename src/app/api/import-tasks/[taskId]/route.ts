import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: { taskId: string }
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { data: task, error } = await supabaseAdmin
      .from('import_tasks')
      .select('*')
      .eq('task_id', params.taskId)
      .maybeSingle()

    if (error) throw error
    if (!task) return NextResponse.json({ error: '任务不存在' }, { status: 404 })

    const { data: batches, error: batchError } = await supabaseAdmin
      .from('import_task_batches')
      .select('*', { count: 'exact' })
      .eq('task_id', params.taskId)
      .order('batch_index', { ascending: true })
      .range(0, 999)
    if (batchError) throw batchError

    const totalBatchesFromLedger = batches?.length || Number(task.total_batches || 0)
    const completedBatchesFromLedger = (batches || []).filter((batch) => ['succeeded', 'failed'].includes(batch.status)).length
    const successRowsFromLedger = (batches || []).reduce((sum, batch) => sum + Number(batch.rows_success || 0), 0)
    const failedRowsFromLedger = (batches || []).reduce((sum, batch) => sum + Number(batch.rows_failed || 0), 0)
    const processedRowsFromLedger = successRowsFromLedger + failedRowsFromLedger
    const failedBatchCount = (batches || []).filter((batch) => batch.status === 'failed').length

    let effectiveStatus = String(task.status)
    if (totalBatchesFromLedger > 0 && completedBatchesFromLedger >= totalBatchesFromLedger) {
      effectiveStatus = failedBatchCount >= totalBatchesFromLedger
        ? 'failed'
        : failedRowsFromLedger > 0
          ? 'partial_success'
          : 'completed'
    } else if (processedRowsFromLedger > 0 || completedBatchesFromLedger > 0) {
      effectiveStatus = 'processing'
    }

    const effectiveProcessedRows = Math.max(Number(task.processed_rows || 0), processedRowsFromLedger)
    const effectiveSuccessRows = Math.max(Number(task.success_rows || 0), successRowsFromLedger)
    const effectiveFailedRows = Math.max(Number(task.failed_rows || 0), failedRowsFromLedger)
    const effectiveCompletedBatches = Math.max(Number(task.completed_batches || 0), completedBatchesFromLedger)

    if (
      effectiveStatus !== task.status ||
      effectiveProcessedRows !== Number(task.processed_rows || 0) ||
      effectiveCompletedBatches !== Number(task.completed_batches || 0)
    ) {
      void supabaseAdmin
        .from('import_tasks')
        .update({
          status: effectiveStatus,
          processed_rows: effectiveProcessedRows,
          success_rows: effectiveSuccessRows,
          failed_rows: effectiveFailedRows,
          completed_batches: effectiveCompletedBatches,
          completed_at: ['completed', 'partial_success', 'failed'].includes(effectiveStatus) ? new Date().toISOString() : task.completed_at,
        })
        .eq('task_id', params.taskId)
    }

    const createdAt = task.created_at ? new Date(task.created_at).getTime() : Date.now()
    const elapsedMinutes = Math.max((Date.now() - createdAt) / 60000, 1 / 60)
    const throughputPerMin = Math.round((effectiveProcessedRows / elapsedMinutes) * 100) / 100
    const remainingRows = Math.max(Number(task.total_rows || 0) - effectiveProcessedRows, 0)
    const etaSeconds = throughputPerMin > 0 ? Math.ceil((remainingRows / throughputPerMin) * 60) : null

    const { data: recentErrors, error: errorsError } = await supabaseAdmin
      .from('import_task_errors')
      .select('row_number, field_name, raw_value, error_code, error_reason, created_at')
      .eq('task_id', params.taskId)
      .order('created_at', { ascending: false })
      .limit(5)

    if (errorsError) throw errorsError

    return NextResponse.json({
      task_id: task.task_id,
      file_name: task.file_name,
      status: effectiveStatus,
      total_rows: task.total_rows,
      processed_rows: effectiveProcessedRows,
      success_rows: effectiveSuccessRows,
      failed_rows: effectiveFailedRows,
      total_batches: task.total_batches,
      completed_batches: effectiveCompletedBatches,
      degraded: task.degraded,
      degraded_note: task.degraded_note,
      throughput_per_min: throughputPerMin,
      eta_seconds: etaSeconds,
      error_summary: task.error_summary,
      recent_errors: recentErrors || [],
      trace_id: task.trace_id,
      created_at: task.created_at,
      completed_at: task.completed_at,
    })
  } catch (error) {
    console.error('[import-tasks/:taskId] 查询失败', error)
    return NextResponse.json({ error: `查询任务失败: ${(error as Error).message}` }, { status: 500 })
  }
}
