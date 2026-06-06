// src/app/api/shipments/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { ShipmentData, ImportResult } from '@/types'

// Helper to map DB row to V2 format (if DB contains V1 columns, auto map them to V2)
function mapRowToV2(row: any): ShipmentData {
  const isV1 = row.sender_name !== undefined && row.sender_address !== undefined
  
  if (isV1) {
    const hasReceiverContact = row.receiver_phone || row.receiver_address
    return {
      id: row.id,
      external_code: row.external_code || '',
      store_name: !hasReceiverContact ? (row.receiver_name || '') : '',
      receiver_name: hasReceiverContact ? (row.receiver_name || '') : '',
      receiver_phone: row.receiver_phone || '',
      receiver_address: row.receiver_address || '',
      sku_code: row.sender_name || '',        // sku_code was saved as sender_name in V1 fallback
      sku_name: row.sender_address || '',     // sku_name was saved as sender_address in V1 fallback
      sku_quantity: parseInt(row.quantity || '0', 10), // sku_quantity was saved as quantity
      sku_spec: row.sender_phone || '',       // sku_spec was saved as sender_phone
      remark: row.remark || '',
      created_at: row.created_at
    }
  }
  
  return {
    id: row.id,
    external_code: row.external_code || '',
    store_name: row.store_name || '',
    receiver_name: row.receiver_name || '',
    receiver_phone: row.receiver_phone || '',
    receiver_address: row.receiver_address || '',
    sku_code: row.sku_code || '',
    sku_name: row.sku_name || '',
    sku_quantity: parseInt(row.sku_quantity || '0', 10),
    sku_spec: row.sku_spec || '',
    remark: row.remark || '',
    created_at: row.created_at
  }
}

// GET /api/shipments - List shipments, search, check duplicates
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    if (!isSupabaseConfigured) {
      if (searchParams.get('check_duplicates') || searchParams.get('check_duplicate_items')) {
        return NextResponse.json([])
      }

      return NextResponse.json({
        data: [],
        total: 0,
        page: 1,
        limit: 10,
        warning: 'Supabase 未配置，无法读取历史运单'
      })
    }
    
    // 1. Check duplicate item rows by external_code + sku_code
    const checkDuplicateItems = searchParams.get('check_duplicate_items')
    if (checkDuplicateItems) {
      let items: { external_code?: string; sku_code?: string }[] = []
      try {
        const parsed = JSON.parse(checkDuplicateItems)
        items = Array.isArray(parsed) ? parsed : []
      } catch {
        return NextResponse.json({ error: '重复校验参数格式错误' }, { status: 400 })
      }

      const normalizedItems = items
        .map((item) => ({
          external_code: String(item.external_code || '').trim(),
          sku_code: String(item.sku_code || '').trim(),
        }))
        .filter((item) => item.external_code && item.sku_code)

      if (normalizedItems.length === 0) {
        return NextResponse.json([])
      }

      const externalCodes = Array.from(new Set(normalizedItems.map((item) => item.external_code)))
      const requestedKeys = new Set(
        normalizedItems.map((item) => `${item.external_code}::${item.sku_code}`)
      )

      let queryResult: { data: any[] | null; error: any } = await supabase
        .from('shipments')
        .select('external_code, sku_code')
        .in('external_code', externalCodes)

      if (queryResult.error && (queryResult.error.message.includes('sku_code') || queryResult.error.code === 'PGRST204')) {
        queryResult = await supabase
          .from('shipments')
          .select('external_code, sender_name')
          .in('external_code', externalCodes)
      }

      if (queryResult.error) {
        throw queryResult.error
      }

      const duplicates = Array.from(new Set(
        (queryResult.data || [])
          .map((row: any) => `${String(row.external_code || '').trim()}::${String(row.sku_code || row.sender_name || '').trim()}`)
          .filter((key) => requestedKeys.has(key))
      ))

      return NextResponse.json(duplicates)
    }

    // 2. Check duplicate external codes (legacy compatibility)
    const checkDuplicates = searchParams.get('check_duplicates')
    if (checkDuplicates) {
      const codes = Array.from(
        new Set(checkDuplicates.split(',').map((code) => code.trim()).filter(Boolean))
      )
      if (codes.length === 0) {
        return NextResponse.json([])
      }
      
      const { data, error } = await supabase
        .from('shipments')
        .select('external_code')
        .in('external_code', codes)

      if (error) {
        throw error
      }
        
      const duplicates = Array.from(new Set(data?.map(row => row.external_code) || []))
      return NextResponse.json(duplicates)
    }
    
    // 2. Query normal list with pagination and search
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '10', 10)
    const searchCode = searchParams.get('external_code')
    const searchName = searchParams.get('receiver_name')
    const searchStore = searchParams.get('store_name')
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')
    
    let query = supabase
      .from('shipments')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)
      
    // Exclude system rules from the shipments list
    query = query.or('external_code.is.null,external_code.neq.SYSTEM_RULE_CONFIG')
      
    if (searchCode) {
      query = query.ilike('external_code', `%${searchCode}%`)
    }
    
    if (searchName) {
      query = query.ilike('receiver_name', `%${searchName}%`)
    }
    
    if (searchStore) {
      query = query.ilike('store_name', `%${searchStore}%`)
    }
    
    if (startDate) {
      query = query.gte('created_at', startDate)
    }
    
    if (endDate) {
      query = query.lte('created_at', endDate)
    }
    
    const { data, count, error } = await query
    
    if (error) {
      throw error
    }
    
    const formattedData = (data || []).map(mapRowToV2)
    
    return NextResponse.json({
      data: formattedData,
      total: count || 0,
      page,
      limit
    })
    
  } catch (error) {
    console.error('Shipments query API error:', error)
    return NextResponse.json({ 
      error: `查询失败: ${(error as Error).message || '未知错误'}` 
    }, { status: 500 })
  }
}

