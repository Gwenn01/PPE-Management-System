import { useId, useState } from 'react'
import { Upload } from 'lucide-react'
/** Client-side usability check only. Mock document service revalidates bytes, scope and permissions. */
export default function FileUpload({ onSelect, accept = '.pdf,.png,.jpg,.jpeg,.txt', maxBytes = 5 * 1024 * 1024, disabled = false }: { onSelect: (file: File) => void; accept?: string; maxBytes?: number; disabled?: boolean }) {
  const id = useId()
  const [error, setError] = useState('')
  return <div><label htmlFor={id} className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-line bg-mist p-6 text-center text-sm text-navy focus-within:ring-2 focus-within:ring-navy"><Upload aria-hidden size={23} /><span className="mt-2 font-semibold">Choose a document</span><span className="mt-1 text-xs text-charcoal">PDF, PNG, JPEG or text; up to {(maxBytes / 1024 / 1024).toFixed(0)} MiB</span><input id={id} type="file" accept={accept} disabled={disabled} className="sr-only" aria-describedby={error ? `${id}-error` : undefined} onChange={(event) => { const file = event.target.files?.[0]; setError(''); if (!file) return; if (!file.size || file.size > maxBytes) setError('Choose a nonempty file within the allowed size.'); else onSelect(file); event.target.value = '' }} /></label>{error && <p id={`${id}-error`} role="alert" className="mt-2 text-xs text-red-700">{error}</p>}</div>
}
