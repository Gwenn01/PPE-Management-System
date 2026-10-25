export default function Pagination({ page, totalPages, total, pageSize, onChange }: { page: number; totalPages: number; total: number; pageSize: number; onChange: (page: number) => void }) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  return <nav aria-label="Record pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-3 py-3 text-xs text-muted sm:px-4">
    <span aria-live="polite">Showing {start}–{Math.min(total, page * pageSize)} of {total} records</span>
    <div className="flex max-w-full flex-wrap items-center gap-2">
      <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} className="ui-button-secondary min-h-11 px-3 text-xs">Previous</button>
      <span className="tabular-nums">Page {page} of {totalPages}</span>
      <button type="button" disabled={page >= totalPages} onClick={() => onChange(page + 1)} className="ui-button-secondary min-h-11 px-3 text-xs">Next</button>
    </div>
  </nav>
}
