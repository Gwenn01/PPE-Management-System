import { useEffect, useMemo, useState } from 'react'
import { useAuthenticatedUser } from '../../hooks/useAuthenticatedUser'
import { mockDataServices } from '../../services/mockDataService'
import type { AccountingOverview } from '../../services/accountingService'
import type { RecognitionDetails } from '../../domain/models'
import { depreciationSchedule, residualFromPercent } from '../../domain/accounting'

const money = (n: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n / 100)
const control = 'rounded-lg border border-line p-2'
export default function AccountingModule({ module }: { module: string }) {
  const { session } = useAuthenticatedUser()
  const ctx = useMemo(() => ({ actor: session.user, sessionId: session.sessionId, municipalityId: session.user.municipalityId }), [session])
  const [data, setData] = useState<AccountingOverview | null>(null)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [assetId, setAssetId] = useState(''), [policyId, setPolicyId] = useState('')
  const [treatment, setTreatment] = useState<RecognitionDetails['treatment']>('depreciable_ppe')
  const [life, setLife] = useState(60), [residual, setResidual] = useState('0'), [reason, setReason] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10)), [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10))
  useEffect(() => { let live = true; void mockDataServices.accounting.overview(ctx, module === 'depreciation' ? 'depreciation' : 'recognition').then(r => { if (live) { if (r.ok) setData(r.data); else setError(r.error.message) } }); return () => { live = false } }, [ctx, module])
  const asset = data?.assets.find(a => a.id === assetId)
  const record = data?.records.find(r => r.assetId === assetId && r.recognitionDetails)
  const policy = data?.policies.find(p => p.id === policyId)
  const pending = data?.assets.filter(a => a.recognitionStatus === 'awaiting_recognition' && data.registrations.some(r => r.id === a.registrationId)) ?? []
  const choosePolicy = (id: string) => {
    setPolicyId(id)
    const p = data?.policies.find(p => p.id === id)
    if (p && asset) { setLife(p.usefulLifeMonths); setResidual((residualFromPercent(asset.acquisitionCost, p.residualValuePercent) / 100).toFixed(2)); setTreatment(asset.acquisitionCost < p.recognitionThreshold ? p.belowThresholdTreatment ?? 'semi_expendable' : 'depreciable_ppe') }
  }
  let schedule: ReturnType<typeof depreciationSchedule> | null = null
  try { if (record?.recognitionDetails) schedule = depreciationSchedule(record.recognitionDetails, asOf) } catch { /* Date input can be temporarily empty. */ }
  async function save() {
    if (!asset || !policy) return
    setBusy(true); setError('')
    try {
      if (!/^\d+(\.\d{1,2})?$/.test(residual)) throw new Error('Enter a nonnegative peso amount with at most two decimals.')
      const [whole, fraction = ''] = residual.split('.')
      const residualValue = Number(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')))
      const depreciable = treatment === 'depreciable_ppe'
      const result = await mockDataServices.accounting.recognize(ctx, { assetId: asset.id, version: asset.version, policyId: policy.id, policyVersion: policy.version, postingDate: date, treatment, usefulLifeMonths: depreciable ? life : 0, residualValue: depreciable ? residualValue : 0, reason })
      if (!result.ok) throw new Error(result.error.message)
      const refreshed = await mockDataServices.accounting.overview(ctx, module === 'depreciation' ? 'depreciation' : 'recognition')
      if (refreshed.ok) setData(refreshed.data); else throw new Error(refreshed.error.message)
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed.') } finally { setBusy(false) }
  }
  return <div className="space-y-5">
    <h2 className="text-2xl font-bold text-navy">{module === 'depreciation' ? 'Depreciation Schedule' : 'Pending Asset Recognition'}</h2>
    <p className="rounded-xl border border-line bg-white p-4">Unverified demonstration policies - LGU-reported references only. Straight-line; example salvage 5%; buildings/infrastructure 20 years, electrical systems/streetlights 10 years, selected office equipment 5 years. Review and configure policy settings with the Administrator. Monthly calculations use full months at month end, without daily proration.</p>
    {error && <p role="alert">{error}</p>}
    {!data ? <p role="status">Loading accounting data...</p> : <>
      {module === 'recognition' && <section className="rounded-xl border border-line bg-white p-4"><h3 className="font-bold">Approved registrations awaiting accounting review</h3>{pending.length ? <ul>{pending.map(a => <li key={a.id}><button className="py-2 text-left text-navy underline" onClick={() => { setAssetId(a.id); setPolicyId(''); setReason('') }}>{a.propertyNumber} - {a.description} / {money(a.acquisitionCost)}</button></li>)}</ul> : <p>No approved registrations await recognition.</p>}</section>}
      <label className="block">Asset Accounting Details <select className={control} value={assetId} onChange={e => { setAssetId(e.target.value); setPolicyId(''); setReason('') }}><option value="">Select asset ({pending.length} pending)</option>{data.assets.map(a => <option key={a.id} value={a.id}>{a.propertyNumber} - {a.description} ({a.recognitionStatus ?? 'legacy'})</option>)}</select></label>
      {asset && <section className="space-y-4 rounded-xl border border-line bg-white p-5">
        <h3 className="font-bold">Accounting Classification</h3><p>Acquisition: {asset.acquisitionDate.slice(0, 10)} · Cost: {money(asset.acquisitionCost)} · Category: {asset.category}</p>
        {pending.some(a => a.id === asset.id) && <form className="grid gap-4 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); void save() }}>
          <label>Reference policy <select required className={control} value={policyId} onChange={e => choosePolicy(e.target.value)}><option value="">Select policy</option>{data.policies.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.name} v{p.version}</option>)}</select></label>
          {policy && <p>Threshold {money(policy.recognitionThreshold)}; below threshold: {policy.belowThresholdTreatment ?? 'semi_expendable'}; start: {policy.startConvention}; life {policy.usefulLifeMonths} months; residual {policy.residualValuePercent}%.</p>}
          <label>Treatment <select className={control} value={treatment} onChange={e => setTreatment(e.target.value as RecognitionDetails['treatment'])}>{(['depreciable_ppe','non_depreciable_ppe','semi_expendable','expense'] as const).map(t => <option key={t}>{t}</option>)}</select></label>
          <label>Recognition / in-service date <input required type="date" className={control} value={date} onChange={e => setDate(e.target.value)} /></label>
          {treatment === 'depreciable_ppe' && <><label>Unverified LGU reference examples <select className={control} value="" onChange={e => setLife(Number(e.target.value))}><option value="">Choose optional useful-life example</option><option value="240">Buildings / infrastructure: 20 years</option><option value="120">Electrical systems / streetlights: 10 years</option><option value="60">Selected office equipment: 5 years</option></select></label><label>Useful life (months, configurable) <input required type="number" min="1" max="1200" className={control} value={life} onChange={e => setLife(Number(e.target.value))} /></label><label>Residual value (PHP, configurable) <input required className={control} value={residual} onChange={e => setResidual(e.target.value)} /></label></>}
          <label>Classification rationale / overrides <textarea required maxLength={4000} className={control} value={reason} onChange={e => setReason(e.target.value)} /></label>
          <button disabled={busy || !policy} className="rounded-lg bg-navy p-3 text-white">{busy ? 'Saving...' : 'Authorize and save accounting information'}</button>
        </form>}
        {record?.recognitionDetails && <><p>Saved treatment: {record.recognitionDetails.treatment} · {record.recognitionDetails.reason}</p><label>Historical calculation as of <input type="date" required className={control} value={asOf} onChange={e => setAsOf(e.target.value)} /></label>
          {schedule && <><p>Cost {money(schedule.cost)} · Depreciable amount {money(schedule.depreciableAmount)} · Calculated accumulated depreciation {money(schedule.accumulatedDepreciation)} · Net book value {money(schedule.netBookValue)}</p><p>Semi-expendable net book value is a demonstration tracking value; expensed items have zero capitalized net book value.</p><p>Calculated preview only. No depreciation postings are authorized by viewing this schedule.</p><div className="max-h-96 overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{['Month end','Depreciation','Accumulated','Net book value'].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{schedule.rows.map(r => <tr key={r.date}><td>{r.date}</td><td>{money(r.depreciation)}</td><td>{money(r.accumulated)}</td><td>{money(r.netBookValue)}</td></tr>)}</tbody></table>{!schedule.rows.length && <p>No depreciation applies to this treatment.</p>}</div></>}
        </>}
        {!record && !pending.some(a => a.id === asset.id) && <p>No Phase 08 recognition snapshot exists. Legacy postings remain available in history; no assumptions are fabricated.</p>}
        <h3 className="font-bold">Accounting History</h3>{data.records.filter(r => r.assetId === asset.id).map(r => <article key={r.id} className="border-t border-line py-3"><p>{r.postingDate.slice(0, 10)} · {r.kind} · {r.accountCode} · Debit {money(r.debit)} · Credit {money(r.credit)} · Actor {r.postedById} · Policy v{r.policyVersion}</p>{r.recognitionDetails && <details><summary>Immutable decision and policy snapshot</summary><pre className="overflow-auto text-xs">{JSON.stringify(r.recognitionDetails, null, 2)}</pre></details>}</article>)}
      </section>}
    </>}
  </div>
}
