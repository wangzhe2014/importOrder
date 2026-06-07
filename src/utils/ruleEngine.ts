// src/utils/ruleEngine.ts

import { ShipmentData, ParsingRule, ParsingConfig, MetaExtractor } from '@/types'

// Helper to convert cell coordinate to indices (e.g. "B2" -> { r: 1, c: 1 }, "A9" -> { r: 8, c: 0 })
export function coordinateToRowCol(coord: string): { r: number; c: number } {
  const match = coord.toUpperCase().match(/^([A-Z]+)([0-9]+)$/)
  if (!match) return { r: 0, c: 0 }
  
  const colStr = match[1]
  const rowStr = match[2]
  
  // Convert column letters (A, B, C...) to index (0, 1, 2...)
  let c = 0
  for (let i = 0; i < colStr.length; i++) {
    c = c * 26 + (colStr.charCodeAt(i) - 64)
  }
  c = c - 1 // 0-indexed
  
  const r = parseInt(rowStr, 10) - 1 // 0-indexed
  
  return { r, c }
}

// Extract generic metadata from sheet data
function extractMetadata(sheetData: string[][], extractors: unknown = []): Partial<ShipmentData> {
  const meta: Partial<ShipmentData> = {}
  const normalizedExtractors: MetaExtractor[] = Array.isArray(extractors)
    ? extractors.filter((ext): ext is MetaExtractor => Boolean(ext && typeof ext === 'object'))
    : []
  
  normalizedExtractors.forEach((ext) => {
    if (ext.source_type === 'cell' && ext.coordinate) {
      const { r, c } = coordinateToRowCol(ext.coordinate)
      if (sheetData[r] && sheetData[r][c] !== undefined) {
        meta[ext.field] = String(sheetData[r][c] || '').trim() as any
      }
    } else if (ext.source_type === 'search_regex' && ext.pattern) {
      const regex = new RegExp(ext.pattern)
      // Scan all cells for a regex match
      for (let r = 0; r < sheetData.length; r++) {
        for (let c = 0; c < sheetData[r].length; c++) {
          const val = String(sheetData[r][c] || '')
          const match = val.match(regex)
          if (match && match[1]) {
            meta[ext.field] = match[1].trim() as any
            break
          }
        }
        if (meta[ext.field]) break
      }
    }
  })
  
  return meta
}

function shouldSkipRow(row: string[], config: ParsingConfig): boolean {
  const filledCells = row.filter(cell => String(cell || '').trim() !== '').length
  if (filledCells < (config.min_filled_cells ?? 1)) {
    return true
  }

  const rowText = row.map(cell => String(cell || '')).join(' ')
  return (config.skip_row_patterns || []).some(pattern => new RegExp(pattern).test(rowText))
}

function withConfiguredDefaults(
  rowData: Partial<ShipmentData>,
  config: ParsingConfig
): Partial<ShipmentData> {
  return {
    ...(config.default_values || {}),
    ...(config.static_fields || {}),
    ...rowData,
    created_at: rowData.created_at || new Date().toISOString(),
  }
}

function normalizeParsedRows(rows: ShipmentData[], config: ParsingConfig): ShipmentData[] {
  const carryForwardValues: Record<string, unknown> = {}
  const carriedRows = rows.map((row) => {
    const nextRow: Record<string, unknown> = { ...row }
    ;(config.carry_forward_fields || []).forEach((field) => {
      const value = nextRow[field]
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        carryForwardValues[field] = value
      } else if (carryForwardValues[field] !== undefined) {
        nextRow[field] = carryForwardValues[field]
      }
    })
    return nextRow as unknown as ShipmentData
  })

  if (!config.group_by_field || !config.group_fill_fields?.length) {
    return carriedRows
  }

  const groupedValues = new Map<string, Record<string, unknown>>()
  carriedRows.forEach((row) => {
    const groupValue = row[config.group_by_field!]
    const groupKey = String(groupValue || '').trim()
    if (!groupKey) return

    const existing = groupedValues.get(groupKey) || {}
    config.group_fill_fields!.forEach((field) => {
      const value = row[field]
      if (existing[field] === undefined && value !== undefined && value !== null && String(value).trim() !== '') {
        existing[field] = value
      }
    })
    groupedValues.set(groupKey, existing)
  })

  return carriedRows.map((row) => {
    const groupKey = String(row[config.group_by_field!] || '').trim()
    const groupValues = groupedValues.get(groupKey)
    if (!groupValues) return row

    const nextRow: Record<string, unknown> = { ...row }
    config.group_fill_fields!.forEach((field) => {
      const value = nextRow[field]
      if ((value === undefined || value === null || String(value).trim() === '') && groupValues[field] !== undefined) {
        nextRow[field] = groupValues[field]
      }
    })
    return nextRow as unknown as ShipmentData
  })
}

