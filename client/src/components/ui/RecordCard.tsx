import type { ReactNode } from 'react'

export interface RecordCardField {
  label: string
  value: ReactNode
}

/** Compact mobile presentation for a single row, with optional extra details and actions. */
export default function RecordCard({
  title,
  subtitle,
  status,
  fields,
  moreFields = [],
  actions,
  selection,
}: {
  title: ReactNode
  subtitle?: ReactNode
  status?: ReactNode
  fields: RecordCardField[]
  moreFields?: RecordCardField[]
  actions?: ReactNode
  selection?: { checked: boolean; onChange: (checked: boolean) => void; label: string }
}) {
  return (
    <article role="listitem" className="min-w-0 rounded-xl border border-line bg-white p-4 shadow-sm shadow-navy/5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          {selection && <input type="checkbox" checked={selection.checked} onChange={(event) => selection.onChange(event.target.checked)} aria-label={selection.label} className="mt-1 size-4 shrink-0 accent-navy" />}
          <div className="min-w-0 break-words font-semibold text-navy">{title}</div>
        </div>
        {status && <div className="shrink-0">{status}</div>}
      </div>
      {subtitle && <div className="mt-1 break-words text-xs text-gray">{subtitle}</div>}

      {fields.length > 0 && <dl className="mt-3 grid min-w-0 grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-3">
        {fields.map((field, index) => <div className="min-w-0" key={`${field.label}-${index}`}>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray">{field.label}</dt>
          <dd className="mt-0.5 break-words text-sm text-charcoal">{field.value}</dd>
        </div>)}
      </dl>}

      {moreFields.length > 0 && <details className="mt-3 border-t border-line pt-2">
        <summary className="cursor-pointer rounded text-xs font-semibold text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy">More record details</summary>
        <dl className="mt-3 grid min-w-0 grid-cols-2 gap-x-4 gap-y-3">
          {moreFields.map((field, index) => <div className="min-w-0" key={`${field.label}-${index}`}>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray">{field.label}</dt>
            <dd className="mt-0.5 break-words text-sm text-charcoal">{field.value}</dd>
          </div>)}
        </dl>
      </details>}

      {actions && <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">{actions}</div>}
    </article>
  )
}
