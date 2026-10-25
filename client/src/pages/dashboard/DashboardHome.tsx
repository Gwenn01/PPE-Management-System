import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, ArrowRight, BookOpen, Building2, Calculator, CheckCheck, ClipboardCheck, ClipboardList, Coins, FileClock, FileSearch, HardHat, Landmark, Package, RefreshCw, Scale, ShieldCheck, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { roleLabels, roleResponsibilities } from '../../config/roles'
import type { Role } from '../../config/roles'
import DemoAccountSwitcher from '../../features/auth/DemoAccountSwitcher'
import { useAuthenticatedUser } from '../../hooks/useAuthenticatedUser'
import { dashboardService } from '../../services/dashboardService'
import type { DashboardRecord, DashboardSnapshot } from '../../services/dashboardService'
import { ActivityTimeline, DataTable, EmptyState, ErrorState, LoadingSkeleton, Modal, PageHeader, StatCard, StatusBadge, useToast } from '../../components/ui'
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
  administrator: 'Administration overview',
  property_officer: 'Property operations',
  accounting_officer: 'Accounting workspace',
  inventory_personnel: 'Inventory assignments',
  approving_officer: 'Approval overview',
  auditor: 'Audit and compliance overview',
  engineering_office: 'Engineering projects',
  budget_office: 'Budget routing overview',
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
  const tableColumns: TableColumn<DashboardRecord>[] = useMemo(() => [
    { id: 'title', label: 'Record / activity', sortValue: (row) => row.title, cell: (row) => <div className="min-w-0"><p className="font-semibold text-navy">{row.href ? <Link className="underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-navy" to={row.href}>{row.title}</Link> : row.title}</p><p className="mt-1 max-w-md break-words text-xs text-charcoal/75">{row.detail}</p></div> },
    { id: 'status', label: 'Status', sortValue: (row) => row.status, cell: (row) => <StatusBadge status={row.status} /> },
    { id: 'date', label: 'Updated', sortValue: (row) => row.timestamp, cell: (row) => <time dateTime={row.timestamp} className="whitespace-nowrap text-xs text-charcoal">{readableDate(row.timestamp)}</time> },
    { id: 'details', label: 'Details', cell: (row) => <button type="button" onClick={() => setSelected({ sessionId: session.sessionId, id: row.id })} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-navy hover:bg-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy" aria-label={`View details for ${row.title}`}>View</button> },
  ], [session.sessionId])
  const statuses = useMemo(() => current ? [...new Set(current.records.map((row) => row.status))].sort().map((status) => ({ value: status, label: status.replaceAll('_', ' ') })) : [], [current])
  const searchText = useCallback((row: DashboardRecord) => `${row.title} ${row.detail} ${row.status} ${row.id}`, [])
  const getId = useCallback((row: DashboardRecord) => row.id, [])
  const getStatus = useCallback((row: DashboardRecord) => row.status, [])

  return <div className="mx-auto max-w-7xl space-y-7 pb-8">
    <section className="rounded-2xl border border-line bg-white p-5 sm:p-7">
      <PageHeader eyebrow={`${session.municipality.name} · ${roleLabels[user.role]}`} title={roleHeadings[user.role]} description={`${user.name.split(' ')[0]}, ${roleResponsibilities[user.role]}`} actions={<button type="button" onClick={refresh} disabled={refreshing || loading} className="inline-flex items-center gap-2 rounded-xl border border-navy px-4 py-2.5 text-sm font-semibold text-navy transition-colors enabled:hover:bg-mist disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"><RefreshCw aria-hidden size={16} className={refreshing ? 'animate-spin' : ''} />Refresh data</button>}/>
      {import.meta.env.DEV && <div className="mt-4 sm:hidden"><DemoAccountSwitcher /></div>}
      {user.role === 'auditor' && <p className="mt-4 inline-flex items-center gap-2 rounded-lg bg-mist px-3 py-2 text-xs text-charcoal"><ShieldCheck size={17} aria-hidden /> Your dashboard and services are read-only.</p>}
    </section>

    {(loading && !current) ? <LoadingSkeleton count={user.role === 'budget_office' || user.role === 'engineering_office' ? 3 : 4} /> : error ? <ErrorState message={error} onRetry={refresh} /> : current ? <>
      <section aria-labelledby="metric-heading"><h2 id="metric-heading" className="mb-3 text-sm font-bold text-navy">At a glance</h2><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{current.metrics.map((metric, index) => <StatCard key={metric.id} label={metric.label} value={formatValue(metric.value, metric.format)} hint={metric.hint} icon={metricIcons[user.role][index]} />)}</div></section>
      {user.role !== 'administrator' && <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(250px,320px)]" aria-label="Dashboard information">
        <div className="min-w-0 rounded-2xl border border-line bg-white p-5 sm:p-6"><h2 className="text-base font-bold text-navy">Quick actions</h2><p className="mt-1 text-xs leading-5 text-charcoal">Access frequently used modules and review recent activities.</p><div className="mt-4 flex flex-wrap gap-2"><a href="#recent-records" className="inline-flex items-center gap-2 rounded-xl border border-line bg-mist px-4 py-2.5 text-sm font-semibold text-navy hover:border-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy">Explore {user.role === 'approving_officer' ? 'approval records' : 'dashboard records'}<ArrowRight size={14} aria-hidden /></a></div></div>
        <div className="min-w-0 rounded-2xl border border-line bg-white p-5 sm:p-6"><h2 className="text-base font-bold text-navy">Records</h2><p className="mt-2 text-xs leading-5 text-charcoal">{current.description}</p><p className="mt-2 text-xs font-semibold text-gray">{session.municipality.name} records · Stored in this browser</p></div>
      </section>}
      <section id="recent-records" className="scroll-mt-24 space-y-4" aria-labelledby="recent-heading"><div><h2 id="recent-heading" className="text-lg font-extrabold text-navy">{current.recordsTitle}</h2><p className="mt-1 text-sm text-charcoal">Search, sort and filter the read-only records below. All results reflect current stored data.</p></div>
        {current.records.length ? <DataTable rows={current.records} columns={tableColumns} getRowId={getId} getSearchText={searchText} getFilterValue={getStatus} filterOptions={statuses} caption={current.recordsTitle} emptyMessage="No records match these search and status filters." /> : <div className="rounded-2xl border border-line bg-white"><EmptyState title="Nothing to review" message="No relevant records have been saved in this municipality." /></div>}
      </section>
      {user.role === 'auditor' && <section aria-labelledby="timeline-heading" className="rounded-2xl border border-line bg-white p-5 sm:p-6"><h2 id="timeline-heading" className="mb-4 text-lg font-extrabold text-navy">Recent timeline</h2><ActivityTimeline events={current.records.slice(0, 5).map((row) => ({ id: row.id, title: row.title, description: row.detail, status: row.status, timestamp: row.timestamp }))} /></section>}
    </> : <LoadingSkeleton />}
    <Modal open={!!detail && !!current} title="Record details" onClose={() => setSelected(null)}><div className="space-y-3"><p className="break-words font-semibold text-navy">{detail?.title}</p><p>{detail?.detail}</p>{detail && <div className="flex flex-wrap items-center gap-3"><StatusBadge status={detail.status} /><time dateTime={detail.timestamp} className="text-xs text-gray">{readableDate(detail.timestamp)}</time></div>}<p className="text-xs text-gray">This is a read-only dashboard summary. Record changes must use an authorized, completed module.</p></div></Modal>
  </div>
}
