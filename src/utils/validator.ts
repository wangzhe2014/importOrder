import { ShipmentData, ImportError, PreviewRow, REQUIRED_FIELDS, TEMPERATURE_OPTIONS } from '@/types';

export function validateRow(row: Partial<ShipmentData>, rowIndex: number): ImportError[] {
  const errors: ImportError[] = [];
  
  REQUIRED_FIELDS.forEach((field) => {
    const value = row[field];
    if (value === undefined || value === null || String(value).trim() === '') {
      errors.push({
        rowIndex,
        field: field.toString(),
        message: '必填字段缺失',
      });
    }
  });
  
  if (row.sender_phone && !validatePhone(String(row.sender_phone))) {
    errors.push({
      rowIndex,
      field: 'sender_phone',
      message: '电话格式错误',
    });
  }
  
  if (row.receiver_phone && !validatePhone(String(row.receiver_phone))) {
    errors.push({
      rowIndex,
      field: 'receiver_phone',
      message: '电话格式错误',
    });
  }
  
  if (row.weight !== undefined) {
    const weight = parseFloat(String(row.weight));
    if (isNaN(weight) || weight <= 0) {
      errors.push({
        rowIndex,
        field: 'weight',
        message: '重量必须为正数',
      });
    }
  }
  
  if (row.quantity !== undefined) {
    const quantity = parseInt(String(row.quantity), 10);
    if (isNaN(quantity) || quantity <= 0) {
      errors.push({
        rowIndex,
        field: 'quantity',
        message: '件数必须为正整数',
      });
    }
  }
  
  if (row.temperature && !TEMPERATURE_OPTIONS.includes(String(row.temperature))) {
    errors.push({
      rowIndex,
      field: 'temperature',
      message: `温层值必须是"常温"、"冷藏"或"冷冻"之一`,
    });
  }
  
  return errors;
}

function validatePhone(phone: string): boolean {
  const phoneRegex = /^1[3-9]\d{9}$|^0\d{2,3}-?\d{7,8}$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
}

export function checkDuplicates(rows: PreviewRow[]): PreviewRow[] {
  const result = [...rows];
  const externalCodeMap = new Map<string, number[]>();
  
  result.forEach((row, index) => {
    if (row.external_code) {
      const code = row.external_code.trim();
      if (code) {
        if (!externalCodeMap.has(code)) {
          externalCodeMap.set(code, []);
        }
        externalCodeMap.get(code)!.push(index);
      }
    }
  });
  
  externalCodeMap.forEach((indices) => {
    if (indices.length > 1) {
      indices.forEach((index) => {
        const otherIndices = indices.filter((i) => i !== index);
        result[index].isDuplicate = true;
        result[index].duplicateWith = otherIndices[0];
      });
    }
  });
  
  return result;
}

export function validateAll(data: Partial<ShipmentData>[]): PreviewRow[] {
  const previewRows: PreviewRow[] = data.map((row, index) => {
    const errors = validateRow(row, index + 2);
    return {
      ...row as ShipmentData,
      rowIndex: index + 2,
      errors,
      isDuplicate: false,
    };
  });
  
  return checkDuplicates(previewRows);
}

export function hasErrors(rows: PreviewRow[]): boolean {
  return rows.some((row) => row.errors.length > 0 || row.isDuplicate);
}

export function getAllErrors(rows: PreviewRow[]): ImportError[] {
  const allErrors: ImportError[] = [];
  rows.forEach((row) => {
    allErrors.push(...row.errors);
    if (row.isDuplicate && row.duplicateWith !== undefined) {
      allErrors.push({
        rowIndex: row.rowIndex,
        field: 'external_code',
        message: `与第 ${row.duplicateWith + 2} 行重复`,
      });
    }
  });
  return allErrors;
}
