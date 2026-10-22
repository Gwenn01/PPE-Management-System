import { database, type MockDatabase } from '../mock/database.js'
import { authorize } from '../mock/unitOfWork.js'
import type { RequestContext } from './contracts.js'
import { DataError, respond } from './errors.js'
import { createAccountingReportService } from './accountingReportService.js'

export const reportTypes = ['ppe_master', 'depreciation', 'cip', 'inventory', 'transfers_disposals', 'reconciliation', 'audit_trail'] as const
export type ReportType = typeof reportTypes[number]
export interface ReportFilters { type: ReportType; start: string; end: string; category?: string; departmentId?: string; status?: string }
export interface ReportColumn { key: string; label: string; money?: boolean }
export type ReportValue = string | number | null
export interface ReportResult {
  type: ReportType; municipalityId: string; generatedAt: string; generatedBy: string; filters: ReportFilters
  columns: ReportColumn[]; rows: Record<string, ReportValue>[]; totals: Record<string, number>
}
const col = (key: string, label: string, money = false): ReportColumn => ({ key, label, money })
const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date
const num = (value: number) => { if (!Number.isSafeInteger(value)) throw new DataError('validation', 'Report contains an invalid monetary amount.'); return value }
function sum(rows: Record<string, ReportValue>[], columns: ReportColumn[]) {
  return Object.fromEntries(columns.filter(c => c.money).map(c => {
    const total = rows.reduce((acc, row) => acc + BigInt(num(Number(row[c.key] ?? 0))), 0n)
    if (total > BigInt(Number.MAX_SAFE_INTEGER) || total < BigInt(Number.MIN_SAFE_INTEGER)) throw new DataError('validation', 'Report total exceeds the safe integer limit.')
    return [c.key, Number(total)]
  }))
}
export function createReportingService(db: MockDatabase = database) {
  const accounting = createAccountingReportService(db)
  const ensure = async (ctx: RequestContext, action: 'read' | 'export') => db.transaction('r', db.tables, () => authorize(db, ctx, 'reports', action))
  const report = async (ctx: RequestContext, filters: ReportFilters, action: 'read' | 'export') => {
    await ensure(ctx, action)
    if (!reportTypes.includes(filters.type) || !validDate(filters.start) || !validDate(filters.end) || filters.start > filters.end) throw new DataError('validation', 'Choose a valid report type and date range.')
    // All records originate from scoped persisted rows. The same report builder drives preview and both exports.
    const records = await db.transaction('r', db.tables, async () => {
      await authorize(db, ctx, 'reports', action)
      const municipality = ctx.municipalityId
      const names = ['assets','projects','inventorySessions','inventoryChecks','transfers','disposals','accountingRecords','reconciliations','approvals','auditLogs','users','departments'] as const
      const entries = await Promise.all(names.map(n => db.entity(n).where('municipalityId').equals(municipality).toArray()))
      const [assets,projects,inventorySessions,inventoryChecks,transfers,disposals,accountingRecords,reconciliations,approvals,auditLogs,users,departments] = entries as unknown as [
        import('../domain/models.js').Asset[], import('../domain/models.js').ConstructionProject[], import('../domain/models.js').InventorySession[], import('../domain/models.js').InventoryCheck[], import('../domain/models.js').AssetTransfer[], import('../domain/models.js').DisposalRequest[], import('../domain/models.js').AccountingRecord[], import('../domain/models.js').Reconciliation[], import('../domain/models.js').ApprovalRequest[], import('../domain/models.js').AuditLog[], import('../domain/models.js').User[], import('../domain/models.js').Department[]
      ]
      return { assets,projects,inventorySessions,inventoryChecks,transfers,disposals,accountingRecords,reconciliations,approvals,auditLogs,users,departments }
    })
    const { assets,projects,inventorySessions,inventoryChecks,transfers,disposals,reconciliations,approvals,auditLogs,users,departments } = records
    const departmentById = new Map(departments.map(d => [d.id, d]))
    const userById = new Map(users.map(u => [u.id, u]))
    const assetById = new Map(assets.map(a => [a.id, a]))
    const projectById = new Map(projects.map(p => [p.id, p]))
    const sessionById = new Map(inventorySessions.map(s => [s.id, s]))
    const dept = (id: string | null) => departmentById.get(id ?? "")?.name ?? (id ?? '—')
    const actor = (id: string) => userById.get(id)?.name ?? id
    const asset = (id: string) => assetById.get(id)
    const range = (value: string) => value.slice(0,10) >= filters.start && value.slice(0,10) <= filters.end
    const assetFilter = (a: typeof assets[number] | undefined) => (!filters.category || a?.category === filters.category) && (!filters.departmentId || a?.departmentId === filters.departmentId)
    let columns: ReportColumn[], rows: Record<string, ReportValue>[]
    if (filters.type === 'ppe_master') {
      columns = [col('propertyNumber','Property Number'),col('description','Description'),col('category','Category'),col('department','Department'),col('status','Status'),col('acquisitionDate','Acquired'),col('acquisitionCost','Acquisition Cost',true)]
      rows = assets.filter(a => range(a.acquisitionDate) && assetFilter(a) && (!filters.status || a.lifecycleStatus === filters.status)).map(a => ({propertyNumber:a.propertyNumber,description:a.description,category:a.category,department:dept(a.departmentId),status:a.lifecycleStatus,acquisitionDate:a.acquisitionDate,acquisitionCost:a.acquisitionCost}))
    } else if (filters.type === 'depreciation' || filters.type === 'cip' || filters.type === 'reconciliation') {
      const base = await accounting.overview(ctx, filters.end)
      if (!base.ok) throw new DataError(base.error.code,base.error.message)
      if (filters.type === 'depreciation') {
        columns = [col('propertyNumber','Property Number'),col('description','Description'),col('startDate','Depreciation Start'),col('cost','Recognized Cost',true),col('depreciableAmount','Depreciable Amount',true),col('accumulatedDepreciation','Calculated Depreciation',true),col('netBookValue','Net Book Value',true)]
        rows = base.data.depreciation.filter(a => { const original=asset(a.assetId); return range(a.startDate) && assetFilter(original) && (!filters.status || original?.lifecycleStatus === filters.status) }).map(a => ({ propertyNumber:a.propertyNumber,description:a.description,startDate:a.startDate,cost:a.cost,depreciableAmount:a.depreciableAmount,accumulatedDepreciation:a.accumulatedDepreciation,netBookValue:a.netBookValue }))
      } else if (filters.type === 'cip') {
        columns = [col('projectNumber','Project Number'),col('name','Project'),col('department','Department'),col('status','Status'),col('accumulatedCosts','Accumulated Costs',true),col('transferredToPPE','Transferred to PPE',true),col('cipBalance','CIP Balance',true)]
        rows = base.data.cip.filter(p => {const original=projectById.get(p.projectId);return !!original && range(original.createdAt) && (!filters.departmentId || original.departmentId===filters.departmentId) && (!filters.status || p.status===filters.status)}).map(p=>({projectNumber:p.projectNumber,name:p.name,department:dept(projectById.get(p.projectId)?.departmentId??null),status:p.status,accumulatedCosts:p.accumulatedCosts,transferredToPPE:p.transferredToPPE,cipBalance:p.cipBalance}))
      } else {
        columns = [col('periodStart','Period Start'),col('periodEnd','Period End'),col('status','Status'),col('registryPPE','Captured Registry PPE',true),col('postedPPE','Captured Posted PPE',true),col('difference','Captured Difference',true)]
        rows = reconciliations.filter(r=>r.reconciliationSession?.status==='completed' && range(r.periodEnd) && (!filters.status || r.workflowStatus===filters.status)).map(r=> { const captured = r.reconciliationSession?.captures.at(-1); const matched = captured?.rows ?? []; const registryPPE = matched.reduce((s,x)=>s + x.reference.cost,0); const postedPPE = matched.reduce((s,x)=>s+(x.accounting?.cost??0),0); return {periodStart:r.periodStart,periodEnd:r.periodEnd,status:r.workflowStatus,registryPPE,postedPPE,difference:registryPPE-postedPPE} })
      }
    } else if (filters.type === 'inventory') {
      columns=[col('session','Session'),col('propertyNumber','Property Number'),col('date','Checked At'),col('found','Found'),col('location','Observed Location'),col('condition','Condition'),col('observer','Checked By')]
      rows=inventoryChecks.filter(c=>range(c.checkedAt)&&assetFilter(asset(c.assetId))&&(!filters.status||String(c.found)===filters.status)).map(c=>({session:sessionById.get(c.sessionId)?.title??c.sessionId,propertyNumber:asset(c.assetId)?.propertyNumber??c.assetId,date:c.checkedAt,found:c.found?'Yes':'No',location:c.observedLocation,condition:c.observedCondition,observer:actor(c.checkedById)}))
    } else if (filters.type === 'transfers_disposals') {
      columns=[col('type','Transaction'),col('propertyNumber','Property Number'),col('date','Effective Date'),col('department','Department'),col('status','Status'),col('details','Details'),col('proceeds','Disposal Proceeds',true)]
      rows=[...transfers.filter(t=>range(t.effectiveDate)&&assetFilter(asset(t.assetId))&&(!filters.status||t.workflowStatus===filters.status)).map(t=>({type:'Transfer',propertyNumber:asset(t.assetId)?.propertyNumber??t.assetId,date:t.effectiveDate,department:dept(t.toDepartmentId),status:t.workflowStatus,details:t.reason,proceeds:0})),...disposals.filter(d=>range(d.disposedAt??d.createdAt)&&assetFilter(asset(d.assetId))&&(!filters.status||d.workflowStatus===filters.status)).map(d=>({type:'Disposal',propertyNumber:asset(d.assetId)?.propertyNumber??d.assetId,date:d.disposedAt??d.createdAt,department:dept(asset(d.assetId)?.departmentId??null),status:d.workflowStatus,details:d.reason,proceeds:d.proceeds??0}))]
    } else {
      columns=[col('actionId','Action ID'),col('actor','Actor'),col('role','Role'),col('municipality','Municipality'),col('action','Action'),col('entity','Entity'),col('recordId','Record ID'),col('previous','Previous Values'),col('next','New Values'),col('time','Timestamp'),col('approvalRef','Approval Reference')]
      rows=auditLogs.filter(a=>range(a.occurredAt)&&(!filters.status||a.action===filters.status)).map(a=>({actionId:a.id,actor:actor(a.actorId),role:a.actorRole,municipality:a.municipalityId,action:a.action,entity:a.resource,recordId:a.entityId,previous:JSON.stringify(a.changes.map(c=>({field:c.field,value:c.before}))),next:JSON.stringify(a.changes.map(c=>({field:c.field,value:c.after}))),time:a.occurredAt,approvalRef:approvals.find(p=>p.id===a.entityId||p.subjectId===a.entityId)?.id??null}))
    }
    return {type:filters.type,municipalityId:ctx.municipalityId,generatedAt:new Date().toISOString(),generatedBy:ctx.actor.id,filters,columns,rows,totals:sum(rows,columns)} satisfies ReportResult
  }
  return {
    preview: (ctx: RequestContext, filters: ReportFilters) => respond(()=>report(ctx,filters,'read')),
    exportSnapshot: (ctx: RequestContext, filters: ReportFilters) => respond(()=>report(ctx,filters,'export')),
    auditorRecords: (ctx: RequestContext) => respond(()=>db.transaction('r',db.tables,async()=> {
      const user=await authorize(db,ctx,'audit_logs','read')
      if(user.role!=='auditor') throw new DataError('forbidden','The read-only Auditor workspace is for Auditor accounts.')
      const allowed=['assets','accountingRecords','projects','inventorySessions','inventoryChecks','transfers','disposals','approvals','auditLogs'] as const
      const entries=await Promise.all(allowed.map(name=>db.entity(name).where('municipalityId').equals(ctx.municipalityId).toArray()))
      return Object.fromEntries(allowed.map((key,i)=>[key,entries[i]])) as Record<typeof allowed[number],unknown[]>
    }))
  }
}
export type ReportingService = ReturnType<typeof createReportingService>
