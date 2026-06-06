'use client'

import { useState, useEffect } from 'react'
import { Search, Calendar, ChevronLeft, ChevronRight, Package, RotateCcw } from 'lucide-react'
import { ShipmentData } from '@/types'

interface ShipmentListResponse {
  data: ShipmentData[]
  total: number
  page: number
  limit: number
}

export function ShipmentList() {
  const [data, setData] = useState<ShipmentData[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit] = useState(10)
  const [filters, setFilters] = useState({
    external_code: '',
    receiver_name: '',
    store_name: '',
    start_date: '',
    end_date: '',
  })
  const [searchFilters, setSearchFilters] = useState({
    external_code: '',
    receiver_name: '',
    store_name: '',
    start_date: '',
    end_date: '',
  })
  const [loading, setLoading] = useState(false)

  const loadData = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', String(limit))
      
      if (searchFilters.external_code) {
        params.set('external_code', searchFilters.external_code)
      }
      if (searchFilters.receiver_name) {
        params.set('receiver_name', searchFilters.receiver_name)
      }
      if (searchFilters.store_name) {
        params.set('store_name', searchFilters.store_name)
      }
      if (searchFilters.start_date) {
        params.set('start_date', searchFilters.start_date)
      }
      if (searchFilters.end_date) {
        params.set('end_date', searchFilters.end_date)
      }

      const response = await fetch(`/api/shipments?${params.toString()}`)
      const result: ShipmentListResponse = await response.json()
      
      setData(result.data)
      setTotal(result.total)
    } catch (error) {
      console.error('加载数据失败:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [page, searchFilters])

  const handleFilterChange = (key: keyof typeof filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const handleSearch = () => {
    setSearchFilters({ ...filters })
    setPage(1)
  }

  const handleReset = () => {
    setFilters({
      external_code: '',
      receiver_name: '',
      store_name: '',
      start_date: '',
      end_date: '',
    })
    setSearchFilters({
      external_code: '',
      receiver_name: '',
      store_name: '',
      start_date: '',
      end_date: '',
    })
    setPage(1)
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center gap-2 mb-4">
          <Package className="w-6 h-6 text-[#0fc6c2]" />
          <h3 className="text-lg font-semibold text-gray-800">运单列表</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索外部编码"
              value={filters.external_code}
              onChange={(e) => handleFilterChange('external_code', e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#0fc6c2] focus:border-transparent"
            />
          </div>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索收件人姓名"
              value={filters.receiver_name}
              onChange={(e) => handleFilterChange('receiver_name', e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#0fc6c2] focus:border-transparent"
            />
          </div>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索收货门店"
              value={filters.store_name}
              onChange={(e) => handleFilterChange('store_name', e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#0fc6c2] focus:border-transparent"
            />
          </div>
          
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="date"
              placeholder="开始日期"
              value={filters.start_date}
              onChange={(e) => handleFilterChange('start_date', e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#0fc6c2] focus:border-transparent"
            />
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={handleSearch}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-[#0fc6c2] text-white rounded-lg hover:bg-[#0bada9] disabled:bg-gray-300 transition-colors"
            >
              <Search className="w-4 h-4" />
              查询
            </button>
            <button
              onClick={handleReset}
              className="flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              重置
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 border-b border-gray-200">
                外部编码
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 border-b border-gray-200">
                收货门店
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 border-b border-gray-200">
                收件人姓名
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 border-b border-gray-200">
                收件人电话
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 border-b border-gray-200">
                收件人地址
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 border-b border-gray-200">
                SKU物品编码
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 border-b border-gray-200">
                SKU物品名称
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 border-b border-gray-200">
                SKU规格型号
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 border-b border-gray-200">
                SKU发货数量
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 border-b border-gray-200">
                备注
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 border-b border-gray-200">
                提交时间
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={11} className="px-4 py-12 text-center">
                  <div className="w-8 h-8 border-4 border-[#0fc6c2] border-t-transparent rounded-full animate-spin mx-auto" />
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
              data.map((row) => (
                <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-800">{row.external_code || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-800">{row.store_name || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-800">{row.receiver_name || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-800">{row.receiver_phone || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-800 max-w-[150px] truncate" title={row.receiver_address}>
                    {row.receiver_address || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-800">{row.sku_code || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-800">{row.sku_name || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-800">{row.sku_spec || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-800">{row.sku_quantity}</td>
                  <td className="px-4 py-3 text-sm text-gray-800 max-w-[100px] truncate" title={row.remark}>
                    {row.remark || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {row.created_at ? new Date(row.created_at).toLocaleString() : '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
        <span className="text-gray-600 text-sm">
          共 {total} 条记录，当前第 {page} / {totalPages} 页
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
            className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const pageNum = i + Math.max(1, page - 2)
            if (pageNum > totalPages) return null
            return (
              <button
                key={pageNum}
                onClick={() => setPage(pageNum)}
                className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                  page === pageNum
                    ? 'bg-[#0fc6c2] text-white'
                    : 'hover:bg-gray-100 text-gray-700'
                }`}
              >
                {pageNum}
              </button>
            )
          })}
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || loading}
            className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}