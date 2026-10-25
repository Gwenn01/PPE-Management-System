import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Asset, AssetRegistration, Document } from '../../domain/models'
import { registrationDocumentTypes, registrationDocumentLabels, registrationMethods, type RegistrationDocumentType } from '../../domain/registration'
import { useAuthenticatedUser } from '../../hooks/useAuthenticatedUser'
import { mockDataServices } from '../../services/mockDataService'
import { registrationService } from '../../services/registrationService'
import type { RegistrationOverview, RegistrationDraft } from '../../services/registrationService'
import { DataTable, DocumentPreview, EmptyState, ErrorState, FileUpload, LoadingSkeleton, Modal, PageHeader, StatusBadge, useToast } from '../../components/ui'
import type { TableColumn } from '../../components/ui/DataTable'

const primary = 'rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy disabled:opacity-50'
const secondary = 'rounded-xl border border-line px-3 py-2 text-sm font-semibold text-navy hover:bg-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy disabled:opacity-50'
const control = 'mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-charcoal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy'
const money = (centavos: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(centavos / 100)
const dateLabel = (value: string | null) => value ? new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
const empty: RegistrationDraft = { description: '', proposedPropertyNumber: '', category: '', departmentId: '', custodianId: null, location: '', acquisitionDate: '', acquisitionCost: 0, acquisitionMethod: 'purchase' }
const choose = (value: string, label: string) => <option value={value}>{label}</option>

function Field({ label, value, onChange, type = 'text', required = true, min }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; min?: string }) {
  return <label className="block text-xs font-semibold text-navy">{label}<input className={control} type={type} required={required} min={min} value={value} onChange={(event) => onChange(event.target.value)} /></label>
}
function SelectField({ label, value, onChange, children, required = true }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode; required?: boolean }) {
  return <label className="block text-xs font-semibold text-navy">{label}<select className={control} required={required} value={value} onChange={(event) => onChange(event.target.value)}>{children}</select></label>
}