export function parseExcelWithRule(sheets: { name: string; data: string[][] }[], rule: ParsingRule): ShipmentData[] {
  const results: ShipmentData[] = []
  const { config } = rule
  
  // Decide sheets to parse
  let targetSheets = sheets
  if (config.merge_sheets === false) {
    targetSheets = [sheets[0]]
  } else if (config.sheet_name_pattern) {
    const regex = new RegExp(config.sheet_name_pattern)
    targetSheets = sheets.filter(s => regex.test(s.name))
  }
  
  targetSheets.forEach((sheet) => {
    const sheetData = sheet.data
    if (sheetData.length === 0) return
    
    // Extract metadata for the sheet (e.g. receiver info at fixed coordinates)
    const sheetMeta = extractMetadata(sheetData, config.meta_extractors)
    
    if (rule.structure_type === 'standard') {
      const headerRowIndex = config.header_row_index ?? 0
      const dataStartRowIndex = config.data_start_row_index ?? (headerRowIndex + 1)
      const headers = sheetData[headerRowIndex]?.map(h => String(h || '').trim()) || []
      
      const colMappings = config.column_mappings || {}
      
      for (let r = dataStartRowIndex; r < sheetData.length; r++) {
        const row = sheetData[r]
        if (!row) continue
        
        // Check end marker
        if (config.data_end_marker) {
          const rowStr = row.join(' ')
          if (rowStr.includes(config.data_end_marker)) {
            break
          }
        }

        if (shouldSkipRow(row, config)) continue
        
        const rowData: Partial<ShipmentData> = { ...sheetMeta }
        
        // Map columns
        Object.entries(colMappings).forEach(([targetField, sourceColName]) => {
          if (!sourceColName) return
          const colIndex = headers.indexOf(sourceColName)
          if (colIndex !== -1 && row[colIndex] !== undefined) {
            const val = String(row[colIndex]).trim()
            if (targetField === 'sku_quantity') {
              rowData.sku_quantity = parseInt(val, 10) || 0
            } else {
              rowData[targetField as keyof ShipmentData] = val as any
            }
          }
        })
        
        // Ensure defaults or backward compatibility
        const finalRow = withConfiguredDefaults(rowData, config)
        
        // Push only if there is at least SKU code or name
        if (finalRow.sku_code || finalRow.sku_name) {
          results.push(finalRow as ShipmentData)
        }
      }
    } 
    else if (rule.structure_type === 'matrix') {
      const headerRowIndex = config.header_row_index ?? 0
      const dataStartRowIndex = config.data_start_row_index ?? (headerRowIndex + 1)
      const headers = sheetData[headerRowIndex]?.map(h => String(h || '').trim()) || []
      
      const skuFields = config.sku_fields_mapping || {}
      const storeStart = config.store_columns_start ?? 0
      const storeEnd = config.store_columns_end ?? (headers.length - 1)
      
      for (let r = dataStartRowIndex; r < sheetData.length; r++) {
        const row = sheetData[r]
        if (!row) continue
        
        // Check end marker
        if (config.data_end_marker) {
          const rowStr = row.join(' ')
          if (rowStr.includes(config.data_end_marker)) {
            break
          }
        }

        if (shouldSkipRow(row, config)) continue
        
        // Extract SKU details from current row
        const skuData: Partial<ShipmentData> = {}
        Object.entries(skuFields).forEach(([field, headerName]) => {
          const idx = headers.indexOf(headerName)
          if (idx !== -1 && row[idx] !== undefined) {
            skuData[field as keyof ShipmentData] = String(row[idx]).trim() as any
          }
        })
        
        // Iterate through store columns
        for (let c = storeStart; c <= Math.min(storeEnd, row.length - 1); c++) {
          const cellVal = String(row[c] || '').trim()
          if (!cellVal || cellVal === '0' || cellVal === '') continue
          
          const storeName = config.store_name_column !== undefined
            ? String(row[config.store_name_column] || '').trim()
            : headers[c] || ''
            
          // If using store_name_column, column header is usually a Date, let's combine it into external_code
          const extCode = config.store_name_column !== undefined
            ? `${storeName}_${headers[c]}`
            : (skuData.external_code || sheetMeta.external_code || '')
          
          if (config.composite_cell_split) {
            // Split cell by line breaks (like in Weekly plans)
            const lines = cellVal.split(/[\r\n]+/)
            lines.forEach((line) => {
              const trimmedLine = line.trim()
              if (!trimmedLine) return
              
              let parsedSkuName = skuData.sku_name || ''
              let parsedQty = 0
              
              if (config.composite_cell_pattern) {
                const match = trimmedLine.match(new RegExp(config.composite_cell_pattern))
                if (match) {
                  parsedSkuName = match[1]?.trim() || parsedSkuName
                  parsedQty = parseInt(match[2] || '0', 10)
                }
              } else {
                // Default fallback: match item name and qty, e.g. "Item x 5" or "Item * 5" or "Item 5"
                const fallbackMatch = trimmedLine.match(/^(.+?)(?:\s*[x*]\s*|\s+)(\d+)$/)
                if (fallbackMatch) {
                  parsedSkuName = fallbackMatch[1].trim()
                  parsedQty = parseInt(fallbackMatch[2], 10)
                }
              }
              
              if (parsedQty > 0) {
                results.push(withConfiguredDefaults({
                  ...sheetMeta,
                  external_code: extCode,
                  store_name: storeName,
                  sku_code: skuData.sku_code || parsedSkuName, // Fallback code to name if not separate
                  sku_name: parsedSkuName,
                  sku_spec: skuData.sku_spec || '',
                  sku_quantity: parsedQty,
                  remark: skuData.remark || '',
                }, config) as ShipmentData)
              }
            })
          } else {
            // Single numeric quantity
            const qty = parseInt(cellVal, 10)
            if (qty > 0) {
              results.push(withConfiguredDefaults({
                ...sheetMeta,
                external_code: extCode,
                store_name: storeName,
                sku_code: skuData.sku_code || '',
                sku_name: skuData.sku_name || '',
                sku_spec: skuData.sku_spec || '',
                sku_quantity: qty,
                remark: skuData.remark || '',
              }, config) as ShipmentData)
            }
          }
        }
      }
    }
    else if (rule.structure_type === 'card') {
      const cardStartPattern = config.card_start_pattern || ''
      const regex = new RegExp(cardStartPattern)
      
      // Find all card start coordinates
      for (let r = 0; r < sheetData.length; r++) {
        for (let c = 0; c < sheetData[r].length; c++) {
          const val = String(sheetData[r][c] || '').trim()
          if (val && regex.test(val)) {
            // Found a card start cell!
            const cardMeta: Partial<ShipmentData> = { ...sheetMeta }
            
            // Extract receiver info using relative offsets
            if (config.card_receiver_offsets) {
              Object.entries(config.card_receiver_offsets).forEach(([field, offset]) => {
                const targetRow = r + offset.r
                const targetCol = c + offset.c
                if (sheetData[targetRow] && sheetData[targetRow][targetCol] !== undefined) {
                  cardMeta[field as keyof ShipmentData] = String(sheetData[targetRow][targetCol] || '').trim() as any
                }
              })
            }
            
            // Subtable header row
            const relHeader = config.card_table_header_relative_row ?? 3
            const relData = config.card_table_data_start_relative_row ?? (relHeader + 1)
            
            const headerRow = sheetData[r + relHeader] || []
            const subHeaders = headerRow.map(h => String(h || '').trim())
            
            const colMappings = config.column_mappings || {}
            
            // Scan subtable rows downwards until empty row or next card
            let currRelRow = relData
            while (r + currRelRow < sheetData.length) {
              const subRow = sheetData[r + currRelRow]
              if (!subRow || subRow.every(cell => String(cell || '').trim() === '')) {
                break // Empty row signals card boundary end
              }
              if (shouldSkipRow(subRow, config)) {
                currRelRow++
                continue
              }
              
              // If we hit next card header, stop
              const firstCell = String(subRow[c] || '').trim()
              if (firstCell && regex.test(firstCell)) {
                break
              }
              
              const rowData: Partial<ShipmentData> = { ...cardMeta }
              
              Object.entries(colMappings).forEach(([targetField, sourceColName]) => {
                if (!sourceColName) return
                const colIndex = subHeaders.indexOf(sourceColName)
                if (colIndex !== -1 && subRow[colIndex] !== undefined) {
                  const cellVal = String(subRow[colIndex]).trim()
                  if (targetField === 'sku_quantity') {
                    rowData.sku_quantity = parseInt(cellVal, 10) || 0
                  } else {
                    rowData[targetField as keyof ShipmentData] = cellVal as any
                  }
                }
              })
              
              const finalRow = withConfiguredDefaults(rowData, config)
              
              if (finalRow.sku_code || finalRow.sku_name) {
                results.push(finalRow as ShipmentData)
              }
              
              currRelRow++
            }
          }
        }
      }
    }
  })
  
  return normalizeParsedRows(results, config)
}

