import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthenticatedUser } from '../../hooks/useAuthenticatedUser'
import { mockDataServices } from '../../services/mockDataService'
const sections = [
  ['assets','PPE Registry'],['accountingRecords','Accounting Records'],['projects','Construction in Progress'],
  ['inventorySessions','Inventory Sessions'],['inventoryChecks','Physical Inventory'],['transfers','Asset Transfers'],
  ['disposals','Disposals'],['approvals','Approval History'],['auditLogs','Audit Trail'],
] as const
export default function AuditorModule() {
  const { session }=useAuthenticatedUser()
  const ctx=useMemo(()=>({actor:session.user,sessionId:session.sessionId,municipalityId:session.user.municipalityId}),[session])
  const [section,setSection]=useState<string>('auditLogs')
  const [data,setData]=useState<Record<string,unknown[]>|null>(null)
  const [error,setError]=useState('')
  useEffect(()=>{let active=true;void mockDataServices.reporting.auditorRecords(ctx).then(r=>{if(!active)return;if(r.ok){setData(r.data);setError('')}else setError(r.error.message)});return()=>{active=false}},[ctx])
  const rows = data?.[section] ?? []
  return <div className="space-y-5"><header><h2 className="text-2xl font-bold text-navy">Auditor — Read-only Workspace</h2><p className="text-sm text-gray">Authorized municipality: {ctx.municipalityId}. Data is retrieved through service-enforced read-only access. No edit, approval, or administrative commands are available.</p><Link to="/dashboard/reports" className="text-sm font-semibold text-navy underline">Open authorized reports and exports</Link></header>
  {error&&<p role="alert" className="text-red-700">{error}</p>}
  {data&&<><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{sections.map(([key,label])=><button key={key} onClick={()=>setSection(key)} aria-pressed={section===key} className={`rounded-xl border border-line p-3 text-left text-sm ${section===key?'bg-navy text-white':'bg-white text-navy'}`}><strong className="block">{data[key]?.length??0}</strong>{label}</button>)}</div>
  <section className="rounded-xl border border-line bg-white p-4"><h3 className="mb-3 font-bold text-navy">{sections.find(([key])=>key===section)?.[1]}</h3>{rows.length===0?<p className="text-sm text-gray">No matching records.</p>:<div className="max-h-[38rem] space-y-2 overflow-y-auto">{rows.map((entry,index)=><details key={typeof entry==='object'&&entry&&'id' in entry?String(entry.id):index} className="rounded-xl border border-line p-3"><summary className="cursor-pointer break-all text-sm font-semibold text-navy">{typeof entry==='object'&&entry&&'id' in entry?String(entry.id):`Record ${index+1}`}</summary><pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(entry,null,2)}</pre></details>)}</div>}</section></>}
  </div>
}
