import { NextRequest, NextResponse } from 'next/server'
import {
  createRequestId,
  loadShipmentRowsByExternalCode,
  mapRowToSku,
  requireV3ApiAuth,
} from '../../../../_utils'

export async function GET(
  request: NextRequest,
  { params }: { params: { externalCode: string; skuCode: string } }
) {
  const authError = requireV3ApiAuth(request)
  if (authError) return authError

  const requestId = createRequestId(request)
  const externalCode = decodeURIComponent(params.externalCode)
  const skuCode = decodeURIComponent(params.skuCode)

  try {
    const rows = await loadShipmentRowsByExternalCode(externalCode)
    if (rows.length === 0) {
      return NextResponse.json({
        valid: false,
        waybillNo: externalCode,
        skuCode,
        error: '运单不存在',
        requestId,
      }, { status: 404 })
    }

    const matchedSku = rows
      .map(mapRowToSku)
      .find((sku: { skuCode: string; skuName?: string }) => sku.skuCode === skuCode)

    return NextResponse.json({
      valid: Boolean(matchedSku),
      waybillNo: externalCode,
      skuCode,
      skuName: matchedSku?.skuName,
      requestId,
    })
  } catch (error) {
    return NextResponse.json({
      valid: false,
      waybillNo: externalCode,
      skuCode,
      error: `V2 SKU 归属校验失败：${(error as Error).message || '未知错误'}`,
      requestId,
    }, { status: 500 })
  }
}
