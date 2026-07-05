import { NextRequest, NextResponse } from 'next/server'
import {
  createRequestId,
  loadShipmentRowsByExternalCode,
  mapRowsToWaybill,
  requireV3ApiAuth,
} from '../_utils'

export async function GET(
  request: NextRequest,
  { params }: { params: { externalCode: string } }
) {
  const authError = requireV3ApiAuth(request)
  if (authError) return authError

  const requestId = createRequestId(request)
  const externalCode = decodeURIComponent(params.externalCode)

  try {
    const rows = await loadShipmentRowsByExternalCode(externalCode)
    if (rows.length === 0) {
      return NextResponse.json({ error: '运单不存在', requestId }, { status: 404 })
    }

    return NextResponse.json(mapRowsToWaybill(rows, requestId))
  } catch (error) {
    return NextResponse.json({
      error: `V2 运单详情读取失败：${(error as Error).message || '未知错误'}`,
      requestId,
    }, { status: 500 })
  }
}
