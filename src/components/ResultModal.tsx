import React from 'react';
import { AlertTriangle, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { ImportResult } from '@/types';

interface ResultModalProps {
  result: ImportResult;
  onClose: () => void;
  onRetry: () => void;
}

export function ResultModal({ result, onClose, onRetry }: ResultModalProps) {
  const hasFailures = result.failed > 0;
  const reasonList = result.failedReasons?.length
    ? result.failedReasons
    : (result.error || result.message)
      ? [{ message: result.error || result.message || '提交失败，但服务端未返回具体原因' }]
      : [];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-8 w-full max-w-md mx-4">
        <div className="text-center">
          {hasFailures ? (
            <div className="w-20 h-20 mx-auto mb-4 bg-yellow-100 rounded-full flex items-center justify-center">
              <XCircle className="w-10 h-10 text-yellow-500" />
            </div>
          ) : (
            <div className="w-20 h-20 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-green-500" />
            </div>
          )}
          
          <h3 className={`text-xl font-semibold mb-2 ${hasFailures ? 'text-yellow-700' : 'text-green-700'}`}>
            {hasFailures ? (result.success > 0 ? '部分提交成功' : '提交失败') : '提交成功'}
          </h3>
          {hasFailures && (
            <p className="text-sm text-gray-500">
              请根据失败原因修正配置或稍后重试。
            </p>
          )}
          
          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <span className="text-gray-700">成功提交</span>
              </div>
              <span className="text-green-600 font-bold text-lg">{result.success}</span>
            </div>
            
            {hasFailures && (
              <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-red-500" />
                  <span className="text-gray-700">提交失败</span>
                </div>
                <span className="text-red-600 font-bold text-lg">{result.failed}</span>
              </div>
            )}
          </div>

          {hasFailures && (
            <div className="mt-4 text-left">
              <div className="flex items-center gap-2 mb-2 text-sm font-medium text-red-700">
                <AlertTriangle className="w-4 h-4" />
                失败原因
              </div>
              <div className="max-h-36 overflow-y-auto rounded-lg border border-red-100 bg-red-50/60 p-3 space-y-2">
                {reasonList.length > 0 ? (
                  reasonList.map((reason, index) => (
                    <div key={index} className="text-sm text-red-700 leading-5">
                      {reason.rowIndex ? `第 ${reason.rowIndex} 行：` : ''}
                      {reason.message}
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-red-700 leading-5">
                    提交失败，但服务端未返回具体原因。请检查数据库配置、网络连接或服务端日志。
                  </div>
                )}
              </div>
            </div>
          )}
          
          <div className="mt-6 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              关闭
            </button>
            {hasFailures && (
              <button
                onClick={onRetry}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                重新提交
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
