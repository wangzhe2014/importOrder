import { gzipSync, gunzipSync } from 'zlib'
import { ShipmentData, ParsingRule } from '@/types'
import { ExcelParsePlan, estimateExcelDataRows } from '@/utils/ruleEngine'
import { parseFileBuffer, ParsedSource } from './fileParser'
import { validateSkus, SkuValidationResult } from './skuValidation'
import { readUploadFile, saveTaskArtifact } from '../fileStorage'
import { serverConfig } from '../server-env'

const ARTIFACT_VERSION = 1
const ARTIFACT_NAME = '_planned.json.gz'

export interface TaskParseContext {
  file_ref: string
  file_name: string
  source: ParsedSource | null
  primaryPlan: ExcelParsePlan | null
  batchRows?: Record<string, ShipmentData[]>
  skuCodes: string[]
  skuValidation?: SkuValidationResult
  skuValidationPromise?: Promise<SkuValidationResult>
  degradedNotified?: boolean
}

interface PersistedTaskArtifact {
  version: number
  file_ref: string
  file_name: string
  primaryPlan: ExcelParsePlan | null
  batchRows: Record<string, ShipmentData[]>
  skuCodes: string[]
}

interface CacheEntry {
  context: TaskParseContext
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

function evictExpired(now = Date.now()): void {
  cache.forEach((entry, taskId) => {
    if (entry.expiresAt <= now) cache.delete(taskId)
  })
  while (cache.size >= Math.max(1, serverConfig.taskCacheMaxEntries)) {
    const first = cache.keys().next().value as string | undefined
    if (!first) break
    cache.delete(first)
  }
}

function remember(taskId: string, context: TaskParseContext): TaskParseContext {
  evictExpired()
  cache.delete(taskId)
  cache.set(taskId, {
    context,
    expiresAt: Date.now() + Math.max(60_000, serverConfig.taskCacheTtlMs),
  })
  return context
}

function fromArtifact(buffer: Buffer, fileRef: string, fileName: string): TaskParseContext {
  const artifact = JSON.parse(gunzipSync(buffer).toString('utf8')) as PersistedTaskArtifact
  if (artifact.version !== ARTIFACT_VERSION) throw new Error('Unsupported task artifact version')
  if (artifact.file_ref !== fileRef || artifact.file_name !== fileName) {
    throw new Error('Task artifact does not match the uploaded file')
  }
  return {
    file_ref: artifact.file_ref,
    file_name: artifact.file_name,
    source: null,
    primaryPlan: artifact.primaryPlan,
    batchRows: artifact.batchRows,
    skuCodes: artifact.skuCodes,
  }
}

async function parseSource(taskId: string, fileRef: string, fileName: string, rule: ParsingRule): Promise<TaskParseContext> {
  const buffer = await readUploadFile(taskId, fileRef)
  const source = await parseFileBuffer(buffer, fileName)
  const primaryPlan = source.type === 'excel' ? (estimateExcelDataRows(source.sheets, rule)[0] || null) : null
  return { file_ref: fileRef, file_name: fileName, source, primaryPlan, skuCodes: [] }
}

export async function loadTaskParseContext(
  taskId: string,
  fileRef: string,
  fileName: string,
  rule: ParsingRule,
  artifactRef?: string
): Promise<TaskParseContext> {
  evictExpired()
  const cached = cache.get(taskId)
  if (cached && cached.context.file_ref === fileRef && cached.context.file_name === fileName) {
    cached.expiresAt = Date.now() + Math.max(60_000, serverConfig.taskCacheTtlMs)
    return cached.context
  }

  if (artifactRef) {
    try {
      const artifactBuffer = await readUploadFile(taskId, artifactRef)
      return remember(taskId, fromArtifact(artifactBuffer, fileRef, fileName))
    } catch (error) {
      console.warn('[task-cache] artifact unavailable, falling back to original file', taskId, error)
    }
  }

  return remember(taskId, await parseSource(taskId, fileRef, fileName, rule))
}

export async function saveTaskParseArtifact(
  taskId: string,
  context: TaskParseContext
): Promise<string> {
  const artifact: PersistedTaskArtifact = {
    version: ARTIFACT_VERSION,
    file_ref: context.file_ref,
    file_name: context.file_name,
    primaryPlan: context.primaryPlan,
    batchRows: context.batchRows || {},
    skuCodes: context.skuCodes,
  }
  const compressed = gzipSync(Buffer.from(JSON.stringify(artifact), 'utf8'))
  const saved = await saveTaskArtifact(taskId, ARTIFACT_NAME, compressed, 'application/gzip')
  return saved.file_ref
}

export async function ensureTaskSkuValidation(context: TaskParseContext): Promise<SkuValidationResult> {
  if (context.skuValidation) return context.skuValidation
  if (!context.skuValidationPromise) {
    context.skuValidationPromise = validateSkus(context.skuCodes).then((result) => {
      context.skuValidation = result
      return result
    })
  }
  return context.skuValidationPromise
}

export function claimDegradedNotification(context: TaskParseContext): boolean {
  if (context.degradedNotified) return false
  context.degradedNotified = true
  return true
}
