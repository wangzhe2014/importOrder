import React from 'react';

interface ProgressModalProps {
  progress: number;
  current: number;
  total: number;
  message: string;
}

export function ProgressModal({ progress, current, total, message }: ProgressModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-8 w-full max-w-md mx-4">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 relative">
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="32"
                cy="32"
                r="28"
                stroke="#f3f4f6"
                strokeWidth="8"
                fill="none"
              />
              <circle
                cx="32"
                cy="32"
                r="28"
                stroke="#3b82f6"
                strokeWidth="8"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${progress * 1.76} 176`}
                className="transition-all duration-300"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xl font-bold text-gray-800">{Math.round(progress)}%</span>
            </div>
          </div>
          
          <p className="text-gray-600 mb-4">{message}</p>
          
          <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
            <span>{current}</span>
            <span>/</span>
            <span>{total}</span>
            <span>条</span>
          </div>
          
          <div className="mt-4 w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
