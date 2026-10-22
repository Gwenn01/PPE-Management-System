import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { MockDatabase } from '../src/mock/database.js'
import { createMockDataServices, type MockDataServices } from '../src/services/mockDataService.js'
import type { RequestContext, ServiceResult } from '../src/services/contracts.js'
import type { ConstructionCommand } from '../src/services/constructionService.js'
import type { BudgetCommand } from '../src/services/budgetService.js'
import type { ApprovalDecision } from '../src/services/approvalService.js'
import type { Role } from '../src/config/roles.js'
import type { ProjectDocumentType } from '../src/domain/construction.js'
import { depreciationSchedule, residualFromPercent } from '../src/domain/accounting.js'
import { safeTotal } from '../src/services/cipValidation.js'

function ok<T>(r: ServiceResult<T>): T { if (!r.ok) assert.fail(JSON.stringify(r.error)); return r.data }
function denied<T>(r: ServiceResult<T>, code?: string) { assert.equal(r.ok, false); if (!r.ok && code) assert.equal(r.error.code, code, r.error.message) }

describe('Construction in progress accounting and capitalization', () => {
  let db: MockDatabase, services: MockDataServices, property: RequestContext, engineering: RequestContext, budget: RequestContext, accounting: RequestContext, approver: RequestContext, admin: RequestContext
  let projectId: string, packetId: string, supportingId: string
  const today = new Date().toISOString().slice(0, 10)
  async function session(actor: RequestContext['actor']) {
    const sessionId = crypto.randomUUID()
    await db.sessions.add({ id: sessionId, userId: actor.id, role: actor.role, municipalityId: actor.municipalityId, issuedAt: new Date().toISOString(), expiresAt: '2099-01-01T00:00:00.000Z', remember: false })
    return { actor, sessionId, municipalityId: actor.municipalityId }
  }
  async function context(role: Role, municipalityId = 'botolan') { return session((await db.entity('users').toArray()).find(u => u.role === role && u.municipalityId === municipalityId)!) }
  async function upload(type: ProjectDocumentType, ctx = property, budgetRoutingId?: string) {
    return ok(await services.documents.upload(ctx, { entityType: 'project', entityId: projectId, projectDocumentType: type, ...(budgetRoutingId ? { budgetRoutingId } : {}), fileName: `${type}.txt`, file: new Blob(['Fictional local accounting evidence. Demonstration only.'], { type: 'text/plain' }) }))
  }
  async function construction(command: ConstructionCommand, ctx = engineering) { const p = (await db.entity('projects').get(projectId))!; return services.construction.act(ctx, projectId, p.version, command) }
  async function budgetAct(id: string, command: BudgetCommand, ctx = budget) { const p = (await db.entity('documentRouting').get(id))!; return services.budget.act(ctx, id, p.version, command) }
  async function cost(reference = 'CIP-001', amount = 10000001) { return services.cip.recordCost(accounting, { projectId, reference, description: 'Eligible construction expenditure', category: 'contractor_billing', amount, date: today, supportingDocumentId: supportingId, budgetPacketId: packetId }) }
  async function approvedCost(reference = 'CIP-001', amount = 10000001) { const c = ok(await cost(reference, amount)); return ok(await services.cip.reviewCost(accounting, c.id, c.version, 'approve', 'Reviewed as a qualifying direct construction cost.')) }
  async function complete(ready = true) {
    ok(await construction({ action: 'progress', note: 'Property monitoring confirms physical completion.', percent: 100 }, property))
    await upload('completion_certificate'); await upload('acceptance_report')
    ok(await construction({ action: 'complete', note: 'Completion and acceptance submitted.', actualCompletionDate: today }, property))
    if (ready) ok(await construction({ action: 'confirm_ready', note: 'Property confirms ready for intended use with acceptance evidence.', date: today }, property))
  }
  async function preparation() {
    const costs = (await db.entity('cipCosts').where('projectId').equals(projectId).toArray()).filter(c => c.accounting?.status === 'approved')
    const policy = (await db.entity('depreciationPolicies').where('municipalityId').equals('botolan').first())!
    return { costIds: costs.map(c => c.id), propertyNumber: 'DEMO-CAP-PPE-001', category: 'botolan-category-machinery', custodianId: null, policyId: policy.id, policyVersion: policy.version, treatment: 'depreciable_ppe' as const, usefulLifeMonths: 240, residualValue: residualFromPercent(safeTotal(costs.map(c => c.amount)), 5), verificationNote: 'Completion, acceptance, qualifying costs and unverified demo depreciation requirements reviewed.' }
  }
  async function prepare() { const p = (await db.entity('projects').get(projectId))!; return services.cip.prepare(accounting, projectId, p.version, await preparation()) }
  async function submit() { const p = (await db.entity('projects').get(projectId))!; return services.cip.submit(accounting, projectId, p.version) }
  async function decide(decision: ApprovalDecision, remarks = '') { const a = (await db.entity('approvals').where('subjectId').equals(projectId).first())!; return services.approvals.decide(approver, { id: a.id, version: a.version, decision, remarks }) }

  beforeEach(async () => {
    db = new MockDatabase(`cip-${crypto.randomUUID()}`); services = createMockDataServices(db); ok(await services.initialize())
    property = await context('property_officer'); engineering = await context('engineering_office'); budget = await context('budget_office'); accounting = await context('accounting_officer'); approver = await context('approving_officer'); admin = await context('administrator')
    projectId = ok(await services.construction.create(property, { name: 'Fictional completed public facility', projectNumber: 'DEMO-CIP-PROJECT', location: 'Demo site', contractor: 'Fictional contractor', departmentId: 'botolan-dept-general', budgetAmount: 100000000, startDate: '2026-01-01', expectedCompletionDate: today, engineeringUserId: engineering.actor.id, budgetUserId: budget.actor.id })).id
    await upload('mpdo_proposal'); ok(await construction({ action: 'proposal', note: 'Demo MPDO proposal.' }, property))
    await upload('mayor_authorization_simulation'); ok(await construction({ action: 'simulate_mayor', note: 'External Mayor simulation.' }, property)); ok(await construction({ action: 'receive', note: 'Engineering receives approved demo project.' }))
    await upload('construction_plan', engineering); await upload('availability_of_fund', engineering)
    ok(await construction({ action: 'review', subject: 'construction', result: 'accepted', note: 'Plan reviewed.' })); ok(await construction({ action: 'review', subject: 'fund', result: 'accepted', note: 'Fund evidence reviewed.' }))
    await upload('progress_report', engineering); ok(await construction({ action: 'progress', note: 'Implementation monitored.', percent: 50 })); await upload('engineering_report', engineering); ok(await construction({ action: 'forward', note: 'Complete packet forwarded to Budget.' }))
    const inbound = (await db.entity('documentRouting').where('projectId').equals(projectId).first())!
    ok(await budgetAct(inbound.id, { action: 'receive', note: 'Budget received.' })); ok(await budgetAct(inbound.id, { action: 'save_voucher', voucher: { reference: 'DEMO-CIP-VOUCHER', date: today, amount: 30000000, remarks: 'Eligible construction expenditures demo.' }, fund: 'regular', accountingUserId: accounting.actor.id }))
    await upload('voucher', budget, inbound.id); await upload('budget_review', budget, inbound.id); ok(await budgetAct(inbound.id, { action: 'review', result: 'ready', note: 'Voucher and funding reviewed.' }))
    packetId = ok(await budgetAct(inbound.id, { action: 'forward_accounting', note: 'Processed documents sent to Accounting.' })).outgoing!.id
    ok(await budgetAct(packetId, { action: 'accounting_receive', note: 'Processed Budget documents acknowledged.' }, accounting))
    supportingId = (await upload('cip_support', accounting)).id
  })
  afterEach(async () => { await db.delete() })

  it('records reviewed CIP without depreciating unfinished projects and blocks incomplete capitalization', async () => {
    const c = ok(await cost())
    let overview = ok(await services.cip.overview(accounting))
    assert.equal(overview.balances.find(b => b.projectId === projectId)!.cipBalance, 0)
    ok(await services.cip.reviewCost(accounting, c.id, c.version, 'approve', 'Verified qualifying construction cost.'))
    overview = ok(await services.cip.overview(accounting))
    assert.equal(overview.balances.find(b => b.projectId === projectId)!.cipBalance, c.amount)
    denied(await prepare(), 'validation')
    denied(await construction({ action: 'confirm_ready', date: today, note: 'Unfinished project cannot be ready.' }, property), 'validation')
    const report = ok(await services.accountingReports.overview(accounting, today))
    assert.equal(report.cip.find(p => p.projectId === projectId)!.cipBalance, c.amount)
    assert.ok(!report.ppeMaster.some(a => a.constructionProjectId === projectId)); assert.ok(!report.depreciation.some(a => a.description === 'Fictional completed public facility'))
    assert.equal(await db.entity('accountingRecords').where('projectId').equals(projectId).filter(e => e.kind === 'depreciation' || e.kind === 'capitalization').count(), 0)
    await complete(false); denied(await prepare(), 'validation')
  })

  it('capitalizes approved qualifying costs atomically and updates PPE, CIP, depreciation and reconciliation data', async () => {
    const c1 = await approvedCost('CIP-001', 6000001), c2 = await approvedCost('CIP-002', 4000000)
    const excluded = ok(await cost('CIP-NONQUALIFYING', 1000000)); ok(await services.cip.reviewCost(accounting, excluded.id, excluded.version, 'exclude', 'Non-qualifying demonstration expenditure.'))
    await complete(); ok(await prepare()); const approval = ok(await submit())
    assert.equal(approval.requestedById, accounting.actor.id)
    const details = ok(await services.approvals.getById(approver, approval.id))
    assert.ok(details.documents.some(d => d.projectDocumentType === 'completion_certificate'))
    ok(await services.documents.download(approver, supportingId))
    const decision = ok(await decide('approve', 'Completed facility, evidence and qualifying expenditures verified.'))
    const asset = decision.asset!; assert.ok(asset); assert.equal(asset.acquisitionCost, c1.amount + c2.amount); assert.equal(asset.registrationId, null); assert.equal(asset.constructionProjectId, projectId)
    assert.equal(asset.recognitionStatus, 'recognized'); assert.equal(asset.lifecycleStatus, 'in_service')
    const project = (await db.entity('projects').get(projectId))!
    assert.equal(project.requestedById, property.actor.id); assert.equal(project.capitalizedAssetId, asset.id); assert.equal(project.projectStatus, 'capitalized')
    const entries = await db.entity('accountingRecords').where('projectId').equals(projectId).filter(e => e.kind === 'capitalization').toArray()
    assert.equal(entries.length, 2); assert.equal(safeTotal(entries.map(e => e.debit - e.credit)), 0)
    assert.equal((await db.entity('cipCosts').get(c1.id))!.accounting!.status, 'capitalized')
    assert.equal((await db.entity('cipCosts').get(excluded.id))!.accounting!.status, 'excluded')
    const report = ok(await services.accountingReports.overview(accounting, today))
    assert.equal(report.cip.find(p => p.projectId === projectId)!.cipBalance, 0)
    assert.equal(report.cip.find(p => p.projectId === projectId)!.transferredToPPE, asset.acquisitionCost)
    assert.equal(report.ppeMaster.find(a => a.id === asset.id)!.postedCost, asset.acquisitionCost)
    assert.equal(report.reconciliation.difference, 0)
    assert.ok(report.depreciation.some(a => a.assetId === asset.id && a.startDate >= today))
    const saved = ok(await services.accounting.overview(accounting, 'depreciation')).records.find(e => e.assetId === asset.id && e.recognitionDetails)!
    assert.equal(depreciationSchedule(saved.recognitionDetails!, '2099-12-31').netBookValue, residualFromPercent(asset.acquisitionCost, 5))
    assert.ok(ok(await services.registration.overview(property)).assets.some(a => a.id === asset.id))
    db.close(); await db.open(); services = createMockDataServices(db)
    assert.equal(ok(await services.accountingReports.overview(accounting, today, 'reconciliations')).cip.find(p => p.projectId === projectId)!.cipBalance, 0)
  })

  it('returns capitalization for correction, reverses excluded costs and preserves earlier submissions', async () => {
    const c1 = await approvedCost('CIP-001', 6000001), c2 = await approvedCost('CIP-002', 4000000)
    await complete(); ok(await prepare()); const first = ok(await submit()), snapshot = first.history[0].submission!.payload
    ok(await decide('return', 'Exclude the non-qualifying cost and revise the capitalization.'))
    assert.equal((await db.entity('projects').get(projectId))!.workflowStatus, 'returned')
    const exclusion = ok(await services.cip.reviewCost(accounting, c2.id, c2.version, 'exclude', 'Returned review identified a non-qualifying cost. Reverse the prior CIP debit.'))
    assert.ok(exclusion.accounting!.reversalRecordId)
    const revised = ok(await prepare()); assert.equal(revised.capitalization!.total, c1.amount)
    const second = ok(await submit()); assert.equal(second.history[0].submission!.payload, snapshot); assert.equal(second.history.filter(e => e.action === 'submit').length, 2)
    ok(await decide('approve', 'Revised qualifying costs accepted.'))
    const project = (await db.entity('projects').get(projectId))!, asset = (await db.entity('assets').get(project.capitalizedAssetId!))!
    assert.equal(asset.acquisitionCost, c1.amount)
    const report = ok(await services.accountingReports.overview(accounting, today)); assert.equal(report.cip.find(p => p.projectId === projectId)!.cipBalance, 0)
  })

  it('retains non-depreciable treatment and separates historical forecasts from authorized postings', async () => {
    await approvedCost(); await complete()
    const p = (await db.entity('projects').get(projectId))!, input = await preparation()
    ok(await services.cip.prepare(accounting, projectId, p.version, { ...input, treatment: 'non_depreciable_ppe', usefulLifeMonths: 0, residualValue: 0, verificationNote: 'Reviewed non-depreciable demonstration classification and completion evidence.' }))
    ok(await submit()); const asset = ok(await decide('approve')).asset!
    const before = await db.snapshot(), records = ok(await services.accounting.overview(accounting, 'depreciation')).records
    const entry = records.find(e => e.assetId === asset.id && e.recognitionDetails)!
    const schedule = depreciationSchedule(entry.recognitionDetails!, '2099-12-31')
    assert.equal(schedule.rows.length, 0); assert.equal(schedule.netBookValue, asset.acquisitionCost)
    const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86400000).toISOString().slice(0, 10)
    assert.ok(!ok(await services.accountingReports.overview(accounting, yesterday)).ppeMaster.some(a => a.id === asset.id))
    const projected = ok(await services.accountingReports.overview(accounting, '2099-12-31'))
    assert.equal(projected.depreciation.find(a => a.assetId === asset.id)!.accumulatedDepreciation, 0)
    assert.deepEqual(await db.snapshot(), before)
  })

  it('rejects capitalization without moving CIP or creating PPE and retains the rejected history', async () => {
    const c = await approvedCost(); await complete(); ok(await prepare()); ok(await submit())
    const before = await db.snapshot(); ok(await decide('reject', 'Demo request is not approved for capitalization.'))
    const after = await db.snapshot(); assert.deepEqual(after.assets, before.assets); assert.deepEqual(after.accountingRecords, before.accountingRecords)
    assert.equal((await db.entity('projects').get(projectId))!.workflowStatus, 'rejected')
    denied(await prepare(), 'invalid_transition'); denied(await submit(), 'invalid_transition'); denied(await decide('approve'), 'invalid_transition')
    assert.equal(ok(await services.accountingReports.overview(accounting, today)).cip.find(p => p.projectId === projectId)!.cipBalance, c.amount)
  })

  it('rechecks local evidence, policy versions, pending costs and unsafe values before approval', async () => {
    assert.throws(() => safeTotal([Number.MAX_SAFE_INTEGER, 1]))
    for (const amount of [-1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1, 30000001]) denied(await cost(`BAD-${amount}`, amount), 'validation')
    await approvedCost(); denied(await cost('cip-001'), 'duplicate')
    const pending = ok(await cost('PENDING-REVIEW', 1000000)); await complete(); denied(await prepare(), 'validation')
    ok(await services.cip.reviewCost(accounting, pending.id, pending.version, 'exclude', 'Excluded pending charge.'))
    const p = (await db.entity('projects').get(projectId))!, input = await preparation()
    denied(await services.cip.prepare(accounting, projectId, p.version, { ...input, residualValue: input.residualValue + 100000000 }), 'validation')
    ok(await prepare()); ok(await submit())
    const supporting = (await db.entity('documents').get(supportingId))!, blob = (await db.blobs.get(supporting.storageKey))!
    await db.blobs.delete(supporting.storageKey)
    denied(await decide('approve'), 'validation'); assert.equal((await db.entity('projects').get(projectId))!.workflowStatus, 'submitted')
    await db.blobs.add(blob)
    const policy = (await db.entity('depreciationPolicies').get(input.policyId))!
    await db.entity('depreciationPolicies').put({ ...policy, version: policy.version + 1 })
    denied(await decide('approve'), 'validation')
    await db.entity('depreciationPolicies').put(policy)
    ok(await decide('approve'))
  })

  it('rolls back partial capitalization postings and prevents duplicate or stale capitalization', async () => {
    await approvedCost(); await complete(); ok(await prepare()); const request = ok(await submit()), before = await db.snapshot()
    const fail = (_key: unknown, value: { action?: string }) => { if (value.action === 'transfer_cip_to_ppe') throw new Error('Simulated failure after asset creation and first ledger write') }
    db.entity('auditLogs').hook('creating', fail)
    denied(await decide('approve'))
    db.entity('auditLogs').hook('creating').unsubscribe(fail)
    assert.deepEqual(await db.snapshot(), before)
    ok(await decide('approve'))
    denied(await services.approvals.decide(approver, { id: request.id, version: request.version, decision: 'approve', remarks: 'Stale duplicate' }), 'conflict')
    denied(await decide('approve'), 'invalid_transition'); denied(await cost('AFTER-CAP'), 'invalid_transition')
    assert.equal(await db.entity('assets').filter(a => a.constructionProjectId === projectId).count(), 1)
    assert.equal(await db.entity('accountingRecords').where('projectId').equals(projectId).filter(e => e.kind === 'capitalization').count(), 2)
  })

  it('enforces active role, municipality, receipt assignment, immutable requests and live permissions', async () => {
    const input = { projectId, reference: 'UNAUTHORIZED', description: 'Demo', category: 'materials' as const, amount: 6000000, date: today, supportingDocumentId: supportingId, budgetPacketId: packetId }
    denied(await services.cip.recordCost(property, input), 'forbidden')
    denied(await services.cip.recordCost(await context('accounting_officer', 'san_antonio'), input), 'not_found')
    const other = ok(await services.administration.createUser(admin, { name: 'Other Accountant', username: 'other.cip', email: 'other.cip@example.test', role: 'accounting_officer', departmentId: 'botolan-dept-general' }))
    const otherCtx = await session(other); denied(await services.cip.recordCost(otherCtx, input), 'not_found'); assert.ok(!ok(await services.cip.overview(otherCtx)).projects.some(p => p.id === projectId))
    const c = await approvedCost(); await complete(); ok(await prepare()); const request = ok(await submit())
    denied(await services.cip.reviewCost(accounting, c.id, c.version, 'exclude', 'Cannot change a pending snapshot.'), 'invalid_transition')
    denied(await services.approvals.decide(accounting, { id: request.id, version: request.version, decision: 'approve', remarks: 'No self approval' }), 'forbidden')
    const grant = (await db.entity('permissions').where('[municipalityId+role]').equals(['botolan', 'approving_officer']).toArray()).find(g => g.resource === 'capitalization_approvals' && g.action === 'approve')!
    await db.entity('permissions').delete(grant.id); denied(await decide('approve'), 'forbidden'); await db.entity('permissions').add(grant)
    denied(await services.entities.cipCosts.update(accounting, c.id, c.version, { amount: 1 }), 'forbidden')
    const exported = JSON.parse(ok(await services.dataset.exportJson(admin)).json)
    exported.data.cipCosts.find((row: { id: string }) => row.id === c.id).description = 'Rewritten history'
    denied(await services.dataset.importJson(admin, JSON.stringify(exported)), 'conflict')
  })
})
