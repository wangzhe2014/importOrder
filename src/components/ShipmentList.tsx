'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ComponentType, ReactNode } from 'react'
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Hash,
  Package,
  PackageCheck,
  RotateCcw,
  Search,
  Store,
} from 'lucide-react'
import { ShipmentData } from '@/types'

interface ShipmentListResponse {
  data: ShipmentData[]
  total: number
  page: number
  limit: number
}

const PAGE_SIZE = 10

export function ShipmentList() {
  const [data, setData] = useState<ShipmentData[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [jumpPage, setJumpPage] = useState('')
  const [filters, setFilters] = useState({
    external_code: '',
    receiver_name: '',
    store_name: '',
    start_date: '',
    end_date: '',
  })
  const [searchFilters, setSearchFilters] = useState(filters)
  const [loading, setLoading] = useState(false)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  useEffect(() => {
    loadData()
  }, [page, searchFilters])

  const loadData = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', String(PAGE_SIZE))

      Object.entries(searchFilters).forEach(([key, value]) => {
        if (value) params.set(key, value)
      })

      const response = await fetch(`/api/shipments?${params.toString()}`)
      const result: ShipmentListResponse = await response.json()

      setData(Array.isArray(result.data) ? result.data : [])
      setTotal(result.total || 0)
    } catch (error) {
      console.error('加载运单列表失败:', error)
      setData([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  const summary = useMemo(() => {
    const uniqueOrders = new Set(data.map(row => row.external_code).filter(Boolean)).size
    const uniqueStores = new Set(data.map(row => row.store_name || row.receiver_name).filter(Boolean)).size
    const skuQuantity = data.reduce((sum, row) => sum + Number(row.sku_quantity || 0), 0)

    return {
      currentRows: data.length,
      uniqueOrders,
      uniqueStores,
      skuQuantity,
    }
  }, [data])

  const pageItems = useMemo(() => buildPageItems(page, totalPages), [page, totalPages])

  const handleFilterChange = (key: keyof typeof filters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const handleSearch = () => {
    setSearchFilters({ ...filters })
    setPage(1)
  }

  const handleReset = () => {
    const emptyFilters = {
      external_code: '',
      receiver_name: '',
      store_name: '',
      start_date: '',
      end_date: '',
    }
    setFilters(emptyFilters)
    setSearchFilters(emptyFilters)
    setPage(1)
    setJumpPage('')
  }

  const handleJumpPage = () => {
    const nextPage = Number(jumpPage)
    if (!Number.isInteger(nextPage)) return
    setPage(Math.min(Math.max(nextPage, 1), totalPages))
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-6 py-5">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Package className="h-6 w-6 text-[#0fc6c2]" />
              <h3 className="text-lg font-semibold text-gray-800">运单列表</h3>
            </div>
            <p className="mt-1 text-sm text-gray-500">查看已提交入库的运单明细，支持按单号、门店和日期筛选。</p>
          </div>
          <div className="text-sm text-gray-500">
            共 <span className="font-semibold text-[#1d2129]">{total}</span> 条记录
          </div>
        </div>

        <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard icon={PackageCheck} label="当前页明细" value={summary.currentRows} suffix="条" />
          <SummaryCard icon={Hash} label="当前页单号" value={summary.uniqueOrders} suffix="个" />
          <SummaryCard icon={Store} label="当前页门店/收件方" value={summary.uniqueStores} suffix="个" />
          <SummaryCard icon={Package} label="当前页 SKU 数量" value={summary.skuQuantity} suffix="件" />
        </div>

        <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-2 xl:grid-cols-7">
          <SearchInput
            placeholder="搜索外部编码"
            value={filters.external_code}
            onChange={(value) => handleFilterChange('external_code', value)}
          />
          <SearchInput
            placeholder="搜索收件人姓名"
            value={filters.receiver_name}
            onChange={(value) => handleFilterChange('receiver_name', value)}
          />
          <SearchInput
            placeholder="搜索收货门店"
            value={filters.store_name}
            onChange={(value) => handleFilterChange('store_name', value)}
          />
          <DateField
            label="开始日期"
            value={filters.start_date}
            onChange={(value) => handleFilterChange('start_date', value)}
          />
          <DateField
            label="结束日期"
            value={filters.end_date}
            onChange={(value) => handleFilterChange('end_date', value)}
          />
          <button
            onClick={handleSearch}
            disabled={loading}
            className="flex items-center justify-center gap-2 rounded-lg bg-[#0fc6c2] px-4 py-2 text-white transition-colors hover:bg-[#0bada9] disabled:bg-gray-300"
          >
            <Search className="h-4 w-4" />
            查询
          </button>
          <button
            onClick={handleReset}
            className="flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-50"
          >
            <RotateCcw className="h-4 w-4" />
            重置
          </button>
        </div>
      </div>

      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[1320px]">
          <thead className="bg-gray-50">
            <tr>
              {['外部编码', '收货门店', '收件人姓名', '收件人电话', '收件人地址', 'SKU物品编码', 'SKU物品名称', 'SKU规格型号', 'SKU发货数量', '备注', '提交时间'].map(title => (
                <th key={title} className="whitespace-nowrap border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-700">
                  {title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={11} className="px-4 py-12 text-center">
                  <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-[#0fc6c2] border-t-transparent" />
                  <p className="mt-2 text-gray-500">加载中...</p>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-12 text-center text-gray-500">
                  暂无运单记录
                </td>
              </tr>
            ) : (
              data.map((row, index) => (
                <tr key={row.id || `${row.external_code}-${row.sku_code}-${index}`} className="border-b border-gray-100 hover:bg-gray-50">
                  <TableCell>{row.external_code || '-'}</TableCell>
                  <TableCell>{row.store_name || '-'}</TableCell>
                  <TableCell>{row.receiver_name || '-'}</TableCell>
                  <TableCell>{row.receiver_phone || '-'}</TableCell>
                  <TableCell className="max-w-[220px] truncate" title={row.receiver_address}>{row.receiver_address || '-'}</TableCell>
                  <TableCell>{row.sku_code || '-'}</TableCell>
                  <TableCell className="max-w-[220px] truncate" title={row.sku_name}>{row.sku_name || '-'}</TableCell>
                  <TableCell className="max-w-[180px] truncate" title={row.sku_spec}>{row.sku_spec || '-'}</TableCell>
                  <TableCell>{row.sku_quantity}</TableCell>
                  <TableCell className="max-w-[140px] truncate" title={row.remark}>{row.remark || '-'}</TableCell>
                  <TableCell className="text-gray-500">{row.created_at ? new Date(row.created_at).toLocaleString() : '-'}</TableCell>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-4 border-t border-gray-200 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
        <span className="text-sm text-gray-600">
          共 {total} 条记录，当前第 {page} / {totalPages} 页
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setPage(prev => Math.max(1, prev - 1))}
            disabled={page === 1 || loading}
            className="rounded-lg p-2 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          {pageItems.map((item, index) => item === 'ellipsis' ? (
            <span key={`ellipsis-${index}`} className="px-2 text-gray-400">...</span>
          ) : (
            <button
              key={item}
              onClick={() => setPage(item)}
              className={`h-8 min-w-8 rounded-lg px-2 text-sm font-medium transition-colors ${
                page === item ? 'bg-[#0fc6c2] text-white' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {item}
            </button>
          ))}

          <button
            onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
            disabled={page === totalPages || loading}
            className="rounded-lg p-2 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          <div className="ml-2 flex items-center gap-2 text-sm text-gray-600">
            <span>跳至</span>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={jumpPage}
              onChange={(event) => setJumpPage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleJumpPage()
              }}
              className="h-8 w-16 rounded-lg border border-gray-300 px-2 text-center focus:border-transparent focus:ring-2 focus:ring-[#0fc6c2]"
            />
            <span>页</span>
            <button onClick={handleJumpPage} className="h-8 rounded-lg border border-gray-300 px-3 hover:bg-gray-50">
              确定
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SearchInput({
  placeholder,
  value,
  onChange,
}: {
  placeholder: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-transparent focus:ring-2 focus:ring-[#0fc6c2]"
      />
    </div>
  )
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="relative cursor-pointer rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-[#0fc6c2]">
      <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <span className={`block pl-7 ${value ? 'text-gray-800' : 'text-gray-400'}`}>
        {value || label}
      </span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        aria-label={label}
      />
    </div>
  )
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  suffix,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  value: number
  suffix: string
}) {
  return (
    <div className="rounded-xl border border-[#d0e8e8] bg-[#f7ffff] p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-[#667085]">{label}</span>
        <Icon className="h-4 w-4 text-[#0fc6c2]" />
      </div>
      <div className="mt-2 text-2xl font-semibold text-[#1d2129]">
        {value}
        <span className="ml-1 text-sm font-normal text-[#86909c]">{suffix}</span>
      </div>
    </div>
  )
}

function TableCell({
  children,
  className = '',
  title,
}: {
  children: ReactNode
  className?: string
  title?: string
}) {
  return (
    <td className={`whitespace-nowrap px-4 py-3 text-sm text-gray-800 ${className}`} title={title}>
      {children}
    </td>
  )
}

function buildPageItems(currentPage: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const pages = new Set<number>([1, totalPages, currentPage, currentPage - 1, currentPage + 1])
  const sortedPages = Array.from(pages)
    .filter(item => item >= 1 && item <= totalPages)
    .sort((left, right) => left - right)

  const items: Array<number | 'ellipsis'> = []
  sortedPages.forEach((pageNumber, index) => {
    const previous = sortedPages[index - 1]
    if (previous && pageNumber - previous > 1) {
      items.push('ellipsis')
    }
    items.push(pageNumber)
  })

  return items
}
