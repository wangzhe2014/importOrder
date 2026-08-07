import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: { taskId: string }
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const searchParams = new URL(request.url).searchParams
    const page = Math.max(Number(searchParams.get('page') || 1), 1)
    const pageSize = Math.min(Math.max(Number(searchParams.get('page_size') || 100), 1), 500)

    const { data: batches, error: batchError, count } = await supabaseAdmin
      .from('import_task_batches')
      .select('*', { count: 'exact' })
      .eq('task_id', params.taskId)
      .order('batch_index', { ascending: true })
      .range((page - 1) * pageSize, page * pageSize - 1)
    if (batchError) throw batchError

    const unitIds = (batches || []).map((batch) => batch.unit_id)
    const { data: performance, error: performanceError } = unitIds.length
      ? await supabaseAdmin
        .from('batch_performance_log')
        .select('*')
        .eq('task_id', params.taskId)
        .in('unit_id', unitIds)
      : { data: [], error: null }
    if (performanceError) throw performanceError

    const performanceMap = new Map((performance || []).map((item) => [item.unit_id, item]))
    const data = (batches || []).map((batch) => ({
      ...batch,
      performance: performanceMap.get(batch.unit_id) || null,
    }))

    return NextResponse.json({
      data,
      page,
      page_size: pageSize,
      total: count || 0,
      total_pages: Math.ceil((count || 0) / pageSize),
    })
  } catch (error) {
    console.error('[import-tasks/:taskId/batches] 查询失败', error)
    return NextResponse.json({ error: `查询批次失败: ${(error as Error).message}` }, { status: 500 })
  }
}
