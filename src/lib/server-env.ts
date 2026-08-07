// src/lib/server-env.ts
// 服务端环境变量访问（安全：仅服务端可 import，勿在 client 组件中使用）

import { loadLocalEnv } from './load-env'

loadLocalEnv()

export function getRequiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`缺少环境变量 ${name}`)
  }
  return value
}

export function getOptionalEnv(name: string, fallback = ''): string {
  return process.env[name] || fallback
}

export const serverConfig = {
  // Supabase
  supabaseUrl: getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: getRequiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  supabaseServiceRoleKey: getOptionalEnv('SUPABASE_SERVICE_ROLE_KEY'),

  // 队列（BullMQ + Redis）。未配置时退回 DB 轮询兜底，保证本地可跑通
  redisUrl: getOptionalEnv('UPSTASH_REDIS_URL'),
  redisToken: getOptionalEnv('UPSTASH_REDIS_TOKEN'),
  queueBackend: getOptionalEnv('QUEUE_BACKEND', 'auto') as 'auto' | 'bullmq' | 'db',

  // 导入参数
  batchSize: Number(getOptionalEnv('IMPORT_BATCH_SIZE', '1000')),
  workerConcurrency: Number(getOptionalEnv('WORKER_CONCURRENCY', '2')),
  staleBatchLockMinutes: Number(getOptionalEnv('STALE_BATCH_LOCK_MINUTES', '5')),
  taskCacheTtlMs: Number(getOptionalEnv('IMPORT_TASK_CACHE_TTL_MS', '1800000')),
  taskCacheMaxEntries: Number(getOptionalEnv('IMPORT_TASK_CACHE_MAX_ENTRIES', '4')),

  // 文件存储
  uploadDir: getOptionalEnv('UPLOAD_DIR', 'data/uploads'),
  uploadStorageBackend: getOptionalEnv('UPLOAD_STORAGE_BACKEND', 'supabase') as 'local' | 'supabase',
  supabaseStorageBucket: getOptionalEnv('SUPABASE_STORAGE_BUCKET', 'import-files'),
}

export function isQueueConfigured(): boolean {
  return Boolean(serverConfig.redisUrl)
}
