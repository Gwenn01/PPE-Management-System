import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, ArrowRight, BookOpen, Building2, Calculator, CheckCheck, ClipboardCheck, ClipboardList, Coins, FileClock, FileSearch, HardHat, Landmark, Package, RefreshCw, Scale, ShieldCheck, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { CSSProperties } from 'react'
import DashboardOverview from '../../components/dashboard/DashboardOverview'
import { roleLabels, roleResponsibilities } from '../../config/roles'
import type { Role } from '../../config/roles'
import { useAuthenticatedUser } from '../../hooks/useAuthenticatedUser'
import { dashboardService } from '../../services/dashboardService'
import type { DashboardRecord, DashboardSnapshot } from '../../services/dashboardService'
import { DataTable, EmptyState, ErrorState, LoadingSkeleton, Modal, PageHeader, StatCard, StatusBadge, useToast } from '../../components/ui'
import type { TableColumn } from '../../components/ui/DataTable'

const metricIcons: Record<Role, LucideIcon[]> = {
  administrator: [Users, ClipboardList, Building2, Activity],
  property_officer: [Package, FileClock, HardHat, ClipboardCheck],
  accounting_officer: [BookOpen, Coins, Calculator, Scale],
  inventory_personnel: [ClipboardList, CheckCheck, FileSearch, Activity],
  approving_officer: [FileClock, CheckCheck, ClipboardList, ShieldCheck],
  auditor: [Package, Calculator, BookOpen, ShieldCheck],
  engineering_office: [HardHat, FileSearch, Building2],
  budget_office: [Landmark, FileClock, ClipboardList],
}
const roleHeadings: Record<Role, string> = {
  administrator: 'Administration Overview',
  property_officer: 'Property Operations',
  accounting_officer: 'Accounting Workspace',
  inventory_personnel: 'Inventory Overview',
  approving_officer: 'Approval Management',
  auditor: 'Audit & Compliance Overview',
  engineering_office: 'Engineering Projects',
  budget_office: 'Budget Processing Overview',
}
const primaryActions: Record<Role, { label: string; href: string }> = {
  administrator: { label: 'Review Account Requests', href: '/dashboard/account-requests' },
  property_officer: { label: 'Register New Asset', href: '/dashboard/asset-registration' },
  accounting_officer: { label: 'Open Accounting Work Queue', href: '/dashboard/accounting-documents' },
  inventory_personnel: { label: 'View Assigned Sessions', href: '/dashboard/physical-inventory' },
  approving_officer: { label: 'Review Pending Approvals', href: '/dashboard/approvals' },
  auditor: { label: 'Open Audit Trail', href: '/dashboard/audit-trail' },
  engineering_office: { label: 'Open Engineering Workspace', href: '/dashboard/engineering' },
  budget_office: { label: 'Open Budget Workspace', href: '/dashboard/budget' },
}
const formatValue = (value: number, type: 'count' | 'currency') => type === 'currency' ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(value / 100) : new Intl.NumberFormat('en-PH').format(value)
const readableDate = (value: string) => Number.isNaN(Date.parse(value)) ? value : new Date(value).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })

