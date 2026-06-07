// src/app/api/rules/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { ParsingRule } from '@/types'

// GET /api/rules - Fetch all saved rules
export async function GET() {
  try {
    if (!isSupabaseConfigured) {
      return NextResponse.json({ error: 'Supabase 未配置，无法读取规则库' }, { status: 503 })
    }

    const { data, error } = await supabase
      .from('parsing_rules')
      .select('*')
      .order('name', { ascending: true })

    if (error) {
      throw error
    }

    const rules: ParsingRule[] = (data || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      file_type: row.file_type,
      structure_type: row.structure_type,
      config: row.rule_config,
      is_builtin: Boolean(row.is_builtin),
    }))

    return NextResponse.json({ rules })
  } catch (error) {
    console.error('Rules fetch API error:', error)
    return NextResponse.json({
      error: `读取规则失败: ${(error as Error).message || '未知错误'}`
    }, { status: 500 })
  }
}

// POST /api/rules - Create or Update a rule
export async function POST(request: NextRequest) {
  try {
    const rule: ParsingRule = await request.json()
    if (!rule.name || !rule.file_type || !rule.structure_type || !rule.config) {
      return NextResponse.json({ error: '配置参数缺失' }, { status: 400 })
    }

    if (!isSupabaseConfigured) {
      return NextResponse.json({ error: 'Supabase 未配置，无法保存规则' }, { status: 503 })
    }

    try {
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
            rule_config: rule.config,
            is_builtin: Boolean(rule.is_builtin),
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
            rule_config: rule.config,
            is_builtin: Boolean(rule.is_builtin),
          })
        resError = error
      }
      
      if (resError) {
        throw resError
      }
      
      return NextResponse.json({ success: true, name: rule.name })
      
    } catch (dbError) {
      throw dbError
    }
    
  } catch (error) {
    console.error('Rules save API error:', error)
    return NextResponse.json({ 
      error: `保存规则失败: ${(error as Error).message || '未知错误'}` 
    }, { status: 500 })
  }
}

// PUT /api/rules - Update an existing rule by id or originalName
export async function PUT(request: NextRequest) {
  try {
    const payload = await request.json()
    const rule = payload as ParsingRule
    const originalName = typeof payload.originalName === 'string' ? payload.originalName : rule.name

    if (!rule.name || !rule.file_type || !rule.structure_type || !rule.config) {
      return NextResponse.json({ error: '配置参数缺失' }, { status: 400 })
    }

    try {
      if (!isSupabaseConfigured) {
        return NextResponse.json({ error: 'Supabase 未配置，无法更新规则' }, { status: 503 })
      }


      let updateQuery = supabase
        .from('parsing_rules')
        .update({
          name: rule.name,
          description: rule.description || '',
          file_type: rule.file_type,
          structure_type: rule.structure_type,
          rule_config: rule.config,
          is_builtin: Boolean(rule.is_builtin),
        })

      if (rule.id && !String(rule.id).startsWith('rule-')) {
        updateQuery = updateQuery.eq('id', rule.id)
      } else {
        updateQuery = updateQuery.eq('name', originalName)
      }

      const { data, error } = await updateQuery.select('id')

      if (error) {
        throw error
      }

      if (!data || data.length === 0) {
        return NextResponse.json({ error: '未找到要编辑的规则，请刷新后重试' }, { status: 404 })
      }

      return NextResponse.json({ success: true, name: rule.name })
    } catch (dbError) {
      throw dbError
    }
  } catch (error) {
    console.error('Rules update API error:', error)
    return NextResponse.json({
      error: `更新规则失败: ${(error as Error).message || '未知错误'}`
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

    if (!isSupabaseConfigured) {
      return NextResponse.json({ error: 'Supabase 未配置，无法删除规则' }, { status: 503 })
    }

    const { data: ruleForDelete, error: findError } = await supabase
      .from('parsing_rules')
      .select('id,is_builtin')
      .eq('name', name)
      .maybeSingle()

    if (findError) {
      throw findError
    }

    if (ruleForDelete?.is_builtin) {
      return NextResponse.json({ error: '内置规则不允许删除' }, { status: 403 })
    }

    try {
      const { error } = await supabase
        .from('parsing_rules')
        .delete()
        .eq('name', name)
        
      if (error) {
        throw error
      }
      
      return NextResponse.json({ success: true })
      
    } catch (dbError) {
      throw dbError
    }
  } catch (error) {
    console.error('Rules delete API error:', error)
    return NextResponse.json({ 
      error: `删除规则失败: ${(error as Error).message || '未知错误'}` 
    }, { status: 500 })
  }
}
