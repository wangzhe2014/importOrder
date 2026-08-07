// src/lib/fileStorage.ts
// 文件存储抽象：本地开发使用本地盘；生产可切换到 Supabase Storage。

import { promises as fs } from 'fs'
import { createWriteStream } from 'fs'
import path from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { serverConfig } from './server-env'
import { supabaseAdmin } from './supabase-server'

export interface SaveFileResult {
  file_ref: string
  absPath?: string
}

function safeName(name: string): string {
  const base = path.basename(name || 'file').replace(/[^\w.\-]+/g, '_')
  return base || 'file'
}

function storagePath(taskId: string, originalName: string): string {
  return `${taskId}/${safeName(originalName)}`
}

function isSupabaseRef(file_ref: string): boolean {
  return file_ref.startsWith('supabase://')
}

function parseSupabaseRef(file_ref: string): { bucket: string; objectPath: string } {
  const ref = file_ref.replace(/^supabase:\/\//, '')
  const slash = ref.indexOf('/')
  if (slash <= 0) throw new Error(`无效 Supabase Storage 文件引用: ${file_ref}`)
  return { bucket: ref.slice(0, slash), objectPath: ref.slice(slash + 1) }
}

async function uploadToSupabaseStorage(
  objectPath: string,
  body: Buffer | Readable,
  contentType = 'application/octet-stream'
): Promise<SaveFileResult> {
  if (!serverConfig.supabaseServiceRoleKey) {
    throw new Error('UPLOAD_STORAGE_BACKEND=supabase 需要配置 SUPABASE_SERVICE_ROLE_KEY')
  }
  const bucket = serverConfig.supabaseStorageBucket
  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(objectPath, body, {
      cacheControl: '3600',
      contentType,
      upsert: true,
      duplex: 'half',
    } as Parameters<ReturnType<typeof supabaseAdmin.storage.from>['upload']>[2] & { duplex: 'half' })
  if (error) throw error
  return { file_ref: `supabase://${bucket}/${objectPath}` }
}

export async function saveUploadFile(
  taskId: string,
  originalName: string,
  buffer: Buffer
): Promise<SaveFileResult> {
  if (serverConfig.uploadStorageBackend === 'supabase') {
    return uploadToSupabaseStorage(storagePath(taskId, originalName), buffer)
  }
  const dir = path.resolve(process.cwd(), serverConfig.uploadDir, taskId)
  await fs.mkdir(dir, { recursive: true })
  const absPath = path.join(dir, safeName(originalName))
  await fs.writeFile(absPath, buffer)
  return { file_ref: `local://${taskId}/${safeName(originalName)}`, absPath }
}

export async function saveUploadStream(
  taskId: string,
  originalName: string,
  stream: Readable
): Promise<SaveFileResult> {
  if (serverConfig.uploadStorageBackend === 'supabase') {
    return uploadToSupabaseStorage(storagePath(taskId, originalName), stream)
  }
  const dir = path.resolve(process.cwd(), serverConfig.uploadDir, taskId)
  await fs.mkdir(dir, { recursive: true })
  const filename = safeName(originalName)
  const absPath = path.join(dir, filename)
  await pipeline(stream, createWriteStream(absPath))
  return { file_ref: `local://${taskId}/${filename}`, absPath }
}

export async function saveTaskArtifact(
  taskId: string,
  artifactName: string,
  buffer: Buffer,
  contentType = 'application/octet-stream'
): Promise<SaveFileResult> {
  const filename = safeName(artifactName)
  if (serverConfig.uploadStorageBackend === 'supabase') {
    return uploadToSupabaseStorage(`${taskId}/${filename}`, buffer, contentType)
  }

  const dir = path.resolve(process.cwd(), serverConfig.uploadDir, taskId)
  await fs.mkdir(dir, { recursive: true })
  const absPath = path.join(dir, filename)
  await fs.writeFile(absPath, buffer)
  return { file_ref: `local://${taskId}/${filename}`, absPath }
}

export async function readUploadFile(taskId: string, file_ref: string): Promise<Buffer> {
  if (isSupabaseRef(file_ref)) {
    if (!serverConfig.supabaseServiceRoleKey) {
      throw new Error('读取 Supabase Storage 文件需要配置 SUPABASE_SERVICE_ROLE_KEY')
    }
    const { bucket, objectPath } = parseSupabaseRef(file_ref)
    const { data, error } = await supabaseAdmin.storage.from(bucket).download(objectPath)
    if (error) throw error
    return Buffer.from(await data.arrayBuffer())
  }
  // local://task/file 或 task/file
  const rel = file_ref.replace(/^local:\/\//, '')
  const absPath = path.resolve(process.cwd(), serverConfig.uploadDir, rel)
  return fs.readFile(absPath)
}

export function resolveLocalPath(taskId: string, file_ref: string): string {
  if (isSupabaseRef(file_ref)) {
    throw new Error('Supabase Storage 文件没有本地路径')
  }
  const rel = file_ref.replace(/^local:\/\//, '')
  return path.resolve(process.cwd(), serverConfig.uploadDir, rel)
}

export async function fileExists(taskId: string, file_ref: string): Promise<boolean> {
  if (isSupabaseRef(file_ref)) {
    const { bucket, objectPath } = parseSupabaseRef(file_ref)
    const folder = objectPath.split('/').slice(0, -1).join('/')
    const name = objectPath.split('/').pop() || ''
    const { data, error } = await supabaseAdmin.storage.from(bucket).list(folder, { search: name, limit: 1 })
    if (error) return false
    return (data || []).some((item) => item.name === name)
  }
  try {
    await fs.access(resolveLocalPath(taskId, file_ref))
    return true
  } catch {
    return false
  }
}

export async function deleteTaskFiles(taskId: string): Promise<void> {
  if (serverConfig.uploadStorageBackend === 'supabase') {
    const bucket = serverConfig.supabaseStorageBucket
    const { data } = await supabaseAdmin.storage.from(bucket).list(taskId)
    const paths = (data || []).map((item) => `${taskId}/${item.name}`)
    if (paths.length > 0) {
      const { error } = await supabaseAdmin.storage.from(bucket).remove(paths)
      if (error) throw error
    }
    return
  }
  const dir = path.resolve(process.cwd(), serverConfig.uploadDir, taskId)
  await fs.rm(dir, { recursive: true, force: true })
}
