import { createContext, useCallback, useContext, useState } from 'react'

const ToastCtx = createContext({ toast: () => {}, dismiss: () => {} })

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])

  const dismiss = useCallback((id) => {
    setItems((s) => s.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback((message, kind = 'info', durationMs = 4000) => {
    const id = `${Date.now()}-${Math.random()}`
    setItems((s) => [...s, { id, message, kind }])
    if (durationMs > 0) setTimeout(() => dismiss(id), durationMs)
    return id
  }, [dismiss])

  return (
    <ToastCtx.Provider value={{ toast, dismiss }}>
      {children}
      <Viewport items={items} dismiss={dismiss} />
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx).toast

const STYLES = {
  success: { bg: 'bg-emerald-500/15', border: 'border-emerald-500/40', icon: '✓', iconCls: 'text-emerald-400' },
  error:   { bg: 'bg-red-500/15',     border: 'border-red-500/40',     icon: '✕', iconCls: 'text-red-400' },
  warning: { bg: 'bg-amber-500/15',   border: 'border-amber-500/40',   icon: '⚠', iconCls: 'text-amber-400' },
  info:    { bg: 'bg-primary/15',     border: 'border-primary/40',     icon: 'ℹ', iconCls: 'text-primary' },
}

function Viewport({ items, dismiss }) {
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col-reverse gap-2 pointer-events-none w-[min(360px,calc(100vw-2rem))]">
      {items.map((t) => {
        const s = STYLES[t.kind] || STYLES.info
        return (
          <button
            key={t.id}
            onClick={() => dismiss(t.id)}
            className={`pointer-events-auto card text-left ${s.bg} border ${s.border} px-4 py-3 flex items-start gap-3
                        animate-[toastIn_180ms_ease-out] hover:bg-card-hover transition-colors`}
            aria-live="polite"
            role="status"
          >
            <span className={`text-base leading-none ${s.iconCls}`}>{s.icon}</span>
            <span className="text-sm text-gray-100 flex-1">{t.message}</span>
            <span className="text-gray-500 text-xs leading-none">×</span>
          </button>
        )
      })}
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(8px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  )
}
