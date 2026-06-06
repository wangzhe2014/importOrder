// src/app/api/rules/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { ParsingRule } from '@/types'
import fs from 'fs'
import path from 'path'

const LOCAL_RULES_PATH = path.join(process.cwd(), 'saved_rules.json')

// Helper to read local rules
function readLocalRules(): ParsingRule[] {
  try {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase 未配置，使用本地规则文件')
    }
    if (fs.existsSync(LOCAL_RULES_PATH)) {
      const content = fs.readFileSync(LOCAL_RULES_PATH, 'utf8')
      return JSON.parse(content) || []
    }
  } catch (error) {
    console.error('Failed to read local rules:', error)
  }
  return []
}

// Helper to write local rules
function writeLocalRules(rules: ParsingRule[]): void {
  try {
    fs.writeFileSync(LOCAL_RULES_PATH, JSON.stringify(rules, null, 2), 'utf8')
  } catch (error) {
    console.error('Failed to write local rules:', error)
  }
}

// GET /api/rules - Fetch all saved rules
export async function GET() {
  let supabaseRules: ParsingRule[] = []
  
  try {
    // 1. Try fetching from Supabase parsing_rules table
    const { data, error } = await supabase
      .from('parsing_rules')
      .select('*')
      .order('name', { ascending: true })
      
    if (error) {
      throw error
    }
    
    // Map database fields to front-end schema
    supabaseRules = (data || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      file_type: row.file_type,
      structure_type: row.structure_type,
      config: row.rule_config
    }))
    
  } catch (dbError) {
    console.warn('Supabase rules fetch failed:', (dbError as Error).message)
  }
  
  // 2. Always merge with local rules (for fallback consistency)
  const localRules = readLocalRules()
  
  // Merge: Supabase rules first, then local rules (deduped by name)
  const allRules = [...supabaseRules]
  const existingNames = new Set(supabaseRules.map(r => r.name))
  for (const rule of localRules) {
    if (!existingNames.has(rule.name)) {
      allRules.push(rule)
    }
  }
  
  return NextResponse.json({ rules: allRules })
}

// POST /api/rules - Create or Update a rule
export async function POST(request: NextRequest) {
  try {
    const rule: ParsingRule = await request.json()
    if (!rule.name || !rule.file_type || !rule.structure_type || !rule.config) {
      return NextResponse.json({ error: '配置参数缺失' }, { status: 400 })
    }
    
    try {
      if (!isSupabaseConfigured) {
        throw new Error('Supabase 未配置，使用本地规则文件')
      }
      // 1. Try inserting/updating in Supabase
      // Check if it exists
      const { data: existing } = await supabase
        .from('parsing_rules')
        .select('id')
        .eq('name', rule.name)
        .limit(1)
      
      let resError = null
      if (existing && existing.length > 0) {
        // Update
        const { error } = await supabase
          .from('parsing_rules')
          .update({
            description: rule.description || '',
            file_type: rule.file_type,
            structure_type: rule.structure_type,
            rule_config: rule.config
          })
          .eq('name', rule.name)
        resError = error
      } else {
        // Insert
        const { error } = await supabase
          .from('parsing_rules')
          .insert({
            name: rule.name,
            description: rule.description || '',
            file_type: rule.file_type,
            structure_type: rule.structure_type,
            rule_config: rule.config
          })
        resError = error
      }
      
      if (resError) {
        throw resError
      }
      
      return NextResponse.json({ success: true, name: rule.name })
      
    } catch (dbError) {
      console.warn('Supabase rules save failed, falling back to local file:', (dbError as Error).message)
      
      // 2. Fallback to local saved_rules.json
      const localRules = readLocalRules()
      const existingIndex = localRules.findIndex(r => r.name === rule.name)
      
      const savedRule = {
        ...rule,
        id: rule.id || Math.random().toString(36).substring(2, 9)
      }
      
      if (existingIndex >= 0) {
        localRules[existingIndex] = savedRule
      } else {
        localRules.push(savedRule)
      }
      
      writeLocalRules(localRules)
      return NextResponse.json({ success: true, name: rule.name, storage: 'local' })
    }
    
  } catch (error) {
    console.error('Rules save API error:', error)
    return NextResponse.json({ 
      error: `保存规则失败: ${(error as Error).message || '未知错误'}` 
    }, { status: 500 })
  }
}

// DELETE /api/rules?name=xxx - Delete a rule
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const name = searchParams.get('name')
    
    if (!name) {
      return NextResponse.json({ error: '必须指定要删除的规则名称' }, { status: 400 })
    }
    
    try {
      if (!isSupabaseConfigured) {
        throw new Error('Supabase 未配置，使用本地规则文件')
      }
      // 1. Try deleting from Supabase
      const { error } = await supabase
        .from('parsing_rules')
        .delete()
        .eq('name', name)
        
      if (error) {
        throw error
      }
      
      return NextResponse.json({ success: true })
      
    } catch (dbError) {
      console.warn('Supabase rules delete failed, falling back to local file:', (dbError as Error).message)
      
      // 2. Fallback to local saved_rules.json
      const localRules = readLocalRules()
      const filtered = localRules.filter(r => r.name !== name)
      writeLocalRules(filtered)
      
      return NextResponse.json({ success: true, storage: 'local' })
    }
  } catch (error) {
    console.error('Rules delete API error:', error)
    return NextResponse.json({ 
      error: `删除规则失败: ${(error as Error).message || '未知错误'}` 
    }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  return POST(request)
}
