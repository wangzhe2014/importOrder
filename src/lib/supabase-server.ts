// src/lib/supabase-server.ts
// 服务端专用 Supabase 客户端：优先使用 service_role（绕过 RLS），否则退回 anon。
// 只能在 server components / route handlers / worker 中导入。

import { createClient } from '@supabase/supabase-js'
import { serverConfig } from './server-env'

export const supabaseAdmin = createClient(
  serverConfig.supabaseUrl,
  serverConfig.supabaseServiceRoleKey || serverConfig.supabaseAnonKey,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(process.env.NEXT_RUNTIME
      ? { global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: 'no-store' }) } }
      : {}),
  }
)
