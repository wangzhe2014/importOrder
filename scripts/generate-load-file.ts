import * as XLSX from 'xlsx'
import { mkdirSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const TOTAL_ROWS = 10_000
const SKU_TOTAL = 20_000
const INVALID_EVERY = 997
const outputDir = resolve(process.cwd(), '202607')
const outputPath = resolve(outputDir, '10000-orders.xlsx')
const manifestPath = resolve(outputDir, '10000-orders.manifest.json')

const headers = [
  '外部编码', '收货门店', '收件人姓名', '收件人电话', '收件人地址',
  'SKU编码', 'SKU名称', 'SKU数量', 'SKU规格', '备注',
]

function skuCode(index: number): string {
  return `SKU_${String(index).padStart(5, '0')}`
}

function buildRows() {
  const rows: (string | number)[][] = [headers]
  const invalidRows: number[] = []

  for (let row = 1; row <= TOTAL_ROWS; row++) {
    const invalid = row % INVALID_EVERY === 0
    const skuNumber = ((row * 7919) % SKU_TOTAL) + 1
    const code = invalid ? `INVALID_SKU_${String(row).padStart(5, '0')}` : skuCode(skuNumber)
    if (invalid) invalidRows.push(row + 1)

    rows.push([
      `LOADTEST_${String(row).padStart(5, '0')}`,
      `压测门店-${(row % 20) + 1}`,
      `测试收件人-${row}`,
      `138${String(row).padStart(8, '0')}`,
      `测试地址-${row}`,
      code,
      `压测商品-${skuNumber}`,
      (row % 10) + 1,
      `规格-${(skuNumber % 20) + 1}`,
      invalid ? '故意插入非法 SKU' : '压测数据',
    ])
  }

  return { rows, invalidRows }
}

function main() {
  mkdirSync(outputDir, { recursive: true })
  const { rows, invalidRows } = buildRows()
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.aoa_to_sheet(rows)
  XLSX.utils.book_append_sheet(workbook, worksheet, '订单数据')
  XLSX.writeFile(workbook, outputPath)

  writeFileSync(manifestPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    file: '10000-orders.xlsx',
    header_rows: 1,
    data_rows: TOTAL_ROWS,
    total_rows_in_sheet: TOTAL_ROWS + 1,
    sku_master_expected: SKU_TOTAL,
    invalid_sku_rows: invalidRows,
    columns: headers,
  }, null, 2), 'utf8')

  console.log(`生成完成: ${outputPath}`)
  console.log(`数据行: ${TOTAL_ROWS}，非法 SKU 行: ${invalidRows.length}`)
}

main()
