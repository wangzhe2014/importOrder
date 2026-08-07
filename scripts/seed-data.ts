import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import { mkdirSync } from 'fs'
import { resolve } from 'path'
import { loadLocalEnv } from '../src/lib/load-env'

loadLocalEnv()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!supabaseUrl || !supabaseKey) throw new Error('缺少 Supabase 环境变量')

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
const SKU_TOTAL = 20_000
const ORDER_TOTAL = 10_000
const CHUNK_SIZE = 500

function buildSkus() {
  return Array.from({ length: SKU_TOTAL }, (_, index) => {
    const number = index + 1
    return {
      sku_code: `SKU_${String(number).padStart(5, '0')}`,
      name: `压测商品 ${number}`,
      spec: `规格-${(number % 20) + 1}`,
      unit: '件',
    }
  })
}

function buildOrders() {
  const rows: (string | number | null)[][] = [[
    '外部编码', '收货门店', '收件人姓名', '收件人电话', '收件人地址',
    'SKU编码', 'SKU名称', 'SKU数量', 'SKU规格', '备注',
  ]]
  for (let index = 1; index <= ORDER_TOTAL; index++) {
    const skuNumber = ((index - 1) % SKU_TOTAL) + 1
    const skuCode = index % 997 === 0 ? `INVALID_SKU_${index}` : `SKU_${String(skuNumber).padStart(5, '0')}`
    rows.push([
      index,
      'S',
      null,
      null,
      null,
      skuCode,
      'P',
      (index % 10) + 1,
      null,
      null,
    ])
  }
  return rows
}

async function resetSkuMaster() {
  const { error } = await supabase.from('sku_master').delete().like('sku_code', 'SKU_%')
  if (error) throw error
}

async function seedSkuMaster() {
  const rows = buildSkus()
  for (let index = 0; index < rows.length; index += CHUNK_SIZE) {
    const chunk = rows.slice(index, index + CHUNK_SIZE)
    const { error } = await supabase.from('sku_master').upsert(chunk, { onConflict: 'sku_code' })
    if (error) throw error
    process.stdout.write(`\rSKU ${Math.min(index + chunk.length, rows.length)}/${rows.length}`)
  }
  process.stdout.write('\n')
}

function writeOrderFile() {
  const outputDir = resolve(process.cwd(), '202607')
  mkdirSync(outputDir, { recursive: true })
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.aoa_to_sheet(buildOrders())
  XLSX.utils.book_append_sheet(workbook, worksheet, '订单数据')
  const outputPath = resolve(outputDir, '10000-orders.xlsx')
  XLSX.writeFile(workbook, outputPath, { compression: true })
  return outputPath
}

async function main() {
  console.log('清理旧压测 SKU...')
  await resetSkuMaster()
  console.log('写入 20000 条 SKU...')
  await seedSkuMaster()
  const outputPath = writeOrderFile()
  console.log(`已生成 ${ORDER_TOTAL} 行 Excel：${outputPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
