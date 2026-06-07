// src/app/api/parse-file/route.ts

import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import mammoth from 'mammoth'

export async function POST(request: NextRequest) {
  try {
    console.log('[parse-file] Starting file parsing...')
    
    let formData
    try {
      formData = await request.formData()
      console.log('[parse-file] FormData parsed successfully')
    } catch (formError) {
      console.error('[parse-file] Failed to parse form data:', formError)
      return NextResponse.json({ 
        error: `解析表单数据失败: ${(formError as Error).message}` 
      }, { status: 400 })
    }
    
    const file = formData.get('file') as File | null
    
    if (!file) {
      console.warn('[parse-file] No file received')
      return NextResponse.json({ error: '没有接收到上传的文件' }, { status: 400 })
    }
    
    console.log(`[parse-file] File received: ${file.name}, size: ${file.size} bytes`)
    
    let buffer: Buffer
    try {
      buffer = Buffer.from(await file.arrayBuffer())
      console.log('[parse-file] File converted to buffer successfully')
    } catch (bufferError) {
      console.error('[parse-file] Failed to convert file to buffer:', bufferError)
      return NextResponse.json({ 
        error: `读取文件内容失败: ${(bufferError as Error).message}` 
      }, { status: 500 })
    }
    
    const filename = file.name || 'document'
    const extension = filename.split('.').pop()?.toLowerCase() || ''
    
    console.log(`[parse-file] File extension: .${extension}`)
    
    // 1. Process Excel (.xlsx, .xls)
    if (extension === 'xlsx' || extension === 'xls') {
      try {
        console.log('[parse-file] Processing Excel file...')
        const workbook = XLSX.read(buffer, { type: 'buffer' })
        console.log(`[parse-file] Excel workbook loaded, sheets: ${workbook.SheetNames.join(', ')}`)
        
        const sheets: { name: string; data: string[][] }[] = []
        
        workbook.SheetNames.forEach((sheetName) => {
          const worksheet = workbook.Sheets[sheetName]
          const jsonData = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            raw: false,
            blankrows: true,
          }) as string[][]
          
          const dataGrid = jsonData.map((row) => {
            if (!row) return []
            return row.map(cell => (cell === null || cell === undefined) ? '' : String(cell).trim())
          })
          
          sheets.push({ name: sheetName, data: dataGrid })
        })
        
        console.log(`[parse-file] Excel parsing completed, total rows across sheets: ${sheets.reduce((acc, s) => acc + s.data.length, 0)}`)
        
        return NextResponse.json({
          type: 'excel',
          fileName: filename,
          sheets
        })
      } catch (excelError) {
        console.error('[parse-file] Excel parsing failed:', excelError)
        return NextResponse.json({ 
          error: `解析Excel文件失败: ${(excelError as Error).message}` 
        }, { status: 500 })
      }
    }
    
    // 2. Process Word (.docx)
    if (extension === 'docx') {
      try {
        console.log('[parse-file] Processing Word file...')
        const result = await mammoth.extractRawText({ buffer })
        const text = result.value || ''
        const lines = text.split(/\r?\n/).map(line => line.trim())
        
        console.log(`[parse-file] Word parsing completed, ${lines.length} lines extracted`)
        
        return NextResponse.json({
          type: 'word',
          fileName: filename,
          lines
        })
      } catch (wordError) {
        console.error('[parse-file] Word parsing failed:', wordError)
        return NextResponse.json({ 
          error: `解析Word文件失败: ${(wordError as Error).message}` 
        }, { status: 500 })
      }
    }
    
    // 3. Process PDF (.pdf)
    if (extension === 'pdf') {
      try {
        console.log('[parse-file] Processing PDF file using pdf2json...')
        
        const pdf2jsonModule = await import('pdf2json')
        const PDFParser = pdf2jsonModule.default || pdf2jsonModule.PDFParser
        
        const pdfParser = new PDFParser()
        
        const text = await new Promise<string>((resolve, reject) => {
          pdfParser.on('pdfParser_dataError', (error) => {
            reject(error)
          })
          
          pdfParser.on('pdfParser_dataReady', (pdfData) => {
            let extractedText = ''
            for (let pageNum = 0; pageNum < pdfData.Pages.length; pageNum++) {
              const page = pdfData.Pages[pageNum]
              for (const textLine of page.Texts) {
                let lineText = ''
                for (const textItem of textLine.R) {
                  lineText += textItem.T
                }
                extractedText += decodeURIComponent(lineText) + '\n'
              }
              extractedText += '\n'
            }
            resolve(extractedText)
          })
          
          pdfParser.parseBuffer(buffer)
        })
        
        const lines = text.split(/\r?\n/).map(line => line.trim())
        
        console.log(`[parse-file] PDF parsing completed, ${lines.length} lines extracted`)
        
        return NextResponse.json({
          type: 'pdf',
          fileName: filename,
          lines
        })
      } catch (pdfError) {
        console.error('[parse-file] PDF parsing failed:', pdfError)
        return NextResponse.json({ 
          error: `解析PDF文件失败: ${(pdfError as Error).message}` 
        }, { status: 500 })
      }
    }

    console.warn(`[parse-file] Unsupported file format: .${extension}`)
    return NextResponse.json({ error: `不支持的文件格式: .${extension}` }, { status: 400 })
    
  } catch (error) {
    console.error('[parse-file] Unexpected error:', error)
    return NextResponse.json({ 
      error: `服务器内部错误: ${(error as Error).message || '未知错误'}` 
    }, { status: 500 })
  }
}
