import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthenticatedUser } from '../../hooks/useAuthenticatedUser'
import { mockDataServices } from '../../services/mockDataService'
import { DataTable, LoadingSkeleton, Modal, PageHeader, StatusBadge } from '../../components/ui'
import type { TableColumn } from '../../components/ui/DataTable'

const sections = [
  ['assets', 'PPE Registry'], ['accountingRecords', 'Accounting Records'], ['projects', 'Construction in Progress'],
  ['inventorySessions', 'Inventory Sessions'], ['inventoryChecks', 'Physical Inventory'], ['transfers', 'Asset Transfers'],
  ['disposals', 'Disposals'], ['approvals', 'Approval History'], ['auditLogs', 'Audit Trail'],
] as const
type AuditRow = { id: string; label: string; status: string; updated: string; entry: unknown }

export default function AuditorModule() {
  const { session } = useAuthenticatedUser()
  const ctx = useMemo(() => ({ actor: session.user, sessionId: session.sessionId, municipalityId: session.user.municipalityId }), [session])
  const [section, setSection] = useState<string>('auditLogs')
  const [data, setData] = useState<Record<string, unknown[]> | null>(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<AuditRow | null>(null)
  useEffect(() => {
    let active = true
    void mockDataServices.reporting.auditorRecords(ctx).then((result) => {
      if (!active) return
      if (result.ok) { setData(result.data); setError('') } else setError(result.error.message)
    })
    return () => { active = false }
  }, [ctx])
  const rows: AuditRow[] = (data?.[section] ?? []).map((entry, index) => {
    const row = typeof entry === 'object' && entry ? entry as Record<string, unknown> : {}
    return {
      id: String(row.id ?? index),
      label: String(row.propertyNumber ?? row.projectNumber ?? row.name ?? row.title ?? row.description ?? row.action ?? row.accountCode ?? row.id ?? `Record ${index + 1}`),
      status: String(row.workflowStatus ?? row.lifecycleStatus ?? row.sessionStatus ?? row.projectStatus ?? row.status ?? row.kind ?? 'Recorded'),
      updated: String(row.occurredAt ?? row.checkedAt ?? row.postingDate ?? row.updatedAt ?? row.createdAt ?? ''),
      entry,
    }
  })
  const columns: TableColumn<AuditRow>[] = [
    { id: 'record', label: 'Record', mobileRole: 'title', sortValue: (row) => row.label, cell: (row) => <div><p className="font-semibold text-navy">{row.label}</p><p className="mt-1 break-all text-xs text-muted">{row.id}</p></div> },
    { id: 'status', label: 'Recorded status / type', sortValue: (row) => row.status, cell: (row) => <StatusBadge status={row.status} /> },
    { id: 'date', label: 'Recorded / updated', sortValue: (row) => row.updated, cell: (row) => row.updated && !Number.isNaN(Date.parse(row.updated)) ? new Date(row.updated).toLocaleString('en-PH') : row.updated || 'Not recorded' },
    { id: 'actions', label: 'Details', cell: (row) => <button className="ui-button-secondary" onClick={() => setSelected(row)}>View record</button> },
  ]
  return <div className="workspace-page">
    <PageHeader eyebrow={session.municipality.name} title="Accounting and audit records" description="Review authorized records and preserved history with read-only access." actions={<Link to="/dashboard/reports" className="ui-button-secondary">Reports and exports</Link>} />
    {error && <p role="alert" className="ui-panel border-red-200 p-4 text-sm text-red-700">{error}</p>}
    {!data && !error && <LoadingSkeleton count={3} label="Loading audit records" />}
    {data && <>
      <nav className="module-tabs" aria-label="Audit record categories">{sections.map(([key, label]) => <button key={key} onClick={() => setSection(key)} aria-pressed={section === key} className="ui-button-secondary">{label}<span className="rounded bg-mist px-1.5 text-xs tabular-nums text-navy">{data[key]?.length ?? 0}</span></button>)}</nav>
      <section className="min-w-0 space-y-3"><h2 className="text-base font-semibold text-navy">{sections.find(([key]) => key === section)?.[1]}</h2><DataTable key={section} rows={rows} columns={columns} caption="Audit records" pageSize={10} getRowId={(row) => row.id} getSearchText={(row) => JSON.stringify(row.entry) ?? ''} /></section>
    </>}
    <Modal open={!!selected} title="Recorded audit details" onClose={() => setSelected(null)}>{selected && <><p className="mb-3 break-words font-semibold text-navy">{selected.label}</p><pre className="whitespace-pre-wrap break-all rounded-xl bg-mist p-3 text-xs leading-5">{JSON.stringify(selected.entry, null, 2)}</pre></>}</Modal>
  </div>
}
