import { useEffect } from 'react'

export type ToastType = 'success' | 'error' | 'info'

export interface ToastProps {
  message: string
  type: ToastType
  onClose: () => void
  duration?: number
}

export function Toast({ message, type, onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose()
    }, duration)

    return () => clearTimeout(timer)
  }, [duration, onClose])

  const icons = {
    success: '✅',
    error: '❌',
    info: 'ℹ️',
  }

  const colors = {
    success: 'bg-green-500 border-green-400',
    error: 'bg-red-500 border-red-400',
    info: 'bg-blue-500 border-blue-400',
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
      <div className="pointer-events-auto animate-toast">
        <div
          className={`
            ${colors[type]}
            border-2 rounded-2xl shadow-2xl
            px-8 py-6 min-w-[320px] max-w-md
            backdrop-blur-sm
          `}
        >
          <div className="flex items-center space-x-4">
            <div className="text-4xl">{icons[type]}</div>
            <div className="flex-1">
              <p className="text-white font-bold text-lg">{message}</p>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white text-2xl leading-none"
            >
              ×
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