// POST /api/shipments - Bulk insert shipments with V1 fallback self-healing
export async function POST(request: NextRequest) {
  try {
    if (!isSupabaseConfigured) {
      return NextResponse.json({ error: 'Supabase 未配置，无法提交运单' }, { status: 503 })
    }

    const shipments: ShipmentData[] = await request.json()
    if (!Array.isArray(shipments) || shipments.length === 0) {
      return NextResponse.json({ error: '必须包含要导入的运单数组' }, { status: 400 })
    }
    
    const result: ImportResult = {
      success: 0,
      failed: 0,
      failedRows: [],
      failedReasons: []
    }

    const v2Rows = shipments.map(mapShipmentToV2Insert)
    const { error: v2Error } = await supabase
      .from('shipments')
      .insert(v2Rows)

    if (!v2Error) {
      result.success = shipments.length
      return NextResponse.json(result)
    }

    const shouldFallbackToV1 =
      v2Error.message.includes('sku_code') ||
      v2Error.message.includes('store_name') ||
      v2Error.code === 'PGRST204'

    if (!shouldFallbackToV1) {
      result.failed = shipments.length
      result.failedRows = shipments.map((_, index) => index)
      result.failedReasons?.push({
        message: v2Error.message || '数据库批量写入失败',
      })
      return NextResponse.json(result)
    }

    console.warn('V2 table insert failed due to column mapping. Switching to V1 fallback schema.')

    const v1Rows = shipments.map(mapShipmentToV1Insert)
    const { error: v1Error } = await supabase
      .from('shipments')
      .insert(v1Rows)

    if (v1Error) {
      result.failed = shipments.length
      result.failedRows = shipments.map((_, index) => index)
      result.failedReasons?.push({
        message: `V2 表结构不可用，V1 兼容批量写入也失败：${v1Error.message}`,
      })
    } else {
      result.success = shipments.length
    }

    return NextResponse.json(result)
    
    /*
    // Legacy row-by-row insert path. Disabled because bulk insert above is much faster.
    // Check if we should insert with V2 columns first, or immediately fallback
    // We try to write the first row to determine if V2 columns exist
    let useV1Fallback = false
    
    for (let i = 0; i < shipments.length; i++) {
      const row = shipments[i]
      
      if (!useV1Fallback) {
        // Try V2 insert
        const { error } = await supabase
          .from('shipments')
          .insert({
            external_code: row.external_code || null,
            store_name: row.store_name || '',
            receiver_name: row.receiver_name || '',
            receiver_phone: row.receiver_phone || '',
            receiver_address: row.receiver_address || '',
            sku_code: row.sku_code,
            sku_name: row.sku_name,
            sku_quantity: row.sku_quantity,
            sku_spec: row.sku_spec || '',
            remark: row.remark || ''
          })
          
        if (error) {
          if (error.message.includes('sku_code') || error.message.includes('store_name') || error.code === 'PGRST204') {
            console.warn('V2 table insert failed due to column mapping. Switching to V1 fallback schema.')
            useV1Fallback = true
            // Perform fallback insertion for this row
            const fallbackErr = await insertV1Row(row)
            if (fallbackErr) {
              result.failed++
              result.failedRows.push(i)
              result.failedReasons?.push({
                rowIndex: i + 1,
                message: `V2 表结构不可用，V1 兼容写入也失败：${fallbackErr.message}`
              })
            } else {
              result.success++
            }
          } else {
            console.error('V2 Insert failed:', error.message)
            result.failed++
            result.failedRows.push(i)
            result.failedReasons?.push({
              rowIndex: i + 1,
              message: error.message || '数据库写入失败'
            })
          }
        } else {
          result.success++
        }
      } else {
        // Direct V1 Insert
        const fallbackErr = await insertV1Row(row)
        if (fallbackErr) {
          result.failed++
          result.failedRows.push(i)
          result.failedReasons?.push({
            rowIndex: i + 1,
            message: fallbackErr.message || 'V1 兼容写入失败'
          })
        } else {
          result.success++
        }
      }
    }
    
    return NextResponse.json(result)
    */
    
  } catch (error) {
    console.error('Shipments save API error:', error)
    return NextResponse.json({ 
      error: `运单提交失败: ${(error as Error).message || '未知错误'}` 
    }, { status: 500 })
  }
}

