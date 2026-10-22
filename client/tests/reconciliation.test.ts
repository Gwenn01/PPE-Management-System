import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { MockDatabase } from '../src/mock/database.js'
import { createMockDataServices, type MockDataServices } from '../src/services/mockDataService.js'
import type { RequestContext, ServiceResult } from '../src/services/contracts.js'
import type { Role } from '../src/config/roles.js'
import type { ReconciliationProposal } from '../src/services/reconciliationService.js'
import { assetPostedBalances } from '../src/services/accountingBalances.js'
import { lifecycleToday } from '../src/services/lifecycleValidation.js'
import { validateDataset } from '../src/mock/validation/dataset.js'

function ok<T>(r: ServiceResult<T>): T { if (!r.ok) assert.fail(JSON.stringify(r.error)); return r.data }
function denied<T>(r: ServiceResult<T>, code?: string) { assert.equal(r.ok, false); if (!r.ok && code) assert.equal(r.error.code, code, r.error.message) }
describe('Period reconciliation, mock imports and approved atomic corrections', () => {
  let db: MockDatabase, services: MockDataServices, accounting: RequestContext, approver: RequestContext, admin: RequestContext, auditor: RequestContext, sid: string
  const end = lifecycleToday(), start = '2026-06-01', assetId = 'botolan-asset-1', assetKey = `asset:${assetId}`
  async function context(role: Role, municipalityId = 'botolan') { const actor = (await db.entity('users').toArray()).find(u => u.role === role && u.municipalityId === municipalityId)!, sessionId = crypto.randomUUID(); await db.sessions.add({ id: sessionId, userId: actor.id, role, municipalityId: actor.municipalityId, issuedAt: new Date().toISOString(), expiresAt: '2099-01-01T00:00:00.000Z', remember: false }); return { actor, sessionId, municipalityId: actor.municipalityId } }
  async function get(id = sid) { return (await db.entity('reconciliations').get(id))! }
  async function create(categoryId: string | null = null, includeCIP = true) { const row = ok(await services.reconciliation.create(accounting, { periodStart: start, periodEnd: end, categoryId, includeCIP })); sid = row.id; return row }
  async function mismatch() { const posting = (await db.entity('accountingRecords').get('botolan-account-recognition-1'))!; await db.entity('accountingRecords').put({ ...posting, debit: 6499999 }) }
  async function prepare(mode: ReconciliationProposal['mode'] = 'adjust_local_ledger', rowKey = assetKey) { let parent = await get(); parent = ok(await services.reconciliation.investigate(accounting, sid, parent.version, rowKey, 'Compared registry, period ledger and supporting evidence; discrepancy confirmed.')); return ok(await services.reconciliation.prepare(accounting, sid, parent.version, { rowKey, mode, reason: 'Correct verified period balances to the captured PPE/CIP reference.', correctionId: null, correctionVersion: 0 })) }
  async function evidence(id: string) { return ok(await services.documents.upload(accounting, { entityType: 'reconciliation', entityId: id, fileName: 'reconciliation-evidence.txt', file: new Blob(['Fictional source comparison evidence. Demonstration only.'], { type: 'text/plain' }) })) }
  async function submit(id: string) { return services.reconciliation.submit(accounting, id, (await get(id)).version) }
  async function decide(id: string, decision: 'approve' | 'return' | 'reject' = 'approve', remarks = 'Reviewed reconciliation basis and supporting evidence.') { const a = (await db.entity('approvals').where('subjectId').equals(id).first())!; return services.approvals.decide(approver, { id: a.id, version: a.version, decision, remarks }) }
  async function dataset() { return JSON.parse(ok(await services.reconciliation.template(accounting, sid))) }
  async function importDataset(input: unknown) { return services.reconciliation.importBalances(accounting, sid, (await get()).version, JSON.stringify(input), 'demo-accounting-balances.json') }
  beforeEach(async () => { db = new MockDatabase(`reconciliation-${crypto.randomUUID()}`); services = createMockDataServices(db); ok(await services.initialize()); accounting = await context('accounting_officer'); approver = await context('approving_officer'); admin = await context('administrator'); auditor = await context('auditor') })
  afterEach(async () => { await db.delete() })

  it('matches PPE and relevant CIP, completes a session and exposes frozen read-only Auditor reports', async () => {
    const before = await db.entity('accountingRecords').toArray(), s = await create(); assert.equal(s.reconciliationSession!.rows.length, 3); assert.ok(s.reconciliationSession!.rows.every(r => r.status === 'matched')); assert.equal(s.reconciliationSession!.rows.find(r => r.entityType === 'project')!.reference.cipBalance, 175000000)
    const completed = ok(await services.reconciliation.complete(accounting, sid, s.version, 'All required PPE and CIP balances agree.')); assert.equal(completed.reconciliationSession!.status, 'completed')
    const snapshot = await db.snapshot(), revision = (await db.metadata.get('state'))!.revision
    const report = ok(await services.accountingReports.overview(auditor, end)); assert.equal(report.reconciliations.find(r => r.id === sid)!.reconciliationSession!.status, 'completed'); ok(await services.accountingReports.overview(auditor, end)); assert.deepEqual(await db.snapshot(), snapshot); assert.equal((await db.metadata.get('state'))!.revision, revision); assert.deepEqual(await db.entity('accountingRecords').toArray(), before)
    denied(await services.reconciliation.overview(auditor), 'forbidden'); denied(await services.reconciliation.refresh(accounting, sid, completed.version), 'invalid_transition'); validateDataset(await db.snapshot())
  })

  it('detects precise one-centavo cost and NBV differences without changing official sources', async () => {
    await mismatch(); const ledger = await db.entity('accountingRecords').toArray(), asset = await db.entity('assets').get(assetId), s = await create(), row = s.reconciliationSession!.rows.find(r => r.key === assetKey)!
    assert.equal(row.status, 'discrepancy'); assert.equal(row.difference!.cost, 1); assert.equal(row.difference!.netBookValue, 1); assert.equal(row.difference!.accumulatedDepreciation, 0)
    denied(await services.reconciliation.complete(accounting, sid, s.version, 'Unresolved difference.'), 'validation'); assert.deepEqual(await db.entity('accountingRecords').toArray(), ledger); assert.deepEqual(await db.entity('assets').get(assetId), asset)
  })

  it('applies a balanced approved local adjustment once and retains prior values and captures', async () => {
    await mismatch(); await create(); const c = await prepare(), before = await db.entity('accountingRecords').toArray(); denied(await submit(c.id), 'validation'); await evidence(c.id); ok(await submit(c.id)); assert.deepEqual(await db.entity('accountingRecords').toArray(), before)
    ok(await decide(c.id)); const posted = await get(c.id), s = await get(); assert.ok(posted.reconciliationCorrection!.appliedAt); assert.equal(posted.adjustmentRecordIds.length, 2); assert.equal(s.reconciliationSession!.rows.find(r => r.key === assetKey)!.status, 'matched'); assert.equal(s.reconciliationSession!.captures[0].rows.find(r => r.key === assetKey)!.accounting!.cost, 6499999)
    const entries = await db.entity('accountingRecords').where('municipalityId').equals('botolan').filter(e => e.sourceId === c.id).toArray(); assert.equal(entries.reduce((n, e) => n + BigInt(e.debit) - BigInt(e.credit), 0n), 0n); assert.equal(entries.find(e => e.accountCode === 'DEMO-PPE')!.debit, 1)
    denied(await decide(c.id), 'invalid_transition'); assert.equal((await get(c.id)).adjustmentRecordIds.length, 2); assert.equal(ok(await services.accountingReports.overview(accounting, end)).reconciliation.difference, 0); ok(await services.reconciliation.complete(accounting, sid, s.version, 'Adjustment approved and comparisons now agree.')); const completedReport = ok(await services.accountingReports.overview(auditor, end)); assert.equal(completedReport.reconciliationCorrections.find(x => x.id === c.id)!.workflowStatus, 'approved'); assert.equal(completedReport.reconciliationApprovals.find(a => a.subjectId === c.id)!.history.at(-1)!.action, 'approve'); validateDataset(await db.snapshot())
  })

  it('compares saved-policy depreciation separately and only posts its difference after explicit approval', async () => {
    const entry = (await db.entity('accountingRecords').get('botolan-account-recognition-1'))!, asset = (await db.entity('assets').get(assetId))!
    await db.entity('assets').put({ ...asset, recognitionStatus: 'recognized' }); await db.entity('accountingRecords').put({ ...entry, accountCode: 'depreciable_ppe', recognitionDetails: { treatment: 'depreciable_ppe', cost: asset.acquisitionCost, residualValue: 325000, usefulLifeMonths: 60, startDate: entry.postingDate.slice(0, 10), startConvention: 'acquisition_month', reason: 'Saved demonstration recognition assumptions', policySnapshot: '{}' } })
    const s = await create(), comparison = s.reconciliationSession!.rows.find(r => r.key === assetKey)!; assert.ok(comparison.reference.accumulatedDepreciation > 0); assert.equal(comparison.accounting!.accumulatedDepreciation, 0); assert.equal(await db.entity('accountingRecords').filter(e => e.kind === 'adjustment').count(), 0)
    const c = await prepare(); await evidence(c.id); ok(await submit(c.id)); ok(await decide(c.id)); const actual = assetPostedBalances(await db.entity('accountingRecords').where('assetId').equals(assetId).toArray()); assert.equal(actual.accumulatedDepreciation, comparison.reference.accumulatedDepreciation); assert.equal((await get()).reconciliationSession!.rows.find(r => r.key === assetKey)!.status, 'matched')
  })

  it('compares approved CIP cost support and updates CIP reporting through approved adjustments', async () => {
    const entry = (await db.entity('accountingRecords').get('botolan-account-cip'))!; await db.entity('accountingRecords').bulkAdd([{ ...entry, id: 'historical-cip-variance', kind: 'adjustment', sourceId: 'botolan-reconciliation-september', debit: 1 }, { ...entry, id: 'historical-cip-variance-offset', kind: 'adjustment', sourceId: 'botolan-reconciliation-september', accountCode: 'DEMO-RECONCILIATION-OFFSET', debit: 0, credit: 1 }]); const s = await create(), comparison = s.reconciliationSession!.rows.find(r => r.entityType === 'project')!; assert.equal(comparison.difference!.cipBalance, -1)
    const c = await prepare('adjust_local_ledger', comparison.key); await evidence(c.id); ok(await submit(c.id)); ok(await decide(c.id)); const report = ok(await services.accountingReports.overview(accounting, end)); assert.equal(report.cip.find(p => p.projectId === comparison.entityId)!.cipBalance, 175000000); assert.equal((await get()).reconciliationSession!.rows.find(r => r.key === comparison.key)!.status, 'matched')
  })

  it('preserves imported originals and applies approved comparison overlays without posting to the ledger', async () => {
    await create(); const imported = await dataset(); imported.rows.find((r: { entityId: string }) => r.entityId === assetId).values = { cost: 6500001, accumulatedDepreciation: 0, netBookValue: 6500001, cipBalance: 0 }; ok(await importDataset(imported)); const before = await db.entity('accountingRecords').toArray(), original = structuredClone((await get()).reconciliationSession!.imported!.dataset)
    const c = await prepare('correct_import'); await evidence(c.id); ok(await submit(c.id)); ok(await decide(c.id)); const s = await get(); assert.deepEqual(s.reconciliationSession!.imported!.dataset, original); assert.equal(s.reconciliationSession!.overrides.length, 1); assert.equal(s.reconciliationSession!.rows.find(r => r.key === assetKey)!.status, 'matched'); assert.deepEqual(await db.entity('accountingRecords').toArray(), before); assert.equal((await get(c.id)).adjustmentRecordIds.length, 0)
    ok(await services.reconciliation.complete(accounting, sid, s.version, 'Imported comparison corrected by authorized overlay.')); assert.equal(ok(await services.accountingReports.overview(auditor, end)).reconciliations.length, 1)
  })

  it('keeps missing imported rows unresolved until an approved imported correction supplies them', async () => {
    await create(); const imported = await dataset(); imported.rows = imported.rows.filter((r: { entityId: string }) => r.entityId !== assetId); const s = ok(await importDataset(imported)), missing = s.reconciliationSession!.rows.find(r => r.key === assetKey)!; assert.equal(missing.accounting, null); assert.equal(missing.status, 'discrepancy'); denied(await services.reconciliation.complete(accounting, sid, s.version, 'Missing row not accounted for.'), 'validation')
    const c = await prepare('correct_import'); await evidence(c.id); ok(await submit(c.id)); ok(await decide(c.id)); assert.equal((await get()).reconciliationSession!.imported!.dataset.rows.some(r => r.entityId === assetId), false); assert.equal((await get()).reconciliationSession!.rows.find(r => r.key === assetKey)!.status, 'matched')
  })

  it('returns corrections for revision and preserves earlier submissions and the unresolved difference', async () => {
    await mismatch(); await create(); const c = await prepare(); await evidence(c.id); ok(await submit(c.id)); denied(await decide(c.id, 'return', ''), 'validation'); ok(await decide(c.id, 'return', 'Clarify the one-centavo correction rationale.')); assert.equal((await get()).reconciliationSession!.rows.find(r => r.key === assetKey)!.status, 'discrepancy')
    const returned = await get(c.id), parent = await get(); ok(await services.reconciliation.prepare(accounting, sid, parent.version, { rowKey: assetKey, mode: 'adjust_local_ledger', reason: 'Revised investigation confirms rounding input error in the mock ledger.', correctionId: c.id, correctionVersion: returned.version })); ok(await submit(c.id)); ok(await decide(c.id)); const a = (await db.entity('approvals').where('subjectId').equals(c.id).first())!; assert.equal(a.history.filter(e => e.submission).length, 2); assert.ok(a.history[0].submission!.payload.includes('Correct verified period balances'))
  })

  it('rejects without changing balances and routes the open discrepancy into a linked replacement request', async () => {
    await mismatch(); await create(); const c = await prepare(); await evidence(c.id); ok(await submit(c.id)); const before = await db.entity('accountingRecords').toArray(); ok(await decide(c.id, 'reject', 'Further source investigation required.')); assert.deepEqual(await db.entity('accountingRecords').toArray(), before); assert.equal((await get()).reconciliationSession!.rows.find(r => r.key === assetKey)!.status, 'discrepancy'); denied(await submit(c.id), 'invalid_transition')
    const replacement = await prepare(); assert.equal(replacement.reconciliationCorrection!.supersedesId, c.id); await evidence(replacement.id); ok(await submit(replacement.id)); ok(await decide(replacement.id)); assert.equal((await get(c.id)).workflowStatus, 'rejected'); assert.equal((await get(replacement.id)).workflowStatus, 'approved'); assert.ok(await db.entity('notifications').filter(n => n.recipientId === accounting.actor.id && n.href === '/dashboard/reconciliation').count())
  })

  it('requires configured explicit approval to account for a variance without erasing it', async () => {
    ok(await services.reconciliation.savePolicy(admin, 0, { allowDocumentedExceptions: true, maxExceptionCentavos: 1, requireSupportingDocument: true })); await mismatch(); await create(); const c = await prepare('documented_exception'), before = await db.entity('accountingRecords').toArray(); await evidence(c.id); ok(await submit(c.id)); ok(await decide(c.id)); const parent = await get(), row = parent.reconciliationSession!.rows.find(r => r.key === assetKey)!; assert.equal(row.status, 'accounted_for'); assert.equal(row.difference!.cost, 1); assert.deepEqual(await db.entity('accountingRecords').toArray(), before); ok(await services.reconciliation.complete(accounting, sid, parent.version, 'Approved documented exception retained under the saved demo limit.'))
    assert.equal(ok(await services.accountingReports.overview(auditor, end)).reconciliations[0].reconciliationSession!.rows.find(r => r.key === assetKey)!.difference!.cost, 1)
  })

  it('blocks unconfigured exceptions, stale snapshots, unfinished corrections and unauthorized posting paths', async () => {
    await mismatch(); await create(); const parent = ok(await services.reconciliation.investigate(accounting, sid, (await get()).version, assetKey, 'Source balances investigated.')); denied(await services.reconciliation.prepare(accounting, sid, parent.version, { rowKey: assetKey, mode: 'documented_exception', reason: 'Exception not configured.', correctionId: null, correctionVersion: 0 }), 'validation')
    const c = await prepare(); await evidence(c.id); ok(await submit(c.id)); const asset = (await db.entity('assets').get(assetId))!; await db.entity('assets').put({ ...asset, version: asset.version + 1, location: 'Concurrent official update fixture' }); const before = await db.snapshot(); denied(await decide(c.id), 'conflict'); assert.deepEqual(await db.snapshot(), before); ok(await decide(c.id, 'return', 'Refresh the changed source snapshot.')); denied(await services.reconciliation.refresh(accounting, sid, (await get()).version), 'invalid_transition'); ok(await services.reconciliation.cancelCorrection(accounting, c.id, (await get(c.id)).version, 'Cancel stale preparation before fresh capture.')); ok(await services.reconciliation.refresh(accounting, sid, (await get()).version)); assert.equal((await get()).reconciliationSession!.captures.length, 2)
    denied(await services.entities.reconciliations.update(accounting, sid, (await get()).version, { propertyBalance: 0 }), 'forbidden')
  })

  it('validates import precision, duplicate and foreign entities, periods, dates and category scope', async () => {
    denied(await services.reconciliation.create(accounting, { periodStart: end, periodEnd: '2020-01-01', categoryId: null, includeCIP: true }), 'validation'); denied(await services.reconciliation.create(accounting, { periodStart: start, periodEnd: '2099-01-01', categoryId: null, includeCIP: true }), 'validation'); await create(); denied(await services.reconciliation.create(accounting, { periodStart: start, periodEnd: end, categoryId: null, includeCIP: true }), 'duplicate')
    const original = await dataset(); for (const invalid of [-1, 0.1, Number.MAX_SAFE_INTEGER + 1, '6500000']) { const sample = structuredClone(original); sample.rows[0].values.cost = invalid; denied(await importDataset(sample), 'validation') }
    const nbv = structuredClone(original); nbv.rows[0].values.netBookValue++; denied(await importDataset(nbv), 'validation'); const duplicate = structuredClone(original); duplicate.rows.push(duplicate.rows[0]); denied(await importDataset(duplicate), 'duplicate'); const foreign = structuredClone(original); foreign.municipalityId = 'san_antonio'; denied(await importDataset(foreign), 'forbidden'); const unknown = structuredClone(original); unknown.rows[0].entityId = 'san_antonio-asset-1'; denied(await importDataset(unknown), 'validation'); const wrongPeriod = structuredClone(original); wrongPeriod.periodStart = '2020-01-01'; denied(await importDataset(wrongPeriod), 'validation')
    const scoped = await create('botolan-category-ict', false); assert.equal(scoped.reconciliationSession!.rows.length, 1); assert.equal(scoped.reconciliationSession!.rows[0].categoryId, 'botolan-category-ict')
  })

  it('enforces roles, municipalities, ownership, live grants and history/import protection', async () => {
    await mismatch(); await create(); const c = await prepare(); denied(await services.reconciliation.prepare(await context('accounting_officer', 'san_antonio'), sid, (await get()).version, { rowKey: assetKey, mode: 'adjust_local_ledger', reason: 'Wrong municipality', correctionId: null, correctionVersion: 0 }), 'not_found'); denied(await services.reconciliation.create(await context('property_officer'), { periodStart: start, periodEnd: end, categoryId: null, includeCIP: true }), 'forbidden'); await evidence(c.id); ok(await submit(c.id)); const a = (await db.entity('approvals').where('subjectId').equals(c.id).first())!; denied(await services.approvals.decide(accounting, { id: a.id, version: a.version, decision: 'approve', remarks: 'Unauthorized self approval' }), 'forbidden')
    const grant = (await db.entity('permissions').where('[municipalityId+role]').equals(['botolan', 'approving_officer']).toArray()).find(g => g.resource === 'correction_approvals' && g.action === 'approve')!; await db.entity('permissions').delete(grant.id); denied(await decide(c.id), 'forbidden')
    const exported = JSON.parse(ok(await services.dataset.exportJson(admin)).json); exported.data.reconciliations.find((r: { id: string }) => r.id === sid).reconciliationSession.rows[0].finding = 'Rewritten investigation'; denied(await services.dataset.importJson(admin, JSON.stringify(exported)), 'conflict')
  })

  it('rolls back partial approved postings, parent captures, decisions and audits and persists successful retry', async () => {
    await mismatch(); await create(); const c = await prepare(); await evidence(c.id); ok(await submit(c.id)); const before = await db.snapshot(), fail = (_key: unknown, value: { action?: string }) => { if (value.action === 'post_approved_reconciliation_adjustment') throw new Error('Simulated failure after adjustment write') }
    db.entity('auditLogs').hook('creating', fail); denied(await decide(c.id)); db.entity('auditLogs').hook('creating').unsubscribe(fail); assert.deepEqual(await db.snapshot(), before); ok(await decide(c.id)); const parent = await get(); ok(await services.reconciliation.complete(accounting, sid, parent.version, 'Approved correction verified.')); db.close(); await db.open(); const data = ok(await createMockDataServices(db).reconciliation.overview(accounting)); assert.equal(data.sessions.find(s => s.id === sid)!.reconciliationSession!.status, 'completed'); assert.equal(data.corrections.find(r => r.id === c.id)!.workflowStatus, 'approved'); validateDataset(await db.snapshot())
  })
})
