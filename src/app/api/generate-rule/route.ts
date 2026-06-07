// src/app/api/generate-rule/route.ts

import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'
import { ParsingConfig, ParsingRule, ShipmentData } from '@/types'
import { parseExcelWithRule, parseTextWithRule } from '@/utils/ruleEngine'
import { validateRow } from '@/utils/validator'

type ParsedFilePayload = {
  type: 'excel' | 'word' | 'pdf'
  fileName?: string
  sheets?: { name: string; data: string[][] }[]
  lines?: string[]
}

type ReferenceRuleMatch = {
  rule: ParsingRule
  totalRows: number
  validRows: number
  score: number
}

type AiMetadata = Record<string, { status: 'confident' | 'guessed' | 'not_found'; reason: string }>

const FIELD_KEYWORDS: Record<keyof ShipmentData, string[]> = {
  external_code: ['配送单号', '汇总单号', '单据号', '订单号', '外部编码', '单号', '编号', 'code', 'order'],
  store_name: ['收货机构', '收货门店', '门店', '调入门店', '店铺', '机构', 'store'],
  receiver_name: ['收货人', '收件人', '联系人', '姓名', 'receiver', 'consignee'],
  receiver_phone: ['收货电话', '收件电话', '联系电话', '手机', '电话', 'phone', 'tel'],
  receiver_address: ['收货地址', '收件地址', '地址', 'address'],
  sku_code: ['物品编码', '商品编码', 'SKU编码', '外部商品编码', '商品条码', '条码', '编码', 'sku'],
  sku_name: ['物品名称', '商品名称', 'SKU名称', '品名', '名称', 'name'],
  sku_quantity: ['发货数量', '出库数量', '数量', '订货数量', '应发数量', 'qty', 'quantity'],
  sku_spec: ['规格型号', '规格', '型号', 'spec'],
  remark: ['备注', '说明', 'remark', 'note'],
  id: [],
  created_at: [],
  sender_name: [],
  sender_phone: [],
  sender_address: [],
  weight: [],
  quantity: [],
  temperature: [],
}

const TARGET_FIELDS: (keyof ShipmentData)[] = [
  'external_code',
  'store_name',
  'receiver_name',
  'receiver_phone',
  'receiver_address',
  'sku_code',
  'sku_name',
  'sku_quantity',
  'sku_spec',
  'remark',
]

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as ParsedFilePayload
    const { type, sheets, lines } = payload

    if (!type || !['excel', 'word', 'pdf'].includes(type)) {
      return NextResponse.json({ error: '缺少有效的文件类型' }, { status: 400 })
    }

    const llmRule = await tryGenerateWithLlm(payload)
    if (llmRule) {
      return NextResponse.json(llmRule)
    }

    const fallback = generateHeuristicRule(payload)
    return NextResponse.json({
      ...fallback,
      hit_cache: false,
      warning: process.env.LLM_API_KEY
        ? 'AI 服务调用失败，已使用本地启发式规则生成。'
        : '未配置 LLM_API_KEY，已使用本地启发式规则生成。',
    })
  } catch (error) {
    console.error('AI Rule API error:', error)
    return NextResponse.json({
      error: `规则生成失败：${(error as Error).message || '未知错误'}`,
    }, { status: 500 })
  }
}

