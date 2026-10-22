export default function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase()
  const positive = ['active','completed','approved','verified','posted','success','in_service'].includes(normalized)
  const warning = ['pending','submitted','under_review','in_progress','returned','planned','draft'].includes(normalized)
  const negative = ['rejected','disabled','missing','cancelled','error'].includes(normalized)
  const color = positive ? 'bg-navy text-white border-navy' : warning ? 'bg-chip text-navy border-line' : negative ? 'bg-charcoal text-white border-charcoal' : 'bg-mist text-navy border-line'
  return <span className={`inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${color}`}>{status.replaceAll('_', ' ')}</span>
}
