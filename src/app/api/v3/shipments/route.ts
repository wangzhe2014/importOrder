import { NextRequest, NextResponse } from 'next/server'
import {
  createRequestId,
  groupRowsToWaybills,
  loadShipmentRowsForSync,
  requireV3ApiAuth,
} from './_utils'

export async function GET(request: NextRequest) {
  const authError = requireV3ApiAuth(request)
  if (authError) return authError

  const requestId = createRequestId(request)
  const { searchParams } = new URL(request.url)
  const updatedAfter = searchParams.get('updatedAfter')
  const limit = Math.min(Math.max(Number(searchParams.get('limit') || 200), 1), 500)

  try {
    const rows = await loadShipmentRowsForSync(updatedAfter, limit)
    const data = groupRowsToWaybills(rows, requestId)
    return NextResponse.json({
      data,
      count: data.length,
      requestId,
    })
  } catch (error) {
    return NextResponse.json({
      error: `V2 运单同步失败：${(error as Error).message || '未知错误'}`,
      requestId,
    }, { status: 500 })
  }
}