async function tryGenerateWithLlm(payload: ParsedFilePayload) {
  const apiKey = process.env.LLM_API_KEY
  if (!apiKey) return null

  const baseUrl = process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1'
  const model = process.env.LLM_MODEL || 'deepseek-chat'
  const sample = buildSample(payload)
  const demoContext = await buildDemoReferenceContext(payload.type)

  const systemPrompt = `你是物流导入系统的解析规则专家。请根据样本生成纯 JSON 规则，不要输出 Markdown。

可用结构类型：
- standard：标准表格
- matrix：门店/日期在列头的矩阵转置
- card：多段卡片式记录
- free_text：Word/PDF 自由文本

输出 JSON 格式：
{
  "name": "规则名称",
  "structure_type": "standard|matrix|card|free_text",
  "config": {},
  "ai_metadata": {
    "field_name": { "status": "confident|guessed|not_found", "reason": "原因" }
  }
}

目标字段：
external_code, store_name, receiver_name, receiver_phone, receiver_address,
sku_code, sku_name, sku_quantity, sku_spec, remark。

规则配置需符合系统 ParsingConfig，例如：
header_row_index, data_start_row_index, data_end_marker, column_mappings,
merge_sheets, meta_extractors, group_by_field, group_fill_fields,
store_columns_start, store_columns_end, sku_fields_mapping,
card_start_pattern, card_receiver_offsets,
free_text_receiver_patterns, free_text_sequence_item。`

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              `当前文件名：${payload.fileName || 'unknown'}`,
              `文件类型：${payload.type}`,
              `当前上传样本数据：\n${sample}`,
              `demos 参考样本摘要：\n${demoContext || '无同类型 demos 参考样本'}`,
            ].join('\n\n'),
          },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
    })

    if (!response.ok) {
      throw new Error(`LLM HTTP ${response.status}`)
    }

    const llmResult = await response.json()
    const content = llmResult.choices?.[0]?.message?.content || ''
    const ruleJson = parseJsonObject(content)

    if (!ruleJson?.config) {
      throw new Error('LLM 返回内容缺少 config')
    }

    const rule: ParsingRule = {
      name: String(ruleJson.name || 'AI 推荐解析规则'),
      file_type: payload.type,
      structure_type: normalizeStructureType(ruleJson.structure_type),
      config: normalizeParsingConfig(ruleJson.config),
    }

    if (!isRuleUsableForPayload(payload, rule)) {
      throw new Error('LLM 生成的规则无法解析当前样本，回退到本地样本规则识别')
    }

    return {
      rule,
      ai_metadata: ruleJson.ai_metadata || {},
      hit_cache: false,
    }
  } catch (error) {
    console.error('LLM rule generation failed, fallback to heuristic:', error)
    return null
  }
}

async function tryGenerateFromReferenceRules(payload: ParsedFilePayload) {
  const matches = evaluateReferenceRules(payload)
  const bestMatch = matches[0]

  if (!bestMatch || bestMatch.totalRows === 0 || bestMatch.validRows === 0 || bestMatch.score < 8) {
    return null
  }

  const rule: ParsingRule = {
    ...bestMatch.rule,
    id: undefined,
    name: `AI 推荐：${bestMatch.rule.name}`,
    description: [
      bestMatch.rule.description || '',
      `根据 demos/已保存规则试跑命中：解析 ${bestMatch.totalRows} 行，有效 ${bestMatch.validRows} 行。`,
    ].filter(Boolean).join('\n'),
    file_type: payload.type,
    config: normalizeParsingConfig(bestMatch.rule.config),
  }

  return {
    rule,
    ai_metadata: buildMetadataFromRuleConfig(rule.config),
    hit_cache: true,
    warning: '已根据 demos 样本规则库匹配到可用规则，可直接微调或试解析。',
  }
}

function evaluateReferenceRules(payload: ParsedFilePayload): ReferenceRuleMatch[] {
  const rules = loadSavedRules().filter(rule => rule.file_type === payload.type)

  return rules
    .map((rule) => {
      try {
        const normalizedRule = { ...rule, config: normalizeParsingConfig(rule.config) }
        const rows = payload.type === 'excel'
          ? parseExcelWithRule(payload.sheets || [], normalizedRule)
          : parseTextWithRule(payload.lines || [], normalizedRule)
        const validRows = rows.filter((row, index) => validateRow(row, index + 1).length === 0).length
        const totalRows = rows.length
        const fieldScore = countMappedFields(normalizedRule.config)
        const score = validRows * 10 + Math.min(totalRows, 20) + fieldScore
        return { rule: normalizedRule, totalRows, validRows, score }
      } catch {
        return { rule, totalRows: 0, validRows: 0, score: 0 }
      }
    })
    .filter(match => match.totalRows > 0)
    .sort((left, right) => right.score - left.score)
}

