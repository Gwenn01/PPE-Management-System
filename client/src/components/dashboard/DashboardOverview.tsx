import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, ChartNoAxesColumnIncreasing, Clock3 } from 'lucide-react'
import type { Role } from '../../config/roles'
import type { DashboardPanel, DashboardPanelItem, DashboardRecord, DashboardSnapshot } from '../../services/dashboardService'
import { EmptyState, StatusBadge } from '../ui'

const panelHeadings: Record<Role, { primary: string; secondary: string }> = {
  administrator: { primary: 'Pending Account Registrations', secondary: 'Recent Administrative Activity' },
  property_officer: { primary: 'Asset Portfolio Distribution', secondary: 'Property Request Pipeline' },
  accounting_officer: { primary: 'Posted Accounting Overview', secondary: 'Accounting Workload' },
  inventory_personnel: { primary: 'Inventory Verification Progress', secondary: 'Discrepancy Summary' },
  approving_officer: { primary: 'Pending Approvals Queue', secondary: 'Approval Status Distribution' },
  auditor: { primary: 'Audit Activity Explorer', secondary: 'Audit Record Distribution' },
  engineering_office: { primary: 'Construction Project Monitoring', secondary: 'Engineering Routing Status' },
  budget_office: { primary: 'Received Documents Queue', secondary: 'Budget Processing Stages' },
}

