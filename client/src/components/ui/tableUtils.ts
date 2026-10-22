export type SortDirection = 'asc' | 'desc'
export interface SortSpec<T> { getValue: (row: T) => string | number | null | undefined; direction: SortDirection }
/** Pure table transforms make searching/sorting/filtering/pagination testable without a browser. */
export function prepareTable<T>(rows: readonly T[], options: { query: string; getSearchText: (row: T) => string; filter?: (row: T) => boolean; sort?: SortSpec<T>; page: number; pageSize: number }) {
  const query = options.query.trim().toLocaleLowerCase()
  const pageSize = Number.isFinite(options.pageSize) ? Math.max(1, Math.trunc(options.pageSize)) : 1
  const filtered = rows.filter((row) => (!query || options.getSearchText(row).toLocaleLowerCase().includes(query)) && (!options.filter || options.filter(row)))
  const sorted = filtered
  if (options.sort) {
    const { getValue, direction } = options.sort
    sorted.sort((a, b) => {
      const first = getValue(a), second = getValue(b)
      const delta = typeof first === 'number' && typeof second === 'number' ? first - second : String(first ?? '').localeCompare(String(second ?? ''), undefined, { numeric: true, sensitivity: 'base' })
      return direction === 'asc' ? delta : -delta
    })
  }
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const page = Math.min(Number.isFinite(options.page) ? Math.max(1, Math.trunc(options.page)) : 1, totalPages)
  return { items: sorted.slice((page - 1) * pageSize, page * pageSize), page, totalPages, total: sorted.length }
}
