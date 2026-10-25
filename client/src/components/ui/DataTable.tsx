import { Children, isValidElement, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import SearchInput from './SearchInput'
import FilterBar from './FilterBar'
import type { FilterChoice } from './FilterBar'
import Pagination from './Pagination'
import EmptyState from './EmptyState'
import RecordCard from './RecordCard'
import { prepareTable } from './tableUtils'
import type { SortDirection } from './tableUtils'

export interface TableColumn<T> {
  id: string
  label: string
  cell: (row: T) => ReactNode
  sortValue?: (row: T) => string | number | null | undefined
  className?: string
  mobileRole?: 'title' | 'subtitle' | 'status' | 'actions' | 'field'
}

function containsControl(value: ReactNode): boolean {
  return Children.toArray(value).some((child) => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return false
    if (typeof child.type === 'string' && ['a', 'button', 'input', 'select', 'textarea'].includes(child.type)) return true
    return containsControl(child.props.children)
  })
}

function isActionColumn<T>(column: TableColumn<T>, value: ReactNode) {
  return column.mobileRole === 'actions'
    || /^(actions?|details|view|review|reopen|operations)$/i.test(column.id)
    || /^(actions?|details|view|review|reopen|operations)$/i.test(column.label.trim())
    || containsControl(value)
}

function isStatusColumn<T>(column: TableColumn<T>) {
  return column.mobileRole === 'status' || /status|state|result|stage/i.test(`${column.id} ${column.label}`)
}