export default function DashboardHome() {
  const { user, session } = useAuthenticatedUser()
  const { notify } = useToast()
  const [loaded, setLoaded] = useState<{ sessionId: string; snapshot: DashboardSnapshot } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [revision, setRevision] = useState(0)
  const [selected, setSelected] = useState<{ sessionId: string; id: string } | null>(null)
  const current = loaded?.sessionId === session.sessionId && loaded.snapshot.role === user.role && loaded.snapshot.municipalityId === user.municipalityId ? loaded.snapshot : null
  const detail = selected?.sessionId === session.sessionId ? current?.records.find((row) => row.id === selected.id) ?? null : null

  useEffect(() => {
    let active = true
    const context = { actor: user, municipalityId: user.municipalityId, sessionId: session.sessionId }
    void dashboardService.getSnapshot(context).then((result) => {
      if (!active) return
      if (result.ok) { setLoaded({ sessionId: session.sessionId, snapshot: result.data }); setError('') }
      else { setLoaded(null); setError(result.error.message) }
      setLoading(false)
      setRefreshing(false)
    }).catch(() => {
      if (!active) return
      setLoaded(null)
      setError('Unable to open the municipal dashboard. Please retry.')
      setLoading(false)
      setRefreshing(false)
    })
    return () => { active = false }
  }, [user, session.sessionId, revision])

  const refresh = useCallback(() => { setRefreshing(true); setRevision((value) => value + 1); notify('Refreshing dashboard records…') }, [notify])
  const tableColumns: TableColumn<DashboardRecord>[] = useMemo(() => user.role === 'administrator' ? [
    { id: 'title', label: 'Event / Record', sortValue: (row) => row.title, cell: (row) => <div className="min-w-0"><p className="font-semibold text-navy">{row.href ? <Link className="underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-navy" to={row.href}>{row.title}</Link> : row.title}</p><p className="mt-1 max-w-md break-words text-xs text-charcoal/75">{row.detail}</p></div> },
    { id: 'actor', label: 'Actor', sortValue: (row) => row.actor ?? '', cell: (row) => <span className="text-sm text-charcoal">{row.actor ?? '—'}</span> },
    { id: 'resource', label: 'Record Type', sortValue: (row) => row.resource ?? '', cell: (row) => <span className="capitalize text-sm text-charcoal">{row.resource?.replaceAll('_', ' ') ?? '—'}</span> },
    { id: 'status', label: 'Status', sortValue: (row) => row.status, cell: (row) => <StatusBadge status={row.status} /> },
    { id: 'date', label: 'Date', sortValue: (row) => row.timestamp, cell: (row) => <time dateTime={row.timestamp} className="whitespace-nowrap text-xs text-charcoal">{readableDate(row.timestamp)}</time> },
    { id: 'details', label: 'Details', cell: (row) => <button type="button" onClick={() => setSelected({ sessionId: session.sessionId, id: row.id })} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-navy hover:bg-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy" aria-label={`View details for ${row.title}`}>View</button> },
  ] : [
    { id: 'title', label: 'Record / activity', sortValue: (row) => row.title, cell: (row) => <div className="min-w-0"><p className="font-semibold text-navy">{row.href ? <Link className="underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-navy" to={row.href}>{row.title}</Link> : row.title}</p><p className="mt-1 max-w-md break-words text-xs text-charcoal/75">{row.detail}</p></div> },
    { id: 'status', label: 'Status', sortValue: (row) => row.status, cell: (row) => <StatusBadge status={row.status} /> },
    { id: 'date', label: 'Updated', sortValue: (row) => row.timestamp, cell: (row) => <time dateTime={row.timestamp} className="whitespace-nowrap text-xs text-charcoal">{readableDate(row.timestamp)}</time> },
    { id: 'details', label: 'Details', cell: (row) => <button type="button" onClick={() => setSelected({ sessionId: session.sessionId, id: row.id })} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-navy hover:bg-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy" aria-label={`View details for ${row.title}`}>View</button> },
  ], [session.sessionId, user.role])
  const statuses = useMemo(() => current ? [...new Set(current.records.map((row) => row.status))].sort().map((status) => ({ value: status, label: status.replaceAll('_', ' ') })) : [], [current])
  const searchText = useCallback((row: DashboardRecord) => `${row.title} ${row.detail} ${row.status} ${row.actor ?? ''} ${row.resource ?? ''} ${row.id}`, [])
  const getId = useCallback((row: DashboardRecord) => row.id, [])
  const getStatus = useCallback((row: DashboardRecord) => row.status, [])
  const primaryMetrics = user.role === 'budget_office' ? current?.metrics.slice(0, 4) ?? [] : current?.metrics ?? []
  const supportingMetrics = user.role === 'budget_office' ? current?.metrics.slice(4) ?? [] : []
  const primaryAction = primaryActions[user.role]

  return <div className="workspace-page dashboard-page pb-6">
    <PageHeader eyebrow={`${session.municipality.name} · ${roleLabels[user.role]}`} title={roleHeadings[user.role]} description={roleResponsibilities[user.role]} actions={<div className="flex flex-wrap items-center gap-2"><Link to={primaryAction.href} className="ui-button"><ArrowRight aria-hidden size={16} />{primaryAction.label}</Link><button type="button" onClick={refresh} disabled={refreshing || loading} className="ui-button-secondary"><RefreshCw aria-hidden size={16} className={refreshing ? 'animate-spin' : ''} />Refresh data</button></div>} />
    {user.role === 'auditor' && <p className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-xs text-charcoal"><ShieldCheck size={16} aria-hidden /> Read-only dashboard and records</p>}

    {(loading && !current) ? <LoadingSkeleton count={user.role === 'budget_office' || user.role === 'engineering_office' ? 3 : 4} /> : error ? <ErrorState message={error} onRetry={refresh} /> : current ? <>
      <section className="dashboard-kpi-section" aria-labelledby="metric-heading"><div className="mb-2 flex items-end justify-between gap-3"><h2 id="metric-heading" className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">At a glance</h2><span className="text-[11px] text-muted">{session.municipality.name}</span></div><div className="dashboard-metrics" style={{ '--metric-columns': primaryMetrics.length === 3 ? 3 : 4 } as CSSProperties}>{primaryMetrics.map((metric, index) => <StatCard key={metric.id} label={metric.label} value={formatValue(metric.value, metric.format)} hint={metric.hint} icon={metricIcons[user.role][index]} featured={user.role === 'administrator' ? index === 1 : index === 0} compact />)}</div>
        {supportingMetrics.length > 0 && <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">{supportingMetrics.map((metric, index) => <StatCard key={metric.id} label={metric.label} value={formatValue(metric.value, metric.format)} hint={metric.hint} icon={metricIcons[user.role][index + 4]} />)}</div>}
      </section>

      <DashboardOverview snapshot={current} onInspect={(row) => setSelected({ sessionId: session.sessionId, id: row.id })} />
      <section id="recent-records" className="min-w-0 scroll-mt-5 space-y-3" aria-labelledby="recent-heading">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="recent-heading" className="text-base font-semibold text-navy">{current.recordsTitle}</h2><span className="text-xs text-muted">{current.records.length} recent records</span></div>
        {current.records.length ? <DataTable rows={current.records} columns={tableColumns} getRowId={getId} getSearchText={searchText} getFilterValue={getStatus} filterOptions={statuses} caption={current.recordsTitle} emptyMessage="No records match these search and status filters." /> : <div className="ui-panel"><EmptyState title="Nothing to review" message="No relevant records have been saved in this municipality." /></div>}
      </section>
    </> : <LoadingSkeleton />}
    <Modal open={!!detail && !!current} title="Record details" onClose={() => setSelected(null)}><div className="space-y-3"><p className="break-words font-semibold text-navy">{detail?.title}</p><p>{detail?.detail}</p>{detail && <div className="flex flex-wrap items-center gap-3"><StatusBadge status={detail.status} /><time dateTime={detail.timestamp} className="text-xs text-muted">{readableDate(detail.timestamp)}</time></div>}<p className="text-xs text-muted">This is a read-only dashboard summary. Record changes must use an authorized, completed module.</p></div></Modal>
  </div>
}
