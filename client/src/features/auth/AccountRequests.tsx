import { useCallback, useEffect, useState } from 'react'
import type { User } from '../../domain/models'
import { roleLabels } from '../../config/roles'
import { useAuthenticatedUser } from '../../hooks/useAuthenticatedUser'
import { mockDataServices } from '../../services/mockDataService'
import { authClient } from '../../services/authClient'
import { DataTable, Modal, PageHeader, StatusBadge } from '../../components/ui'
import type { TableColumn } from '../../components/ui/DataTable'

export default function AccountRequests() {
  const { user, session, requestContext } = useAuthenticatedUser()
  const [requests, setRequests] = useState<User[]>([])
  const [departments, setDepartments] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [details, setDetails] = useState<User | null>(null)
  const load = useCallback(async () => {
    const result = await mockDataServices.entities.users.getAll({ actor: user, municipalityId: user.municipalityId, sessionId: session.sessionId }, { filters: { status: 'pending' } })
    setRequests(result.ok ? result.data : []); setError(result.ok ? '' : result.error.message); setLoading(false)
  }, [user, session.sessionId])
  useEffect(() => {
    let active = true
    const context = { actor: user, municipalityId: user.municipalityId, sessionId: session.sessionId }
    void Promise.all([mockDataServices.entities.users.getAll(context, { filters: { status: 'pending' } }), mockDataServices.entities.departments.getAll(context)]).then(([result, offices]) => {
      if (active) {
        setRequests(result.ok ? result.data : []); setDepartments(offices.ok ? Object.fromEntries(offices.data.map((office) => [office.id, office.name])) : {})
        setError(!result.ok ? result.error.message : !offices.ok ? offices.error.message : ''); setLoading(false)
      }
    })
    return () => { active = false }
  }, [user, session.sessionId])
  const review = async (request: User, decision: 'approve' | 'reject') => {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    const result = await authClient.reviewAccount(requestContext, request.id, request.version, decision, reasons[request.id] ?? '')
    if (result.ok) { setNotice(`${request.username}: ${decision === 'approve' ? 'approved — the account can now sign in' : 'rejected — the account is disabled'}.`); await load() }
    else setError(result.error.message)
    setBusy(false)
  }
  const columns: TableColumn<User>[] = [
    { id: 'applicant', label: 'Applicant', mobileRole: 'title', cell: (request) => <><p className="font-semibold">{request.name}</p><p>{request.username}</p><p className="text-xs text-muted">{request.email}</p><button type="button" className="mt-2 text-xs font-semibold text-navy underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy" onClick={() => setDetails(request)}>View request details</button></> },
    { id: 'role', label: 'Requested role', mobileRole: 'subtitle', sortValue: (request) => roleLabels[request.role], cell: (request) => <>{roleLabels[request.role]}<span className="mt-1 block text-xs text-muted">{request.departmentId ? departments[request.departmentId] ?? 'Department unavailable' : 'Unassigned'}</span></> },
    { id: 'status', label: 'Status', mobileRole: 'status', cell: () => <StatusBadge status="pending" /> },
    { id: 'review', label: 'Review', mobileRole: 'actions', cell: (request) => <div className="min-w-0 space-y-2"><label className="block text-xs text-muted">Review note (required for rejection)<input value={reasons[request.id] ?? ''} disabled={busy} maxLength={1000} onChange={(event) => setReasons((current) => ({ ...current, [request.id]: event.target.value }))} className="mt-1 w-full rounded border border-line p-2 text-sm text-charcoal" /></label><div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => { void review(request, 'approve') }} className="min-h-11 rounded-lg bg-navy px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Approve</button><button type="button" disabled={busy || !reasons[request.id]?.trim()} onClick={() => { void review(request, 'reject') }} className="min-h-11 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-navy disabled:opacity-50">Reject</button></div></div> },
  ]
  return <section className="workspace-page" aria-label="Account registration requests" aria-busy={loading || busy}>
    <PageHeader eyebrow={session.municipality.name} title="Account registration requests" description="Approve or reject pending requests. New accounts can sign in after approval." />
    {loading && <p role="status" className="text-sm text-muted">Loading account requests…</p>}
    {notice && <p role="status" className="text-sm text-navy">{notice}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error} <button type="button" disabled={busy} className="text-navy underline" onClick={() => { void load() }}>Reload requests</button></p>}
    {!loading && <DataTable rows={requests} columns={columns} caption="Pending account requests" pageSize={10} getRowId={(request) => request.id} getSearchText={(request) => `${request.name} ${request.username} ${request.email} ${roleLabels[request.role]} ${departments[request.departmentId ?? ''] ?? ''}`} emptyMessage="No pending requests match this search." />}
    <Modal open={!!details} title="Submitted account request" onClose={() => setDetails(null)}>{details && <dl className="grid gap-3 text-sm sm:grid-cols-2">{([['Applicant', details.name], ['Username', details.username], ['Email', details.email], ['Requested role', roleLabels[details.role]], ['Department', details.departmentId ? departments[details.departmentId] ?? details.departmentId : 'Unassigned'], ['Municipality', session.municipality.name], ['Submitted', new Date(details.createdAt).toLocaleString('en-PH')], ['Last updated', new Date(details.updatedAt).toLocaleString('en-PH')]] as const).map(([key, value]) => <div key={key}><dt className="text-xs font-semibold text-muted">{key}</dt><dd className="break-words text-navy">{value}</dd></div>)}<div><dt className="text-xs font-semibold text-muted">Status</dt><dd><StatusBadge status={details.status}/></dd></div></dl>}</Modal>
  </section>
}

