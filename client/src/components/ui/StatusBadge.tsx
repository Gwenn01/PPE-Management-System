export default function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase()
  const positive = ['active','completed','approved','verified','posted','success','in_service'].includes(normalized)
  const warning = ['pending','submitted','under_review','in_progress','returned','planned','draft','awaiting_recognition'].includes(normalized)
  const negative = ['rejected','disabled','missing','cancelled','error'].includes(normalized)
  const color = positive ? 'bg-navy-soft text-navy border-navy/15' : warning ? 'bg-mist text-charcoal border-line' : negative ? 'bg-charcoal text-white border-charcoal' : 'bg-white text-muted border-line'
  return <span className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold capitalize leading-4 ${color}`}><span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden /><span className="min-w-0 break-words">{status.replaceAll('_', ' ')}</span></span>
}
