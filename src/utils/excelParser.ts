import * as XLSX from 'xlsx'

export interface ParsedSheet {
  headers: string[]
  rows: Record<string, string>[][]
}

export function parseExcel(file: File): Promise<ParsedSheet[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result as ArrayBuffer
        const workbook = XLSX.read(data, { type: 'array' })
        
        const sheets: ParsedSheet[] = []
        
        workbook.SheetNames.forEach((sheetName) => {
          const worksheet = workbook.Sheets[sheetName]
          const jsonData = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            raw: false,
            blankrows: false,
          }) as string[][]
          
          if (jsonData.length === 0) return
          
          const headers = jsonData[0].map((h) => String(h || '').trim())
          const rows: Record<string, string>[][] = []
          
          for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i]
            if (!row || row.every((cell) => cell === '' || cell === undefined || cell === null)) {
              continue
            }
            
            const mappedRow: Record<string, string>[] = []
            row.forEach((cell, index) => {
              const header = headers[index] || `column_${index}`
              mappedRow.push({ [header]: String(cell || '') })
            })
            rows.push(mappedRow)
          }
          
          sheets.push({ headers, rows })
        })
        
        resolve(sheets)
      } catch (error) {
        reject(new Error('文件解析失败，请确保上传的是有效的Excel文件'))
      }
    }
    
    reader.onerror = () => {
      reject(new Error('文件读取失败'))
    }
    
    reader.readAsArrayBuffer(file)
  })
}

export function exportToExcel(data: Record<string, any>[], filename: string): void {
  const worksheet = XLSX.utils.json_to_sheet(data)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, '运单数据')
  
  XLSX.writeFile(workbook, `${filename}.xlsx`)
}
