'use client'

import { useState, useCallback } from 'react'
import { Trash2, Plus, Download, AlertTriangle, X } from 'lucide-react'
import { PreviewRow, ShipmentData, FIELD_DISPLAY_NAMES, ImportError } from '@/types'
import { validateRow, checkDuplicates, getAllErrors } from '@/utils/validator'
import { exportToExcel } from '@/utils/excelParser'

// 虚拟滚动配置
const CONTAINER_HEIGHT = 600 // 表格容器固定高度 (px)

interface DataPreviewProps {
  rows: PreviewRow[]
  onRowsChange: (rows: PreviewRow[]) => void
  onSubmit: () => void
  hasErrors: boolean
}

export function DataPreview({ rows, onRowsChange, onSubmit, hasErrors }: DataPreviewProps) {
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; field: keyof ShipmentData } | null>(null)
  const [showErrorsModal, setShowErrorsModal] = useState(false)
  

  const allErrors = getAllErrors(rows)
  const handleCellChange = useCallback((rowIndex: number, field: keyof ShipmentData, value: string) => {
    const newRows = [...rows]
    newRows[rowIndex] = {
      ...newRows[rowIndex],
      [field]: field === 'sku_quantity' ? (value === '' ? 0 : parseInt(value, 10) || 0) : value,
    }
    
    const validationErrors = validateRow(newRows[rowIndex], newRows[rowIndex].rowIndex)
    newRows[rowIndex].errors = validationErrors
    
    const updatedRows = checkDuplicates(newRows)
    onRowsChange(updatedRows)
  }, [rows, onRowsChange])

  const handleDeleteRow = useCallback((rowIndex: number) => {
    const newRows = rows.filter((_, i) => i !== rowIndex)
    const updatedRows = checkDuplicates(newRows.map((row, i) => ({ ...row, rowIndex: i + 1 })))
    onRowsChange(updatedRows)
  }, [rows, onRowsChange])

  const handleAddRow = useCallback(() => {
    const newRow: PreviewRow = {
      external_code: '',
      store_name: '',
      receiver_name: '',
      receiver_phone: '',
      receiver_address: '',
      sku_code: '',
      sku_name: '',
      sku_quantity: 0,
      sku_spec: '',
      remark: '',
      rowIndex: rows.length + 1,
      errors: validateRow({
        external_code: '',
        store_name: '',
        receiver_name: '',
        receiver_phone: '',
        receiver_address: '',
        sku_code: '',
        sku_name: '',
        sku_quantity: 0,
      }, rows.length + 1),
      isDuplicate: false,
    }
    const updatedRows = checkDuplicates([...rows, newRow])
    onRowsChange(updatedRows)
  }, [rows, onRowsChange])

  const handleExport = useCallback(() => {
    const exportData = rows.map((row) => {
      const result: Record<string, any> = {}
      Object.keys(FIELD_DISPLAY_NAMES).forEach((key) => {
        result[FIELD_DISPLAY_NAMES[key as keyof ShipmentData]] = row[key as keyof ShipmentData]
      })
      return result
    })
    exportToExcel(exportData, `运单数据_${new Date().toISOString().split('T')[0]}`)
  }, [rows])

  const getErrorForField = (row: PreviewRow, field: keyof ShipmentData): ImportError | undefined => {
    return row.errors.find((e) => e.field === field)
  }

  const fieldKeys = Object.keys(FIELD_DISPLAY_NAMES) as (keyof ShipmentData)[]

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800">数据预览</h3>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            导出Excel
          </button>
          <button
            onClick={handleAddRow}
            className="flex items-center gap-2 px-3 py-2 bg-[#0fc6c2] text-white rounded-lg hover:bg-[#0bada9] transition-colors"
          >
            <Plus className="w-4 h-4" />
            添加行
          </button>
        </div>
      </div>

      <div 
        className="overflow-x-auto overflow-y-auto scrollbar-thin"
        style={{ maxHeight: `${CONTAINER_HEIGHT}px`, position: 'relative' }}
      >
        <table className="w-full" style={{ minWidth: 'max-content' }}>
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="sticky left-0 bg-gray-50 px-4 py-3 text-left text-sm font-medium text-gray-700 border-b border-gray-200 w-16 z-20">
                行号
              </th>
              {fieldKeys.map((field) => (
                <th key={field} className="px-4 py-3 text-left text-sm font-medium text-gray-700 border-b border-gray-200 whitespace-nowrap">
                  {FIELD_DISPLAY_NAMES[field]}
                </th>
              ))}
              <th className="sticky right-0 bg-gray-50 px-4 py-3 text-left text-sm font-medium text-gray-700 border-b border-gray-200 w-16 z-20">
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => {
              
              return (
                <tr
                  key={`${row.rowIndex}-${row.external_code || ''}-${row.sku_code || ''}`}
                  className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${row.isDuplicate ? 'bg-yellow-50' : ''}`}
                >
                  <td className={`sticky left-0 px-4 py-2 text-sm ${row.isDuplicate ? 'bg-yellow-50 font-medium text-yellow-700' : 'bg-white text-gray-600'}`}>
                    {row.rowIndex}
                    {row.isDuplicate && (
                      <span className="inline-block ml-1 px-1.5 py-0.5 text-xs bg-yellow-200 text-yellow-700 rounded">
                        {row.duplicateSource === 'database' ? '库内重复' : '重复'}
                      </span>
                    )}
                  </td>
                  {fieldKeys.map((field) => {
                    const error = getErrorForField(row, field)
                    const isEditing = editingCell?.rowIndex === rowIndex && editingCell?.field === field
                    const cellValue = row[field]
                    const displayValue = cellValue === undefined || cellValue === null ? '' : String(cellValue)
                    
                    return (
                      <td key={field} className="px-4 py-2">
                        {isEditing ? (
                          <input
                            type={field === 'sku_quantity' ? 'number' : 'text'}
                            value={displayValue}
                            onChange={(e) => handleCellChange(rowIndex, field, e.target.value)}
                            onBlur={() => setEditingCell(null)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                setEditingCell(null)
                              }
                            }}
                            autoFocus
                            className="w-full px-2 py-1 border border-[#0fc6c2] rounded focus:ring-2 focus:ring-[#0fc6c2] focus:border-transparent"
                          />
                        ) : (
                          <div
                            className={`
                              relative cursor-pointer text-sm
                              min-h-[20px] min-w-[48px] rounded px-1
                              ${error ? 'text-red-600 bg-red-50' : 'text-gray-800'}
                            `}
                            onClick={() => setEditingCell({ rowIndex, field })}
                          >
                            {displayValue || '\u00A0'}
                            {error && (
                              <div className="absolute top-full left-0 mt-1 p-2 bg-red-600 text-white text-xs rounded-lg z-10 whitespace-nowrap">
                                {error.message}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    )
                  })}
                  <td className="sticky right-0 bg-white px-4 py-2">
                    <button
                      onClick={() => handleDeleteRow(rowIndex)}
                      className="text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              )
            })}
            
          </tbody>
        </table>
        
        {/* 滚动加载更多提示 */}
      </div>

      <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-gray-600">
            共 {rows.length} 条数据
          </span>
          {hasErrors && (
            <button
              onClick={() => setShowErrorsModal(true)}
              className="flex items-center gap-1 text-red-600 hover:text-red-700"
            >
              <AlertTriangle className="w-4 h-4" />
              显示错误 ({allErrors.length})
            </button>
          )}
        </div>
        <button
          onClick={onSubmit}
          disabled={hasErrors}
          className={`
            px-6 py-2 rounded-lg font-medium transition-colors
            ${hasErrors 
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
              : 'bg-[#0fc6c2] text-white hover:bg-[#0bada9]'
            }
          `}
        >
          {hasErrors ? '请先修正错误' : '提交下单'}
        </button>
      </div>

      {showErrorsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">错误列表</h3>
              <button
                onClick={() => setShowErrorsModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {allErrors.length > 0 ? (
                <div className="space-y-2">
                  {allErrors.map((error, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-3 p-3 bg-red-50 rounded-lg"
                    >
                      <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="text-red-700 font-medium">
                          第 {error.rowIndex} 行，{FIELD_DISPLAY_NAMES[error.field as keyof ShipmentData]}：
                        </span>
                        <span className="text-red-600">{error.message}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">暂无错误</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
