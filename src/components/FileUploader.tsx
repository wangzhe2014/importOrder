// src/components/FileUploader.tsx

import React, { useState, useCallback } from 'react'
import { Upload, AlertCircle, FileText } from 'lucide-react'

interface FileUploaderProps {
  onFileSelect: (file: File) => void
  loading: boolean
  error?: string
}

export function FileUploader({ onFileSelect, loading, error }: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const files = e.dataTransfer.files
    if (files.length > 0) {
      handleFile(files[0])
    }
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFile(files[0])
    }
  }, [])

  const handleFile = (file: File) => {
    const validExtensions = ['.xlsx', '.xls', '.docx', '.pdf']
    const extension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'))
    
    if (!validExtensions.includes(extension)) {
      return
    }
    
    if (file.size > 50 * 1024 * 1024) {
      return
    }
    
    onFileSelect(file)
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <span className="text-red-700 text-sm font-medium">{error}</span>
        </div>
      )}
      
      <div
        className={`
          border-2 border-dashed rounded-xl p-12 text-center transition-all duration-300 cursor-pointer
          ${isDragging 
            ? 'border-[#0fc6c2] bg-[#e8fafa]' 
            : 'border-gray-300 hover:border-[#0fc6c2] hover:bg-gray-50'
          }
          ${loading ? 'opacity-50 cursor-not-allowed' : ''}
        `}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !loading && document.getElementById('file-input')?.click()}
      >
        <input
          id="file-input"
          type="file"
          accept=".xlsx,.xls,.docx,.pdf"
          onChange={handleFileChange}
          className="hidden"
          disabled={loading}
        />
        
        {loading ? (
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-[#0fc6c2] border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-600 font-medium">正在上传并分析文件结构...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className={`
              w-20 h-20 rounded-full flex items-center justify-center transition-colors duration-200
              ${isDragging ? 'bg-[#0fc6c2] text-white' : 'bg-[#e8fafa] text-[#0fc6c2]'}
            `}>
              <Upload className="w-10 h-10" />
            </div>
            <div>
              <p className="text-lg font-medium text-gray-800">
                拖拽订单文件到此处上传
              </p>
              <p className="text-gray-500 mt-1 text-sm">
                或点击选择本地文件
              </p>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="flex items-center gap-1 text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">
                <FileText className="w-3 h-3 text-[#0fc6c2]" />
                Excel (.xlsx/.xls)
              </span>
              <span className="flex items-center gap-1 text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">
                <FileText className="w-3 h-3 text-indigo-500" />
                Word (.docx)
              </span>
              <span className="flex items-center gap-1 text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">
                <FileText className="w-3 h-3 text-red-500" />
                PDF (.pdf)
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              单文件大小最大支持 50MB
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
