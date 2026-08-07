// src/lib/import/skuValidation.ts
// SKU 主数据批量校验。优先 RPC 一次校验；迁移未执行时回退到并发分块查询。
// 查询超时或 DB 短暂失败时进入降级模式：本次跳过商品主数据校验，仅做本地格式校验。

import { PostgrestError } from '@supabase/supabase-js'
import { supabaseAdmin } from '../supabase-server'
import { SKU_CHECK_TIMEOUT_MS } from './constants'

export interface SkuValidationResult {
  validSkus: Set<string>
  degraded: boolean
  degradedReason?: string
}

const CHUNK = 500
const FALLBACK_CONCURRENCY = 6

function isMissingRpc(error: PostgrestError): boolean {
  return error.code === 'PGRST202' || error.message.includes('validate_sku_codes')
}

async function queryAllViaRpc(codes: string[]): Promise<string[]> {
  const { data, error } = await supabaseAdmin.rpc('validate_sku_codes', {
    p_sku_codes: codes,
  })
  if (error) throw error
  return (data || []).map((row: { sku_code: string }) => String(row.sku_code))
}

async function queryChunk(codes: string[]): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('sku_master')
    .select('sku_code')
    .in('sku_code', codes)
  if (error) throw error
  return (data || []).map((row: { sku_code: string }) => String(row.sku_code))
}

async function queryAllViaFallback(codes: string[]): Promise<string[]> {
  const chunks: string[][] = []
  for (let i = 0; i < codes.length; i += CHUNK) chunks.push(codes.slice(i, i + CHUNK))

  const found: string[] = []
  let next = 0
  const workers = Array.from({ length: Math.min(FALLBACK_CONCURRENCY, chunks.length) }, async () => {
    while (next < chunks.length) {
      const current = chunks[next]
      next += 1
      found.push(...await queryChunk(current))
    }
  })
  await Promise.all(workers)
  return found
}

async function queryAll(codes: string[]): Promise<string[]> {
  try {
    return await queryAllViaRpc(codes)
  } catch (error) {
    if (error && typeof error === 'object' && isMissingRpc(error as PostgrestError)) {
      return queryAllViaFallback(codes)
    }
    throw error
  }
}

export async function validateSkus(skuCodes: string[]): Promise<SkuValidationResult> {
  const unique = Array.from(new Set(skuCodes.map((c) => String(c).trim()).filter(Boolean)))
  if (unique.length === 0) {
    return { validSkus: new Set<string>(), degraded: false }
  }

  const validSkus = new Set<string>()

  let work: () => Promise<void>
  work = async () => {
    const found = await queryAll(unique)
    found.forEach((code) => validSkus.add(code))
  }

  try {
    await withTimeout(work, SKU_CHECK_TIMEOUT_MS, 'SKU master validation timed out')
    return { validSkus, degraded: false }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'SKU master validation failed'
    return {
      validSkus,
      degraded: true,
      degradedReason: reason,
    }
  }
}

function withTimeout<T>(fn: () => Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    fn().then(
      (val) => {
        clearTimeout(timer)
        resolve(val)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}
