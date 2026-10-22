export default function Pagination({ page, totalPages, total, pageSize, onChange }: { page: number; totalPages: number; total: number; pageSize: number; onChange: (page: number) => void }) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  return <nav aria-label="Table pagination" className="flex flex-wrap items-center justify-between gap-3 rounded-b-2xl border-t border-line px-4 py-3 text-xs text-charcoal">
    <span aria-live="polite">{start}–{Math.min(total, page * pageSize)} of {total}</span>
    <div className="flex items-center gap-3"><button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} className="rounded-lg border border-line px-3 py-2 font-semibold text-navy enabled:hover:bg-mist disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy">Previous</button><span>Page {page} / {totalPages}</span><button type="button" disabled={page >= totalPages} onClick={() => onChange(page + 1)} className="rounded-lg border border-line px-3 py-2 font-semibold text-navy enabled:hover:bg-mist disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy">Next</button></div>
  </nav>
}
