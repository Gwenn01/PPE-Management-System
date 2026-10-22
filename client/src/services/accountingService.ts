import type { RecognitionDetails } from '../domain/models.js'
import { calendarDate, depreciationSchedule, residualFromPercent } from '../domain/accounting.js'
import { database, type MockDatabase } from '../mock/database.js'
import { authorize, commitMutation, writeAudit } from '../mock/unitOfWork.js'
import { parseEntity } from '../mock/validation/schemas.js'
import type { RequestContext } from './contracts.js'
import { DataError, respond } from './errors.js'
import { scopedRecord } from './entityAccess.js'

export function createAccountingService(db: MockDatabase = database) {
  return {
    overview: (ctx: RequestContext, resource: 'recognition' | 'depreciation' = 'recognition') => respond(() => db.transaction('r', db.tables, async () => {
      await authorize(db, ctx, resource, 'read')
      await authorize(db, ctx, 'accounting_records', 'read')
      const assets = await db.entity('assets').where('municipalityId').equals(ctx.municipalityId).toArray()
      const registrations = await db.entity('registrations').where('municipalityId').equals(ctx.municipalityId).filter(r => r.workflowStatus === 'approved').toArray()
      const policies = await db.entity('depreciationPolicies').where('municipalityId').equals(ctx.municipalityId).toArray()
      const records = await db.entity('accountingRecords').where('municipalityId').equals(ctx.municipalityId).toArray()
      return { assets, registrations, policies, records }
    })),
    recognize: (ctx: RequestContext, input: { assetId: string; version: number; policyId: string; policyVersion: number; postingDate: string; treatment: RecognitionDetails['treatment']; usefulLifeMonths: number; residualValue: number; reason: string }) => respond(() => commitMutation(db, async transactionId => {
      const actor = await authorize(db, ctx, 'recognition', 'create')
      const asset = await scopedRecord(db, actor, 'assets', input.assetId)
      const registration = await scopedRecord(db, actor, 'registrations', asset.registrationId)
      const policy = await scopedRecord(db, actor, 'depreciationPolicies', input.policyId)
      if (asset.version !== input.version || policy.version !== input.policyVersion) throw new DataError('conflict', 'Asset or policy changed. Reload before saving.')
      if (asset.recognitionStatus !== 'awaiting_recognition' || registration.workflowStatus !== 'approved' || registration.recognizedAssetId !== asset.id || asset.lifecycleStatus === 'disposed') throw new DataError('invalid_transition', 'An approved registration awaiting recognition is required.')
      if (await db.entity('accountingRecords').where('assetId').equals(asset.id).filter(r => r.kind === 'recognition').count()) throw new DataError('conflict', 'Recognition is already recorded.')
      let date: string
      try { date = calendarDate(input.postingDate) } catch { throw new DataError('validation', 'Use a valid recognition calendar date.') }
      if (!policy.active || date < policy.effectiveFrom.slice(0, 10) || date < asset.acquisitionDate.slice(0, 10) || date > new Date().toISOString().slice(0, 10)) throw new DataError('validation', 'Use an active effective policy and posting date between acquisition and today.')
      const expected = asset.acquisitionCost < policy.recognitionThreshold ? (policy.belowThresholdTreatment ?? 'semi_expendable') : null
      if (asset.acquisitionCost <= 0) throw new DataError('validation', 'Recognition requires a positive acquisition cost.')
      if (expected && input.treatment !== expected) throw new DataError('validation', `The configured below-threshold treatment is ${expected}.`)
      if (!expected && !['depreciable_ppe', 'non_depreciable_ppe'].includes(input.treatment)) throw new DataError('validation', 'Above-threshold assets require a PPE treatment.')
      if (!input.reason?.trim()) throw new DataError('validation', 'Record the classification rationale, including why PPE is non-depreciable when applicable.')
      const details: RecognitionDetails = { treatment: input.treatment, cost: asset.acquisitionCost, residualValue: input.residualValue, usefulLifeMonths: input.usefulLifeMonths, startDate: date, startConvention: policy.startConvention, reason: input.reason.trim(), policySnapshot: JSON.stringify(policy) }
      try {
        depreciationSchedule(details, date)
        residualFromPercent(details.cost, policy.residualValuePercent)
      } catch (error) { throw new DataError('validation', error instanceof Error ? error.message : 'Invalid depreciation settings.') }
      const at = new Date().toISOString()
      const record = parseEntity('accountingRecords', { id: crypto.randomUUID(), municipalityId: actor.municipalityId, version: 1, createdAt: at, updatedAt: at, assetId: asset.id, projectId: null, sourceId: registration.id, kind: 'recognition', postingDate: date, accountCode: input.treatment, debit: details.cost, credit: 0, policyId: policy.id, policyVersion: policy.version, postedById: actor.id, recognitionDetails: details })
      const eligible = input.treatment === 'depreciable_ppe' || input.treatment === 'non_depreciable_ppe'
      const updated = parseEntity('assets', { ...asset, recognitionStatus: 'recognized', lifecycleStatus: eligible ? 'in_service' : 'idle', version: asset.version + 1, updatedAt: at })
      await db.entity('accountingRecords').add(record)
      await db.entity('assets').put(updated)
      await writeAudit(db, actor, transactionId, 'accountingRecords', null, record, 'recognize', details.reason)
      await writeAudit(db, actor, transactionId, 'assets', asset, updated, 'accounting_treatment', details.reason)
      return record
    })),
  }
}
export type AccountingOverview = Extract<Awaited<ReturnType<ReturnType<typeof createAccountingService>['overview']>>, { ok: true }>['data']
