import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuthenticatedUser } from '../../hooks/useAuthenticatedUser'
import { mockDataServices } from '../../services/mockDataService'
import { reportTypes, type ReportResult, type ReportType } from '../../services/reportingService'
import { downloadExcel, downloadPdf, reportCell } from './reportExport'
const titles: Record<ReportType,string> = { ppe_master:'PPE Master List',depreciation:'Depreciation Schedule',cip:'Construction in Progress',inventory:'Physical Inventory',transfers_disposals:'Asset Transfer and Disposal',reconciliation:'Accounting Reconciliation',audit_trail:'Audit Trail' }
const control='rounded-xl border border-line bg-white px-3 py-2 text-sm'
export default function ReportsModule() {
  const { session }=useAuthenticatedUser()
  const ctx=useMemo(()=>({ actor:session.user, sessionId:session.sessionId, municipalityId:session.user.municipalityId }),[session])
  const [type,setType]=useState<ReportType>('ppe_master')
  const [start,setStart]=useState('2000-01-01'),[end,setEnd]=useState(new Date().toISOString().slice(0,10))
  const [category,setCategory]=useState(''),[department,setDepartment]=useState(''),[status,setStatus]=useState('')
  const [data,setData]=useState<ReportResult|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const filters=useMemo(()=>({type,start,end,category:category||undefined,departmentId:department||undefined,status:status||undefined}),[type,start,end,category,department,status])
  const load=useCallback(async()=>{setBusy(true); const r=await mockDataServices.reporting.preview(ctx,filters); if(r.ok){setData(r.data);setError('')}else{setData(null);setError(r.error.message)}setBusy(false)},[ctx,filters])
  useEffect(()=>{void Promise.resolve().then(load)},[load])
  async function exportFile(kind:'pdf'|'excel') {setBusy(true); const result=await mockDataServices.reporting.exportSnapshot(ctx,filters); if(!result.ok){setError(result.error.message);setBusy(false);return} setData(result.data);setError(''); try {if(kind==='pdf') await downloadPdf(result.data); else await downloadExcel(result.data)}catch(e){setError(e instanceof Error?e.message:'Export failed.')}finally{setBusy(false)}}
  return <div className="space-y-5"><header><h2 className="text-2xl font-bold text-navy">Reports and Audit Management</h2><p className="mt-1 text-sm text-gray">Persisted, municipality-authorized data. Financial values use stored accounting or saved reconciliation information; depreciation amounts are calculated from saved recognition policies and are not posted entries.</p></header>
    <section className="grid gap-3 rounded-2xl border border-line bg-white p-4 sm:grid-cols-2 lg:grid-cols-3">
      <label className="grid gap-1 text-sm">Report <select className={control} value={type} onChange={e=>{setType(e.target.value as ReportType);setStatus('')}}>{reportTypes.map(t=><option key={t} value={t}>{titles[t]}</option>)}</select></label>
      <label className="grid gap-1 text-sm">From <input className={control} type="date" value={start} onChange={e=>setStart(e.target.value)}/></label><label className="grid gap-1 text-sm">To <input className={control} type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label>
      <label className="grid gap-1 text-sm">Category <input className={control} value={category} placeholder="All categories" onChange={e=>setCategory(e.target.value)}/></label><label className="grid gap-1 text-sm">Department ID <input className={control} value={department} placeholder="All departments" onChange={e=>setDepartment(e.target.value)}/></label><label className="grid gap-1 text-sm">Status <input className={control} value={status} placeholder="All statuses" onChange={e=>setStatus(e.target.value)}/></label>
      <p className="text-sm sm:col-span-3">Municipality: <strong>{ctx.municipalityId}</strong> (locked to authenticated session)</p>
      <div className="flex flex-wrap gap-2 sm:col-span-3"><button disabled={busy} className="rounded-lg bg-navy px-4 py-2 text-white disabled:opacity-50" onClick={()=>void load()}>Preview report</button><button disabled={busy||!data} className={control} onClick={()=>void exportFile('pdf')}>Export PDF</button><button disabled={busy||!data} className={control} onClick={()=>void exportFile('excel')}>Export Excel</button></div>
    </section>
    {error&&<p role="alert" className="text-red-700">{error}</p>}{busy&&<p role="status">Preparing report...</p>}
    {data&&<section className="rounded-2xl border border-line bg-white p-4"><h3 className="text-lg font-bold text-navy">{titles[data.type]} — Preview</h3><p className="text-xs text-gray">Generated {data.generatedAt} · By {data.generatedBy} · {data.rows.length} rows · Municipality {data.municipalityId}</p><div className="mt-3 overflow-x-auto"><table className="min-w-full border-collapse text-left text-xs"><thead><tr>{data.columns.map(c=><th className="border-b p-2" key={c.key}>{c.label}</th>)}</tr></thead><tbody>{data.rows.map((r,i)=><tr key={i}>{data.columns.map(c=><td className="border-b p-2" key={c.key}>{reportCell(r[c.key],c.money)}</td>)}</tr>)}<tr className="font-bold">{data.columns.map((c,i)=><td className="p-2" key={c.key}>{i===0?'TOTAL':c.money?reportCell(data.totals[c.key]??0,true):''}</td>)}</tr></tbody></table></div>{data.rows.length===0&&<p className="p-5 text-center text-gray">No records match these filters.</p>}</section>}
  </div>
}
