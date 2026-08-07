import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: { taskId: string }
}

function csvCell(value: unknown): string {
  const text = String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const searchParams = new URL(request.url).searchParams
    const batch = searchParams.get('batch')
    const errorCode = searchParams.get('error_code')
    const page = Math.max(Number(searchParams.get('page') || 1), 1)
    const pageSize = Math.min(Math.max(Number(searchParams.get('page_size') || 50), 1), 200)
    const exportCsv = searchParams.get('format') === 'csv'

    let query = supabaseAdmin
      .from('import_task_errors')
      .select('*', { count: 'exact' })
      .eq('task_id', params.taskId)
      .order('row_number', { ascending: true })

    if (batch) query = query.eq('batch_index', Number(batch))
    if (errorCode) query = query.eq('error_code', errorCode)

    if (!exportCsv) {
      query = query.range((page - 1) * pageSize, page * pageSize - 1)
    }

    const { data, count, error } = await query
    if (error) throw error

    if (exportCsv) {
      const headers = ['task_id', 'unit_id', 'batch_index', 'row_number', 'field_name', 'raw_value', 'error_code', 'error_reason', 'trace_id', 'created_at']
      const rows = (data || []).map((row) => headers.map((header) => csvCell(row[header])).join(','))
      const csv = `\uFEFF${headers.join(',')}\n${rows.join('\n')}`
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${params.taskId}-errors.csv"`,
        },
      })
    }

    return NextResponse.json({
      data: data || [],
      page,
      page_size: pageSize,
      total: count || 0,
      total_pages: Math.ceil((count || 0) / pageSize),
    })
  } catch (error) {
    console.error('[import-tasks/:taskId/errors] 查询失败', error)
    return NextResponse.json({ error: `查询错误明细失败: ${(error as Error).message}` }, { status: 500 })
  }
}
