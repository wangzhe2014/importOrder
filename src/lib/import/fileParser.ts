// src/lib/import/fileParser.ts
// 文件读取 + Excel 分片构建。供上传接口预扫描 与 Worker 分片解析共用。

import * as XLSX from 'xlsx'
import mammoth from 'mammoth'
import { ParsingRule } from '@/types'
import { ExcelParsePlan } from '@/utils/ruleEngine'

export interface ParsedSheets {
  type: 'excel'
  sheets: { name: string; data: string[][] }[]
}

export interface ParsedLines {
  type: 'word' | 'pdf'
  lines: string[]
}

export type ParsedSource = ParsedSheets | ParsedLines

export function detectExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || ''
}

export function normalizeGrid(sheet: XLSX.WorkSheet): string[][] {
  const jsonData = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    blankrows: true,
  }) as (string | number | null)[][]

  return jsonData.map((row) => {
    if (!row) return []
    return row.map((cell) => (cell === null || cell === undefined ? '' : String(cell).trim()))
  })
}

export async function parseExcelBuffer(buffer: Buffer): Promise<ParsedSheets> {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheets = workbook.SheetNames.map((sheetName) => ({
    name: sheetName,
    data: normalizeGrid(workbook.Sheets[sheetName]),
  }))
  return { type: 'excel', sheets }
}

export async function parseWordBuffer(buffer: Buffer): Promise<ParsedLines> {
  const result = await mammoth.extractRawText({ buffer })
  const text = result.value || ''
  return { type: 'word', lines: text.split(/\r?\n/).map((line) => line.trim()) }
}

export async function parsePdfBuffer(buffer: Buffer): Promise<ParsedLines> {
  const pdf2jsonModule = await import('pdf2json')
  const PDFParser = pdf2jsonModule.default || pdf2jsonModule.PDFParser
  const parser = new PDFParser()

  const text = await new Promise<string>((resolve, reject) => {
    parser.on('pdfParser_dataError', reject)
    parser.on('pdfParser_dataReady', (pdfData: any) => {
      let extracted = ''
      for (const page of pdfData.Pages || []) {
        for (const textLine of page.Texts || []) {
          let lineText = ''
          for (const item of textLine.R || []) lineText += item.T
          extracted += decodeURIComponent(lineText) + '\n'
        }
        extracted += '\n'
      }
      resolve(extracted)
    })
    parser.parseBuffer(buffer)
  })

  return { type: 'pdf', lines: text.split(/\r?\n/).map((line) => line.trim()) }
}

export async function parseFileBuffer(
  buffer: Buffer,
  filename: string
): Promise<ParsedSource> {
  const ext = detectExtension(filename)
  if (ext === 'xlsx' || ext === 'xls') return parseExcelBuffer(buffer)
  if (ext === 'docx') return parseWordBuffer(buffer)
  if (ext === 'pdf') return parsePdfBuffer(buffer)
  return { type: 'pdf', lines: [] }
}

// 构建 Excel 分片：保留表头区 + 指定范围的原始数据行，
// 交给规则引擎独立解析，从而把大文件按行切成多个可重试处理单元。
export function buildShardSheet(
  fullSheets: { name: string; data: string[][] }[],
  rule: ParsingRule,
  plan: ExcelParsePlan,
  shardStartDataRow: number,
  shardEndDataRow: number
): { name: string; data: string[][] }[] {
  const full = fullSheets.find((s) => s.name === plan.name) || fullSheets[0]
  const sheetData = full.data
  const headerRegion = sheetData.slice(0, plan.dataStartRowIndex)
  const dataRows = sheetData.slice(
    plan.dataStartRowIndex + shardStartDataRow,
    plan.dataStartRowIndex + shardEndDataRow
  )
  return [{ name: plan.name, data: [...headerRegion, ...dataRows] }]
}

// 计算该文件本次任务所需的计划（用于 Worker 确定分片边界）
export function pickPrimaryPlan(plans: ExcelParsePlan[]): ExcelParsePlan | null {
  return plans.length > 0 ? plans[0] : null
}