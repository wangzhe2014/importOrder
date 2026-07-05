import { NextRequest, NextResponse } from 'next/server'
import { withTimeout } from './_timeout.mjs'

export function requireV3ApiAuth(request: NextRequest) {
  const expectedKey = process.env.V2_SERVICE_API_KEY
  if (!expectedKey) {
    return NextResponse.json({ error: 'V2_SERVICE_API_KEY 未配置' }, { status: 503 })
  }

  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (token !== expectedKey) {
    return NextResponse.json({ error: '无效的服务间鉴权令牌' }, { status: 401 })
  }

  if (!isV2SupabaseConfigured()) {
    return NextResponse.json({ error: 'V2 Supabase 未配置' }, { status: 503 })
  }

  return null
}

export async function loadShipmentRowsByExternalCode(externalCode: string) {
  const { supabase } = await import('@/lib/supabase')
  const query = supabase
    .from('shipments')
    .select('*')
    .eq('external_code', externalCode)
    .order('created_at', { ascending: true })

  const { data, error } = await withTimeout(query, 'V2 Supabase 运单详情查询')
  if (error) throw error
  return data || []
}

export async function loadShipmentRowsForSync(updatedAfter: string | null, limit: number) {
  const { supabase } = await import('@/lib/supabase')
  let query = supabase
    .from('shipments')
    .select('*')
    .or('external_code.is.null,external_code.neq.SYSTEM_RULE_CONFIG')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (updatedAfter) {
    query = query.gte('created_at', updatedAfter)
  }

  const { data, error } = await withTimeout(query, 'V2 Supabase 运单同步查询')
  if (error) throw error
  return data || []
}

export function mapRowsToWaybill(rows: any[], requestId: string) {
  const first = rows[0]
  const skus = rows.map(mapRowToSku)
  return {
    waybillNo: first.external_code || '',
    storeName: first.store_name || (!hasV2Receiver(first) ? first.receiver_name || '' : ''),
    receiverName: hasV2Receiver(first) ? first.receiver_name || '' : '',
    receiverPhone: first.receiver_phone || '',
    receiverAddress: first.receiver_address || '',
    amount: skus.reduce((sum, sku) => sum + Number(sku.skuQuantity || 0), 0),
    amountSource: 'sku_quantity_total',
    createdAt: first.created_at,
    skus,
    requestId,
  }
}

export function groupRowsToWaybills(rows: any[], requestId: string) {
  const groups = new Map<string, any[]>()
  rows.forEach((row) => {
    const externalCode = String(row.external_code || '').trim()
    if (!externalCode) return
    if (!groups.has(externalCode)) groups.set(externalCode, [])
    groups.get(externalCode)!.push(row)
  })

  return Array.from(groups.values()).map((group) => mapRowsToWaybill(group, requestId))
}

export function mapRowToSku(row: any) {
  return {
    skuCode: row.sku_code || row.sender_name || '',
    skuName: row.sku_name || row.sender_address || '',
    skuQuantity: Number(row.sku_quantity || row.quantity || 0),
    skuSpec: row.sku_spec || row.sender_phone || '',
    remark: row.remark || '',
  }
}

export function createRequestId(request: NextRequest) {
  return request.headers.get('x-request-id') || `v2_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
}

function hasV2Receiver(row: any) {
  return Boolean(row.store_name || row.receiver_phone || row.receiver_address)
}

function isV2SupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}
