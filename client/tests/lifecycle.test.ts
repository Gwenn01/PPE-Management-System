import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { MockDatabase } from '../src/mock/database.js'
import { createMockDataServices, type MockDataServices } from '../src/services/mockDataService.js'
import type { RequestContext, ServiceResult } from '../src/services/contracts.js'
import type { Role } from '../src/config/roles.js'
import { defaultLifecyclePolicy, lifecycleTables, type LifecycleKind } from '../src/domain/lifecycle.js'
import type { LifecycleDraft } from '../src/services/lifecycleService.js'
import { lifecycleToday } from '../src/services/lifecycleValidation.js'
import { validateDataset } from '../src/mock/validation/dataset.js'
import { depreciationSchedule } from '../src/domain/accounting.js'

function ok<T>(r: ServiceResult<T>): T { if (!r.ok) assert.fail(JSON.stringify(r.error)); return r.data }
function denied<T>(r: ServiceResult<T>, code?: string) { assert.equal(r.ok, false); if (!r.ok && code) assert.equal(r.error.code, code, r.error.message) }
describe('Property lifecycle requests, Accounting review, authorization and execution', () => {
  let db: MockDatabase, services: MockDataServices, property: RequestContext, accounting: RequestContext, approver: RequestContext, admin: RequestContext
  const assetId = 'botolan-asset-1', date = lifecycleToday()
  async function context(role: Role, municipalityId = 'botolan') {
    const actor = (await db.entity('users').toArray()).find(u => u.role === role && u.municipalityId === municipalityId)!, sessionId = crypto.randomUUID()
    await db.sessions.add({ id: sessionId, userId: actor.id, role, municipalityId: actor.municipalityId, issuedAt: new Date().toISOString(), expiresAt: '2099-01-01T00:00:00.000Z', remember: false }); return { actor, sessionId, municipalityId: actor.municipalityId }
  }
  function input(kind: LifecycleKind): LifecycleDraft { const common = { assetId, proposedDate: date, remarks: 'Local demonstration request.' }; return kind === 'transfer' ? { ...common, kind, reason: 'Operational deployment.', toDepartmentId: 'botolan-dept-engineering', toCustodianId: 'demo-botolan-engineering_office', destinationLocation: 'Engineering field store' } : kind === 'maintenance' ? { ...common, kind, description: 'Preventive equipment service.', category: 'preventive', estimatedCost: 123456 } : { ...common, kind, reason: 'End-of-life retirement.', method: 'sale', proceeds: 100001 } }
  async function create(kind: LifecycleKind) { return ok(await services.lifecycle.save(property, null, 0, input(kind))) }
  async function row(kind: LifecycleKind, key: string) { return (await db.entity(lifecycleTables[kind]).get(key))! }
  async function submit(kind: LifecycleKind, key: string) { return services.lifecycle.submit(property, kind, key, (await row(kind, key)).version) }
  async function decide(key: string, decision: 'approve' | 'return' | 'reject' = 'approve', remarks = 'Demonstration authorization reviewed.') { const a = (await db.entity('approvals').where('subjectId').equals(key).first())!; return services.approvals.decide(approver, { id: a.id, version: a.version, decision, remarks }) }
  async function evidence(key: string) { return ok(await services.documents.upload(property, { entityType: 'disposal', entityId: key, fileName: 'disposal-evidence.txt', file: new Blob(['Local fictional inspection and disposal evidence.'], { type: 'text/plain' }) })) }
  async function review(key: string) { const r = await row('disposal', key), impact = ok(await services.lifecycle.impact(accounting, key)); return services.lifecycle.reviewDisposal(accounting, key, r.version, 'approve', 'Posted balances and disposal impact reviewed; no payment or disbursement.', impact.ledgerSnapshot) }
  async function authorizedDisposal() { const d = await create('disposal'); await evidence(d.id); ok(await submit('disposal', d.id)); ok(await review(d.id)); ok(await submit('disposal', d.id)); ok(await decide(d.id)); return row('disposal', d.id) }
  beforeEach(async () => { db = new MockDatabase(`lifecycle-${crypto.randomUUID()}`); services = createMockDataServices(db); ok(await services.initialize()); property = await context('property_officer'); accounting = await context('accounting_officer'); approver = await context('approving_officer'); admin = await context('administrator') })
  afterEach(async () => { await db.delete() })

  it('transfers assignment only on authorized completion, preserving approved and official state separately', async () => {
    const before = (await db.entity('assets').get(assetId))!, r = await create('transfer'); ok(await submit('transfer', r.id)); assert.deepEqual(await db.entity('assets').get(assetId), before)
    denied(await services.lifecycle.complete(property, 'transfer', r.id, (await row('transfer', r.id)).version, { date, note: 'Too soon.' }), 'invalid_transition')
    ok(await decide(r.id)); assert.deepEqual(await db.entity('assets').get(assetId), before)
    const authorized = await row('transfer', r.id); ok(await services.lifecycle.complete(property, 'transfer', r.id, authorized.version, { date, note: 'Physical assignment handed over.' }))
    const asset = (await db.entity('assets').get(assetId))!; assert.equal(asset.departmentId, 'botolan-dept-engineering'); assert.equal(asset.custodianId, 'demo-botolan-engineering_office'); assert.equal(asset.location, 'Engineering field store'); assert.equal(asset.lifecycleStatus, before.lifecycleStatus)
    const completed = await row('transfer', r.id); assert.equal(completed.workflowStatus, 'approved'); assert.equal(completed.lifecycle!.stage, 'completed'); assert.equal(completed.lifecycle!.baseline.location, before.location); assert.equal(completed.lifecycle!.authorization!.actorId, approver.actor.id)
    denied(await services.lifecycle.complete(property, 'transfer', r.id, completed.version, { date, note: 'Duplicate' }), 'invalid_transition'); validateDataset(await db.snapshot())
  })

  it('returns and corrects transfer requests, keeps immutable submissions, and rejects without asset changes', async () => {
    const before = await db.entity('assets').get(assetId), r = await create('transfer'); ok(await submit('transfer', r.id)); denied(await decide(r.id, 'return', ''), 'validation'); ok(await decide(r.id, 'return', 'Clarify destination room.'))
    const returned = await row('transfer', r.id), draft = input('transfer'); assert.equal(draft.kind, 'transfer'); if (draft.kind !== 'transfer') assert.fail(); draft.destinationLocation = 'Corrected Engineering room'
    ok(await services.lifecycle.save(property, returned.id, returned.version, draft)); ok(await submit('transfer', r.id)); ok(await decide(r.id, 'reject', 'Deployment no longer needed.'))
    const a = (await db.entity('approvals').where('subjectId').equals(r.id).first())!; assert.equal(a.history.filter(e => e.submission).length, 2); assert.ok(a.history[0].submission!.payload.includes('Engineering field store')); assert.deepEqual(await db.entity('assets').get(assetId), before); assert.equal((await row('transfer', r.id)).lifecycle!.stage, 'rejected'); denied(await submit('transfer', r.id), 'invalid_transition')
  })

  it('applies configurable transfer and maintenance authorization with retained policy snapshots', async () => {
    const setting = ok(await services.lifecycle.savePolicy(admin, 0, { ...defaultLifecyclePolicy, transferRequiresApproval: false, maintenanceApproval: 'above_threshold', maintenanceThreshold: 50000 })); const transfer = await create('transfer'); const saved = ok(await submit('transfer', transfer.id)); assert.equal(saved.workflowStatus, 'approved'); assert.equal(saved.lifecycle!.authorization!.source, 'configured_policy'); assert.equal(await db.entity('approvals').where('subjectId').equals(transfer.id).count(), 0)
    ok(await services.lifecycle.savePolicy(admin, setting.version, defaultLifecyclePolicy)); assert.equal((await row('transfer', transfer.id)).lifecycle!.policy!.transferRequiresApproval, false)
    denied(await services.lifecycle.savePolicy(property, 0, defaultLifecyclePolicy), 'forbidden'); denied(await services.lifecycle.savePolicy(admin, 0, defaultLifecyclePolicy), 'conflict')
    const maintenance = await create('maintenance'); ok(await submit('maintenance', maintenance.id)); assert.equal((await row('maintenance', maintenance.id)).workflowStatus, 'submitted')
  })

  it('tracks approved, started and completed maintenance with actual costs and no implicit capitalization', async () => {
    const before = (await db.entity('assets').get(assetId))!, costsBefore = await db.entity('accountingRecords').count(), r = await create('maintenance'); ok(await submit('maintenance', r.id)); ok(await decide(r.id)); assert.equal((await db.entity('assets').get(assetId))!.lifecycleStatus, before.lifecycleStatus)
    denied(await services.lifecycle.complete(property, 'maintenance', r.id, (await row('maintenance', r.id)).version, { date, note: 'Not started.', actualCost: 100 }), 'invalid_transition')
    let current = await row('maintenance', r.id); ok(await services.lifecycle.startMaintenance(property, r.id, current.version, date, 'Service work began.')); assert.equal((await db.entity('assets').get(assetId))!.lifecycleStatus, 'under_maintenance')
    ok(await services.documents.upload(property, { entityType: 'maintenance', entityId: r.id, fileName: 'service-receipt.txt', file: new Blob(['Demo service completion evidence'], { type: 'text/plain' }) }))
    current = await row('maintenance', r.id); denied(await services.lifecycle.complete(property, 'maintenance', r.id, current.version, { date, note: 'Over estimate.', actualCost: 123457 }), 'validation'); denied(await services.lifecycle.complete(property, 'maintenance', r.id, current.version, { date, note: 'Invalid cost', actualCost: -1 }), 'validation')
    ok(await services.lifecycle.complete(property, 'maintenance', r.id, current.version, { date, note: 'Serviced and returned to use.', actualCost: 123455 })); const done = await row('maintenance', r.id); assert.ok('actualCost' in done); assert.equal(done.actualCost, 123455); assert.equal(done.lifecycle!.stage, 'completed'); assert.equal((await db.entity('assets').get(assetId))!.lifecycleStatus, before.lifecycleStatus); assert.equal((await db.entity('assets').get(assetId))!.acquisitionCost, before.acquisitionCost); assert.equal(await db.entity('accountingRecords').count(), costsBefore)
  })

  it('uses threshold boundaries for maintenance and requires configured supporting evidence', async () => {
    ok(await services.lifecycle.savePolicy(admin, 0, { ...defaultLifecyclePolicy, maintenanceApproval: 'above_threshold', maintenanceThreshold: 10000, maintenanceDocumentsRequired: true }))
    const draft = input('maintenance'); if (draft.kind !== 'maintenance') assert.fail(); draft.estimatedCost = 9999; let r = ok(await services.lifecycle.save(property, null, 0, draft)); denied(await submit('maintenance', r.id), 'validation')
    ok(await services.documents.upload(property, { entityType: 'maintenance', entityId: r.id, fileName: 'scope.txt', file: new Blob(['Demo scope of service'], { type: 'text/plain' }) })); r = ok(await submit('maintenance', r.id)); assert.equal(r.lifecycle!.approvalRequired, false)
    draft.estimatedCost = 10000; const boundary = ok(await services.lifecycle.save(property, null, 0, draft)); ok(await services.documents.upload(property, { entityType: 'maintenance', entityId: boundary.id, fileName: 'scope.txt', file: new Blob(['Demo scope'], { type: 'text/plain' }) })); assert.equal(ok(await submit('maintenance', boundary.id)).lifecycle!.approvalRequired, true)
  })

  it('requires local disposal evidence, Accounting review and final approval before mock retirement', async () => {
    const before = (await db.entity('assets').get(assetId))!, r = await create('disposal'); denied(await submit('disposal', r.id), 'validation'); await evidence(r.id); ok(await submit('disposal', r.id)); assert.equal(await db.entity('approvals').where('subjectId').equals(r.id).count(), 0); assert.equal((await row('disposal', r.id)).lifecycle!.stage, 'accounting_review'); assert.deepEqual(await db.entity('assets').get(assetId), before)
    denied(await services.lifecycle.complete(property, 'disposal', r.id, (await row('disposal', r.id)).version, { date, note: 'Premature disposal' }), 'invalid_transition'); ok(await review(r.id)); assert.equal((await row('disposal', r.id)).lifecycle!.review!.impact.cost, 6500000); ok(await submit('disposal', r.id)); ok(await decide(r.id)); assert.deepEqual(await db.entity('assets').get(assetId), before)
    const authorized = await row('disposal', r.id); ok(await services.lifecycle.complete(property, 'disposal', r.id, authorized.version, { date, note: 'Authorized retirement completed; mock journal only.' })); const asset = (await db.entity('assets').get(assetId))!; assert.equal(asset.lifecycleStatus, 'disposed'); assert.equal(asset.disposedDate, date)
    const entries = await db.entity('accountingRecords').where('assetId').equals(assetId).filter(e => e.kind === 'disposal').toArray(); assert.equal(entries.reduce((a, e) => a + BigInt(e.debit) - BigInt(e.credit), 0n), 0n); assert.equal(entries.find(e => e.accountCode === 'DEMO-PPE')!.credit, 6500000); assert.equal(entries.find(e => e.accountCode === 'DEMO-DISPOSAL-LOSS')!.debit, 6399999)
    const report = ok(await services.accountingReports.overview(accounting, date)); assert.equal(report.ppeMaster.some(a => a.id === assetId), false); assert.equal(report.reconciliation.difference, 0)
    const historical = ok(await services.accountingReports.overview(accounting, '2026-06-15')); assert.equal(historical.ppeMaster.some(a => a.id === assetId), date === '2026-06-15' ? false : true); validateDataset(await db.snapshot())
  })

  it('returns disposal at Accounting and Approving stages and requires fresh review after corrections', async () => {
    const r = await create('disposal'); await evidence(r.id); ok(await submit('disposal', r.id)); let current = await row('disposal', r.id)
    ok(await services.lifecycle.reviewDisposal(accounting, r.id, current.version, 'return', 'Attach clearer condition assessment.')); current = await row('disposal', r.id); assert.equal(current.lifecycle!.stage, 'returned')
    ok(await services.lifecycle.save(property, r.id, current.version, input('disposal'))); ok(await submit('disposal', r.id)); ok(await review(r.id)); ok(await submit('disposal', r.id)); ok(await decide(r.id, 'return', 'Revise disposal remarks.')); current = await row('disposal', r.id); assert.equal(current.lifecycle!.review, null)
    ok(await services.lifecycle.save(property, r.id, current.version, { ...input('disposal'), remarks: 'Revised supporting remarks.' })); ok(await submit('disposal', r.id)); assert.equal((await row('disposal', r.id)).lifecycle!.stage, 'accounting_review'); ok(await review(r.id)); ok(await submit('disposal', r.id)); ok(await decide(r.id, 'reject', 'Retain asset instead.')); assert.equal((await db.entity('assets').get(assetId))!.lifecycleStatus, 'in_service'); assert.equal((await row('disposal', r.id)).lifecycle!.stage, 'rejected'); assert.equal(await db.entity('accountingRecords').filter(e => e.kind === 'disposal').count(), 0)
  })

  it('prevents duplicate active disposals, competing lifecycle actions and transfers of disposed assets', async () => {
    const r = await create('disposal'); denied(await createResult('disposal'), 'conflict'); denied(await createResult('transfer'), 'conflict'); ok(await services.lifecycle.cancel(property, 'disposal', r.id, r.version, 'Withdraw duplicate planning.')); const transfer = await create('transfer'); ok(await submit('transfer', transfer.id))
    denied(await createResult('disposal'), 'conflict'); const pending = await row('transfer', transfer.id); ok(await services.lifecycle.cancel(property, 'transfer', transfer.id, pending.version, 'Withdraw transfer for disposal review.')); const d = await authorizedDisposal(); ok(await services.lifecycle.complete(property, 'disposal', d.id, d.version, { date, note: 'Completed.' })); denied(await createResult('transfer'), 'invalid_transition'); denied(await createResult('maintenance'), 'invalid_transition')
  })
  async function createResult(kind: LifecycleKind) { return services.lifecycle.save(property, null, 0, input(kind)) }

  it('rechecks current asset and posted ledger after review and rejects stale authorization atomically', async () => {
    const r = await create('disposal'); await evidence(r.id); ok(await submit('disposal', r.id)); ok(await review(r.id)); ok(await submit('disposal', r.id))
    const recognition = (await db.entity('accountingRecords').get('botolan-account-recognition-1'))!, at = new Date().toISOString(); await db.entity('accountingRecords').add({ ...recognition, id: 'depreciation-fixture', kind: 'depreciation', accountCode: 'DEMO-ACCUMULATED-DEPRECIATION', sourceId: assetId, debit: 0, credit: 100000, postingDate: date, createdAt: at, updatedAt: at })
    const before = await db.snapshot(); denied(await decide(r.id), 'conflict'); assert.deepEqual(await db.snapshot(), before)
    ok(await decide(r.id, 'return', 'Recheck updated posted depreciation.')); let current = await row('disposal', r.id); ok(await services.lifecycle.save(property, r.id, current.version, input('disposal'))); ok(await submit('disposal', r.id)); ok(await review(r.id)); current = await row('disposal', r.id); assert.equal(current.lifecycle!.review!.impact.accumulatedDepreciation, 100000); assert.equal(current.lifecycle!.review!.impact.carryingValue, 6400000)
  })

  it('rejects invalid dates, unsafe money, invalid custodians and unauthorized roles or municipalities', async () => {
    denied(await services.lifecycle.save(property, null, 0, { ...input('transfer'), proposedDate: '2026-02-30' }), 'validation'); const transfer = input('transfer'); if (transfer.kind !== 'transfer') assert.fail(); denied(await services.lifecycle.save(property, null, 0, { ...transfer, toCustodianId: 'demo-san_antonio-property_officer' }), 'validation'); denied(await services.lifecycle.save(property, null, 0, { ...transfer, proposedDate: '2020-01-01' }), 'validation')
    const maintenance = input('maintenance'); if (maintenance.kind !== 'maintenance') assert.fail(); for (const n of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN]) denied(await services.lifecycle.save(property, null, 0, { ...maintenance, estimatedCost: n }), 'validation')
    denied(await services.lifecycle.save(accounting, null, 0, transfer), 'forbidden'); const r = await create('transfer'); denied(await services.lifecycle.submit(await context('property_officer', 'san_antonio'), 'transfer', r.id, r.version), 'not_found'); ok(await submit('transfer', r.id)); const a = (await db.entity('approvals').where('subjectId').equals(r.id).first())!; denied(await services.approvals.decide(property, { id: a.id, version: a.version, decision: 'approve', remarks: 'Unauthorized' }), 'forbidden'); denied(await services.lifecycle.reviewDisposal(property, r.id, r.version, 'approve', 'Wrong role'), 'forbidden')
  })

  it('keeps future and stale authorized transfers unapplied', async () => {
    const future = '2099-01-01', r = ok(await services.lifecycle.save(property, null, 0, { ...input('transfer'), proposedDate: future })); ok(await submit('transfer', r.id)); ok(await decide(r.id)); let current = await row('transfer', r.id); denied(await services.lifecycle.complete(property, 'transfer', r.id, current.version, { date: future, note: 'Not yet due.' }), 'validation')
    const asset = (await db.entity('assets').get(assetId))!; await db.entity('assets').put({ ...asset, version: asset.version + 1, location: 'Concurrent official update fixture' }); current = await row('transfer', r.id); denied(await services.lifecycle.complete(property, 'transfer', r.id, current.version, { date, note: 'Stale authorized request.' }), 'conflict'); assert.equal((await db.entity('assets').get(assetId))!.location, 'Concurrent official update fixture')
  })

  it('rolls back partial disposal ledger and asset writes, retains audit history and persists after reopening', async () => {
    const r = await authorizedDisposal(), before = await db.snapshot(), fail = (_key: unknown, value: { action?: string }) => { if (value.action === 'complete_authorized_disposal') throw new Error('Simulated persistence failure after journal and asset writes') }
    db.entity('auditLogs').hook('creating', fail); denied(await services.lifecycle.complete(property, 'disposal', r.id, r.version, { date, note: 'Transactional completion.' })); db.entity('auditLogs').hook('creating').unsubscribe(fail); assert.deepEqual(await db.snapshot(), before)
    ok(await services.lifecycle.complete(property, 'disposal', r.id, r.version, { date, note: 'Retry completed.' })); db.close(); await db.open(); const data = ok(await createMockDataServices(db).lifecycle.overview(property)); assert.equal(data.disposals.find(d => d.id === r.id)!.lifecycle!.stage, 'completed'); assert.ok(await db.entity('auditLogs').filter(a => a.entityId === r.id && a.action === 'disposal_completed').count()); assert.ok(await db.entity('notifications').filter(n => n.recipientId === accounting.actor.id && n.href === '/dashboard/disposal-review').count())
  })

  it('guards live grants, generic writers, import history and approved evidence', async () => {
    const r = await create('transfer'); denied(await services.entities.transfers.update(property, r.id, r.version, { destinationLocation: 'Bypass' }), 'forbidden'); ok(await submit('transfer', r.id)); ok(await decide(r.id))
    denied(await services.documents.upload(property, { entityType: 'transfer', entityId: r.id, fileName: 'late.txt', file: new Blob(['Late'], { type: 'text/plain' }) }), 'forbidden')
    const exported = JSON.parse(ok(await services.dataset.exportJson(admin)).json); exported.data.transfers.find((t: { id: string }) => t.id === r.id).reason = 'Rewritten'; denied(await services.dataset.importJson(admin, JSON.stringify(exported)), 'conflict')
    const grant = (await db.entity('permissions').where('[municipalityId+role]').equals(['botolan', 'property_officer']).toArray()).find(g => g.resource === 'asset_transfers' && g.action === 'update')!; await db.entity('permissions').delete(grant.id); denied(await services.lifecycle.complete(property, 'transfer', r.id, (await row('transfer', r.id)).version, { date, note: 'Revoked grant' }), 'forbidden')
  })

  it('withdraws an unused stale authorization while retaining its approval and releasing the asset', async () => {
    const r = await create('transfer'); ok(await submit('transfer', r.id)); ok(await decide(r.id)); const before = await db.entity('assets').get(assetId), authorized = await row('transfer', r.id)
    const withdrawn = ok(await services.lifecycle.cancel(property, 'transfer', r.id, authorized.version, 'Deployment cancelled before handover.')); assert.equal(withdrawn.workflowStatus, 'approved'); assert.equal(withdrawn.lifecycle!.stage, 'cancelled'); assert.equal((await db.entity('approvals').where('subjectId').equals(r.id).first())!.workflowStatus, 'approved'); assert.deepEqual(await db.entity('assets').get(assetId), before); assert.equal(ok(await createResult('disposal')).lifecycle!.stage, 'draft')
  })

  it('keeps forecast depreciation separate, freezes disposal schedules and refuses excessive posted depreciation', async () => {
    const recognition = (await db.entity('accountingRecords').get('botolan-account-recognition-1'))!, details = { treatment: 'depreciable_ppe' as const, cost: 6500000, residualValue: 325000, usefulLifeMonths: 60, startDate: '2026-06-15', startConvention: 'acquisition_month' as const, reason: 'Fixture saved demo depreciation assumptions', policySnapshot: '{}' }
    await db.entity('accountingRecords').put({ ...recognition, accountCode: details.treatment, recognitionDetails: details }); const recognizedAsset = (await db.entity('assets').get(assetId))!; await db.entity('assets').put({ ...recognizedAsset, recognitionStatus: 'recognized' })
    const r = await authorizedDisposal(); assert.equal(r.lifecycle!.review!.impact.accumulatedDepreciation, 0); assert.ok(depreciationSchedule(details, date).accumulatedDepreciation > 0)
    ok(await services.lifecycle.complete(property, 'disposal', r.id, r.version, { date, note: 'Retired with posted-ledger review; forecasts not posted.' })); const forecast = depreciationSchedule(details, '2099-12-31', date); assert.ok(forecast.rows.every(r => r.date <= date)); const report = ok(await services.accountingReports.overview(accounting, '2099-12-31')); assert.equal(report.depreciation.find(a => a.assetId === assetId)!.accumulatedDepreciation, forecast.accumulatedDepreciation); assert.equal(await db.entity('accountingRecords').filter(e => e.kind === 'depreciation').count(), 0)
  })

  it('retires non-PPE without crediting PPE and blocks invalid accounting balances', async () => {
    const recognition = (await db.entity('accountingRecords').get('botolan-account-recognition-1'))!; await db.entity('accountingRecords').put({ ...recognition, accountCode: 'semi_expendable' })
    const r = await authorizedDisposal(); assert.equal(r.lifecycle!.review!.impact.treatment, 'non_ppe_retirement'); assert.equal(r.lifecycle!.review!.impact.cost, 0)
    ok(await services.lifecycle.complete(property, 'disposal', r.id, r.version, { date, note: 'Non-PPE retirement after review.' })); const entries = await db.entity('accountingRecords').where('assetId').equals(assetId).filter(e => e.kind === 'disposal').toArray(); assert.equal(entries.some(e => e.accountCode === 'DEMO-PPE'), false); assert.equal(entries.find(e => e.accountCode === 'DEMO-DISPOSAL-GAIN')!.credit, 100001); assert.equal(entries.reduce((a, e) => a + e.debit - e.credit, 0), 0)
    const asset2 = 'botolan-asset-2'; ok(await services.lifecycle.cancel(property, 'transfer', 'botolan-transfer-pump', 1, 'Remove fixture pending transfer.')); ok(await services.lifecycle.cancel(property, 'disposal', 'botolan-disposal-pump', 1, 'Remove fixture draft disposal.')); const input2 = { ...input('disposal'), assetId: asset2 }; const d = ok(await services.lifecycle.save(property, null, 0, input2)); await evidence(d.id); ok(await submit('disposal', d.id)); await db.entity('accountingRecords').add({ ...recognition, id: 'excessive-depreciation', assetId: asset2, sourceId: asset2, kind: 'depreciation', accountCode: 'DEMO-ACCUMULATED-DEPRECIATION', debit: 0, credit: 12500001, postingDate: date }); denied(await services.lifecycle.impact(accounting, d.id), 'validation')
  })
})
