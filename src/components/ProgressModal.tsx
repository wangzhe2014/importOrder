interface ProgressModalProps {
  progress: number
  current: number
  total: number
  message: string
}

export function ProgressModal({ progress, current, total, message }: ProgressModalProps) {
  const safeProgress = Math.max(0, Math.min(100, progress))
  const showCount = total > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-md rounded-xl bg-white p-8">
        <div className="text-center">
          <div className="relative mx-auto mb-4 h-16 w-16">
            <svg className="h-full w-full -rotate-90 transform">
              <circle cx="32" cy="32" r="28" stroke="#f3f4f6" strokeWidth="8" fill="none" />
              <circle
                cx="32"
                cy="32"
                r="28"
                stroke="#0fc6c2"
                strokeWidth="8"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${safeProgress * 1.76} 176`}
                className="transition-all duration-300"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xl font-bold text-gray-800">{Math.round(safeProgress)}%</span>
            </div>
          </div>

          <p className="mb-4 text-gray-600">{message}</p>

          {showCount && (
            <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
              <span>{current}</span>
              <span>/</span>
              <span>{total}</span>
              <span>条</span>
            </div>
          )}

          <div className="mt-4 h-2 w-full rounded-full bg-gray-200">
            <div
              className="h-2 rounded-full bg-[#0fc6c2] transition-all duration-300"
              style={{ width: `${safeProgress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
