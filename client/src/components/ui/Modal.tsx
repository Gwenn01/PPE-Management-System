import { useEffect, useId, useRef } from 'react'
import type { ReactNode, KeyboardEvent, MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

/** Dialog portal with Escape close, tab containment and focus restoration. */
export default function Modal({ open, title, onClose, children, footer }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = dialogRef.current
    const first = dialog?.querySelector<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')
    ;(first ?? dialog)?.focus()
    return () => { previous?.focus() }
  }, [open])
  if (!open || typeof document === 'undefined') return null
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); return }
    if (event.key !== 'Tab') return
    const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]') ?? []).filter((node) => node.getClientRects().length > 0)
    if (!controls.length) { event.preventDefault(); return }
    if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls[controls.length - 1].focus() }
    else if (!event.shiftKey && document.activeElement === controls[controls.length - 1]) { event.preventDefault(); controls[0].focus() }
  }
  const onBackdrop = (event: MouseEvent<HTMLDivElement>) => { if (event.target === event.currentTarget) onClose() }
  return createPortal(<div onMouseDown={onBackdrop} className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto overscroll-contain bg-charcoal/65 p-3 sm:p-6">
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown} className="my-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-xl overflow-y-auto rounded-2xl border border-line bg-white p-4 shadow-2xl outline-none sm:max-h-[calc(100dvh-3rem)] sm:p-7">
      <div className="flex items-start justify-between gap-4"><h2 id={titleId} className="text-xl font-extrabold text-navy">{title}</h2><button type="button" onClick={onClose} aria-label="Close dialog" className="rounded-lg p-2 text-gray hover:bg-mist hover:text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"><X size={20} /></button></div>
      <div className="mt-5 text-sm text-charcoal">{children}</div>{footer && <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-line pt-4">{footer}</div>}
    </div>
  </div>, document.body)
}