function isRuleUsableForPayload(payload: ParsedFilePayload, rule: ParsingRule) {
  try {
    const normalizedRule = { ...rule, config: normalizeParsingConfig(rule.config) }
    const rows = payload.type === 'excel'
      ? parseExcelWithRule(payload.sheets || [], normalizedRule)
      : parseTextWithRule(payload.lines || [], normalizedRule)

    if (rows.length === 0) return false

    const validRows = rows.filter((row, index) => validateRow(row, index + 1).length === 0).length
    return validRows > 0
  } catch (error) {
    console.warn('Generated rule validation failed:', error)
    return false
  }
}

function loadSavedRules(): ParsingRule[] {
  try {
    const filePath = path.join(process.cwd(), 'saved_rules.json')
    const content = fs.readFileSync(filePath, 'utf8')
    const rules = JSON.parse(content)
    return Array.isArray(rules) ? rules : []
  } catch (error) {
    console.warn('Failed to load saved_rules.json as AI references:', error)
    return []
  }
}

function countMappedFields(config: ParsingConfig) {
  const mappedFields = new Set<string>()
  Object.keys(config.column_mappings || {}).forEach(field => mappedFields.add(field))
  Object.keys(config.free_text_receiver_patterns || {}).forEach(field => mappedFields.add(field))
  Object.keys(config.default_values || {}).forEach(field => mappedFields.add(field))
  ;(config.meta_extractors || []).forEach(extractor => mappedFields.add(String(extractor.field)))
  return mappedFields.size
}

function buildMetadataFromRuleConfig(config: ParsingConfig): AiMetadata {
  const metadata: AiMetadata = {}
  const mappedFields = new Set<string>()

  Object.keys(config.column_mappings || {}).forEach(field => mappedFields.add(field))
  Object.keys(config.free_text_receiver_patterns || {}).forEach(field => mappedFields.add(field))
  Object.keys(config.default_values || {}).forEach(field => mappedFields.add(field))
  ;(config.meta_extractors || []).forEach(extractor => mappedFields.add(String(extractor.field)))

  TARGET_FIELDS.forEach((field) => {
    metadata[field] = mappedFields.has(field)
      ? { status: 'confident', reason: '根据 demos/已保存参考规则映射得到。' }
      : { status: 'not_found', reason: '参考规则中未映射该字段，请在表单中补充。' }
  })

  return metadata
}

async function buildDemoReferenceContext(type: ParsedFilePayload['type']) {
  try {
    const demosDir = path.join(process.cwd(), 'demos')
    if (!fs.existsSync(demosDir)) return ''

    const files = fs.readdirSync(demosDir)
      .filter(file => isDemoFileOfType(file, type))
      .slice(0, 6)

    const summaries = await Promise.all(files.map(file => summarizeDemoFile(path.join(demosDir, file), file, type)))
    return summaries.filter(Boolean).join('\n\n')
  } catch (error) {
    console.warn('Failed to build demos reference context:', error)
    return ''
  }
}

function isDemoFileOfType(fileName: string, type: ParsedFilePayload['type']) {
  const ext = path.extname(fileName).toLowerCase()
  if (type === 'excel') return ext === '.xlsx' || ext === '.xls'
  if (type === 'word') return ext === '.docx'
  if (type === 'pdf') return ext === '.pdf'
  return false
}

