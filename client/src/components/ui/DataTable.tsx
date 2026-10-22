import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import SearchInput from './SearchInput'
import FilterBar from './FilterBar'
import type { FilterChoice } from './FilterBar'
import Pagination from './Pagination'
import EmptyState from './EmptyState'
import { prepareTable } from './tableUtils'
import type { SortDirection } from './tableUtils'

export interface TableColumn<T> { id: string; label: string; cell: (row: T) => ReactNode; sortValue?: (row: T) => string | number | null | undefined; className?: string }
export default function DataTable<T>({ rows, columns, getRowId, getSearchText, filterOptions, getFilterValue, caption = 'Records', pageSize = 8, emptyMessage }: {
  rows: readonly T[]; columns: readonly TableColumn<T>[]; getRowId: (row: T) => string; getSearchText: (row: T) => string;
  filterOptions?: FilterChoice[]; getFilterValue?: (row: T) => string; caption?: string; pageSize?: number; emptyMessage?: string
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [direction, setDirection] = useState<SortDirection>('asc')
  const sortColumn = columns.find((col) => col.id === sortKey)
  const result = useMemo(() => prepareTable(rows, { query, getSearchText, filter: filter && getFilterValue ? (row) => getFilterValue(row) === filter : undefined, sort: sortColumn?.sortValue ? { getValue: sortColumn.sortValue, direction } : undefined, page, pageSize }), [rows, query, getSearchText, filter, getFilterValue, sortColumn, direction, page, pageSize])
  const changeSort = (id: string) => { if (id === sortKey) setDirection((previous) => previous === 'asc' ? 'desc' : 'asc'); else { setSortKey(id); setDirection('asc') }; setPage(1) }
  return <section className="overflow-hidden rounded-2xl border border-line bg-white">
    <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row"><SearchInput value={query} onChange={(value) => { setQuery(value); setPage(1) }} label={`Search ${caption}`} />{filterOptions && getFilterValue && <FilterBar label="Statuses" value={filter} options={filterOptions} onChange={(value) => { setFilter(value); setPage(1) }} />}</div>
    <div className="w-full overflow-x-auto"><table className="w-full min-w-[600px] border-collapse text-left text-sm text-charcoal"><caption className="sr-only">{caption}</caption><thead className="bg-mist text-xs uppercase tracking-wider text-navy"><tr>{columns.map((column) => <th scope="col" key={column.id} aria-sort={column.sortValue ? sortKey === column.id ? direction === 'asc' ? 'ascending' : 'descending' : 'none' : undefined} className={`px-4 py-3 font-semibold ${column.className ?? ''}`}>{column.sortValue ? <button type="button" className="flex items-center gap-1.5 rounded text-left hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy" onClick={() => changeSort(column.id)}>{column.label}{sortKey === column.id ? direction === 'asc' ? <ArrowUp size={14} aria-hidden /> : <ArrowDown size={14} aria-hidden /> : <ArrowUpDown size={14} aria-hidden />}</button> : column.label}</th>)}</tr></thead>
    <tbody>{result.items.map((row) => <tr key={getRowId(row)} className="border-t border-line align-top hover:bg-mist/60">{columns.map((column) => <td key={column.id} className={`px-4 py-3 ${column.className ?? ''}`}>{column.cell(row)}</td>)}</tr>)}</tbody></table>
    {result.total === 0 && <EmptyState message={emptyMessage ?? 'Try another search or filter, or return after records are added.'} />}</div>
    <Pagination page={result.page} totalPages={result.totalPages} total={result.total} pageSize={pageSize} onChange={setPage}/>
  </section>
}
