import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: { traceId: string }
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const searchParams = new URL(request.url).searchParams
    const taskId = searchParams.get('task_id')
    const unitId = searchParams.get('unit_id')
    const batch = searchParams.get('batch')

    let query = supabaseAdmin
      .from('trace_events')
      .select('*')
      .eq('trace_id', params.traceId)
      .order('occurred_at', { ascending: true })

    if (taskId) query = query.eq('task_id', taskId)
    if (unitId) query = query.eq('unit_id', unitId)
    if (batch) query = query.eq('batch_index', Number(batch))

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ trace_id: params.traceId, events: data || [] })
  } catch (error) {
    console.error('[traces/:traceId] 查询失败', error)
    return NextResponse.json({ error: `查询 Trace 失败: ${(error as Error).message}` }, { status: 500 })
  }
}
