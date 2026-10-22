import type { LucideIcon } from 'lucide-react'
export default function StatCard({ label, value, hint, icon: Icon }: { label: string; value: string; hint: string; icon?: LucideIcon }) {
  return <article className="min-w-0 rounded-2xl border border-line bg-white p-5 shadow-sm shadow-navy/5">
    <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-wide text-gray">{label}</p>{Icon && <span className="rounded-lg bg-mist p-2 text-navy"><Icon size={19} aria-hidden /></span>}</div>
    <p className="mt-4 break-words text-3xl font-extrabold tabular-nums text-navy">{value}</p><p className="mt-2 text-xs leading-5 text-charcoal/75">{hint}</p>
  </article>
}