async function summarizeDemoFile(filePath: string, fileName: string, type: ParsedFilePayload['type']) {
  if (type === 'excel') {
    const workbook = XLSX.readFile(filePath)
    const sheets = workbook.SheetNames.slice(0, 2).map((sheetName) => {
      const worksheet = workbook.Sheets[sheetName]
      const data = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        raw: false,
        blankrows: true,
      }) as string[][]
      return {
        name: sheetName,
        data: data.slice(0, 12).map(row => (row || []).map(cell => String(cell || '').trim())),
      }
    })
    return JSON.stringify({ fileName, type, sheets })
  }

  if (type === 'pdf') {
    const lines = await extractPdfLines(filePath)
    return JSON.stringify({ fileName, type, lines: lines.slice(0, 80) })
  }

  return JSON.stringify({ fileName, type })
}

async function extractPdfLines(filePath: string) {
  const pdf2jsonModule = await import('pdf2json')
  const PDFParser = pdf2jsonModule.default || pdf2jsonModule.PDFParser
  const pdfParser = new PDFParser()
  const buffer = fs.readFileSync(filePath)

  const text = await new Promise<string>((resolve, reject) => {
    pdfParser.on('pdfParser_dataError', reject)
    pdfParser.on('pdfParser_dataReady', (pdfData) => {
      let extractedText = ''
      for (const page of pdfData.Pages || []) {
        for (const textLine of page.Texts || []) {
          let lineText = ''
          for (const textItem of textLine.R || []) {
            lineText += textItem.T
          }
          extractedText += `${decodeURIComponent(lineText)}\n`
        }
        extractedText += '\n'
      }
      resolve(extractedText)
    })
    pdfParser.parseBuffer(buffer)
  })

  return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
}

function generateHeuristicRule(payload: ParsedFilePayload) {
  if (payload.type === 'excel' && payload.sheets?.length) {
    return generateExcelRule(payload.sheets)
  }

  if (payload.type === 'word' || payload.type === 'pdf') {
    return generateTextRule(payload.type, payload.lines || [])
  }

  return generateExcelRule([{ name: 'Sheet1', data: [] }])
}