export default function DataTable<T>({ rows, columns, getRowId, getSearchText, filterOptions, getFilterValue, caption = 'Records', pageSize = 8, emptyMessage }: {
  rows: readonly T[]
  columns: readonly TableColumn<T>[]
  getRowId: (row: T, index: number) => string
  getSearchText: (row: T) => string
  filterOptions?: FilterChoice[]
  getFilterValue?: (row: T) => string
  caption?: string
  pageSize?: number
  emptyMessage?: string
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [direction, setDirection] = useState<SortDirection>('asc')
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches)
  const resultsRef = useRef<HTMLDivElement>(null)
  const sortColumn = columns.find((col) => col.id === sortKey)
  const effectivePageSize = isMobile ? 5 : pageSize
  const result = useMemo(() => prepareTable(rows, {
    query,
    getSearchText,
    filter: filter && getFilterValue ? (row) => getFilterValue(row) === filter : undefined,
    sort: sortColumn?.sortValue ? { getValue: sortColumn.sortValue, direction } : undefined,
    page,
    pageSize: effectivePageSize,
  }), [rows, query, getSearchText, filter, getFilterValue, sortColumn, direction, page, effectivePageSize])
  const sortableColumns = columns.filter((column) => column.sortValue)
  const visibleRows = useMemo(() => result.items.map((row, index) => ({
    row,
    id: getRowId(row, index),
    cells: columns.map((column) => column.cell(row)),
  })), [result.items, columns, getRowId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const media = window.matchMedia('(max-width: 767px)')
    const update = () => {
      setIsMobile(media.matches)
      setPage(1)
    }
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  const changeSort = (id: string) => {
    if (id === sortKey) setDirection((previous) => previous === 'asc' ? 'desc' : 'asc')
    else { setSortKey(id); setDirection('asc') }
    setPage(1)
  }
  const selectSort = (value: string) => {
    if (!value) { setSortKey(null); setPage(1); return }
    const [id, nextDirection] = value.split(':')
    setSortKey(id)
    setDirection(nextDirection === 'desc' ? 'desc' : 'asc')
    setPage(1)
  }
  const changePage = (nextPage: number) => {
    setPage(nextPage)
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' }))
  }
  const statusIndex = columns.findIndex(isStatusColumn)
  const titleIndex = Math.max(0, columns.findIndex((column) => column.mobileRole === 'title'))
  const subtitleIndex = columns.findIndex((column) => column.mobileRole === 'subtitle')

  return <section className="overflow-hidden rounded-2xl border border-line bg-white">
    <div className="record-list-container">
      <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row">
        <SearchInput value={query} onChange={(value) => { setQuery(value); setPage(1) }} label={`Search ${caption}`} />
        {filterOptions && getFilterValue && <FilterBar label="Statuses" value={filter} options={filterOptions} onChange={(value) => { setFilter(value); setPage(1) }} />}
        {sortableColumns.length > 0 && <label className="record-list-mobile-sort min-w-0 sm:min-w-36">
          <span className="sr-only">Sort {caption}</span>
          <select aria-label={`Sort ${caption}`} value={sortKey ? `${sortKey}:${direction}` : ''} onChange={(event) => selectSort(event.target.value)} className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-charcoal outline-none focus-visible:border-navy focus-visible:ring-2 focus-visible:ring-navy/20">
            <option value="">Default order</option>
            {sortableColumns.flatMap((column) => [
              <option key={`${column.id}:asc`} value={`${column.id}:asc`}>{column.label} (ascending)</option>,
              <option key={`${column.id}:desc`} value={`${column.id}:desc`}>{column.label} (descending)</option>,
            ])}
          </select>
        </label>}
      </div>

      <div ref={resultsRef} className="record-list-results scroll-mt-20">
      {result.total === 0 ? <div className="p-4"><EmptyState message={emptyMessage ?? 'Try another search or filter, or return after records are added.'} /></div> : <>
        <div className="record-list-table w-full overflow-x-auto">
          <table className="w-full min-w-[600px] border-collapse text-left text-sm text-charcoal">
            <caption className="sr-only">{caption}</caption>
            <thead className="bg-mist text-xs uppercase tracking-wider text-navy"><tr>{columns.map((column) => <th scope="col" key={column.id} aria-sort={column.sortValue ? sortKey === column.id ? direction === 'asc' ? 'ascending' : 'descending' : 'none' : undefined} className={`px-4 py-3 font-semibold ${column.className ?? ''}`}>
              {column.sortValue ? <button type="button" className="flex items-center gap-1.5 rounded text-left hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy" onClick={() => changeSort(column.id)}>{column.label}{sortKey === column.id ? direction === 'asc' ? <ArrowUp size={14} aria-hidden /> : <ArrowDown size={14} aria-hidden /> : <ArrowUpDown size={14} aria-hidden />}</button> : column.label}
            </th>)}</tr></thead>
            <tbody>{visibleRows.map(({ id, cells }) => <tr key={id} className="border-t border-line align-top hover:bg-mist/60">{columns.map((column, index) => <td key={column.id} className={`px-4 py-3 ${column.className ?? ''}`}>{cells[index]}</td>)}</tr>)}</tbody>
          </table>
        </div>

        <div className="record-list-cards space-y-3 p-3" role="list" aria-label={`${caption} cards`}>
          {visibleRows.map(({ id, cells }) => {
            const actionIndices = columns.map((column, index) => isActionColumn(column, cells[index]) ? index : -1).filter((index) => index >= 0 && index !== titleIndex)
            const statusColumnIndex = statusIndex >= 0 && statusIndex !== titleIndex && !actionIndices.includes(statusIndex) ? statusIndex : -1
            const cardTitleIndex = columns.findIndex((column) => column.mobileRole === 'title') >= 0 ? titleIndex : 0
            const reserved = new Set([cardTitleIndex, statusColumnIndex, subtitleIndex, ...actionIndices].filter((index) => index >= 0))
            const fieldIndices = columns.map((_, index) => index).filter((index) => !reserved.has(index))
            const shownIndices = fieldIndices.slice(0, 3)
            const extraIndices = fieldIndices.slice(3)
            return <RecordCard
              key={id}
              title={cells[cardTitleIndex]}
              subtitle={subtitleIndex >= 0 && subtitleIndex !== cardTitleIndex ? cells[subtitleIndex] : undefined}
              status={statusColumnIndex >= 0 ? <><span className="sr-only">{columns[statusColumnIndex].label}: </span>{cells[statusColumnIndex]}</> : undefined}
              fields={shownIndices.map((index) => ({ label: columns[index].label, value: cells[index] }))}
              moreFields={extraIndices.map((index) => ({ label: columns[index].label, value: cells[index] }))}
              actions={actionIndices.length ? actionIndices.map((index) => <div className="flex flex-wrap gap-2" key={columns[index].id}>{cells[index]}</div>) : undefined}
            />
          })}
        </div>
      </>}
      </div>
      <Pagination page={result.page} totalPages={result.totalPages} total={result.total} pageSize={effectivePageSize} onChange={changePage} />
    </div>
  </section>
}
