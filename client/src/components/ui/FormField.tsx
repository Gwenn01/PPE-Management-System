import { useId } from 'react'
import type { HTMLInputTypeAttribute } from 'react'
export default function FormField({ label, name, value, onChange, error, hint, type = 'text', required = false, disabled = false, maxLength }: { label: string; name: string; value: string; onChange: (value: string) => void; error?: string; hint?: string; type?: HTMLInputTypeAttribute; required?: boolean; disabled?: boolean; maxLength?: number }) {
  const id = useId()
  const hintId = `${id}-hint`, errorId = `${id}-error`
  return <div className="space-y-1.5"><label htmlFor={id} className="block text-sm font-semibold text-navy">{label}{required && <span className="ml-1 text-red-700" aria-hidden>*</span>}</label>
    <input id={id} name={name} type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} disabled={disabled} maxLength={maxLength} aria-invalid={!!error} aria-describedby={[hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined} className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-charcoal outline-none focus-visible:border-navy focus-visible:ring-2 focus-visible:ring-navy/20 disabled:opacity-50" />
    {hint && <p id={hintId} className="text-xs text-gray">{hint}</p>}{error && <p id={errorId} role="alert" className="text-xs text-red-700">{error}</p>}</div>
}
