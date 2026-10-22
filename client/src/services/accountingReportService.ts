import { calendarDate, depreciationSchedule } from '../domain/accounting.js'
import { database, type MockDatabase } from '../mock/database.js'
import { authorize } from '../mock/unitOfWork.js'
import type { RequestContext } from './contracts.js'
import { DataError, respond } from './errors.js'
import { safeTotal } from './cipValidation.js'

export function createAccountingReportService(db: MockDatabase = database) {
  return {
    overview: (ctx: RequestContext, asOf: string, resource: 'reports' | 'reconciliations' = 'reports') => respond(() => db.transaction('r', db.tables, async () => {
      await authorize(db, ctx, resource, 'read')
      try { calendarDate(asOf) } catch { throw new DataError('validation', 'Choose a valid report calendar date.') }
      const entries = (await db.entity('accountingRecords').where('municipalityId').equals(ctx.municipalityId).toArray()).filter(e => e.postingDate.slice(0, 10) <= asOf)
      const projects = await db.entity('projects').where('municipalityId').equals(ctx.municipalityId).toArray()
      const allAssets = await db.entity('assets').where('municipalityId').equals(ctx.municipalityId).toArray()
      const ppeEntry = (e: typeof entries[number]) => e.kind === 'capitalization' && e.accountCode === 'DEMO-PPE' || e.kind === 'recognition' && !['expense', 'semi_expendable'].includes(e.recognitionDetails?.treatment ?? e.accountCode)
      const recognizedAssets = allAssets.filter(a => a.recognitionStatus !== 'awaiting_recognition' && a.acquisitionDate.slice(0, 10) <= asOf && entries.some(e => e.assetId === a.id && ppeEntry(e)))
      const assets = recognizedAssets.filter(a => !a.disposedDate || a.disposedDate > asOf)
      const ppeMaster = assets.map(a => ({ ...a, postedCost: safeTotal(entries.filter(e => e.assetId === a.id && ppeEntry(e)).map(e => e.debit - e.credit)) }))
      const cip = projects.map(p => {
        const rows = entries.filter(e => e.projectId === p.id)
        const accumulatedCosts = safeTotal(rows.filter(e => e.kind === 'cip').map(e => e.debit - e.credit))
        const transferredToPPE = safeTotal(rows.filter(e => e.kind === 'capitalization' && e.accountCode === 'DEMO-CIP').map(e => e.credit - e.debit))
        return { projectId: p.id, projectNumber: p.projectNumber, name: p.name, status: p.projectStatus, accumulatedCosts, transferredToPPE, cipBalance: safeTotal([accumulatedCosts, -transferredToPPE]), capitalizedAssetId: p.capitalizedAssetId }
      })
      const depreciation = recognizedAssets.flatMap(a => {
        const entry = entries.find(e => e.assetId === a.id && e.recognitionDetails)
        if (!entry?.recognitionDetails) return []
        const schedule = depreciationSchedule(entry.recognitionDetails, asOf, a.disposedDate)
        return [{ assetId: a.id, propertyNumber: a.propertyNumber, description: a.description, disposedDate: a.disposedDate ?? null, startDate: entry.recognitionDetails.startDate, treatment: entry.recognitionDetails.treatment, cost: schedule.cost, depreciableAmount: schedule.depreciableAmount, accumulatedDepreciation: schedule.accumulatedDepreciation, netBookValue: schedule.netBookValue }]
      })
      const registryPPE = safeTotal(assets.map(a => a.acquisitionCost)), postedPPE = safeTotal(entries.filter(e => ppeEntry(e) || e.kind === 'disposal' && e.accountCode === 'DEMO-PPE').map(e => e.debit - e.credit))
      const postedCIP = safeTotal(cip.map(p => p.cipBalance))
      return { asOf, ppeMaster, cip, depreciation, reconciliation: { registryPPE, postedPPE, difference: safeTotal([registryPPE, -postedPPE]), postedCIP }, entries }
    })),
  }
}
export type AccountingReport = Extract<Awaited<ReturnType<ReturnType<typeof createAccountingReportService>['overview']>>, { ok: true }>['data']
