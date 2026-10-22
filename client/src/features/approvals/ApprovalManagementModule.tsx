import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ApprovalSubject, CIPCost, ConstructionProject, Document } from '../../domain/models'
import { approvalTypeLabels, approvalTypes, type ApprovalDecision, type ApprovalOverview, type ApprovalSubjectDetails } from '../../services/approvalService'
import { useAuthenticatedUser } from '../../hooks/useAuthenticatedUser'
import { mockDataServices } from '../../services/mockDataService'
import { ActivityTimeline, DataTable, DocumentPreview, EmptyState, ErrorState, LoadingSkeleton, Modal, PageHeader, StatCard, StatusBadge, useToast } from '../../components/ui'
import type { TableColumn } from '../../components/ui/DataTable'

const primary = 'rounded-xl bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-navy-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy disabled:opacity-50'
const secondary = 'rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold text-navy hover:bg-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy disabled:opacity-50'
const control = 'w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-charcoal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy'
const dateLabel = (value: string | null) => value ? new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
const money = (centavos: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(centavos / 100)
type View = 'pending' | 'returned' | 'history'
function summary(row: ApprovalSubjectDetails) {
  const subject = row.subject
  return String(subject.description ?? subject.name ?? subject.projectNumber ?? subject.proposedPropertyNumber ?? row.approval.subjectId)
}
function prettySubmission(payload: string): string {
  try { return JSON.stringify(JSON.parse(payload), null, 2) } catch { return 'The archived submission payload is unavailable.' }
}
function detailEntries(row: ApprovalSubjectDetails) {
  const ignored = new Set(['id', 'municipalityId', 'version', 'createdAt', 'updatedAt', 'requestedById', 'documentIds', 'recognizedAssetId', 'capitalizedAssetId'])
  return Object.entries(row.subject).filter(([key, value]) => !ignored.has(key) && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null))
}

