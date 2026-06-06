// src/app/api/parse-with-rule/route.ts
// API wrapper for rule engine testing

import { NextRequest, NextResponse } from 'next/server'
import { parseExcelWithRule, parseTextWithRule } from '@/utils/ruleEngine'
import { ParsingRule } from '@/types'

export async function POST(request: NextRequest) {
  try {
    const { rule, parsedData } = await request.json()
    
    if (!rule || !parsedData) {
      return NextResponse.json({ error: '缺少规则或解析数据' }, { status: 400 })
    }
    
    let shipments: any[]
    
    if (parsedData.type === 'excel') {
      shipments = parseExcelWithRule(parsedData.sheets, rule as ParsingRule)
    } else {
      // word or pdf
      shipments = parseTextWithRule(parsedData.lines, rule as ParsingRule)
    }
    
    return NextResponse.json({
      success: true,
      shipments,
      count: shipments.length
    })
    
  } catch (error) {
    return NextResponse.json({
      error: `规则引擎解析失败: ${(error as Error).message}`
    }, { status: 500 })
  }
}