function generateExcelRule(sheets: { name: string; data: string[][] }[]) {
  const firstSheet = sheets[0]
  const rows = firstSheet.data || []
  const headerRowIndex = findBestHeaderRow(rows)
  const headers = (rows[headerRowIndex] || []).map(cell => String(cell || '').trim())
  const columnMappings = buildColumnMappings(headers)
  const metadata = buildMetadataFromMappings(columnMappings)
  const config: ParsingConfig = {
    header_row_index: headerRowIndex,
    data_start_row_index: headerRowIndex + 1,
    data_end_marker: '合计',
    column_mappings: columnMappings,
    skip_row_patterns: ['合计', '总计'],
    min_filled_cells: 2,
  }

  const firstTitle = String(rows[0]?.[0] || '')
  if (sheets.length > 1 && firstTitle.includes('出库单')) {
    config.merge_sheets = true
    config.meta_extractors = [{
      field: 'store_name',
      source_type: 'search_regex',
      pattern: '^(.+?)出库单$',
    }]
  }

  const cardStart = rows.some(row => row.some(cell => /调拨记录|记录\s*#/.test(String(cell || ''))))
  if (cardStart) {
    const rule: ParsingRule = {
      name: 'AI 推荐卡片式解析规则',
      file_type: 'excel',
      structure_type: 'card',
      config: {
        card_start_pattern: '调拨记录',
        card_receiver_offsets: {
          store_name: { r: 1, c: 1 },
          receiver_name: { r: 1, c: 3 },
          receiver_phone: { r: 1, c: 5 },
          receiver_address: { r: 2, c: 1 },
        },
        card_table_header_relative_row: 3,
        card_table_data_start_relative_row: 4,
        column_mappings: {
          sku_code: '物品编码',
          sku_name: '物品名称',
          sku_spec: '规格',
          sku_quantity: '数量',
        },
        min_filled_cells: 2,
      },
    }
    return { rule, ai_metadata: buildMetadataFromRuleConfig(rule.config), hit_cache: false }
  }

  const matrixInfo = detectMatrix(headers)
  if (matrixInfo) {
    const rule: ParsingRule = {
      name: 'AI 推荐矩阵转置解析规则',
      file_type: 'excel',
      structure_type: 'matrix',
      config: {
        header_row_index: headerRowIndex,
        data_start_row_index: headerRowIndex + 1,
        store_columns_start: matrixInfo.start,
        store_columns_end: matrixInfo.end,
        sku_fields_mapping: {
          sku_code: columnMappings.sku_code,
          sku_name: columnMappings.sku_name,
          sku_spec: columnMappings.sku_spec,
        },
        skip_row_patterns: ['合计', '总计'],
        min_filled_cells: 2,
      },
    }
    return { rule, ai_metadata: buildMetadataFromRuleConfig(rule.config), hit_cache: false }
  }

  const rule: ParsingRule = {
    name: sheets.length > 1 ? 'AI 推荐多 Sheet 解析规则' : 'AI 推荐标准表格解析规则',
    file_type: 'excel',
    structure_type: 'standard',
    config,
  }

  return { rule, ai_metadata: buildMetadataFromRuleConfig(rule.config), hit_cache: false }
}

function generateTextRule(type: 'word' | 'pdf', lines: string[]) {
  const hasZbwpSequence = lines.some(line => /^ZBWP\d+$/.test(String(line || '').trim()))
  const config: ParsingConfig = {
    free_text_receiver_patterns: {
      external_code: '单据编号：\\s*(.+)',
      store_name: '收货机构：\\s*(.+)',
      receiver_name: '收货人：\\s*(.+)',
      receiver_phone: '收货电话：\\s*(.+)',
      receiver_address: '收货地址：\\s*(.+)',
    },
  }

  if (hasZbwpSequence) {
    config.free_text_sequence_item = {
      item_start_pattern: '^\\d+$',
      sku_code_pattern: '^ZBWP\\d+$',
      sku_code_lookahead: 3,
      sku_name_offset: 1,
      quantity_strategy: 'last_number',
      sku_spec_between_name_and_quantity: true,
      sku_spec_max_lines: 1,
      skip_line_patterns: [
        '^物品类别$',
        '^物品编码$',
        '^物品名称$',
        '^规格型号$',
        '^订货单位$',
        '^发货数量$',
        '^备注$',
        '^第\\d+页',
        '^页$',
      ],
    }
  }

  const rule: ParsingRule = {
    name: type === 'pdf' ? 'AI 推荐 PDF 文本解析规则' : 'AI 推荐 Word 文本解析规则',
    file_type: type,
    structure_type: 'free_text',
    config,
  }

  return {
    rule,
    ai_metadata: buildDefaultTextMetadata(),
    hit_cache: false,
  }
}

function findBestHeaderRow(rows: string[][]) {
  let bestIndex = 0
  let bestScore = -1

  rows.slice(0, 30).forEach((row, rowIndex) => {
    const rowText = row.map(cell => String(cell || '').trim()).join(' ')
    const score = TARGET_FIELDS.reduce((total, field) => {
      return total + FIELD_KEYWORDS[field].filter(keyword => includesIgnoreCase(rowText, keyword)).length
    }, 0)

    if (score > bestScore) {
      bestScore = score
      bestIndex = rowIndex
    }
  })

  return bestIndex
}

function buildColumnMappings(headers: string[]) {
  const mappings: Record<string, string> = {}

  TARGET_FIELDS.forEach((field) => {
    const match = headers.find(header =>
      FIELD_KEYWORDS[field].some(keyword => includesIgnoreCase(header, keyword))
    )
    if (match) {
      mappings[field] = match
    }
  })

  return mappings
}

function buildMetadataFromMappings(mappings: Record<string, string>): AiMetadata {
  const metadata: AiMetadata = {}

  TARGET_FIELDS.forEach((field) => {
    if (mappings[field]) {
      metadata[field] = {
        status: 'guessed',
        reason: `根据表头“${mappings[field]}”匹配。`,
      }
    } else {
      metadata[field] = {
        status: 'not_found',
        reason: '未在样本表头中识别到对应字段，请手动补充。',
      }
    }
  })

  return metadata
}

function buildDefaultTextMetadata(): AiMetadata {
  const metadata: AiMetadata = {}
  TARGET_FIELDS.forEach((field) => {
    metadata[field] = {
      status: ['external_code', 'store_name', 'receiver_name', 'receiver_phone', 'receiver_address'].includes(field)
        ? 'guessed'
        : 'not_found',
      reason: '根据文本常见标签生成默认正则，可在规则中继续调整。',
    }
  })
  return metadata
}

function detectMatrix(headers: string[]) {
  const skuColumnIndexes = ['sku_code', 'sku_name', 'sku_spec']
    .map(field => headers.findIndex(header => FIELD_KEYWORDS[field as keyof ShipmentData].some(keyword => includesIgnoreCase(header, keyword))))
    .filter(index => index >= 0)

  if (skuColumnIndexes.length < 2) return null

  const maxSkuIndex = Math.max(...skuColumnIndexes)
  const candidateStart = maxSkuIndex + 1
  const candidateHeaders = headers.slice(candidateStart).filter(Boolean)
  if (candidateHeaders.length < 2) return null

  const numericLikeColumns = candidateHeaders.filter(header =>
    !['库存', '数量', '单位', '状态', '规格', '编码', '名称'].some(keyword => header.includes(keyword))
  )

  if (numericLikeColumns.length < 2) return null

  return {
    start: candidateStart,
    end: headers.length - 1,
  }
}

function buildSample(payload: ParsedFilePayload) {
  if (payload.type === 'excel') {
    return JSON.stringify(
      (payload.sheets || []).slice(0, 3).map(sheet => ({
        name: sheet.name,
        data: sheet.data.slice(0, 30),
      }))
    )
  }

  return JSON.stringify((payload.lines || []).slice(0, 120))
}

function parseJsonObject(content: string) {
  const clean = content.replace(/```json/g, '').replace(/```/g, '').trim()
  const start = clean.indexOf('{')
  const end = clean.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('未找到 JSON 对象')
  }
  return JSON.parse(clean.slice(start, end + 1))
}

function normalizeParsingConfig(config: unknown): ParsingConfig {
  if (!config || typeof config !== 'object') return {}

  const normalized = { ...(config as ParsingConfig) }

  if (normalized.meta_extractors && !Array.isArray(normalized.meta_extractors)) {
    const rawExtractors = normalized.meta_extractors as unknown
    if (
      rawExtractors &&
      typeof rawExtractors === 'object' &&
      'field' in rawExtractors &&
      'source_type' in rawExtractors
    ) {
      normalized.meta_extractors = [rawExtractors as NonNullable<ParsingConfig['meta_extractors']>[number]]
    } else {
      normalized.meta_extractors = []
    }
  }

  if (normalized.free_text_sku_patterns && !Array.isArray(normalized.free_text_sku_patterns)) {
    normalized.free_text_sku_patterns = [String(normalized.free_text_sku_patterns)]
  }

  ;(['carry_forward_fields', 'group_fill_fields', 'skip_row_patterns', 'record_separators'] as const).forEach((key) => {
    const value = normalized[key] as unknown
    if (value !== undefined && !Array.isArray(value)) {
      normalized[key] = [String(value)] as never
    }
  })

  return normalized
}

function normalizeStructureType(value: unknown): ParsingRule['structure_type'] {
  if (value === 'matrix' || value === 'card' || value === 'free_text' || value === 'standard') {
    return value
  }
  return 'standard'
}

function includesIgnoreCase(text: string, keyword: string) {
  return text.toLowerCase().includes(keyword.toLowerCase())
}