function CapitalizationReview({ subject }: { subject: Record<string, unknown> }) {
  const project = subject as unknown as ConstructionProject, cap = project.capitalization
  if (!cap) return <p className="rounded-xl bg-mist p-3 text-sm">Legacy request: Accounting must prepare verified qualifying costs and completion evidence before capitalization can be approved.</p>
  let costs: CIPCost[]
  try { costs = JSON.parse(cap.costSnapshot) as CIPCost[] } catch { return <p role="alert">Qualifying-cost snapshot is unavailable. Return the request for correction.</p> }
  return <section className="space-y-3 rounded-xl border border-line p-4"><h3 className="font-bold text-navy">Construction completion and qualifying costs</h3><p className="text-sm">Completed: {project.completionDate?.slice(0, 10)} · Property confirmed intended use: {project.readyForUse?.date} · Proposed PPE: {cap.propertyNumber}</p><p className="font-semibold">Capitalization amount: {money(cap.total)}</p><p className="text-sm">{cap.verificationNote}</p><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr>{['Cost reference', 'Description / category', 'Approved amount', 'Qualification rationale'].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{costs.map(c => <tr key={c.id} className="border-t border-line"><td className="p-2">{c.accounting?.reference}</td><td className="p-2">{c.description} / {c.accounting?.category}</td><td className="p-2">{money(c.amount)}</td><td className="p-2">{c.accounting?.reviewNote}</td></tr>)}</tbody></table></div><p className="text-xs">Depreciation review: {cap.depreciation.treatment} · {cap.depreciation.usefulLifeMonths} months · Residual {money(cap.depreciation.residualValue)} · Policy v{cap.policyVersion}. These are unverified demo assumptions; no depreciation starts while construction remains CIP.</p><p className="rounded-lg bg-mist p-3 text-xs">Approving this prepared request atomically transfers approved CIP to PPE and creates the recognized asset. Returning or rejecting it leaves CIP and PPE balances unchanged.</p></section>
}

/** Shared workflow view: legacy type-specific links open the same queue with a preset filter. */
export default function ApprovalManagementModule({ module }: { module: string }) {
  const { session, user } = useAuthenticatedUser()
  const requestContext = useMemo(() => ({ actor: session.user, sessionId: session.sessionId, municipalityId: session.user.municipalityId }), [session])
  const { notify } = useToast()
  const initialView: View = module === 'approvals/returned' ? 'returned' : module === 'approvals/history' ? 'history' : 'pending'
  const initialType: ApprovalSubject | '' = module === 'approvals/registrations' ? 'registration' : module === 'approvals/capitalization' ? 'capitalization' : ''
  const permittedModuleTypes: readonly ApprovalSubject[] = module === 'approvals/corrections' ? ['correction', 'reconciliation'] : module === 'approvals/lifecycle' ? ['transfer', 'maintenance', 'disposal'] : approvalTypes
  const [view, setView] = useState<View>(initialView)
  const [type, setType] = useState<ApprovalSubject | ''>(initialType)
  const [status, setStatus] = useState('')
  const [submitter, setSubmitter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [rows, setRows] = useState<ApprovalOverview>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [decision, setDecision] = useState<ApprovalDecision | null>(null)
  const [remarks, setRemarks] = useState('')
  const [documentPreview, setDocumentPreview] = useState<{ document: Document; file: Blob | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    const result = await mockDataServices.approvals.overview(requestContext)
    if (result.ok) { setRows(result.data); setError('') } else setError(result.error.message)
    setLoading(false)
  }, [requestContext])
  useEffect(() => { void Promise.resolve().then(refresh) }, [refresh])
  const selected = rows.find((row) => row.approval.id === selectedId) ?? null
  const filtered = useMemo(() => rows.filter((row) => {
    const a = row.approval
    const inView = view === 'pending' ? a.workflowStatus === 'submitted' || a.workflowStatus === 'under_review'
      : view === 'returned' ? a.workflowStatus === 'returned' : ['approved', 'rejected', 'cancelled', 'returned'].includes(a.workflowStatus)
    const date = (a.submittedAt ?? a.createdAt).slice(0, 10)
    return inView && permittedModuleTypes.includes(a.subjectType) && (!type || a.subjectType === type) && (!status || a.workflowStatus === status) &&
      (!submitter || a.requestedById === submitter) && (!fromDate || date >= fromDate) && (!toDate || date <= toDate)
  }), [rows, view, type, status, submitter, fromDate, toDate, permittedModuleTypes])
  const submitters = useMemo(() => [...new Map(rows.map((row) => [row.requester.id, row.requester])).values()].sort((a, b) => a.name.localeCompare(b.name)), [rows])
  const openDecision = (choice: ApprovalDecision) => { setDecision(choice); setRemarks(''); setError('') }
  const execute = async () => {
    if (!selected || !decision || busy) return
    if (['return', 'reject'].includes(decision) && !remarks.trim()) { setError('Enter a reason before processing this request.'); return }
    setBusy(true); setError('')
    const result = await mockDataServices.approvals.decide(requestContext, { id: selected.approval.id, version: selected.approval.version, decision, remarks })
    if (result.ok) {
      notify(`${approvalTypeLabels[selected.approval.subjectType]} ${result.data.approval.workflowStatus.replaceAll('_', ' ')}.`)
      setDecision(null); setSelectedId(null); await refresh()
    } else setError(result.error.message)
    setBusy(false)
  }
  const preview = async (document: Document) => {
    const result = await mockDataServices.documents.download(requestContext, document.id)
    if (result.ok) setDocumentPreview({ document, file: result.data.file })
    else { setDocumentPreview({ document, file: null }); setError(result.error.message) }
  }
  const columns: TableColumn<ApprovalSubjectDetails>[] = [
    { id: 'type', label: 'Request type', sortValue: (row) => row.approval.subjectType, cell: (row) => <div><p className="font-semibold text-navy">{approvalTypeLabels[row.approval.subjectType]}</p><p className="max-w-xs truncate text-xs text-gray">{summary(row)}</p></div> },
    { id: 'submitter', label: 'Submitter', sortValue: (row) => row.requester.name, cell: (row) => <span>{row.requester.name}<span className="block text-xs text-gray">@{row.requester.username}</span></span> },
    { id: 'date', label: 'Submitted', sortValue: (row) => row.approval.submittedAt ?? '', cell: (row) => dateLabel(row.approval.submittedAt) },
    { id: 'status', label: 'Status', sortValue: (row) => row.approval.workflowStatus, cell: (row) => <StatusBadge status={row.approval.workflowStatus}/> },
    { id: 'action', label: 'Details', cell: (row) => <button className={secondary} onClick={() => { setSelectedId(row.approval.id); setDecision(null); setRemarks(''); setError('') }}>View request</button> },
  ]
  return <div className="mx-auto max-w-7xl space-y-6">
    <PageHeader eyebrow="Municipality-scoped authorization" title="Approval Management" description={`Review and decide requests assigned to your municipality. ${user.municipalityId === 'botolan' ? 'Botolan' : 'San Antonio'} demo records only. Prepared capitalization approvals atomically transfer qualifying CIP to PPE.`} actions={<button onClick={() => { setLoading(true); void refresh() }} className={secondary} disabled={loading || busy}>Refresh queue</button>}/>
    <div className="grid gap-4 sm:grid-cols-3">
      <StatCard label="Pending review" value={String(rows.filter((r) => ['submitted','under_review'].includes(r.approval.workflowStatus)).length)} hint="Submitted or under review"/>
      <StatCard label="Returned for correction" value={String(rows.filter((r) => r.approval.workflowStatus === 'returned').length)} hint="Awaiting requester revisions"/>
      <StatCard label="Approved requests" value={String(rows.filter((r) => r.approval.workflowStatus === 'approved').length)} hint="Decisions recorded locally"/>
    </div>
    <div className="flex flex-wrap gap-2" aria-label="Approval categories">{([['pending','Pending Approvals'],['returned','Returned Requests'],['history','Approval History']] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={view === key} className={view === key ? primary : secondary} onClick={() => { setView(key); setStatus(''); setSelectedId(null) }}>{label}</button>)}</div>
    <section className="grid gap-3 rounded-2xl border border-line bg-white p-4 sm:grid-cols-2 lg:grid-cols-5" aria-label="Approval filters">
      <label className="text-xs font-semibold text-navy">Request type<select className={`${control} mt-1`} value={type} onChange={(e) => setType(e.target.value as ApprovalSubject | '')}><option value="">All permitted types</option>{permittedModuleTypes.map((key) => <option key={key} value={key}>{approvalTypeLabels[key]}</option>)}</select></label>
      <label className="text-xs font-semibold text-navy">Submitter<select className={`${control} mt-1`} value={submitter} onChange={(e) => setSubmitter(e.target.value)}><option value="">All submitters</option>{submitters.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
      <label className="text-xs font-semibold text-navy">Status<select className={`${control} mt-1`} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses in tab</option>{['submitted','under_review','returned','approved','rejected','cancelled'].map((key) => <option key={key} value={key}>{key.replaceAll('_',' ')}</option>)}</select></label>
      <label className="text-xs font-semibold text-navy">Submitted from<input className={`${control} mt-1`} type="date" max={toDate || undefined} value={fromDate} onChange={(e) => setFromDate(e.target.value)}/></label>
      <label className="text-xs font-semibold text-navy">Submitted until<input className={`${control} mt-1`} type="date" min={fromDate || undefined} value={toDate} onChange={(e) => setToDate(e.target.value)}/></label>
    </section>
    {loading ? <LoadingSkeleton count={5}/> : error && !selected ? <ErrorState message={error} onRetry={() => { setLoading(true); void refresh() }}/> : filtered.length ? <DataTable rows={filtered} columns={columns} getRowId={(row) => row.approval.id} getSearchText={(row) => `${row.requester.name} ${row.requester.username} ${row.approval.subjectType} ${summary(row)} ${row.approval.workflowStatus}`} caption="Approval requests" pageSize={8}/> : <EmptyState message={view === 'pending' ? 'No pending approvals match these filters.' : view === 'returned' ? 'No returned requests match these filters.' : 'No completed requests match these filters.'}/>}
    <p className="text-xs text-gray">Other approval types use this same service, history and transition policy. Prepared CIP capitalization executes with its approval; unrelated future lifecycle effects remain separate.</p>
    <Modal open={!!selected} title="Approval details" onClose={() => { if (!busy) { setSelectedId(null); setDecision(null); setError('') } }}>
      {selected && <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        <div className="flex items-center justify-between gap-3"><p className="font-bold text-navy">{approvalTypeLabels[selected.approval.subjectType]}</p><StatusBadge status={selected.approval.workflowStatus}/></div>
        <p className="text-sm">Submitted by <strong>{selected.requester.name}</strong> on {dateLabel(selected.approval.submittedAt)}.</p>
        <dl className="grid grid-cols-1 gap-2 rounded-xl bg-mist p-4 sm:grid-cols-2">{detailEntries(selected).map(([key, value]) => <div key={key}><dt className="text-xs capitalize text-gray">{key.replace(/([A-Z])/g, ' $1')}</dt><dd className="break-words font-medium text-navy">{typeof value === 'number' && key.toLowerCase().includes('cost') ? money(value) : value === null ? '—' : String(value)}</dd></div>)}</dl>
        {selected.approval.subjectType === 'capitalization' && <CapitalizationReview subject={selected.subject} />}
        {selected.approval.subjectType === 'registration' && <p className="rounded-lg bg-mist p-3 text-xs">Approving creates a linked PPE registry entry with status <strong>Awaiting Recognition</strong>. No accounting entry or depreciation calculation is posted.</p>}
        <div><h3 className="mb-2 font-bold text-navy">Supporting documents</h3>{selected.documents.length ? <ul className="space-y-2">{selected.documents.map((doc) => <li key={doc.id} className="flex items-center justify-between gap-3 rounded-lg border border-line p-3"><span className="min-w-0"><strong className="block break-all text-sm">{doc.fileName}</strong><span className="text-xs text-gray">{doc.projectDocumentType?.replaceAll('_',' ') ?? doc.documentType?.replaceAll('_',' ') ?? doc.mimeType} · {doc.sizeBytes.toLocaleString()} bytes</span></span><button className={secondary} onClick={() => { void preview(doc) }}>Preview</button></li>)}</ul> : <p className="text-sm text-gray">No attached document metadata. Older seeded requests may contain no binary files.</p>}</div>
        <div><h3 className="mb-3 font-bold text-navy">Workflow timeline</h3><ActivityTimeline events={selected.approval.history.map((event, index) => ({ id: `${index}-${event.occurredAt}`, title: `${event.action.replaceAll('_',' ')} · ${selected.actors[event.actorId] ?? event.actorRole}`, description: `${event.fromStatus.replaceAll('_',' ')} → ${event.toStatus.replaceAll('_',' ')}${event.reason ? ` · ${event.reason}` : ''}${event.submission ? ` · saved submission v${event.submission.subjectVersion} (${event.submission.documentIds.length} document references)` : ''}`, status: event.toStatus, timestamp: event.occurredAt }))}/></div>
        {selected.approval.history.some((event) => !!event.submission) && <section className="space-y-2"><h3 className="font-bold text-navy">Earlier submitted versions</h3><p className="text-xs text-gray">Immutable snapshots of submitted request fields and attachment metadata. Binary file contents are stored separately, when available.</p>{selected.approval.history.filter((event) => !!event.submission).map((event, index) => <details key={`${event.occurredAt}-${index}`} className="rounded-xl border border-line p-3"><summary className="cursor-pointer font-semibold text-navy">Submission v{event.submission!.subjectVersion} · {dateLabel(event.occurredAt)}</summary><pre className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-mist p-3 text-xs text-charcoal">{prettySubmission(event.submission!.payload)}</pre></details>)}</section>}
        {selected.approval.workflowStatus === 'returned' && <p role="status" className="rounded-lg bg-mist p-3 text-sm">Returned to the original submitter for correction. {selected.approval.subjectType === 'capitalization' ? 'The Accounting Officer corrects and resubmits from CIP Accounting.' : 'The Property Officer can edit and resubmit from Asset Registration.'}</p>}
        {['submitted','under_review'].includes(selected.approval.workflowStatus) && <div className="space-y-3 border-t border-line pt-4"><h3 className="font-bold text-navy">Decision</h3>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}{decision && <label className="block text-xs font-semibold text-navy">{decision === 'reject' || decision === 'return' ? 'Mandatory reason' : 'Remarks (optional)'}<textarea className={`${control} mt-2`} rows={3} maxLength={4000} required={decision === 'return' || decision === 'reject'} value={remarks} onChange={(e) => setRemarks(e.target.value)}/></label>}
          <div className="flex flex-wrap gap-2">{decision ? <><button className={secondary} disabled={busy} onClick={() => { setDecision(null); setError('') }}>Cancel</button><button className={primary} disabled={busy || (['return','reject'].includes(decision) && !remarks.trim())} onClick={() => { void execute() }}>{busy ? 'Saving…' : `Confirm ${decision}`}</button></> : <>{selected.approval.workflowStatus === 'submitted' && selected.capabilities.review && <button className={secondary} onClick={() => openDecision('review')}>Start review</button>}{selected.capabilities.approve && <button className={primary} onClick={() => openDecision('approve')}>Approve</button>}{selected.capabilities.return && <button className={secondary} onClick={() => openDecision('return')}>Return for correction</button>}{selected.capabilities.reject && <button className={secondary} onClick={() => openDecision('reject')}>Reject</button>}</>}</div>
        </div>}
      </div>}
    </Modal>
    <Modal open={!!documentPreview} title="Document preview" onClose={() => setDocumentPreview(null)}>{documentPreview && <DocumentPreview file={documentPreview.file} fileName={documentPreview.document.fileName} mimeType={documentPreview.document.mimeType}/>}</Modal>
  </div>
}
