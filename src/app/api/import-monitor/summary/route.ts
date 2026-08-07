import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)
  return sorted[Math.max(index, 0)] || 0
}

function stageStats(rows: Record<string, unknown>[], field: string) {
  const values = rows
    .map((row) => Number(row[field] || 0))
    .filter((value) => value > 0)
  return {
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
  }
}

export async function GET() {
  try {
    const since = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const [performanceResult, errorsResult, batchesResult, tasksResult, outboxResult, queueResult] = await Promise.all([
      supabaseAdmin.from('batch_performance_log').select('*').gte('created_at', since),
      supabaseAdmin.from('import_task_errors').select('error_code, error_reason').gte('created_at', since),
      supabaseAdmin.from('import_task_batches').select('task_id, unit_id, status, start_row, end_row').in('status', ['pending', 'processing']),
      supabaseAdmin.from('import_tasks').select('task_id, file_name, status, created_at').order('created_at', { ascending: false }).limit(20),
      supabaseAdmin.from('event_outbox').select('id', { count: 'exact', head: true }).in('status', ['pending', 'failed']),
      supabaseAdmin.from('event_queue').select('id', { count: 'exact', head: true }).in('status', ['queued', 'claimed']),
    ])

    const firstError = performanceResult.error || errorsResult.error || batchesResult.error || tasksResult.error
    if (firstError) throw firstError

    const performance = (performanceResult.data || []) as Record<string, unknown>[]
    const errors = errorsResult.data || []
    const minuteBuckets = new Map<string, number>()
    for (const row of performance) {
      const minute = new Date(String(row.created_at)).toISOString().slice(0, 16)
      minuteBuckets.set(minute, (minuteBuckets.get(minute) || 0) + Number(row.rows_processed || 0))
    }

    const errorBuckets = new Map<string, { error_code: string; error_reason: string; count: number }>()
    for (const row of errors) {
      const key = String(row.error_code || 'UNKNOWN')
      const previous = errorBuckets.get(key)
      if (previous) previous.count++
      else errorBuckets.set(key, { error_code: key, error_reason: String(row.error_reason || ''), count: 1 })
    }

    const pendingBatches = batchesResult.data || []
    const pendingRows = pendingBatches.reduce((sum, row) => sum + Math.max(Number(row.end_row || 0) - Number(row.start_row || 0) + 1, 0), 0)

    return NextResponse.json({
      throughput: Array.from(minuteBuckets.entries()).map(([minute, count]) => ({ minute, count })),
      queue_depth: {
        pending_batches: (queueResult.count || 0) + (outboxResult.count || 0),
        pending_rows: pendingRows,
        queue_available: !queueResult.error,
        threshold: 5000,
      },
      stage_durations: {
        parse: stageStats(performance, 'parse_duration_ms'),
        rule: stageStats(performance, 'rule_duration_ms'),
        validate: stageStats(performance, 'validate_duration_ms'),
        insert: stageStats(performance, 'insert_duration_ms'),
      },
      error_distribution: Array.from(errorBuckets.values()).sort((a, b) => b.count - a.count),
      slow_batches: performance
        .sort((a, b) => Number(b.total_duration_ms || 0) - Number(a.total_duration_ms || 0))
        .slice(0, 10)
        .map((row) => ({
          task_id: String(row.task_id),
          unit_id: String(row.unit_id),
          total_duration_ms: Number(row.total_duration_ms || 0),
        })),
      recent_tasks: tasksResult.data || [],
    })
  } catch (error) {
    console.error('[import-monitor/summary] 聚合失败', error)
    return NextResponse.json({ error: `读取监控数据失败: ${(error as Error).message}` }, { status: 500 })
  }
}
