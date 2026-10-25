import PageHeader from '../../components/ui/PageHeader'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuthenticatedUser } from '../../hooks/useAuthenticatedUser'
import { mockDataServices } from '../../services/mockDataService'
import { reportTypes, type ReportResult, type ReportType } from '../../services/reportingService'
import { downloadExcel, downloadPdf, reportCell } from './reportExport'
import DataTable from '../../components/ui/DataTable'
import type { TableColumn } from '../../components/ui/DataTable'
const titles: Record<ReportType,string> = { ppe_master:'PPE Master List',depreciation:'Depreciation Schedule',cip:'Construction in Progress',inventory:'Physical Inventory',transfers_disposals:'Asset Transfer and Disposal',reconciliation:'Accounting Reconciliation',audit_trail:'Audit Trail' }
const control = 'ui-input'
export default function ReportsModule() {
  const { session }=useAuthenticatedUser()
  const ctx=useMemo(()=>({ actor:session.user, sessionId:session.sessionId, municipalityId:session.user.municipalityId }),[session])
  const [type,setType]=useState<ReportType>('ppe_master')
  const [start,setStart]=useState('2000-01-01'),[end,setEnd]=useState(new Date().toISOString().slice(0,10))
  const [category,setCategory]=useState(''),[department,setDepartment]=useState(''),[status,setStatus]=useState('')
  const [data,setData]=useState<ReportResult|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const generation=useRef(0)
  const invalidate=useCallback(()=>{generation.current++},[])
  const filters=useMemo(()=>({type,start,end,category:category||undefined,departmentId:department||undefined,status:status||undefined}),[type,start,end,category,department,status])
  const load=useCallback(async()=>{const revision=++generation.current;setBusy(true); const r=await mockDataServices.reporting.preview(ctx,filters); if(revision!==generation.current)return; if(r.ok){setData(r.data);setError('')}else{setData(null);setError(r.error.message)}setBusy(false)},[ctx,filters])
  useEffect(()=>{invalidate();const timer=window.setTimeout(()=>{void load()},200); return()=>{window.clearTimeout(timer);invalidate()}},[load,invalidate])
  async function exportFile(kind:'pdf'|'excel') {setBusy(true); const result=await mockDataServices.reporting.exportSnapshot(ctx,filters); if(!result.ok){setError(result.error.message);setBusy(false);return} setData(result.data);setError(''); try {if(kind==='pdf') await downloadPdf(result.data); else await downloadExcel(result.data)}catch(e){setError(e instanceof Error?e.message:'Export failed.')}finally{setBusy(false)}}
  const columns: TableColumn<Record<string, string | number | null>>[] = data?.columns.map((column) => ({
    id: column.key,
    label: column.label,
    align: column.money ? 'right' : undefined,
    sortValue: (row) => row[column.key],
    cell: (row) => reportCell(row[column.key], column.money),
  })) ?? []
  return <div className="workspace-page"><PageHeader eyebrow="Reports and audit" title="Reports" description="Preview and export municipal records. Calculated depreciation uses saved policies and is separate from posted entries." />
    <section className="ui-panel grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
      <label className="grid gap-1 text-sm">Report <select className={control} value={type} onChange={e=>{setType(e.target.value as ReportType);setStatus('')}}>{reportTypes.map(t=><option key={t} value={t}>{titles[t]}</option>)}</select></label>
      <label className="grid gap-1 text-sm">From <input className={control} type="date" value={start} onChange={e=>setStart(e.target.value)}/></label><label className="grid gap-1 text-sm">To <input className={control} type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label>
      <label className="grid gap-1 text-sm">Category <input className={control} value={category} placeholder="All categories" onChange={e=>setCategory(e.target.value)}/></label><label className="grid gap-1 text-sm">Department ID <input className={control} value={department} placeholder="All departments" onChange={e=>setDepartment(e.target.value)}/></label><label className="grid gap-1 text-sm">Status <input className={control} value={status} placeholder="All statuses" onChange={e=>setStatus(e.target.value)}/></label>
      <p className="text-sm sm:col-span-2 lg:col-span-3">Municipality: <strong>{ctx.municipalityId}</strong> (locked to authenticated session)</p>
      <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3"><button disabled={busy} className="ui-button" onClick={()=>void load()}>Preview report</button><button disabled={busy||!data} className="ui-button-secondary" onClick={()=>void exportFile('pdf')}>Export PDF</button><button disabled={busy||!data} className="ui-button-secondary" onClick={()=>void exportFile('excel')}>Export Excel</button></div>
    </section>
    {error&&<p role="alert" className="text-red-700">{error}</p>}{busy&&<p role="status">Preparing report...</p>}
    {data&&<section className="space-y-3"><h3 className="text-lg font-bold text-navy">{titles[data.type]} — Preview</h3><p className="text-xs text-muted">Generated {data.generatedAt} · By {data.generatedBy} · {data.rows.length} rows · Municipality {data.municipalityId}</p>{Object.entries(data.totals).length > 0 && <dl className="grid gap-2 rounded-xl bg-mist p-3 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(data.totals).map(([key, value]) => <div key={key}><dt className="text-xs font-semibold text-muted">Total {data.columns.find((column) => column.key === key)?.label ?? key}</dt><dd className="font-semibold text-navy">{reportCell(value, true)}</dd></div>)}</dl>}<DataTable rows={data.rows} columns={columns} caption={`${titles[data.type]} report preview`} pageSize={25} getRowId={(row, index) => `${index}-${String(row[data.columns[0]?.key] ?? '')}`} getSearchText={(row) => data.columns.map((column) => String(row[column.key] ?? '')).join(' ')} emptyMessage="No records match these filters." /></section>}
  </div>
}
