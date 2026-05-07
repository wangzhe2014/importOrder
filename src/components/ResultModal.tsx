import React from 'react';
import { CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { ImportResult } from '@/types';

interface ResultModalProps {
  result: ImportResult;
  onClose: () => void;
  onRetry: () => void;
}

export function ResultModal({ result, onClose, onRetry }: ResultModalProps) {
  const hasFailures = result.failed > 0;

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
            {hasFailures ? '部分提交成功' : '提交成功'}
          </h3>
          
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
                重试失败
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
