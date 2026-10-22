import { useCallback, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { ToastContext } from './ToastContext'
import type { ToastVariant } from './ToastContext'
interface Notice { id: number; message: string; variant: ToastVariant }
export default function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Notice[]>([])
  const nextId = useRef(0)
  const notify = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = ++nextId.current
    setMessages((old) => [...old, { id, message, variant }].slice(-4))
  }, [])
  const value = useMemo(() => ({ notify }), [notify])
  return <ToastContext.Provider value={value}>{children}<div className="fixed bottom-4 right-4 z-[100] flex w-[min(25rem,calc(100vw-2rem))] flex-col gap-2" role="region" aria-label="Notifications">{messages.map((item) => <div key={item.id} role={item.variant === 'error' ? 'alert' : 'status'} className="flex items-start justify-between gap-2 rounded-xl border border-line bg-white p-4 text-sm text-charcoal shadow-xl"><p>{item.message}</p><button type="button" aria-label="Dismiss notification" onClick={() => setMessages((old) => old.filter((row) => row.id !== item.id))} className="rounded p-1 text-gray hover:text-navy focus-visible:outline-2 focus-visible:outline-navy"><X size={18}/></button></div>)}</div></ToastContext.Provider>
}
