import PageHeader from '../../components/ui/PageHeader'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { budgetDocumentTypes } from '../../domain/budget'
import { projectDocumentTypes, type ProjectDocumentType } from '../../domain/construction'
import { useAuthenticatedUser } from '../../hooks/useAuthenticatedUser'
import { mockDataServices } from '../../services/mockDataService'
import type { ConstructionCommand, ConstructionDraft, ConstructionOverview } from '../../services/constructionService'
import type { ServiceResult } from '../../services/contracts'
import { DataTable, DocumentPreview, FileUpload, Modal } from '../../components/ui'
import type { Document } from '../../domain/models'

const control = 'ui-input mt-1'
const button = 'ui-button'
const money = (n: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n / 100)
const label = (s: string) => s.replaceAll('_', ' ')
const initialDraft: ConstructionDraft = { name: '', projectNumber: '', location: '', departmentId: '', budgetAmount: 0, contractor: '', startDate: '', expectedCompletionDate: '', engineeringUserId: '', budgetUserId: '' }

export default function ConstructionModule({ module }: { module: 'construction-projects' | 'engineering' | 'budget' }) {
  const { session, user } = useAuthenticatedUser()
  const ctx = useMemo(() => ({ actor: session.user, sessionId: session.sessionId, municipalityId: session.user.municipalityId }), [session])
  const [data, setData] = useState<ConstructionOverview | null>(null), [selected, setSelected] = useState('')
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  const [createOpen, setCreateOpen] = useState(false), [draft, setDraft] = useState(initialDraft), [budget, setBudget] = useState('')
  const [readyDate, setReadyDate] = useState(new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState(''), [percent, setPercent] = useState('0'), [actual, setActual] = useState('')
  const [documentType, setDocumentType] = useState<ProjectDocumentType>('progress_report')
  const [preview, setPreview] = useState<{ document: Document; file: Blob } | null>(null)
  const [view, setView] = useState('all')
  const load = useCallback(async () => {
    const result = await mockDataServices.construction.overview(ctx, module)
    if (result.ok) setData(result.data); else setError(result.error.message)
  }, [ctx, module])
  useEffect(() => { void Promise.resolve().then(load) }, [load])
  const project = data?.projects.find(p => p.id === selected), tracking = project?.construction
  const property = user.role === 'property_officer', engineering = user.role === 'engineering_office', budgetOffice = user.role === 'budget_office'
  const closed = project && ['completed', 'capitalized', 'cancelled'].includes(project.projectStatus)
  const canProcess = tracking && ['engineering_received', 'processed', 'returned'].includes(tracking.stage)
  async function run<T>(operation: () => Promise<ServiceResult<T>>, success = 'Project saved.') {
    setBusy(true); setError(''); setMessage('')
    try {
      const result = await operation()
      if (!result.ok) throw new Error(result.error.message)
      setMessage(success); await load(); return result.data
    } catch (e) { setError(e instanceof Error ? e.message : 'Operation failed.') } finally { setBusy(false) }
  }
  async function act(command: ConstructionCommand) {
    if (!project) return
    const result = await run(() => mockDataServices.construction.act(ctx, project.id, project.version, command))
    if (result) setNote('')
  }
  async function create() {
    if (!/^\d+(\.\d{1,2})?$/.test(budget)) { setError('Enter a positive peso budget with at most two decimal places.'); return }
    const [whole, decimals = ''] = budget.split('.')
    const budgetAmount = Number(BigInt(whole) * 100n + BigInt(decimals.padEnd(2, '0')))
    const result = await run(() => mockDataServices.construction.create(ctx, { ...draft, budgetAmount }))
    if (result) { setSelected(result.id); setCreateOpen(false); setDraft(initialDraft); setBudget('') }
  }
  const rows = (data?.projects ?? []).filter(p => view !== 'returned' || p.construction?.stage === 'returned')
  const uploadTypes = projectDocumentTypes.filter(t => t !== 'cip_support' && !budgetDocumentTypes.some(b => b === t)).filter(t => engineering ? ['construction_plan', 'availability_of_fund', 'engineering_report', 'progress_report'].includes(t) : t !== 'engineering_report')
  const documentCorrection = engineering && project?.projectStatus === 'completed' && canProcess
  const completionCorrection = property && project?.projectStatus === 'completed' && project.capitalization && ['draft', 'returned'].includes(project.workflowStatus)
  const availableUploadTypes = completionCorrection ? uploadTypes.filter(t => ['completion_certificate', 'acceptance_report'].includes(t)) : uploadTypes
  const effectiveDocumentType = availableUploadTypes.includes(documentType) ? documentType : availableUploadTypes[0]
  const canUpload = tracking && (!closed || documentCorrection || completionCorrection) && (property || (engineering && canProcess))
  return <div className="workspace-page">
    <PageHeader eyebrow={user.municipalityId.replaceAll('_', ' ')} title={engineering ? 'Engineering projects and documents' : budgetOffice ? 'Forwarded engineering packets' : 'Construction projects'} description="Manage assigned project records, supporting documents and processing milestones." actions={property ? <button className={button} onClick={() => setCreateOpen(true)}>Register project</button> : undefined} />
    <p className="ui-panel p-4 text-sm">External MPDO proposal and Mayor authorization are recorded from supplied evidence. These offices are not application roles, and recorded evidence does not represent an official approval. Construction completion does not capitalize an asset.</p>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{error}</p>}{message && <p role="status" className="rounded-xl bg-mist p-3">{message}</p>}
    {!data ? <p role="status">Loading assigned projects...</p> : <>
      <label className="block max-w-xs">Project view<select className={control} value={view} onChange={e => setView(e.target.value)}><option value="all">All authorized projects</option><option value="returned">Returned documents</option></select></label>
      <DataTable rows={rows} caption="Authorized construction projects" getRowId={p => p.id} getSearchText={p => `${p.projectNumber} ${p.name} ${p.location}`} columns={[
        { id: 'ref', label: 'Reference', sortValue: p => p.projectNumber, cell: p => <button className="text-navy underline" onClick={() => { setSelected(p.id); setNote(''); setPercent(String(p.construction?.progressPercent ?? 0)); setMessage('') }}>{p.projectNumber}</button> },
        { id: 'name', label: 'Project', cell: p => p.name }, { id: 'status', label: 'Status', cell: p => `${label(p.projectStatus)} / ${label(p.construction?.stage ?? 'legacy')}` },
        { id: 'progress', label: 'Progress', cell: p => p.construction ? `${p.construction.progressPercent}%` : 'Not recorded' }, { id: 'budget', label: 'Budget', align: 'right', cell: p => money(p.budgetAmount) },
      ]} />
      {project && <section className="ui-panel space-y-5 p-5">
        <h3 className="text-xl font-bold text-navy">{project.name}</h3>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">{Object.entries({ Reference: project.projectNumber, Municipality: project.municipalityId, Budget: money(project.budgetAmount), Contractor: tracking?.contractor ?? 'Not recorded', Location: project.location, 'Start date': project.startDate.slice(0, 10), 'Expected completion': tracking?.expectedCompletionDate ?? 'Not recorded', 'Actual completion': project.completionDate?.slice(0, 10) ?? 'Not completed', Status: label(project.projectStatus), 'Demo external / processing stage': label(tracking?.stage ?? 'legacy'), Engineering: data.users.find(u => u.id === tracking?.engineeringUserId)?.name ?? 'Legacy assignment', 'Budget officer': data.users.find(u => u.id === tracking?.budgetUserId)?.name ?? 'Legacy assignment' }).map(([k, v]) => <div key={k}><dt className="text-muted">{k}</dt><dd className="font-semibold">{v}</dd></div>)}</dl>
        {!tracking && <p>This is a legacy project. No external approval, assignment or progress history has been invented. Its existing files remain available; new tracked projects use the full Phase 09 workflow.</p>}
        {tracking && <><p>Construction review: {tracking.constructionReview} · Availability of Fund review: {tracking.fundReview}</p><progress aria-label="Implementation progress" className="w-full" max={100} value={tracking.progressPercent} /><p>{tracking.progressPercent}% implementation progress</p>
          {(!closed || documentCorrection) && <fieldset disabled={busy} className="space-y-3"><legend className="font-bold">Processing and monitoring</legend>
            <label className="block">Result, evidence reference or monitoring note (required for every action)<textarea className={control} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} /></label>
            <div className="flex flex-wrap gap-2">
              {property && tracking.stage === 'awaiting_proposal' && <button disabled={!note.trim()} className={button} onClick={() => void act({ action: 'proposal', note })}>Record external MPDO proposal</button>}
              {property && tracking.stage === 'proposal_recorded' && <button disabled={!note.trim()} className={button} onClick={() => void act({ action: 'simulate_mayor', note })}>Record simulated external Mayor authorization</button>}
              {engineering && tracking.stage === 'mayor_simulated' && <button disabled={!note.trim()} className={button} onClick={() => void act({ action: 'receive', note })}>Receive authorized project</button>}
              {engineering && canProcess && (['construction', 'fund'] as const).map(subject => <div key={subject} className="flex flex-wrap gap-2"><button disabled={!note.trim()} className={button} onClick={() => void act({ action: 'review', subject, result: 'accepted', note })}>Accept {subject === 'fund' ? 'Availability of Fund' : 'construction'} review</button><button disabled={!note.trim()} className={button} onClick={() => void act({ action: 'review', subject, result: 'returned', note })}>Return {subject} documents</button></div>)}
              {engineering && tracking.stage === 'processed' && <button disabled={!note.trim()} className={button} onClick={() => void act({ action: 'forward', note })}>Forward processed packet to Budget</button>}
              {budgetOffice && tracking.stage === 'forwarded' && <button disabled={!note.trim()} className={button} onClick={() => void act({ action: 'return', note })}>Return packet to assigned Engineering officer</button>}
            </div>
            {!closed && (property || engineering) && (canProcess || property && tracking.stage === 'forwarded') && <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); void act({ action: 'progress', note, percent: Number(percent) }) }}><label>Implementation progress (%)<input required type="number" min={tracking.progressPercent} max="100" step="1" className={control} value={percent} onChange={e => setPercent(e.target.value)} /></label><button disabled={!note.trim()} className={button}>Record {property ? 'monitoring' : 'Engineering progress'} update</button></form>}
            {property && ['processed', 'forwarded'].includes(tracking.stage) && <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); void act({ action: 'complete', note, actualCompletionDate: actual }) }}><label>Actual completion date<input required type="date" min={project.startDate.slice(0, 10)} max={new Date().toISOString().slice(0, 10)} className={control} value={actual} onChange={e => setActual(e.target.value)} /></label><button disabled={!note.trim()} className={button}>Submit completion and acceptance evidence</button><p className="text-xs">Requires 100% progress, accepted Engineering reviews, completion certificate and acceptance report uploads.</p></form>}
          </fieldset>}
        </>}
        {project.readyForUse && <p>Property confirmed readiness for intended use: {project.readyForUse.date}. {project.readyForUse.note}</p>}
        {project.capitalization && <section className="rounded-xl bg-mist p-4"><h4 className="font-bold">Capitalization request: {project.workflowStatus}</h4><p>Qualifying costs {money(project.capitalization.total)} / PPE {project.capitalization.propertyNumber}</p><p>{project.capitalization.verificationNote}</p>{project.capitalizedAssetId && <p>Recognized construction asset: {project.capitalizedAssetId}</p>}</section>}
        {property && project.projectStatus === 'completed' && (!project.capitalization || ['draft', 'returned'].includes(project.workflowStatus)) && <form className="space-y-3 rounded-xl border border-line p-4" onSubmit={e => { e.preventDefault(); void act({ action: 'confirm_ready', date: readyDate, note }) }}><h4 className="font-bold">Confirm ready for intended use</h4><p className="text-sm">Completion and acceptance documents must be present. This confirmation allows Accounting to prepare capitalization; it does not create PPE or start depreciation.</p><label className="block">Ready-for-use date<input required type="date" min={project.completionDate?.slice(0, 10)} max={new Date().toISOString().slice(0, 10)} className={control} value={readyDate} onChange={e => setReadyDate(e.target.value)} /></label><label className="block">Readiness confirmation and evidence reference<textarea required maxLength={2000} className={control} value={note} onChange={e => setNote(e.target.value)} /></label><button disabled={busy} className={button}>Confirm project is ready for intended use</button></form>}
        <h4 className="font-bold">Supporting documents and document history</h4>
        {canUpload && <fieldset disabled={busy} className="space-y-3"><label>Evidence type<select className={control} value={effectiveDocumentType} onChange={e => setDocumentType(e.target.value as ProjectDocumentType)}>{availableUploadTypes.map(t => <option key={t} value={t}>{label(t)}</option>)}</select></label><FileUpload disabled={busy} onSelect={file => void run(() => mockDataServices.documents.upload(ctx, { entityType: 'project', entityId: project.id, projectDocumentType: effectiveDocumentType, fileName: file.name, file }))} /><p className="text-xs">This evidence checklist is configurable and is not a verified LGU requirement. Files are append-only. Uploading a newer plan or fund document resets its Engineering review. Evidence may use a clearly labeled text file.</p></fieldset>}
        <ul className="space-y-2">{data.documents.filter(d => project.documentIds.includes(d.id)).map(d => <li key={d.id} className="flex flex-wrap justify-between gap-2 border-b border-line py-2 text-sm"><span>{label(d.projectDocumentType ?? 'legacy document')} · {d.fileName} · {new Date(d.createdAt).toLocaleString()} · {d.uploadedById}</span><button disabled={busy} className="text-navy underline" onClick={() => void run(async () => { const r = await mockDataServices.documents.download(ctx, d.id); if (r.ok) setPreview(r.data); return r }, 'Local document opened.')}>Preview / download</button></li>)}</ul>
        <h4 className="font-bold">Shared project timeline</h4><ol className="space-y-3">{tracking?.timeline.map(e => <li key={e.id} className="border-l-2 border-line pl-3 text-sm"><p className="font-semibold">{label(e.action)} · {e.progressPercent}%</p><p>{e.note}</p><p className="text-xs text-muted">{new Date(e.occurredAt).toLocaleString()} · {e.actorId}</p>{e.documentIds.length > 0 && <p className="text-xs">Evidence: {e.documentIds.map(id => data.documents.find(d => d.id === id)?.fileName ?? id).join(', ')}</p>}</li>)}</ol>
        <h4 className="font-bold">Forwarding history</h4>{data.routing.filter(r => r.projectId === project.id).map(r => <article key={r.id} className="rounded-xl border border-line p-3 text-sm"><p>Engineering → Budget · {label(r.workflowStatus)} · {new Date(r.submittedAt ?? r.createdAt).toLocaleString()}</p><p>{r.remarks}</p><p>Assigned: {data.users.find(u => u.id === r.assignedUserId)?.name ?? r.assignedUserId} · {r.documentIds.length} archived document references</p></article>)}
      </section>}
    </>}
    <Modal open={createOpen} title="Register construction project" onClose={() => setCreateOpen(false)}>{error && <p role="alert" className="mb-3 text-red-800">{error}</p>}<form className="space-y-3" onSubmit={e => { e.preventDefault(); void create() }}><p className="text-sm">Municipality: {user.municipalityId}. Record the external proposal and Mayor authorization evidence after creating this project. Engineering cannot receive it before those steps.</p>{(['name', 'projectNumber', 'contractor', 'location', 'startDate', 'expectedCompletionDate'] as const).map(key => <label key={key} className="block text-sm">{label(key.replace(/[A-Z]/g, c => ` ${c.toLowerCase()}`))}<input required maxLength={key === 'projectNumber' ? 100 : 2000} type={key.endsWith('Date') ? 'date' : 'text'} className={control} value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })} /></label>)}<label className="block text-sm">Budget (PHP)<input required inputMode="decimal" className={control} value={budget} onChange={e => setBudget(e.target.value)} /></label><label className="block text-sm">Department<select required className={control} value={draft.departmentId} onChange={e => setDraft({ ...draft, departmentId: e.target.value })}><option value="">Select department</option>{data?.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>{(['engineeringUserId', 'budgetUserId'] as const).map(key => <label key={key} className="block text-sm">Assigned {key === 'engineeringUserId' ? 'Engineering' : 'Budget'} officer<select required className={control} value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })}><option value="">Select officer</option>{data?.users.filter(u => u.role === (key === 'engineeringUserId' ? 'engineering_office' : 'budget_office')).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>)}<button disabled={busy} className={button}>{busy ? 'Saving...' : 'Register project'}</button></form></Modal>
    <Modal open={!!preview} title="Project document" onClose={() => setPreview(null)}>{preview && <DocumentPreview file={preview.file} fileName={preview.document.fileName} mimeType={preview.document.mimeType} />}</Modal>
  </div>
}
