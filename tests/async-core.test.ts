import { describe, expect, it } from 'vitest'
import { parseExcelWithRule, estimateExcelDataRows } from '../src/utils/ruleEngine'
import { buildShardSheet } from '../src/lib/import/fileParser'
import { checkDuplicates, validateRow } from '../src/utils/validator'
import type { ParsingRule, PreviewRow } from '../src/types'

const rule: ParsingRule = {
  name: 'test-standard',
  file_type: 'excel',
  structure_type: 'standard',
  config: {
    header_row_index: 0,
    data_start_row_index: 1,
    column_mappings: {
      external_code: '外部编码',
      store_name: '收货门店',
      receiver_name: '收件人姓名',
      receiver_phone: '收件人电话',
      receiver_address: '收件人地址',
      sku_code: 'SKU编码',
      sku_name: 'SKU名称',
      sku_quantity: 'SKU数量',
    },
  },
}

const source = [{
  name: '订单数据',
  data: [
    ['外部编码', '收货门店', '收件人姓名', '收件人电话', '收件人地址', 'SKU编码', 'SKU名称', 'SKU数量'],
    ['ORD-1', '门店A', '', '', '', 'SKU_00001', '商品1', '2'],
    ['ORD-2', '门店B', '', '', '', 'SKU_00002', '商品2', '3'],
    ['ORD-3', '门店C', '', '', '', 'SKU_00003', '商品3', '4'],
  ],
}]

describe('async import core', () => {
  it('estimates and shards standard Excel rows', () => {
    const plans = estimateExcelDataRows(source, rule)
    expect(plans[0].totalDataRows).toBe(3)

    const shard = buildShardSheet(source, rule, plans[0], 1, 3)
    expect(shard[0].data).toHaveLength(3)
    expect(parseExcelWithRule(shard, rule).map((row) => row.external_code)).toEqual(['ORD-2', 'ORD-3'])
  })

  it('returns required, phone and quantity validation errors', () => {
    const errors = validateRow({ sku_code: '', sku_name: '', sku_quantity: 0, receiver_phone: '123' }, 8)
    expect(errors.map((error) => error.message)).toEqual(expect.arrayContaining(['必填字段缺失', '电话格式错误', '数量必须为正数']))
  })

  it('marks duplicate external code and SKU rows within a batch', () => {
    const rows: PreviewRow[] = [
      { external_code: 'ORD-1', sku_code: 'SKU-1', sku_name: 'A', sku_quantity: 1, store_name: '门店', receiver_name: '', receiver_phone: '', receiver_address: '', sku_spec: '', remark: '', rowIndex: 1, errors: [], isDuplicate: false },
      { external_code: 'ORD-1', sku_code: 'SKU-1', sku_name: 'A', sku_quantity: 1, store_name: '门店', receiver_name: '', receiver_phone: '', receiver_address: '', sku_spec: '', remark: '', rowIndex: 2, errors: [], isDuplicate: false },
    ]
    const result = checkDuplicates(rows)
    expect(result.every((row) => row.isDuplicate)).toBe(true)
    expect(result[1].duplicateWith).toBe(1)
  })
})
