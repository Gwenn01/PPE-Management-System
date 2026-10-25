import { useId } from 'react'
import type { SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string
  options: readonly (string | { value: string; label: string; disabled?: boolean })[]
  placeholder: string
  error?: string
  wrapperClassName?: string
}

export default function SelectField({
  label,
  options,
  placeholder,
  error,
  wrapperClassName = '',
  value,
  ...rest
}: SelectFieldProps) {
  const id = useId()

  return (
    <div className={wrapperClassName}>
      <label
        htmlFor={id}
        className="auth-field-label block text-[11px] font-semibold uppercase tracking-wider text-gray"
      >
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`auth-field-control w-full appearance-none border-b bg-transparent py-2 pr-8 text-[15px] outline-none transition-colors focus:border-navy ${
            value ? 'text-charcoal' : 'text-gray/70'
          } ${error ? 'border-red-600' : 'border-line'}`}
          {...rest}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={typeof option === 'string' ? option : option.value} value={typeof option === 'string' ? option : option.value} disabled={typeof option === 'string' ? false : option.disabled}>
              {typeof option === 'string' ? option : option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-0 top-1/2 h-4 w-4 -translate-y-1/2 text-gray" />
      </div>
      {error && <p id={`${id}-error`} className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
