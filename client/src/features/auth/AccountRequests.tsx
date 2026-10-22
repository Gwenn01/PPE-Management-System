import { useCallback, useEffect, useState } from 'react'
import type { User } from '../../domain/models'
import { roleLabels } from '../../config/roles'
import { useAuthenticatedUser } from '../../hooks/useAuthenticatedUser'
import { mockDataServices } from '../../services/mockDataService'
import { authClient } from '../../services/authClient'
import { Modal, StatusBadge } from '../../components/ui'

export default function AccountRequests() {
  const { user, session, requestContext } = useAuthenticatedUser()
  const [requests, setRequests] = useState<User[]>([])
  const [departments, setDepartments] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
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
  const filtered = requests.filter((request) => `${request.name} ${request.username} ${request.email} ${roleLabels[request.role]}`.toLowerCase().includes(search.toLowerCase()))
  const totalPages = Math.max(1, Math.ceil(filtered.length / 10))
  const currentPage = Math.min(page, totalPages)
  return <section className="mt-8 space-y-4" aria-labelledby="account-requests-heading" aria-busy={loading || busy}>
    <div><h3 id="account-requests-heading" className="text-lg font-bold text-navy">Pending account requests — {session.municipality.name}</h3><p className="mt-2 text-sm text-charcoal">Approve or reject fictional account requests for this municipality. New requests cannot sign in until approved.</p></div>
    <label className="block text-xs font-semibold text-gray">Search requests<input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} className="mt-1 block w-full rounded-lg border border-line p-2 text-sm text-charcoal focus:border-navy" /></label>
    {loading && <p role="status" className="text-sm text-gray">Loading account requests…</p>}
    {notice && <p role="status" className="text-sm text-navy">{notice}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error} <button type="button" disabled={busy} className="text-navy underline" onClick={() => { void load() }}>Reload requests</button></p>}
    {!loading && <div className="overflow-x-auto rounded-xl border border-line"><table className="w-full text-left text-sm text-charcoal">
      <caption className="p-3 text-left text-xs text-gray">{filtered.length} Pending request{filtered.length === 1 ? '' : 's'} in the current filtered list.</caption>
      <thead className="bg-mist text-xs text-navy"><tr><th scope="col" className="p-3">Applicant</th><th scope="col" className="p-3">Requested role</th><th scope="col" className="p-3">Review</th></tr></thead>
      <tbody>{filtered.slice((currentPage - 1) * 10, currentPage * 10).map((request) => <tr key={request.id} className="border-t border-line align-top">
        <td className="p-3"><p className="font-semibold">{request.name}</p><p>{request.username}</p><p className="text-xs text-gray">{request.email}</p><button type="button" className="mt-2 text-xs font-semibold text-navy underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy" onClick={() => setDetails(request)}>View request details</button></td>
        <td className="p-3">{roleLabels[request.role]}<span className="mt-1 block text-xs text-gray">{request.departmentId ? departments[request.departmentId] ?? 'Department unavailable' : 'Unassigned'}</span><span className="mt-1 block text-xs text-gray">Pending</span></td>
        <td className="min-w-56 space-y-2 p-3"><label className="block text-xs text-gray">Review note (required for rejection)<input value={reasons[request.id] ?? ''} disabled={busy} maxLength={1000} onChange={(event) => setReasons((current) => ({ ...current, [request.id]: event.target.value }))} className="mt-1 w-full rounded border border-line p-2 text-sm text-charcoal" /></label>
          <div className="flex gap-2"><button type="button" disabled={busy} onClick={() => { void review(request, 'approve') }} className="rounded-lg bg-navy px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Approve</button><button type="button" disabled={busy || !reasons[request.id]?.trim()} onClick={() => { void review(request, 'reject') }} className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-navy disabled:opacity-50">Reject</button></div></td>
      </tr>)}{!filtered.length && <tr><td colSpan={3} className="p-6 text-center text-sm text-gray">No Pending requests match this list.</td></tr>}</tbody>
    </table></div>}
    <Modal open={!!details} title="Submitted account request" onClose={() => setDetails(null)}>{details && <dl className="grid gap-3 text-sm sm:grid-cols-2">{([['Applicant', details.name], ['Username', details.username], ['Email', details.email], ['Requested role', roleLabels[details.role]], ['Department', details.departmentId ? departments[details.departmentId] ?? details.departmentId : 'Unassigned'], ['Municipality', session.municipality.name], ['Submitted', new Date(details.createdAt).toLocaleString('en-PH')], ['Last updated', new Date(details.updatedAt).toLocaleString('en-PH')]] as const).map(([key, value]) => <div key={key}><dt className="text-xs font-semibold text-gray">{key}</dt><dd className="break-words text-navy">{value}</dd></div>)}<div><dt className="text-xs font-semibold text-gray">Status</dt><dd><StatusBadge status={details.status}/></dd></div></dl>}</Modal>
    <div className="flex items-center justify-between text-xs text-gray"><button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} className="rounded border border-line px-3 py-2 disabled:opacity-50">Previous</button><span>Page {currentPage} of {totalPages}</span><button type="button" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)} className="rounded border border-line px-3 py-2 disabled:opacity-50">Next</button></div>
  </section>
}

