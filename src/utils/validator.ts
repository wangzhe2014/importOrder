// src/utils/validator.ts

import { ShipmentData, ImportError, PreviewRow, REQUIRED_FIELDS } from '@/types'

export function validateRow(row: Partial<ShipmentData>, rowIndex: number): ImportError[] {
  const errors: ImportError[] = []

  REQUIRED_FIELDS.forEach((field) => {
    const value = row[field]
    if (value === undefined || value === null || String(value).trim() === '') {
      errors.push({
        rowIndex,
        field: field.toString(),
        message: '必填字段缺失',
      })
    }
  })

  const storeName = String(row.store_name || '').trim()
  const receiverName = String(row.receiver_name || '').trim()
  const receiverPhone = String(row.receiver_phone || '').trim()
  const receiverAddress = String(row.receiver_address || '').trim()

  const hasStore = storeName !== ''
  const hasReceiver = receiverName !== '' && receiverPhone !== '' && receiverAddress !== ''

  if (!hasStore && !hasReceiver) {
    errors.push({
      rowIndex,
      field: 'store_name',
      message: '收货门店，或收件人姓名+电话+地址二选一必填',
    })

    if (receiverName === '') {
      errors.push({
        rowIndex,
        field: 'receiver_name',
        message: '收件人姓名必填（B组）',
      })
    }

    if (receiverPhone === '') {
      errors.push({
        rowIndex,
        field: 'receiver_phone',
        message: '收件人电话必填（B组）',
      })
    }

    if (receiverAddress === '') {
      errors.push({
        rowIndex,
        field: 'receiver_address',
        message: '收件人地址必填（B组）',
      })
    }
  }

  if (receiverPhone !== '' && !validatePhone(receiverPhone)) {
    errors.push({
      rowIndex,
      field: 'receiver_phone',
      message: '电话格式错误',
    })
  }

  if (row.sku_quantity !== undefined && row.sku_quantity !== null) {
    const quantity = parseFloat(String(row.sku_quantity))
    if (Number.isNaN(quantity) || quantity <= 0) {
      errors.push({
        rowIndex,
        field: 'sku_quantity',
        message: '数量必须为正数',
      })
    }
  }

  return errors
}

export function validatePhone(phone: string): boolean {
  const phoneRegex = /^1[3-9]\d{9}$|^0\d{2,3}-?\d{7,8}$/
  return phoneRegex.test(phone.replace(/\s/g, ''))
}

export function checkDuplicates(rows: PreviewRow[]): PreviewRow[] {
  const result: PreviewRow[] = rows.map((row): PreviewRow => ({
    ...row,
    isDuplicate: row.duplicateSource === 'database',
    duplicateWith: row.duplicateSource === 'database' ? row.duplicateWith : undefined,
    duplicateSource: row.duplicateSource === 'database' ? 'database' : undefined,
  }))
  const rowKeyMap = new Map<string, number[]>()

  result.forEach((row, index) => {
    const code = String(row.external_code || '').trim()
    const skuCode = String(row.sku_code || '').trim()
    if (!code || !skuCode) return

    const key = `${code}::${skuCode}`
    if (!rowKeyMap.has(key)) {
      rowKeyMap.set(key, [])
    }
    rowKeyMap.get(key)!.push(index)
  })

  rowKeyMap.forEach((indices) => {
    if (indices.length <= 1) return

    indices.forEach((index) => {
      const otherIndex = indices.find((currentIndex) => currentIndex !== index)
      if (otherIndex === undefined) return

      result[index].isDuplicate = true
      result[index].duplicateSource = 'batch'
      result[index].duplicateWith = result[otherIndex].rowIndex
    })
  })

  return result
}

export function validateAll(data: Partial<ShipmentData>[]): PreviewRow[] {
  const previewRows: PreviewRow[] = data.map((row, index) => {
    const rowIndex = index + 1
    const errors = validateRow(row, rowIndex)
    return {
      ...(row as ShipmentData),
      rowIndex,
      errors,
      isDuplicate: false,
    }
  })

  return checkDuplicates(previewRows)
}

export function hasErrors(rows: PreviewRow[]): boolean {
  return rows.some((row) => row.errors.length > 0 || row.isDuplicate)
}

export function getAllErrors(rows: PreviewRow[]): ImportError[] {
  const allErrors: ImportError[] = []

  rows.forEach((row) => {
    allErrors.push(...row.errors)

    if (row.isDuplicate && row.duplicateWith !== undefined) {
      allErrors.push({
        rowIndex: row.rowIndex,
        field: 'external_code',
        message:
          row.duplicateSource === 'database'
            ? '外部编码与数据库已有运单重复'
            : `与第 ${row.duplicateWith} 行外部编码重复`,
      })
    }
  })

  return allErrors
}
