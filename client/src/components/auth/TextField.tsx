import { useId, useState } from 'react'
import type { InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  error?: string
  wrapperClassName?: string
}

export default function TextField({
  label,
  error,
  type = 'text',
  wrapperClassName = '',
  ...rest
}: TextFieldProps) {
  const id = useId()
  const [visible, setVisible] = useState(false)
  const isPassword = type === 'password'

  return (
    <div className={wrapperClassName}>
      <label
        htmlFor={id}
        className="block text-[11px] font-semibold uppercase tracking-wider text-gray"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={isPassword && visible ? 'text' : type}
          aria-invalid={Boolean(error)}
          className={`w-full border-b bg-transparent py-2 pr-8 text-[15px] text-charcoal outline-none transition-colors placeholder:text-gray/60 focus:border-navy ${
            error ? 'border-red-600' : 'border-line'
          }`}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            className="absolute right-0 top-1/2 -translate-y-1/2 text-gray transition-colors hover:text-navy"
          >
            {visible ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
