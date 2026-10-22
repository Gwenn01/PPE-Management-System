import { createContext, useContext } from 'react'
export type ToastVariant = 'success' | 'info' | 'error'
export interface ToastContextValue { notify: (message: string, variant?: ToastVariant) => void }
export const ToastContext = createContext<ToastContextValue | null>(null)
export function useToast(): ToastContextValue {
  const value = useContext(ToastContext)
  if (!value) throw new Error('useToast requires ToastProvider')
  return value
}
