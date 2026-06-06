// src/app/api/generate-rule/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { ParsingRule, ParsingConfig } from '@/types'

const PRE_BAKED_RULES: Record<string, ParsingRule> = {}

function detectExcelTemplate(sheets: { name: string; data: string[][] }[]): string | null {
  return null
}

function detectTextTemplate(lines: string[], type: 'word' | 'pdf'): string | null {
  return null
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, sheets, lines } = body
    
    let templateKey: string | null = null
    if (type === 'excel' && sheets) {
      templateKey = detectExcelTemplate(sheets)
    } else if ((type === 'word' || type === 'pdf') && lines) {
      templateKey = detectTextTemplate(lines, type)
    }
    
    if (templateKey && PRE_BAKED_RULES[templateKey]) {
      const rule = PRE_BAKED_RULES[templateKey]
      
      const metadata: Record<string, any> = {}
      const allFields = ['external_code', 'store_name', 'receiver_name', 'receiver_phone', 'receiver_address', 'sku_code', 'sku_name', 'sku_quantity', 'sku_spec', 'remark']
      
      allFields.forEach(f => {
        metadata[f] = {
          status: 'confident',
          reason: '智能比对命中系统内置的高精度模板规则特征。'
        }
      })
      
      return NextResponse.json({
        rule,
        ai_metadata: metadata,
        hit_cache: true
      })
    }
    
    const apiKey = process.env.LLM_API_KEY
    const baseUrl = process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1'
    const model = process.env.LLM_MODEL || 'deepseek-chat'
    
    if (apiKey) {
      const sample = type === 'excel' 
        ? JSON.stringify(sheets[0]?.data.slice(0, 30)) 
        : JSON.stringify(lines.slice(0, 80))
      
      const systemPrompt = `你是一个物流系统的高级文件解析专家。

任务：分析该文件的结构（类型为 ${type}）并生成一套用于解析该文件的 JSON 规则配置。

文件分析要点：
1. 识别文件结构类型：
   - standard（标准表格）：常规表格，每行是一条记录
   - matrix（矩阵转置）：门店/日期作为列头横向排列
   - card（卡片式）：纵向堆叠的独立卡片区域
   - free_text（纯文本）：Word/PDF纯文本格式，无表格

2. 处理各种复杂场景：
   - 干扰头部：跳过非数据行（公司名称、日期、业务状态等）
   - 尾部信息提取：收货信息可能在数据区之外的独立行
   - 跨行聚合：同一配送单号的多行物品共享收货人信息
   - 矩阵转置：将门店/日期列转置为独立记录
   - 多Sheet合并：遍历所有Sheet合并解析
   - 卡片边界识别：识别卡片起始标志
   - 复合单元格拆分：单个单元格内含多行文本需拆分
   - PDF多订单拆分：识别分隔线/页面边界

3. 确定表头行位置、数据起始行位置、数据结束标记（如"合计"行）
4. 识别收货信息的位置（固定单元格、尾部区域、每行中或纯文本正则匹配）
5. 识别SKU表格的列结构和字段映射

规则配置必须符合以下 ParsingConfig TypeScript 接口格式：

interface ParsingConfig {
  merge_sheets?: boolean
  sheet_name_pattern?: string
  header_row_index?: number
  data_start_row_index?: number
  data_end_marker?: string
  
  store_columns_start?: number
  store_columns_end?: number
  store_name_column?: number
  sku_fields_mapping?: {
    sku_code?: string
    sku_name?: string
    sku_spec?: string
  }
  composite_cell_split?: boolean
  composite_cell_pattern?: string
  
  card_start_pattern?: string
  card_receiver_offsets?: {
    store_name?: { r: number, c: number }
    receiver_name?: { r: number, c: number }
    receiver_phone?: { r: number, c: number }
    receiver_address?: { r: number, c: number }
  }
  card_table_header_relative_row?: number
  card_table_data_start_relative_row?: number

  column_mappings?: {
    [field: string]: string
  }
  default_values?: { [field: string]: any }
  static_fields?: { [field: string]: any }
  carry_forward_fields?: string[]
  group_by_field?: string
  group_fill_fields?: string[]
  skip_row_patterns?: string[]
  min_filled_cells?: number
  
  meta_extractors?: Array<{
    field: string
    source_type: 'cell' | 'search_regex'
    coordinate?: string
    pattern?: string
  }>
  
  record_separator?: string
  free_text_receiver_patterns?: {
    store_name?: string
    receiver_name?: string
    receiver_phone?: string
    receiver_address?: string
    external_code?: string
  }
  free_text_sku_pattern?: string
  free_text_sku_fields?: {
    sku_code?: number
    sku_name?: number
    sku_spec?: number
    sku_quantity?: number
    remark?: number
  }
}

字段映射说明：
- external_code: 外部编码（配送单号等）
- store_name: 收货门店（A组）
- receiver_name: 收件人姓名（B组）
- receiver_phone: 收件人电话（B组）
- receiver_address: 收件人地址（B组）
- sku_code: SKU物品编码
- sku_name: SKU物品名称
- sku_quantity: SKU发货数量
- sku_spec: SKU规格型号
- remark: 备注

输出格式必须是纯 JSON，不能包裹 markdown 块或额外的文字：
{
  "name": "推荐的解析规则名称",
  "structure_type": "standard|matrix|card|free_text",
  "config": { ... ParsingConfig ... },
  "ai_metadata": {
    "字段名": {
      "status": "confident|guessed|not_found",
      "reason": "匹配原因说明"
    }
  }
}`

      const userPrompt = `这里是文件的采样数据：\n${sample}\n\n请分析文件结构并生成规则配置 JSON。`
      
      try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature: 0.1,
            response_format: { type: 'json_object' }
          })
        })
        
        const llmResult = await response.json()
        const contentStr = llmResult.choices?.[0]?.message?.content || ''
        const ruleJson = JSON.parse(contentStr.replace(/```json/g, '').replace(/```/g, '').trim())
        
        const rule: ParsingRule = {
          name: ruleJson.name || '智能推荐解析规则',
          file_type: type,
          structure_type: ruleJson.structure_type || 'standard',
          config: ruleJson.config || {}
        }
        
        return NextResponse.json({
          rule,
          ai_metadata: ruleJson.ai_metadata || {},
          hit_cache: false
        })
        
      } catch (err) {
        console.error('LLM API Call failed, falling back to heuristic:', err)
      }
    }
    
    const config: ParsingConfig = {
      header_row_index: 0,
      data_start_row_index: 1,
      column_mappings: {}
    }
    
    const metadata: Record<string, any> = {}
    
    if (type === 'excel' && sheets && sheets[0]?.data?.length) {
      const mappings: Record<string, string> = {}
      
      const keywordMap: Record<string, string[]> = {
        external_code: ['单号', '订单', '编码', 'code', 'order', '编号'],
        store_name: ['门店', '收货机构', '收货部门', '机构', 'store', '部门'],
        receiver_name: ['收货人', '收件人', '联系人', 'consignee', 'receiver', '姓名'],
        receiver_phone: ['电话', '手机', '联系方式', 'phone', 'tel', '手机'],
        receiver_address: ['地址', '送货', '收货', 'address', '住址'],
        sku_code: ['商品编码', '物品编码', 'SKU编码', '商品货号', '编码', 'barcode', '条码'],
        sku_name: ['商品名称', '物品名称', 'SKU名称', '名称', 'name', '品名'],
        sku_quantity: ['数量', '件数', '发货数量', 'quantity', 'qty', '出库数量'],
        sku_spec: ['规格', '型号', '规格型号', 'spec'],
        remark: ['备注', '说明', 'remark', 'note']
      }

      let bestHeaderRowIndex = 0
      let bestHeaderScore = -1
      const sampleRows = sheets[0].data.slice(0, 20)
      sampleRows.forEach((row: string[], rowIndex: number) => {
        const rowText = row.join(' ')
        const score = Object.values(keywordMap).flat().reduce((total, keyword) => {
          return total + (rowText.toLowerCase().includes(keyword.toLowerCase()) ? 1 : 0)
        }, 0)
        if (score > bestHeaderScore) {
          bestHeaderScore = score
          bestHeaderRowIndex = rowIndex
        }
      })

      const headers = sheets[0].data[bestHeaderRowIndex]
      config.header_row_index = bestHeaderRowIndex
      config.data_start_row_index = bestHeaderRowIndex + 1
      config.skip_row_patterns = ['合计', '总计']
      config.min_filled_cells = 2
      
      Object.entries(keywordMap).forEach(([field, keywords]) => {
        for (const kw of keywords) {
          const match = headers.find((h: string) => String(h).includes(kw))
          if (match) {
            mappings[field] = String(match).trim()
            metadata[field] = {
              status: 'guessed',
              reason: `启发式匹配：在表头查找到包含"${kw}"的列"${match}"。`
            }
            break
          }
        }
        if (!mappings[field]) {
          metadata[field] = {
            status: 'not_found',
            reason: `未能通过表头关键字推测此字段，请手动匹配。`
          }
        }
      })
      
      config.column_mappings = mappings
    }
    
    const rule: ParsingRule = {
      name: '系统自动识别模板规则',
      file_type: type,
      structure_type: 'standard',
      config
    }
    
    return NextResponse.json({
      rule,
      ai_metadata: metadata,
      hit_cache: false,
      warning: apiKey ? undefined : '未配置 LLM_API_KEY，系统已使用本地启发式算法进行规则预测，推荐您配置 API Key 获取最佳智能解析能力。'
    })
    
  } catch (error) {
    console.error('AI Rule API error:', error)
    return NextResponse.json({ 
      error: `规则预测生成失败: ${(error as Error).message || '未知错误'}` 
    }, { status: 500 })
  }
}
