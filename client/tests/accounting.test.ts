import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { depreciationSchedule, residualFromPercent } from '../src/domain/accounting.js'
import type { RecognitionDetails } from '../src/domain/models.js'
import { MockDatabase } from '../src/mock/database.js'
import { createMockDataServices } from '../src/services/mockDataService.js'
import type { ServiceResult } from '../src/services/contracts.js'

function ok<T>(r: ServiceResult<T>): T { if (!r.ok) assert.fail(JSON.stringify(r.error)); return r.data }
const details: RecognitionDetails = { treatment: 'depreciable_ppe', cost: 10001, residualValue: 500, usefulLifeMonths: 3, startDate: '2024-01-31', startConvention: 'following_month', reason: 'Demo', policySnapshot: '{}' }
test('centavo rounding, leap day, month-end, historical cutoff and salvage floor', () => {
  const s = depreciationSchedule(details, '2024-02-28')
  assert.equal(s.accumulatedDepreciation, 0)
  assert.deepEqual(s.rows.map(r => r.date), ['2024-02-29', '2024-03-31', '2024-04-30'])
  assert.equal(s.rows.reduce((a, r) => a + r.depreciation, 0), 9501)
  assert.equal(depreciationSchedule(details, '2099-12-31').netBookValue, 500)
  assert.equal(depreciationSchedule(details, '2024-02-29').accumulatedDepreciation, 3167)
  assert.equal(residualFromPercent(Number.MAX_SAFE_INTEGER, 5), 450359962737050)
  assert.equal(depreciationSchedule({ ...details, startDate: '2024-12-31', startConvention: 'acquisition_month' }, '2024-12-31').rows[0].date, '2024-12-31')
})
test('non-depreciable assets and invalid inputs', () => {
  for (const treatment of ['non_depreciable_ppe','semi_expendable','expense'] as const) {
    const s = depreciationSchedule({ ...details, treatment, residualValue: 0, usefulLifeMonths: 0 }, '2026-01-01')
    assert.equal(s.rows.length, 0); assert.equal(s.netBookValue, treatment === 'expense' ? 0 : details.cost)
  }
  for (const change of [{ cost: -1 }, { cost: 1.5 }, { residualValue: 10002 }, { usefulLifeMonths: 0 }, { usefulLifeMonths: 1.2 }, { startDate: '2024-02-30' }]) assert.throws(() => depreciationSchedule({ ...details, ...change }, '2024-01-01'))
  assert.throws(() => depreciationSchedule(details, '2023-02-29'))
})
test('approval handoff, recognition, immutable history, policies, roles and scope', async () => {
  const db = new MockDatabase(`accounting-${crypto.randomUUID()}`)
  const services = createMockDataServices(db)
  try {
    ok(await services.initialize())
    const users = await db.entity('users').toArray()
    async function context(role: string, municipalityId = 'botolan') {
      const actor = users.find(u => u.role === role && u.municipalityId === municipalityId)!
      const sessionId = crypto.randomUUID()
      await db.sessions.add({ id: sessionId, userId: actor.id, municipalityId: actor.municipalityId, role: actor.role, issuedAt: new Date().toISOString(), expiresAt: '2099-01-01T00:00:00.000Z', remember: false })
      return { actor, municipalityId: actor.municipalityId, sessionId }
    }
    const accounting = await context('accounting_officer'), approver = await context('approving_officer')
    const approval = (await db.entity('approvals').toArray()).find(a => a.municipalityId === 'botolan' && a.subjectType === 'registration' && a.workflowStatus === 'submitted')!
    assert.ok(approval)
    ok(await services.approvals.decide(approver, { id: approval.id, version: approval.version, decision: 'approve', remarks: 'Approved demo' }))
    const overview = ok(await services.accounting.overview(accounting))
    const asset = overview.assets.find(a => a.recognitionStatus === 'awaiting_recognition')!
    assert.ok(asset)
    const policy = overview.policies[0]
    const below = asset.acquisitionCost < policy.recognitionThreshold
    const input = { assetId: asset.id, version: asset.version, policyId: policy.id, policyVersion: policy.version, postingDate: '2026-10-22', treatment: below ? 'semi_expendable' as const : 'depreciable_ppe' as const, usefulLifeMonths: below ? 0 : 60, residualValue: below ? 0 : residualFromPercent(asset.acquisitionCost, 5), reason: 'Reviewed classification and demo policy' }
    assert.equal((await services.accounting.recognize(await context('property_officer'), input)).ok, false)
    assert.equal((await services.accounting.recognize(await context('accounting_officer', 'san_antonio'), input)).ok, false)
    assert.equal((await services.accounting.recognize(accounting, { ...input, version: 999 })).ok, false)
    assert.equal((await services.accounting.recognize(accounting, { ...input, residualValue: -1 })).ok, false)
    const saved = ok(await services.accounting.recognize(accounting, input))
    assert.equal(saved.recognitionDetails?.cost, asset.acquisitionCost)
    assert.equal((await db.entity('assets').get(asset.id))?.recognitionStatus, 'recognized')
    assert.equal((await services.accounting.recognize(accounting, input)).ok, false)
    assert.equal((await db.entity('accountingRecords').where('assetId').equals(asset.id).toArray()).filter(r => r.kind === 'depreciation').length, 0)
    const property = await context('property_officer')
    async function approvedAsset(cost: number) {
      const draft = ok(await services.registration.create(property, { proposedPropertyNumber: crypto.randomUUID(), description: 'Demo classification test', category: asset.category, departmentId: asset.departmentId, custodianId: asset.custodianId, location: asset.location, acquisitionDate: '2026-09-01', acquisitionCost: cost, acquisitionMethod: 'purchase' }))
      for (const documentType of ['purchase_order', 'inspection_acceptance_report', 'property_acknowledgement_receipt'] as const) ok(await services.documents.upload(property, { entityType: 'registration', entityId: draft.id, documentType, fileName: documentType + '.pdf', file: new Blob(['%PDF-1.7 Demo'], { type: 'application/pdf' }) }))
      const attached = (await db.entity('registrations').get(draft.id))!
      ok(await services.registration.submit(property, draft.id, attached.version))
      const approval = (await db.entity('approvals').where('subjectId').equals(draft.id).first())!
      ok(await services.approvals.decide(approver, { id: approval.id, version: approval.version, decision: 'approve', remarks: '' }))
      return (await db.entity('assets').get((await db.entity('registrations').get(draft.id))!.recognizedAssetId!))!
    }
    for (const treatment of ['depreciable_ppe', 'non_depreciable_ppe'] as const) {
      const high = await approvedAsset(policy.recognitionThreshold)
      const highInput = { ...input, assetId: high.id, version: high.version, treatment, usefulLifeMonths: treatment === 'depreciable_ppe' ? 240 : 0, residualValue: treatment === 'depreciable_ppe' ? residualFromPercent(high.acquisitionCost, 5) : 0 }
      for (const change of [{ postingDate: '2026-02-30' }, { postingDate: '2026-08-31' }, { postingDate: '2099-01-01' }, { residualValue: high.acquisitionCost + 1 }, { reason: '' }]) assert.equal((await services.accounting.recognize(accounting, { ...highInput, ...change })).ok, false)
      const failAudit = () => { throw new Error('Simulated persistence failure') }
      db.entity('auditLogs').hook('creating', failAudit)
      const beforeFailure = await db.snapshot()
      assert.equal((await services.accounting.recognize(accounting, highInput)).ok, false)
      db.entity('auditLogs').hook('creating').unsubscribe(failAudit)
      assert.deepEqual(await db.snapshot(), beforeFailure)
      const posting = ok(await services.accounting.recognize(accounting, highInput))
      assert.equal((await db.entity('assets').get(high.id))!.lifecycleStatus, 'in_service')
      assert.equal(depreciationSchedule(posting.recognitionDetails!, '2099-12-31').netBookValue, treatment === 'depreciable_ppe' ? highInput.residualValue : high.acquisitionCost)
    }
    const belowAsset = await approvedAsset(policy.recognitionThreshold - 1)
    const lowInput = { ...input, assetId: belowAsset.id, version: belowAsset.version, treatment: 'expense' as const, usefulLifeMonths: 0, residualValue: 0 }
    assert.equal((await services.accounting.recognize(accounting, lowInput)).ok, false)
    const admin = await context('administrator')
    const revised = ok(await services.administration.savePolicy(admin, policy.id, policy.version, { name: policy.name, method: policy.method, usefulLifeMonths: policy.usefulLifeMonths, residualValuePercent: policy.residualValuePercent, recognitionThreshold: policy.recognitionThreshold, startConvention: policy.startConvention, effectiveFrom: policy.effectiveFrom, active: true, belowThresholdTreatment: 'expense' }))
    ok(await services.accounting.recognize(accounting, { ...lowInput, policyVersion: revised.version }))
    const grant = (await db.entity('permissions').where('[municipalityId+role]').equals(['botolan', 'accounting_officer']).toArray()).find(g => g.resource === 'recognition' && g.action === 'create')!
    await db.entity('permissions').delete(grant.id)
    assert.equal((await services.accounting.recognize(accounting, lowInput)).ok, false)
    await db.entity('permissions').add(grant)
    const exported = ok(await services.dataset.exportJson(admin))
    const imported = JSON.parse(exported.json)
    imported.data.accountingRecords.find((r: { id: string }) => r.id === saved.id).recognitionDetails.reason = 'Rewritten history'
    assert.equal((await services.dataset.importJson(admin, JSON.stringify(imported))).ok, false)
    const snapshot = saved.recognitionDetails!.policySnapshot
    await db.entity('depreciationPolicies').update(policy.id, { usefulLifeMonths: 240, version: revised.version + 1 })
    assert.equal((await db.entity('accountingRecords').get(saved.id))?.recognitionDetails?.policySnapshot, snapshot)
    assert.ok((await db.entity('auditLogs').toArray()).some(a => a.entityId === saved.id && a.action === 'recognize'))
  } finally { await db.delete() }
})