// Split raw text lines into blocks using multiple record separators and/or page boundaries
function splitTextBlocks(
  lines: string[],
  config: ParsingConfig
): string[][] {
  // Build list of all separators to detect
  const separators: string[] = []
  if (config.record_separators && config.record_separators.length > 0) {
    separators.push(...config.record_separators)
  }
  if (config.record_separator && !separators.includes(config.record_separator)) {
    separators.push(config.record_separator)
  }
  if (config.pdf_page_separator && !separators.includes(config.pdf_page_separator)) {
    separators.push(config.pdf_page_separator)
  }

  // If no separators configured, treat entire content as a single block
  if (separators.length === 0) {
    const nonEmpty = lines.filter(l => l.trim() !== '')
    return nonEmpty.length > 0 ? [nonEmpty] : []
  }

  const blocks: string[][] = []
  let currentBlock: string[] = []

  lines.forEach((line) => {
    const isSeparator = separators.some(sep => line.includes(sep))
    if (isSeparator) {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock)
        currentBlock = []
      }
    } else {
      currentBlock.push(line)
    }
  })
  if (currentBlock.length > 0) {
    blocks.push(currentBlock)
  }

  return blocks
}

// Extract metadata from a text block using regex patterns
function extractBlockMeta(
  blockLines: string[],
  config: ParsingConfig
): Partial<ShipmentData> {
  const meta: Partial<ShipmentData> = {}

  // Extract from standard patterns (search within the block)
  const patterns = config.free_text_receiver_patterns
  if (patterns) {
    Object.entries(patterns).forEach(([field, pattern]) => {
      if (!pattern) return
      const regex = new RegExp(pattern)
      for (const line of blockLines) {
        const match = line.match(regex)
        if (match && match[1]) {
          meta[field as keyof ShipmentData] = match[1].trim() as any
          break
        }
      }
    })
  }

  // Extract from "before" patterns (useful for info before the main block content)
  const beforePatterns = config.free_text_receiver_patterns_before
  if (beforePatterns) {
    Object.entries(beforePatterns).forEach(([field, pattern]) => {
      if (!pattern || meta[field as keyof ShipmentData]) return
      const regex = new RegExp(pattern)
      for (const line of blockLines) {
        const match = line.match(regex)
        if (match && match[1]) {
          meta[field as keyof ShipmentData] = match[1].trim() as any
          break
        }
      }
    })
  }

  // Extract using "编号:值" (key:value) format from embedded paragraph text
  const itemFields = config.free_text_item_fields
  if (itemFields) {
    Object.entries(itemFields).forEach(([field, pattern]) => {
      if (!pattern || meta[field as keyof ShipmentData]) return
      const regex = new RegExp(pattern)
      for (const line of blockLines) {
        const match = line.match(regex)
        if (match && match[1]) {
          meta[field as keyof ShipmentData] = match[1].trim() as any
          break
        }
      }
    })
  }

  return meta
}