function dateLabel(value: string) {
  return Number.isNaN(Date.parse(value)) ? value : new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

function compactCount(value: number, format: 'count' | 'currency' = 'count') {
  if (format === 'currency') return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(value / 100)
  return new Intl.NumberFormat('en-PH').format(value)
}

function AdminDashboardOverview({ snapshot }: { snapshot: DashboardSnapshot }) {
  const applicants = snapshot.pendingApplicants ?? []
  const activity = snapshot.administrativeActivity ?? []
  const userStatuses = snapshot.userStatuses ?? []
  const departments = snapshot.departmentSummary ?? []
  const totalUsers = userStatuses.reduce((total, row) => total + row.count, 0)

  return <div className="dashboard-bento dashboard-admin-bento">
    <section className="ui-panel dashboard-bento-panel dashboard-admin-queue" aria-labelledby="admin-queue-heading">
      <div className="dashboard-panel-heading"><div><p className="dashboard-overline">Needs review</p><h2 id="admin-queue-heading">{panelHeadings.administrator.primary}</h2></div><Link to="/dashboard/account-requests" className="dashboard-panel-link">View all requests <ArrowRight size={14} aria-hidden /></Link></div>
      {applicants.length ? <>
        <div className="dashboard-admin-table-wrap"><table className="dashboard-admin-table"><caption className="sr-only">Pending account registration applications</caption><thead><tr><th scope="col">Applicant</th><th scope="col">Role</th><th scope="col">Department</th><th scope="col">Submitted</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Action</span></th></tr></thead><tbody>{applicants.slice(0, 6).map((applicant) => <tr key={applicant.id}><td className="font-semibold text-charcoal">{applicant.name}</td><td className="capitalize">{applicant.role}</td><td>{applicant.department}</td><td><time dateTime={applicant.submittedAt}>{dateLabel(applicant.submittedAt)}</time></td><td><StatusBadge status={applicant.status} /></td><td><Link to="/dashboard/account-requests" className="dashboard-row-action">Review</Link></td></tr>)}</tbody></table></div>
        <ul className="dashboard-admin-applicant-cards">{applicants.slice(0, 5).map((applicant) => <li key={applicant.id} className="dashboard-applicant-card"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-sm font-semibold text-navy">{applicant.name}</p><p className="mt-1 capitalize text-xs text-muted">{applicant.role} · {applicant.department}</p></div><StatusBadge status={applicant.status} /></div><div className="mt-2 flex items-center justify-between gap-3"><time dateTime={applicant.submittedAt} className="text-xs text-muted">Submitted {dateLabel(applicant.submittedAt)}</time><Link to="/dashboard/account-requests" className="dashboard-row-action">Review</Link></div></li>)}</ul>
      </> : <div className="dashboard-queue-empty"><p className="text-sm font-semibold text-navy">No pending account requests</p><p className="mt-1 text-xs text-muted">New municipal registrations will appear here for review.</p></div>}
    </section>

    <section className="ui-panel dashboard-bento-panel dashboard-admin-activity" aria-labelledby="admin-activity-heading">
      <div className="dashboard-panel-heading"><div><p className="dashboard-overline">Latest events</p><h2 id="admin-activity-heading">{panelHeadings.administrator.secondary}</h2></div><Clock3 size={18} className="text-muted" aria-hidden /></div>
      {activity.length ? <ol className="dashboard-activity-list">{activity.slice(0, 5).map((event) => <li key={event.id}><span className="dashboard-activity-dot" aria-hidden="true" /><div className="min-w-0 flex-1"><p className="break-words text-xs font-semibold capitalize text-charcoal">{event.action} <span className="font-normal text-muted">· {event.resource}</span></p><p className="mt-1 break-words text-[11px] text-muted">{event.actor}{event.detail ? ` · ${event.detail}` : ''}</p></div><time dateTime={event.timestamp} className="shrink-0 text-[10px] text-muted">{dateLabel(event.timestamp)}</time></li>)}</ol> : <p className="py-5 text-xs text-muted">Administrative events will appear after records change.</p>}
      <Link to="/dashboard/audit-trail" className="dashboard-panel-link mt-auto pt-3">Open audit trail <ArrowRight size={14} aria-hidden /></Link>
    </section>

    <section className="ui-panel dashboard-bento-panel dashboard-admin-status" aria-labelledby="user-status-heading">
      <div className="dashboard-panel-heading"><div><p className="dashboard-overline">Municipal accounts</p><h2 id="user-status-heading">User Status Overview</h2></div><Link to="/dashboard/users" className="dashboard-panel-link">View users <ArrowRight size={14} aria-hidden /></Link></div>
      <p className="dashboard-panel-description">Account status across all {totalUsers} municipal users.</p>
      <ul className="dashboard-status-list">{userStatuses.map((item) => <li key={item.status}><div className="dashboard-status-label"><span className="capitalize">{item.status}</span><strong>{item.count}</strong></div><div className="dashboard-status-track"><span style={{ width: `${totalUsers ? item.count / totalUsers * 100 : 0}%` }} /></div></li>)}</ul>
    </section>

    <section className="ui-panel dashboard-bento-panel dashboard-admin-departments" aria-labelledby="department-summary-heading">
      <div className="dashboard-panel-heading"><div><p className="dashboard-overline">Office directory</p><h2 id="department-summary-heading">Department Summary</h2></div></div>
      {departments.length ? <ul className="dashboard-department-list">{departments.slice(0, 5).map((department) => <li key={department.id}><span className="min-w-0 break-words text-xs font-medium text-charcoal">{department.name}</span><span className="shrink-0 text-xs tabular-nums text-muted">{department.activeUsers} active</span></li>)}</ul> : <p className="py-4 text-xs text-muted">No active departments are recorded.</p>}
      <Link to="/dashboard/departments" className="dashboard-panel-link mt-auto pt-3">Open departments <ArrowRight size={14} aria-hidden /></Link>
    </section>
  </div>
}

function PanelRows({ panel, role, records, onInspect }: { panel: DashboardPanel; role: Role; records: readonly DashboardRecord[]; onInspect: (record: DashboardRecord) => void }) {
  if (panel.kind === 'distribution') {
    const max = Math.max(1, ...panel.items.map((item) => Math.abs(item.value ?? 0)))
    return panel.items.length ? <ul className="dashboard-distribution-list">{panel.items.slice(0, 6).map((item) => <li key={item.id}><div className="dashboard-distribution-label"><span className="min-w-0 break-words capitalize">{item.label}</span><strong>{compactCount(item.value ?? 0, item.format)}</strong></div><div className="dashboard-distribution-track"><span style={{ width: `${Math.max(3, Math.abs(item.value ?? 0) / max * 100)}%` }} /></div></li>)}</ul> : <p className="py-5 text-xs text-muted">No records are available for this summary.</p>
  }

  return panel.items.length ? <ul className="dashboard-focus-list">{panel.items.slice(0, 5).map((item: DashboardPanelItem) => {
    const record = records.find((row) => row.id === item.id)
    const content = <><span className="dashboard-focus-copy"><span className="dashboard-focus-title">{item.label}</span><span className="dashboard-focus-detail">{item.detail}</span></span>{item.status && <StatusBadge status={item.status} />}{item.timestamp && <time dateTime={item.timestamp} className="shrink-0 text-[10px] text-muted">{dateLabel(item.timestamp)}</time>}{panel.kind === 'progress' && <span className="dashboard-focus-progress">{item.value ?? 0}/{item.total ?? 0}</span>}</>
    const row = item.href ? <Link to={item.href} className="dashboard-focus-button">{content}<ArrowUpRight size={15} className="shrink-0 text-muted" aria-hidden /></Link> : record ? <button type="button" onClick={() => onInspect(record)} className="dashboard-focus-button">{content}<ArrowUpRight size={15} className="shrink-0 text-muted" aria-hidden /></button> : <div className="dashboard-focus-button">{content}</div>
    const progress = panel.kind === 'progress' ? <div role="progressbar" aria-label={`${item.label} inspection progress`} aria-valuemin={0} aria-valuemax={item.total ?? 0} aria-valuenow={item.value ?? 0} className="dashboard-focus-track"><span style={{ width: `${item.total ? Math.min(100, (item.value ?? 0) / item.total * 100) : 0}%` }} /></div> : null
    return <li key={item.id}>{row}{progress}</li>
  })}</ul> : <div className="py-4"><EmptyState title={role === 'approving_officer' ? 'No pending approvals' : 'No current work'} message="Authorized records will appear here when available." /></div>
}

export default function DashboardOverview({ snapshot, onInspect }: { snapshot: DashboardSnapshot; onInspect: (record: DashboardRecord) => void }) {
  const { role, records } = snapshot
  if (role === 'administrator') return <AdminDashboardOverview snapshot={snapshot} />
  const panels = snapshot.panels
  if (!panels) return null
  return <div className="dashboard-bento dashboard-role-bento">
    <section className="ui-panel dashboard-bento-panel dashboard-role-primary" aria-label={panels.primary.title}>
      <div className="dashboard-panel-heading"><div><p className="dashboard-overline">Operational focus</p><h2>{panelHeadings[role].primary}</h2></div><ChartNoAxesColumnIncreasing size={18} className="text-muted" aria-hidden /></div>
      <p className="dashboard-panel-description">{panels.primary.description}</p>
      <PanelRows panel={panels.primary} role={role} records={records} onInspect={onInspect} />
    </section>
    <section className="ui-panel dashboard-bento-panel dashboard-role-secondary" aria-label={panels.secondary.title}>
      <div className="dashboard-panel-heading"><div><p className="dashboard-overline">Supporting view</p><h2>{panelHeadings[role].secondary}</h2></div></div>
      <p className="dashboard-panel-description">{panels.secondary.description}</p>
      <PanelRows panel={panels.secondary} role={role} records={records} onInspect={onInspect} />
    </section>
    <section className="dashboard-bento-footnote"><Link to={role === 'auditor' ? '/dashboard/audit-trail' : role === 'approving_officer' ? '/dashboard/approvals' : role === 'budget_office' ? '/dashboard/budget' : role === 'engineering_office' ? '/dashboard/engineering' : role === 'inventory_personnel' ? '/dashboard/physical-inventory' : role === 'accounting_officer' ? '/dashboard/accounting-documents' : '/dashboard/assets'}>Open related workspace <ArrowRight size={14} aria-hidden /></Link></section>
  </div>
}
