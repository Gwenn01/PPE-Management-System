import { useId } from 'react'
import type { HTMLInputTypeAttribute } from 'react'
export default function FormField({ label, name, value, onChange, error, hint, type = 'text', required = false, disabled = false, maxLength }: { label: string; name: string; value: string; onChange: (value: string) => void; error?: string; hint?: string; type?: HTMLInputTypeAttribute; required?: boolean; disabled?: boolean; maxLength?: number }) {
  const id = useId()
  const hintId = `${id}-hint`, errorId = `${id}-error`
  return <div className="space-y-1.5"><label htmlFor={id} className="block text-xs font-semibold text-charcoal">{label}{required && <span className="ml-1 text-red-700" aria-hidden>*</span>}</label>
    <input id={id} name={name} type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} disabled={disabled} maxLength={maxLength} aria-invalid={!!error} aria-describedby={[hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined} className="ui-input" />
    {hint && <p id={hintId} className="text-xs text-muted">{hint}</p>}{error && <p id={errorId} role="alert" className="text-xs text-red-700">{error}</p>}</div>
}