export default function AssetRegistryModule({ module }: { module: 'assets' | 'asset-registration' }) {
  const { requestContext, session } = useAuthenticatedUser()
  const { notify } = useToast()
  const [data, setData] = useState<RegistrationOverview | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draft, setDraft] = useState<RegistrationDraft>({ ...empty })
  const [formOpen, setFormOpen] = useState(false)
  const [viewAsset, setViewAsset] = useState<Asset | null>(null)
  const [viewRequest, setViewRequest] = useState<string | null>(null)
  const [docType, setDocType] = useState<RegistrationDocumentType>('purchase_order')
  const [docView, setDocView] = useState<{ document: Document; file: Blob | null } | null>(null)
  const [filterCategory, setFilterCategory] = useState('')
  const [filterDepartment, setFilterDepartment] = useState('')
  const [filterCustodian, setFilterCustodian] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const reload = useCallback(async () => {
    const result = await registrationService.overview(requestContext)
    if (result.ok) { setData(result.data); setError('') } else setError(result.error.message)
    setLoading(false)
    return result.ok ? result.data : null
  }, [requestContext])
  useEffect(() => { void Promise.resolve().then(reload) }, [reload])
  const current = data?.registrations.find((r) => r.id === (viewRequest ?? activeId))
  const update = <K extends keyof RegistrationDraft>(key: K, value: RegistrationDraft[K]) => setDraft((prev) => ({ ...prev, [key]: value }))
  const named = (id: string | null) => data?.users.find((u) => u.id === id)?.name ?? (id ? 'Unassigned user' : 'Not assigned')
  const departmentName = (id: string) => data?.departments.find((d) => d.id === id)?.name ?? 'Unknown department'
  const categoryName = (id: string) => data?.categories.find((c) => c.id === id)?.name ?? 'Unknown category'
  const openForm = (registration?: AssetRegistration) => {
    setActiveId(registration?.id ?? null)
    setDraft(registration ? {
      description: registration.description, proposedPropertyNumber: registration.proposedPropertyNumber, category: registration.category, departmentId: registration.departmentId,
      custodianId: registration.custodianId, location: registration.location, acquisitionDate: registration.acquisitionDate, acquisitionCost: registration.acquisitionCost, acquisitionMethod: registration.acquisitionMethod,
    } : { ...empty, category: data?.categories[0]?.id ?? '', departmentId: data?.departments.find((d) => d.active)?.id ?? '' })
    setFormOpen(true)
  }
  const execute = async (operation: () => Promise<{ ok: boolean; error?: { message: string } }>, message: string) => {
    if (busy) return false
    setBusy(true); setError('')
    try {
      const result = await operation()
      if (!result.ok) { setError(result.error?.message ?? 'The operation was not completed.'); return false }
      await reload(); notify(message); return true
    } catch { setError('Local storage is unavailable. No changes were confirmed.'); return false }
    finally { setBusy(false) }
  }
  const save = async () => {
    const record = data?.registrations.find((r) => r.id === activeId)
    const result = record ? await registrationService.update(requestContext, record.id, record.version, draft) : await registrationService.create(requestContext, draft)
    if (!result.ok) { setError(result.error.message); return }
    await reload(); notify(record ? 'Draft updated.' : 'Draft registration created.'); setFormOpen(false)
    setViewRequest(result.data.id)
  }
  const startSave = () => { if (busy) return; setBusy(true); setError(''); void save().finally(() => setBusy(false)) }
  const upload = async (file: File) => {
    if (!current || busy) return
    await execute(() => mockDataServices.documents.upload(requestContext, { fileName: file.name, file, entityType: 'registration', entityId: current.id, documentType: docType }), 'Supporting document saved locally.')
  }
  const showDoc = async (document: Document) => {
    const result = await mockDataServices.documents.download(requestContext, document.id)
    if (result.ok) setDocView({ document, file: result.data.file })
    else { setDocView({ document, file: null }); setError(result.error.message) }
  }
  const requestDocuments = (id: string) => data?.documents.filter((document) => document.entityId === id) ?? []
  const assets = useMemo(() => (data?.assets ?? []).filter((asset) => (!filterCategory || asset.category === filterCategory) && (!filterDepartment || asset.departmentId === filterDepartment) && (!filterCustodian || asset.custodianId === filterCustodian) && (!filterStatus || (asset.recognitionStatus === 'awaiting_recognition' ? 'awaiting_recognition' : asset.lifecycleStatus) === filterStatus)), [data, filterCategory, filterDepartment, filterCustodian, filterStatus])
  const assetColumns: TableColumn<Asset>[] = [
    { id: 'property', label: 'Property number', sortValue: (a) => a.propertyNumber, cell: (a) => <strong className="text-navy">{a.propertyNumber}</strong> },
    { id: 'name', label: 'Asset', sortValue: (a) => a.description, cell: (a) => <><p>{a.description}</p><p className="text-xs text-gray">{categoryName(a.category)}</p></> },
    { id: 'department', label: 'Department / Custodian', sortValue: (a) => departmentName(a.departmentId), cell: (a) => <>{departmentName(a.departmentId)}<p className="text-xs text-gray">{named(a.custodianId)}</p></> },
    { id: 'status', label: 'Status', sortValue: (a) => a.recognitionStatus ?? a.lifecycleStatus, cell: (a) => <StatusBadge status={a.recognitionStatus === 'awaiting_recognition' ? a.recognitionStatus : a.lifecycleStatus}/> },
    { id: 'cost', label: 'Acquisition cost', sortValue: (a) => a.acquisitionCost, cell: (a) => money(a.acquisitionCost) },
    { id: 'actions', label: 'Details', cell: (a) => <button className={secondary} onClick={() => setViewAsset(a)}>View asset</button> },
  ]
  const requests = data?.registrations ?? []
  const requestColumns: TableColumn<AssetRegistration>[] = [
    { id: 'number', label: 'Property number', sortValue: (r) => r.proposedPropertyNumber, cell: (r) => <><strong className="text-navy">{r.proposedPropertyNumber}</strong><p className="text-xs text-gray">{r.description}</p></> },
    { id: 'method', label: 'Method', sortValue: (r) => r.acquisitionMethod, cell: (r) => r.acquisitionMethod },
    { id: 'status', label: 'Request status', sortValue: (r) => r.workflowStatus, cell: (r) => <StatusBadge status={r.workflowStatus}/> },
    { id: 'updated', label: 'Last updated', sortValue: (r) => r.updatedAt, cell: (r) => dateLabel(r.updatedAt) },
    { id: 'actions', label: 'Actions', cell: (r) => <div className="flex flex-wrap gap-2"><button className={secondary} onClick={() => setViewRequest(r.id)}>Details / history</button>{['draft', 'returned'].includes(r.workflowStatus) && r.requestedById === requestContext.actor.id && data?.capabilities.update && <button className={secondary} onClick={() => openForm(r)}>Edit draft</button>}</div> },
  ]
  return <div className="mx-auto max-w-7xl space-y-6">
    <PageHeader eyebrow="Property management" title={module === 'assets' ? 'PPE Asset Registry' : 'Asset registration requests'} description={module === 'assets' ? `Registered PPE records for ${session.municipality.name}. Unapproved submissions do not become assets.` : 'Save draft details, attach applicable supporting documents and submit to the Approving Officer. Phase 07 will handle approval decisions.'} actions={<>{(module === 'assets' ? data?.capabilities.readRequests : data?.capabilities.readAssets) && <Link to={`/dashboard/${module === 'assets' ? 'asset-registration' : 'assets'}`} className={secondary}>{module === 'assets' ? 'Registration requests' : 'PPE asset registry'}</Link>}{data?.capabilities.create && <button className={primary} onClick={() => openForm()}>New asset registration</button>}</>} />
    {error && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error} <button className="ml-2 underline" onClick={() => { void reload() }}>Refresh</button></div>}
    {loading ? <LoadingSkeleton/> : !data ? <ErrorState message={error || 'No authorized asset data available.'} onRetry={() => { void reload() }}/> : module === 'assets' ? <>
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-line bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <SelectField label="Category" required={false} value={filterCategory} onChange={setFilterCategory}>{choose('', 'All categories')}{data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectField>
        <SelectField label="Department" required={false} value={filterDepartment} onChange={setFilterDepartment}>{choose('', 'All departments')}{data.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</SelectField>
        <SelectField label="Custodian" required={false} value={filterCustodian} onChange={setFilterCustodian}>{choose('', 'All custodians')}{data.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</SelectField>
        <SelectField label="Registry status" required={false} value={filterStatus} onChange={setFilterStatus}>{choose('', 'All statuses')}{['awaiting_recognition', 'in_service', 'under_maintenance', 'idle', 'disposed'].map((s) => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}</SelectField>
      </div>
      <DataTable rows={assets} columns={assetColumns} pageSize={10} caption="Municipal PPE assets" getRowId={(r) => r.id} getSearchText={(r) => `${r.propertyNumber} ${r.description} ${r.location} ${categoryName(r.category)} ${departmentName(r.departmentId)} ${named(r.custodianId)}`}/>
    </> : <><p className="text-xs text-gray">A registration marked “submitted” is awaiting approval; its associated PPE asset does not exist until a later authorized recognition step.</p><DataTable rows={requests} columns={requestColumns} pageSize={10} caption="Asset registration requests and history" getRowId={(r) => r.id} getSearchText={(r) => `${r.proposedPropertyNumber} ${r.description} ${r.workflowStatus} ${r.acquisitionMethod}`} getFilterValue={(r) => r.workflowStatus} filterOptions={['draft', 'submitted', 'under_review', 'returned', 'approved', 'rejected', 'cancelled'].map((s) => ({ value: s, label: s.replaceAll('_', ' ') }))}/></>}
    <Modal open={formOpen} title={activeId ? 'Edit draft registration' : 'New asset registration'} onClose={() => !busy && setFormOpen(false)}><form className="grid max-h-[65vh] grid-cols-1 gap-4 overflow-y-auto sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); startSave() }}>
      <Field label="Asset name" value={draft.description} onChange={(v) => update('description', v)}/>
      <Field label="Property number" value={draft.proposedPropertyNumber} onChange={(v) => update('proposedPropertyNumber', v)}/>
      <SelectField label="Category" value={draft.category} onChange={(v) => update('category', v)}>{choose('', 'Choose category')}{data?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectField>
      <SelectField label="Acquisition method" value={draft.acquisitionMethod} onChange={(v) => update('acquisitionMethod', v as RegistrationDraft['acquisitionMethod'])}>{registrationMethods.map((m) => <option key={m} value={m}>{m}</option>)}</SelectField>
      <Field label="Acquisition date" type="date" value={draft.acquisitionDate} onChange={(v) => update('acquisitionDate', v)}/>
      <Field label="Acquisition cost (PHP)" type="number" min="0.01" value={draft.acquisitionCost ? String(draft.acquisitionCost / 100) : ''} onChange={(v) => update('acquisitionCost', Math.round(Number(v) * 100))}/>
      <Field label="Location" value={draft.location} onChange={(v) => update('location', v)}/>
      <SelectField label="Department" value={draft.departmentId} onChange={(v) => { setDraft((d) => ({ ...d, departmentId: v, custodianId: null })) }}>{choose('', 'Choose active department')}{data?.departments.filter((d) => d.active).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</SelectField>
      <div className="sm:col-span-2"><SelectField label="Custodian" value={draft.custodianId ?? ''} onChange={(v) => update('custodianId', v || null)}>{choose('', 'Choose active custodian')}{data?.users.filter((u) => u.departmentId === draft.departmentId && u.status === 'active').map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</SelectField></div>
      <p className="text-xs text-gray sm:col-span-2">Saving validates fields and property-number uniqueness but does not submit or recognize this asset. Attach documents after saving.</p>
      {error && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{error}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2"><button className={secondary} type="button" onClick={() => setFormOpen(false)} disabled={busy}>Cancel</button><button className={primary} disabled={busy} type="submit">{busy ? 'Saving…' : 'Save draft'}</button></div>
    </form></Modal>
    <Modal open={!!viewAsset} title="PPE asset details" onClose={() => setViewAsset(null)}>{viewAsset && <div className="space-y-3"><dl className="grid grid-cols-2 gap-3">{([['Property number', viewAsset.propertyNumber], ['Asset name', viewAsset.description], ['Category', categoryName(viewAsset.category)], ['Department', departmentName(viewAsset.departmentId)], ['Custodian', named(viewAsset.custodianId)], ['Status', viewAsset.recognitionStatus === 'awaiting_recognition' ? 'Awaiting Recognition' : viewAsset.lifecycleStatus], ['Condition', viewAsset.condition], ['Acquisition date', viewAsset.acquisitionDate], ['Acquisition cost', money(viewAsset.acquisitionCost)], ['Location', viewAsset.location]] as const).map(([k,v]) => <div key={k}><dt className="text-xs text-gray">{k}</dt><dd className="font-semibold text-navy">{v}</dd></div>)}</dl><p className="text-xs text-gray">Accounting ledger and final depreciation are intentionally not exposed in this Property Officer workflow.</p>{data?.capabilities.readRequests && data?.registrations.find((r) => r.id === viewAsset.registrationId) && <button className={secondary} onClick={() => { setViewRequest(viewAsset.registrationId); setViewAsset(null) }}>Registration and supporting documents</button>}</div>}</Modal>
    <Modal open={!!viewRequest} title="Registration details and history" onClose={() => { setViewRequest(null); setDocView(null) }}>
      {current ? <div className="max-h-[68vh] space-y-4 overflow-y-auto">
        {error && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap items-center gap-2"><strong className="text-navy">{current.proposedPropertyNumber}</strong><StatusBadge status={current.workflowStatus}/></div>
        <dl className="grid grid-cols-2 gap-3">{([['Asset name', current.description], ['Category', categoryName(current.category)], ['Department', departmentName(current.departmentId)], ['Custodian', named(current.custodianId)], ['Acquisition method', current.acquisitionMethod], ['Acquisition date', current.acquisitionDate], ['Acquisition cost', money(current.acquisitionCost)], ['Location', current.location], ['Submitted at', dateLabel(current.submittedAt)]] as const).map(([k,v]) => <div key={k}><dt className="text-xs text-gray">{k}</dt><dd className="font-semibold text-navy">{v}</dd></div>)}</dl>
        <h3 className="font-bold text-navy">Supporting documents</h3><p className="text-xs text-gray">Required for {current.acquisitionMethod}: {data?.rules[current.acquisitionMethod].map((kind) => registrationDocumentLabels[kind]).join(', ') || 'None under current municipal rules'}. Other document types remain optional.</p>
        {requestDocuments(current.id).length ? <ul className="space-y-2">{requestDocuments(current.id).map((document) => <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3" key={document.id}><span><span className="block font-semibold">{document.documentType ? registrationDocumentLabels[document.documentType] : 'Unclassified'}</span><span className="block break-all text-xs text-gray">{document.fileName}</span></span><div className="flex gap-2"><button className={secondary} onClick={() => { void showDoc(document) }}>View</button>{['draft', 'returned'].includes(current.workflowStatus) && current.requestedById === requestContext.actor.id && data?.capabilities.documents && data?.capabilities.update && <button className={secondary} disabled={busy} onClick={() => { void execute(() => mockDataServices.documents.remove(requestContext, document.id), 'Draft document removed; audit metadata preserved.') }}>Remove</button>}</div></li>)}</ul> : <EmptyState message="No supporting documents attached yet."/>}
        {['draft', 'returned'].includes(current.workflowStatus) && current.requestedById === requestContext.actor.id && (data?.capabilities.update || data?.capabilities.submit) && <section className="space-y-3 rounded-xl border border-line bg-mist p-4"><SelectField label="Supporting document type" value={docType} onChange={(v) => setDocType(v as RegistrationDocumentType)}>{registrationDocumentTypes.map((kind) => <option key={kind} value={kind}>{registrationDocumentLabels[kind]}</option>)}</SelectField>{data?.capabilities.documents && data?.capabilities.update && <FileUpload onSelect={(file) => { void upload(file) }} disabled={busy}/>}<div className="flex flex-wrap gap-2">{data?.capabilities.update && <button className={secondary} onClick={() => { const r = data?.registrations.find((v) => v.id === current.id); if (r) { setViewRequest(null); openForm(r) } }}>Edit details</button>}{data?.capabilities.submit && <button className={primary} disabled={busy} onClick={() => { void execute(() => registrationService.submit(requestContext, current.id, current.version), 'Registration submitted for Phase 07 approval.').then((ok) => { if (ok) setViewRequest(null) }) }}>{busy ? 'Processing…' : current.workflowStatus === 'returned' ? 'Resubmit for approval' : 'Submit for approval'}</button>}</div></section>}
        <h3 className="font-bold text-navy">Decision and request history</h3>{data?.approvals.find((a) => a.subjectId === current.id)?.history.length ? <ol className="space-y-2">{data.approvals.find((a) => a.subjectId === current.id)!.history.map((entry, i) => <li className="rounded-xl border border-line p-3" key={`${entry.occurredAt}-${i}`}><strong className="capitalize text-navy">{entry.action}: {entry.toStatus.replaceAll('_', ' ')}</strong><p className="text-xs text-gray">{dateLabel(entry.occurredAt)} · {named(entry.actorId)} ({entry.actorRole.replaceAll('_', ' ')})</p>{entry.reason && <p className="mt-1 text-sm">{entry.reason}</p>}</li>)}</ol> : <p className="text-sm text-gray">No approval events yet. Saving and document changes are also retained in the audit trail.</p>}
        {current.workflowStatus === 'approved' && current.recognizedAssetId && <p role="status" className="rounded-xl bg-mist p-3 text-sm">Registration approved — linked PPE registry record created. Accounting recognition remains a separate process.</p>}
        {current.workflowStatus === 'submitted' && <p role="status" className="rounded-xl bg-mist p-3 text-sm">Pending Approval — an Approving Officer will review this request. The PPE entry will be created only on approval, and will then await Accounting recognition.</p>}
      </div> : <EmptyState message="Registration unavailable."/>}
    </Modal>
    <Modal open={!!docView} title="Document preview" onClose={() => setDocView(null)}>{docView && <DocumentPreview file={docView.file} fileName={docView.document.fileName} mimeType={docView.document.mimeType}/>}</Modal>
  </div>
}
