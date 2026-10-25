import type { LucideIcon } from 'lucide-react'

export default function StatCard({ label, value, hint, icon: Icon, featured = false, compact = false }: { label: string; value: string; hint: string; icon?: LucideIcon; featured?: boolean; compact?: boolean }) {
  return <article className={`ui-panel relative flex min-w-0 flex-col overflow-hidden ${compact ? 'min-h-[112px] gap-1.5 p-3.5 sm:p-4' : 'p-5'} ${featured ? 'border-navy bg-navy text-white' : 'text-charcoal'}`}>
    <div className="flex items-start justify-between gap-3">
      <p className={`${compact ? 'pt-0 text-[11px] leading-4' : 'pt-1 text-xs leading-5'} font-medium ${featured ? 'text-white/80' : 'text-muted'}`}>{label}</p>
      {Icon && <span className={`shrink-0 rounded-lg ${compact ? 'p-1.5' : 'rounded-xl p-2.5'} ${featured ? 'bg-white/10 text-white' : 'bg-navy-soft text-navy'}`}><Icon size={compact ? 16 : 19} strokeWidth={1.7} aria-hidden /></span>}
    </div>
    <p className={`${compact ? 'my-0.5 text-[clamp(1.35rem,2vw,1.75rem)]' : 'mb-5 mt-3 text-[clamp(1.5rem,2.1vw,2rem)]'} break-words font-semibold leading-tight tracking-tight tabular-nums ${featured ? 'text-white' : 'text-navy'}`}>{value}</p>
    <p className={`${compact ? 'mt-auto text-[10px] leading-4' : 'mt-auto border-t pt-3 text-[11px] leading-5'} ${featured ? 'text-white/75' : 'text-muted'}`}>{hint}</p>
  </article>
}