// Build a list of SKU regex patterns to try
function buildSkuPatterns(config: ParsingConfig): { pattern: RegExp; fieldsMap: Record<string, number> }[] {
  const results: { pattern: RegExp; fieldsMap: Record<string, number> }[] = []
  const defaultFields = config.free_text_sku_fields || {}

  // Multiple patterns support
  if (config.free_text_sku_patterns && config.free_text_sku_patterns.length > 0) {
    config.free_text_sku_patterns.forEach((pat, idx) => {
      const fieldsMap = config.free_text_sku_fields_per_pattern?.[idx] || defaultFields
      results.push({ pattern: new RegExp(pat), fieldsMap })
    })
  }

  // Single pattern fallback
  if (config.free_text_sku_pattern) {
    results.push({ pattern: new RegExp(config.free_text_sku_pattern), fieldsMap: defaultFields })
  }

  return results
}

function parseSequenceItems(blockLines: string[], config: ParsingConfig): ShipmentData[] {
  const sequenceConfig = config.free_text_sequence_item
  if (!sequenceConfig) return []

  const startRegex = new RegExp(sequenceConfig.item_start_pattern)
  const codeRegex = new RegExp(sequenceConfig.sku_code_pattern)
  const lookahead = sequenceConfig.sku_code_lookahead ?? 4
  const skipRegexes = (sequenceConfig.skip_line_patterns || []).map(pattern => new RegExp(pattern))

  const isSkipped = (line: string) => skipRegexes.some(regex => regex.test(line))
  const isValidStart = (lineIndex: number) => {
    if (!startRegex.test(blockLines[lineIndex] || '')) return false
    if (startRegex.test(blockLines[lineIndex + 1] || '')) return false

    for (let offset = 1; offset <= lookahead && lineIndex + offset < blockLines.length; offset++) {
      if (codeRegex.test(blockLines[lineIndex + offset] || '')) {
        return true
      }
    }
    return false
  }

  const itemStarts: number[] = []
  blockLines.forEach((_, index) => {
    if (isValidStart(index)) {
      itemStarts.push(index)
    }
  })

  return itemStarts.flatMap((startIndex, itemIndex) => {
    const endIndex = itemStarts[itemIndex + 1] ?? blockLines.length
    const segment = blockLines
      .slice(startIndex, endIndex)
      .map(line => line.trim())
      .filter(line => line && !isSkipped(line))

    const codeIndex = segment.findIndex(line => codeRegex.test(line))
    if (codeIndex === -1) return []

    const skuCode = segment[codeIndex].match(codeRegex)?.[0] || ''
    const nameOffset = sequenceConfig.sku_name_offset ?? 1
    const nameIndex = codeIndex + nameOffset
    const skuName = segment[nameIndex] || ''

    let quantityIndex = -1
    if ((sequenceConfig.quantity_strategy || 'last_number') === 'last_number') {
      for (let index = segment.length - 1; index > codeIndex; index--) {
        if (/^\d+(?:\.\d+)?$/.test(segment[index])) {
          quantityIndex = index
          break
        }
      }
    }

    const skuQuantity = quantityIndex === -1 ? 0 : parseFloat(segment[quantityIndex])
    const specStart = nameIndex + 1
    const specEnd = quantityIndex === -1 ? segment.length : quantityIndex
    const specLines = segment.slice(specStart, specEnd)
    const limitedSpecLines = sequenceConfig.sku_spec_max_lines
      ? specLines.slice(0, sequenceConfig.sku_spec_max_lines)
      : specLines
    const skuSpec = sequenceConfig.sku_spec_between_name_and_quantity
      ? limitedSpecLines.join('')
      : ''

    if (!skuCode && !skuName) return []

    return [{
      sku_code: skuCode,
      sku_name: skuName,
      sku_spec: skuSpec,
      sku_quantity: skuQuantity,
    } as ShipmentData]
  })
}

