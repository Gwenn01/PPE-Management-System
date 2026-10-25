import { useId } from 'react'
export interface FilterChoice { value: string; label: string }
export default function FilterBar({ label, value, options, onChange }: { label: string; value: string; options: FilterChoice[]; onChange: (value: string) => void }) {
  const id = useId()
  return <div className="flex min-w-0 flex-col gap-1 md:min-w-36"><label htmlFor={id} className="sr-only">{label}</label><select id={id} value={value} onChange={(event) => onChange(event.target.value)} className="ui-input">
    <option value="">All {label.toLowerCase()}</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
  </select></div>
}
