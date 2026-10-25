import type { ReactNode } from 'react'
export default function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return <header className="flex min-w-0 flex-wrap items-center justify-between gap-4 py-1">
    <div className="min-w-0 flex-1 basis-64">{eyebrow && <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{eyebrow}</p>}<h1 className="break-words text-2xl font-semibold tracking-tight text-navy sm:text-[28px] sm:leading-9">{title}</h1>{description && <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{description}</p>}</div>
    {actions && <div className="flex max-w-full flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
  </header>
}
