export interface ShipmentData {
  id?: string
  external_code: string
  sender_name: string
  sender_phone: string
  sender_address: string
  receiver_name: string
  receiver_phone: string
  receiver_address: string
  weight: number
  quantity: number
  temperature: '常温' | '冷藏' | '冷冻'
  remark: string
  created_at?: string
}

export interface ColumnMapping {
  templateName: string
  mappings: {
    [key: string]: string
  }
  created_at: number
}

export interface ImportError {
  rowIndex: number
  field: string
  message: string
}

export interface PreviewRow extends ShipmentData {
  rowIndex: number
  errors: ImportError[]
  isDuplicate: boolean
  duplicateWith?: number
}

export interface TemplateMatch {
  templateName: string
  confidence: number
  mappings: {
    [key: string]: string
  }
}

export interface ImportResult {
  success: number
  failed: number
  failedRows: number[]
}

export const REQUIRED_FIELDS: (keyof ShipmentData)[] = [
  'sender_name',
  'sender_phone',
  'sender_address',
  'receiver_name',
  'receiver_phone',
  'receiver_address',
  'weight',
  'quantity',
  'temperature',
]

export const FIELD_DISPLAY_NAMES: Record<string, string> = {
  external_code: '外部编码',
  sender_name: '发件人姓名',
  sender_phone: '发件人电话',
  sender_address: '发件人地址',
  receiver_name: '收件人姓名',
  receiver_phone: '收件人电话',
  receiver_address: '收件人地址',
  weight: '重量(kg)',
  quantity: '件数',
  temperature: '温层',
  remark: '备注',
}

export const TEMPERATURE_OPTIONS = ['常温', '冷藏', '冷冻']
