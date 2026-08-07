// src/app/api/import-tasks/route.ts
// 上传即返回：≤1s 返回 task_id。解析规则的确认在客户端完成，本接口只建任务 + 写 Outbox。

import { NextRequest, NextResponse } from 'next/server'
import Busboy from 'busboy'
import { Readable } from 'stream'
import { ParsingRule } from '@/types'
import { supabaseAdmin } from '@/lib/supabase-server'
import { newTraceId, writeTraceEvent } from '@/lib/trace'
import { detectExtension } from '@/lib/import/fileParser'
import { SaveFileResult, saveUploadStream } from '@/lib/fileStorage'
import { BATCH_SIZE } from '@/lib/import/constants'

export const runtime = 'nodejs'

function newTaskId(): string {
  return `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

const SUPPORTED = ['xlsx', 'xls', 'docx', 'pdf']

interface ParsedUpload {
  fileName: string
  saved: SaveFileResult
  ruleJson: string | null
}

function ruleSnapshot(rule: ParsingRule) {
  return {
    file_type: rule.file_type,
    structure_type: rule.structure_type,
    config: rule.config || {},
  }
}

function parseMultipartUpload(request: NextRequest, taskId: string): Promise<ParsedUpload> {
  return new Promise((resolve, reject) => {
    if (!request.body) {
      reject(new Error('请求体为空'))
      return
    }

    const headers = Object.fromEntries(request.headers.entries())
    const parser = Busboy({ headers, limits: { files: 1, fields: 5 } })
    let ruleJson: string | null = null
    let fileName = ''
    let fileSave: Promise<SaveFileResult> | null = null
    let settled = false

    const fail = (error: Error) => {
      if (settled) return
      settled = true
      reject(error)
    }

    parser.on('field', (name, value) => {
      if (name === 'rule') ruleJson = value
    })

    parser.on('file', (name, stream, info) => {
      if (name !== 'file') {
        stream.resume()
        return
      }
      fileName = info.filename
      fileSave = saveUploadStream(taskId, fileName, stream)
      fileSave.catch(fail)
    })

    parser.on('error', fail)

    parser.on('finish', () => {
      Promise.resolve(fileSave)
        .then((saved) => {
          if (settled) return
          if (!saved || !fileName) throw new Error('没有上传文件')
          settled = true
          resolve({ fileName, saved, ruleJson })
        })
        .catch(fail)
    })

    Readable.fromWeb(request.body as unknown as import('stream/web').ReadableStream).pipe(parser)
  })
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  let traceId = newTraceId()
  try {
    const taskId = newTaskId()
    traceId = newTraceId()
    const { fileName, saved, ruleJson } = await parseMultipartUpload(request, taskId)

    const ext = detectExtension(fileName)
    if (!SUPPORTED.includes(ext)) {
      return NextResponse.json({ error: `不支持的文件格式: .${ext}` }, { status: 400 })
    }

    let rule: ParsingRule
    try {
      rule = JSON.parse(ruleJson || '{}')
    } catch {
      return NextResponse.json({ error: '解析规则参数格式错误' }, { status: 400 })
    }
    if (!rule.file_type || !rule.structure_type || !rule.config) {
      return NextResponse.json({ error: '缺少已确认的解析规则' }, { status: 400 })
    }

    const rulePayload = ruleSnapshot(rule)

    const fastResult = await supabaseAdmin.rpc('create_import_task_fast', {
      p_task_id: taskId,
      p_file_name: fileName,
      p_file_ref: saved.file_ref,
      p_trace_id: traceId,
      p_batch_size: BATCH_SIZE,
      p_rule: rulePayload,
    })

    if (fastResult.error) {
      console.warn('[import-tasks] create_import_task_fast 不可用，退回兼容路径', fastResult.error.message)

      const { error } = await supabaseAdmin.rpc('create_import_task', {
        p_task_id: taskId,
        p_file_name: fileName,
        p_file_ref: saved.file_ref,
        p_trace_id: traceId,
        p_rule: rulePayload,
        p_total_rows: 0,
        p_total_batches: 0,
        p_batch_size: BATCH_SIZE,
        p_batches: [],
      })
      if (error) throw error

      const { error: queueError } = await supabaseAdmin.from('event_queue').insert({
        queue_name: 'import-batches',
        event_type: 'ImportTaskCreated',
        payload: {
          task_id: taskId,
          file_ref: saved.file_ref,
          file_name: fileName,
          rule: rulePayload,
          trace_id: traceId,
          batch_size: BATCH_SIZE,
        },
        trace_id: traceId,
        status: 'queued',
      })
      if (queueError) throw queueError

      await writeTraceEvent({
        trace_id: traceId,
        task_id: taskId,
        event_name: 'ImportTaskCreated',
        event_status: 'ok',
        message: 'Import task created and planning event queued.',
      })
    }

    const elapsedMs = Date.now() - startedAt
    if (elapsedMs > 1000) {
      console.warn(`[import-tasks] 上传接口耗时 ${elapsedMs}ms 超过 1s`)
    }

    return NextResponse.json({
      task_id: taskId,
      trace_id: traceId,
      status: 'pending',
      total_rows: 0,
      total_batches: 0,
      batch_size: BATCH_SIZE,
    })
  } catch (error) {
    console.error('[import-tasks] 创建任务失败', error)
    await writeTraceEvent({
      trace_id: traceId,
      event_name: 'ImportTaskCreateFailed',
      event_status: 'error',
      message: 'Import task creation failed. Check server logs for details.',
    })
    return NextResponse.json({ error: `创建任务失败: ${(error as Error).message}` }, { status: 500 })
  }
}