// DELETE /api/shipments?id=xxx - Delete a shipment
export async function DELETE(request: NextRequest) {
  try {
    if (!isSupabaseConfigured) {
      return NextResponse.json({ error: 'Supabase 未配置，无法删除运单' }, { status: 503 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    
    if (!id) {
      return NextResponse.json({ error: '必须指定要删除的运单ID' }, { status: 400 })
    }
    
    const { error } = await supabase
      .from('shipments')
      .delete()
      .eq('id', id)
      
    if (error) {
      throw error
    }
    
    return NextResponse.json({ success: true })
    
  } catch (error) {
    console.error('Shipment delete API error:', error)
    return NextResponse.json({ 
      error: `删除失败: ${(error as Error).message || '未知错误'}` 
    }, { status: 500 })
  }
}

function mapShipmentToV2Insert(row: ShipmentData) {
  return {
    external_code: row.external_code || null,
    store_name: row.store_name || '',
    receiver_name: row.receiver_name || '',
    receiver_phone: row.receiver_phone || '',
    receiver_address: row.receiver_address || '',
    sku_code: row.sku_code,
    sku_name: row.sku_name,
    sku_quantity: row.sku_quantity,
    sku_spec: row.sku_spec || '',
    remark: row.remark || '',
  }
}

function mapShipmentToV1Insert(row: ShipmentData) {
  const name = row.receiver_name || row.store_name || '收货门店'

  return {
    external_code: row.external_code || null,
    sender_name: row.sku_code,
    sender_phone: row.sku_spec || '',
    sender_address: row.sku_name,
    receiver_name: name,
    receiver_phone: row.receiver_phone || '',
    receiver_address: row.receiver_address || '',
    weight: 0,
    quantity: row.sku_quantity,
    temperature: '常温',
    remark: row.remark || '',
  }
}

// Fallback helper to write V2 row to V1 columns
async function insertV1Row(row: ShipmentData) {
  // Store store_name or receiver_name in receiver_name
  const name = row.receiver_name || row.store_name || '收货门店'
  
  const { error } = await supabase
    .from('shipments')
    .insert({
      external_code: row.external_code || null,
      sender_name: row.sku_code,         // sku_code -> sender_name
      sender_phone: row.sku_spec || '',  // sku_spec -> sender_phone
      sender_address: row.sku_name,      // sku_name -> sender_address
      receiver_name: name,
      receiver_phone: row.receiver_phone || '',
      receiver_address: row.receiver_address || '',
      weight: 0,                         // V1 column not null default
      quantity: row.sku_quantity,        // sku_quantity -> quantity
      temperature: '常温',                // V1 column not null default
      remark: row.remark || ''
    })
    
  return error
}
