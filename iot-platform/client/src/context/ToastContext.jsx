import { createContext, useContext, useState, useCallback } from 'react'
import { X, CheckCircle, AlertTriangle, Info } from 'lucide-react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const add = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now() + Math.random()
    setToasts(t => [...t, { id, message, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), duration)
  }, [])

  const remove = useCallback((id) => {
    setToasts(t => t.filter(x => x.id !== id))
  }, [])

  const icons = {
    success: <CheckCircle size={16} style={{ color: 'var(--success)', flexShrink: 0 }} />,
    danger:  <AlertTriangle size={16} style={{ color: 'var(--danger)', flexShrink: 0 }} />,
    warning: <AlertTriangle size={16} style={{ color: 'var(--warning)', flexShrink: 0 }} />,
    info:    <Info size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />,
  }

  return (
    <ToastContext.Provider value={{ toast: add }}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            {icons[t.type] || icons.info}
            <span style={{ flex: 1, fontSize: 13 }}>{t.message}</span>
            <button
              onClick={() => remove(t.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 0 }}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
