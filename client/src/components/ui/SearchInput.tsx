import { Search, X } from 'lucide-react'
import { useId } from 'react'
export default function SearchInput({ value, onChange, label = 'Search records', placeholder = 'Search records…' }: { value: string; onChange: (value: string) => void; label?: string; placeholder?: string }) {
  const id = useId()
  return <div className="relative min-w-0 flex-1 md:basis-48"><label htmlFor={id} className="sr-only">{label}</label><Search size={17} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray" />
    <input id={id} type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="ui-input pl-10 pr-10" />
    {value && <button type="button" aria-label="Clear search" onClick={() => onChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted hover:text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"><X size={16} /></button>}</div>
}
