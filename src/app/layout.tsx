// src/app/layout.tsx

import type { Metadata } from 'next'
import '@/styles/globals.css'

export const metadata: Metadata = {
  title: '万能导入 —— 智能多格式批量下单系统 V2',
  description: '支持智能多格式文件（Excel、Word、PDF）的大模型批量下单系统',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-[#f7f8fa]">
        {children}
      </body>
    </html>
  )
}
