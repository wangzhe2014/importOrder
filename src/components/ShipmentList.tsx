import React, { useState, useEffect } from 'react';
import { Search, Calendar, ChevronLeft, ChevronRight, Package } from 'lucide-react';
import { ShipmentData, FIELD_DISPLAY_NAMES } from '@/types';
import { getShipments } from '@/api/shipments';

export function ShipmentList() {
  const [data, setData] = useState<ShipmentData[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [filters, setFilters] = useState({
    external_code: '',
    receiver_name: '',
    start_date: '',
    end_date: '',
  });
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const result = await getShipments(page, limit, filters);
      setData(result.data);
      setTotal(result.total);
    } catch (error) {
      console.error('加载数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [page, filters]);

  const handleFilterChange = (key: keyof typeof filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center gap-2 mb-4">
          <Package className="w-6 h-6 text-blue-500" />
          <h3 className="text-lg font-semibold text-gray-800">已导入运单列表</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索外部编码"
              value={filters.external_code}
              onChange={(e) => handleFilterChange('external_code', e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索收件人姓名"
              value={filters.receiver_name}
              onChange={(e) => handleFilterChange('receiver_name', e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="date"
              placeholder="开始日期"
              value={filters.start_date}
              onChange={(e) => handleFilterChange('start_date', e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="date"
              placeholder="结束日期"
              value={filters.end_date}
              onChange={(e) => handleFilterChange('end_date', e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
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
                发件人
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 border-b border-gray-200">
                收件人
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 border-b border-gray-200">
                重量(kg)
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 border-b border-gray-200">
                件数
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 border-b border-gray-200">
                温层
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 border-b border-gray-200">
                提交时间
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="mt-2 text-gray-500">加载中...</p>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                  暂无运单记录
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-800">{row.external_code || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-800">
                    <div>{row.sender_name}</div>
                    <div className="text-gray-500 text-xs">{row.sender_phone}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-800">
                    <div>{row.receiver_name}</div>
                    <div className="text-gray-500 text-xs">{row.receiver_phone}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-800">{row.weight}</td>
                  <td className="px-4 py-3 text-sm text-gray-800">{row.quantity}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`px-2 py-1 rounded text-xs ${
                      row.temperature === '常温' ? 'bg-green-100 text-green-700' :
                      row.temperature === '冷藏' ? 'bg-blue-100 text-blue-700' :
                      'bg-purple-100 text-purple-700'
                    }`}>
                      {row.temperature}
                    </span>
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
            const pageNum = i + Math.max(1, page - 2);
            if (pageNum > totalPages) return null;
            return (
              <button
                key={pageNum}
                onClick={() => setPage(pageNum)}
                className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                  page === pageNum
                    ? 'bg-blue-500 text-white'
                    : 'hover:bg-gray-100 text-gray-700'
                }`}
              >
                {pageNum}
              </button>
            );
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
  );
}
