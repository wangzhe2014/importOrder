// src/app/api/cron/outbox/route.ts
// Dispatcher 触发入口：Vercel Cron 或本地 curl 调用。
// 兜底：即使没有常驻轮询进程，也能把 event_outbox 中待投递事件送入队列。

import { NextResponse } from 'next/server'
import { dispatchOutbox } from '@/lib/outbox/dispatcher'

export async function GET() {
  try {
    const dispatched = await dispatchOutbox(50)
    return NextResponse.json({ dispatched, ok: true })
  } catch (error) {
    console.error('[cron/outbox]', error)
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 })
  }
}

export async function POST() {
  try {
    const dispatched = await dispatchOutbox(50)
    return NextResponse.json({ dispatched, ok: true })
  } catch (error) {
    console.error('[cron/outbox]', error)
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 })
  }
}