export function parseTextWithRule(lines: string[], rule: ParsingRule): ShipmentData[] {
  const results: ShipmentData[] = []
  const { config } = rule

  // Step 1: Split text into blocks (each block = one order/shipment)
  const textBlocks = splitTextBlocks(lines, config)

  // Step 2: Process each block
  textBlocks.forEach((block) => {
    const blockMeta = extractBlockMeta(block, config)

    // Step 3: Extract SKU items within the block
    const skuPatternEntries = buildSkuPatterns(config)

    const sequenceRows = parseSequenceItems(block, config)
    if (sequenceRows.length > 0) {
      sequenceRows.forEach((row) => {
        const finalRow = withConfiguredDefaults({ ...blockMeta, ...row }, config)
        if (finalRow.sku_code || finalRow.sku_name) {
          results.push(finalRow as ShipmentData)
        }
      })
    } else if (skuPatternEntries.length > 0) {
      // Filter out empty lines for SKU matching
      const nonEmptyLines = block.filter(l => l.trim() !== '')

      nonEmptyLines.forEach((line) => {
        for (const { pattern, fieldsMap } of skuPatternEntries) {
          const match = line.match(pattern)
          if (match) {
            const rowData: Partial<ShipmentData> = { ...blockMeta }

            Object.entries(fieldsMap).forEach(([field, captureIndex]) => {
              const idx = captureIndex as number
              if (match[idx] !== undefined) {
                const val = match[idx].trim()
                if (field === 'sku_quantity') {
                  rowData.sku_quantity = parseInt(val, 10) || 0
                } else {
                  rowData[field as keyof ShipmentData] = val as any
                }
              }
            })

            const finalRow = withConfiguredDefaults(rowData, config)

            if (finalRow.sku_code || finalRow.sku_name) {
              results.push(finalRow as ShipmentData)
            }
            // Once matched, don't try other patterns for the same line
            break
          }
        }
      })
    } else {
      // No SKU pattern configured: treat entire block as a single record with extracted metadata
      const rowData: Partial<ShipmentData> = { ...blockMeta }
      results.push(withConfiguredDefaults(rowData, config) as ShipmentData)
    }
  })

  return normalizeParsedRows(results, config)
}
