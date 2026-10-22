import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { MockDatabase } from '../src/mock/database.js'
import { createMockDataServices, type MockDataServices } from '../src/services/mockDataService.js'
import type { RequestContext, ServiceResult } from '../src/services/contracts.js'
import type { ConstructionCommand } from '../src/services/constructionService.js'
import type { BudgetCommand } from '../src/services/budgetService.js'
import type { ProjectDocumentType } from '../src/domain/construction.js'
import type { Role } from '../src/config/roles.js'
import { roleList } from '../src/config/roles.js'
import { createDashboardService } from '../src/services/dashboardService.js'

function ok<T>(r: ServiceResult<T>): T { if (!r.ok) assert.fail(JSON.stringify(r.error)); return r.data }
function denied<T>(r: ServiceResult<T>, code?: string) { assert.equal(r.ok, false); if (!r.ok && code) assert.equal(r.error.code, code, r.error.message) }

describe('Budget vouchers, external Treasury and Accounting routing', () => {
  let db: MockDatabase, services: MockDataServices, property: RequestContext, engineering: RequestContext, budget: RequestContext, accounting: RequestContext, admin: RequestContext
  let projectId: string, sourceId: string
  const today = new Date().toISOString().slice(0, 10)
  async function context(role: Role, municipalityId = 'botolan') {
    const actor = (await db.entity('users').toArray()).find(u => u.role === role && u.municipalityId === municipalityId)!
    return session(actor)
  }
  async function session(actor: RequestContext['actor']) {
    const sessionId = crypto.randomUUID()
    await db.sessions.add({ id: sessionId, userId: actor.id, role: actor.role, municipalityId: actor.municipalityId, issuedAt: new Date().toISOString(), expiresAt: '2099-01-01T00:00:00.000Z', remember: false })
    return { actor, sessionId, municipalityId: actor.municipalityId }
  }
  async function projectAct(command: ConstructionCommand, ctx = engineering) {
    const p = (await db.entity('projects').get(projectId))!
    return services.construction.act(ctx, projectId, p.version, command)
  }
  async function upload(type: ProjectDocumentType, ctx = budget, packetId?: string) {
    return ok(await services.documents.upload(ctx, { entityType: 'project', entityId: projectId, projectDocumentType: type, ...(packetId ? { budgetRoutingId: packetId } : {}), fileName: `${type}.txt`, file: new Blob(['Fictional local document processing demo. No real approval or transfer.'], { type: 'text/plain' }) }))
  }
  async function act(command: BudgetCommand, ctx = budget, id = sourceId) {
    const p = (await db.entity('documentRouting').get(id))!
    return services.budget.act(ctx, id, p.version, command)
  }
  const voucher = () => ({ reference: 'DEMO-V-100', date: today, amount: 123456, remarks: 'Demonstration voucher processing only.' })
  async function ready(fund: 'regular' | 'trust') {
    ok(await act({ action: 'receive', note: 'Received assigned Engineering packet.' }))
    ok(await act({ action: 'save_voucher', voucher: voucher(), fund, accountingUserId: accounting.actor.id }))
    await upload('voucher', budget, sourceId); await upload('budget_review', budget, sourceId)
    ok(await act({ action: 'review', result: 'ready', note: 'Reviewed Engineering evidence, voucher and budget checklist.' }))
  }
  beforeEach(async () => {
    db = new MockDatabase(`budget-${crypto.randomUUID()}`); services = createMockDataServices(db); ok(await services.initialize())
    property = await context('property_officer'); engineering = await context('engineering_office'); budget = await context('budget_office'); accounting = await context('accounting_officer'); admin = await context('administrator')
    const p = ok(await services.construction.create(property, { name: 'Fictional Phase 10 project', projectNumber: 'DEMO-P10', location: 'Demo site', departmentId: 'botolan-dept-general', budgetAmount: 100000000, contractor: 'Fictional contractor', startDate: '2026-01-01', expectedCompletionDate: '2026-12-31', engineeringUserId: engineering.actor.id, budgetUserId: budget.actor.id }))
    projectId = p.id
    await upload('mpdo_proposal', property); ok(await projectAct({ action: 'proposal', note: 'Demo proposal.' }, property))
    await upload('mayor_authorization_simulation', property); ok(await projectAct({ action: 'simulate_mayor', note: 'External Mayor simulation only.' }, property))
    ok(await projectAct({ action: 'receive', note: 'Engineering received.' }))
    await upload('construction_plan', engineering); await upload('availability_of_fund', engineering)
    ok(await projectAct({ action: 'review', subject: 'construction', result: 'accepted', note: 'Plan reviewed.' })); ok(await projectAct({ action: 'review', subject: 'fund', result: 'accepted', note: 'Fund evidence reviewed.' }))
    await upload('progress_report', engineering); ok(await projectAct({ action: 'progress', percent: 50, note: 'Engineering implementation update.' }))
    await upload('engineering_report', engineering); ok(await projectAct({ action: 'forward', note: 'Complete Engineering packet forwarded to Budget.' }))
    sourceId = (await db.entity('documentRouting').where('projectId').equals(projectId).filter(r => r.toRole === 'budget_office').first())!.id
  })
  afterEach(async () => { await db.delete() })

  it('processes a Regular Fund voucher through Accounting with atomic notifications and no financial postings', async () => {
    assert.ok(ok(await services.budget.overview(budget)).packets.some(r => r.id === sourceId))
    await ready('regular')
    const before = await db.snapshot()
    const result = ok(await act({ action: 'forward_accounting', note: 'Regular Fund reviewed document handoff.' }))
    assert.ok(result.outgoing); const outgoing = result.outgoing!
    assert.equal(outgoing.budgetHandoff!.fund, 'regular'); assert.equal(outgoing.budgetHandoff!.treasury, null)
    assert.equal(outgoing.budgetHandoff!.voucher.amount, 123456)
    assert.ok((await db.entity('notifications').toArray()).some(n => n.recipientId === accounting.actor.id && n.href === '/dashboard/accounting-documents'))
    const queue = ok(await services.budget.overview(accounting))
    assert.equal(queue.packets.length, 1); assert.equal(queue.sources.length, 0)
    ok(await services.documents.download(accounting, outgoing.documentId))
    assert.ok(ok(await createDashboardService(db).getSnapshot(accounting)).records.some(r => r.id === outgoing.id))
    denied(await act({ action: 'forward_accounting', note: 'Duplicate' }), 'invalid_transition')
    ok(await act({ action: 'accounting_receive', note: 'Documents acknowledged; not a posting.' }, accounting, outgoing.id))
    const completed = (await db.entity('documentRouting').get(sourceId))!
    assert.equal(completed.budgetProcessing!.status, 'completed'); assert.ok(completed.budgetProcessing!.accountingReceivedAt)
    denied(await act({ action: 'accounting_receive', note: 'Duplicate receipt' }, accounting, outgoing.id), 'invalid_transition')
    denied(await act({ action: 'save_voucher', voucher: voucher(), fund: 'trust', accountingUserId: accounting.actor.id }), 'invalid_transition')
    const after = await db.snapshot()
    assert.deepEqual(after.accountingRecords, before.accountingRecords); assert.deepEqual(after.cipCosts, before.cipCosts); assert.deepEqual(after.assets, before.assets)
    assert.equal(roleList.length, 8); assert.ok(!roleList.some(r => String(r).includes('treasury')))
  })

  it('gates Trust Fund forwarding and Accounting receipt on explicit demo Treasury confirmation with evidence', async () => {
    await ready('trust')
    denied(await act({ action: 'forward_accounting', note: 'Skip external stage' }), 'invalid_transition')
    ok(await act({ action: 'send_treasury', note: 'External demo processing requested.' }))
    assert.equal(ok(await services.budget.overview(accounting)).packets.length, 0)
    denied(await services.entities.projects.getById(accounting, projectId), 'not_found')
    denied(await act({ action: 'accounting_receive', note: 'Premature' }, accounting), 'not_found')
    denied(await act({ action: 'send_treasury', note: 'Duplicate external forwarding' }), 'invalid_transition')
    denied(await act({ action: 'confirm_treasury', reference: 'DEMO-TR-1', confirmationDate: today, note: 'Missing file' }), 'validation')
    denied(await act({ action: 'save_voucher', voucher: voucher(), fund: 'regular', accountingUserId: accounting.actor.id }), 'invalid_transition')
    const evidence = await upload('treasury_confirmation_demo', budget, sourceId)
    const stored = (await db.blobs.get(evidence.storageKey))!; await db.blobs.delete(evidence.storageKey)
    denied(await act({ action: 'confirm_treasury', reference: 'DEMO-TR-1', confirmationDate: today, note: 'Metadata only' }), 'validation')
    await db.blobs.add(stored)
    denied(await act({ action: 'confirm_treasury', reference: 'DEMO-TR-1', confirmationDate: '2020-01-01', note: 'Before sent' }), 'validation')
    denied(await act({ action: 'confirm_treasury', reference: 'DEMO-TR-1', confirmationDate: '2099-01-01', note: 'Future confirmation' }), 'validation')
    ok(await act({ action: 'confirm_treasury', reference: 'DEMO-TR-1', confirmationDate: today, note: 'Fictional receipt simulation.' }))
    assert.equal(ok(await services.budget.overview(accounting)).packets.length, 0)
    const confirmed = (await db.entity('documentRouting').get(sourceId))!.budgetProcessing!
    assert.match(confirmed.history.at(-1)!.note, /DEMO-ONLY simulation/)
    denied(await act({ action: 'confirm_treasury', reference: 'Again', confirmationDate: today, note: 'Duplicate' }), 'invalid_transition')
    const outgoing = ok(await act({ action: 'forward_accounting', note: 'Confirmed Trust Fund document packet.' })).outgoing!
    assert.equal(outgoing.budgetHandoff!.treasury!.evidenceId, evidence.id)
    const intactSource = (await db.entity('documentRouting').get(sourceId))!
    await db.entity('documentRouting').put({ ...intactSource, budgetProcessing: { ...intactSource.budgetProcessing!, treasury: null } }) // Fault fixture: do not trust the handoff flag alone.
    denied(await act({ action: 'accounting_receive', note: 'Treasury stage is no longer confirmed' }, accounting, outgoing.id), 'invalid_transition')
    await db.entity('documentRouting').put(intactSource)
    await db.blobs.delete(evidence.storageKey)
    denied(await act({ action: 'accounting_receive', note: 'Missing local confirmation file' }, accounting, outgoing.id), 'validation')
    await db.blobs.add(stored)
    ok(await act({ action: 'accounting_receive', note: 'Confirmed demo evidence checked; documents received.' }, accounting, outgoing.id))
    assert.equal((await db.entity('documentRouting').get(sourceId))!.budgetProcessing!.status, 'completed')
  })

  it('validates vouchers, classification, required documents and stale versions', async () => {
    denied(await act({ action: 'save_voucher', voucher: voucher(), fund: 'regular', accountingUserId: accounting.actor.id }), 'invalid_transition')
    ok(await act({ action: 'receive', note: 'Received.' }))
    denied(await act({ action: 'receive', note: 'Duplicate receipt' }), 'invalid_transition')
    for (const change of [{ amount: 0 }, { amount: -1 }, { amount: 1.2 }, { amount: Number.MAX_SAFE_INTEGER + 1 }, { amount: 100000001 }, { date: '2026-02-30' }, { date: '2020-01-01' }, { date: '2099-01-01' }, { reference: ' ' }, { remarks: '' }]) denied(await act({ action: 'save_voucher', voucher: { ...voucher(), ...change }, fund: 'regular', accountingUserId: accounting.actor.id }), 'validation')
    denied(await act({ action: 'save_voucher', voucher: voucher(), fund: 'regular', accountingUserId: 'demo-san_antonio-accounting_officer' }), 'validation')
    ok(await act({ action: 'review', result: 'incomplete', note: 'Missing voucher requirements.' }))
    assert.equal((await db.entity('documentRouting').get(sourceId))!.budgetProcessing!.status, 'incomplete')
    ok(await act({ action: 'save_voucher', voucher: voucher(), fund: 'regular', accountingUserId: accounting.actor.id }))
    denied(await act({ action: 'review', result: 'ready', note: 'Missing files' }), 'validation')
    denied(await services.documents.upload(budget, { entityType: 'project', entityId: projectId, budgetRoutingId: sourceId, projectDocumentType: 'voucher', fileName: 'bad.pdf', file: new Blob(['not a pdf'], { type: 'application/pdf' }) }), 'validation')
    await upload('voucher', budget, sourceId); await upload('budget_review', budget, sourceId)
    const stale = (await db.entity('documentRouting').get(sourceId))!
    ok(await act({ action: 'review', result: 'ready', note: 'Documents checked.' }))
    denied(await services.budget.act(budget, sourceId, stale.version, { action: 'forward_accounting', note: 'Stale client' }), 'conflict')
    await upload('voucher', budget, sourceId)
    assert.equal((await db.entity('documentRouting').get(sourceId))!.budgetProcessing!.status, 'under_review')
    denied(await act({ action: 'forward_accounting', note: 'Revised file needs review' }), 'invalid_transition')
  })

  it('preserves returned Accounting handoffs while Budget corrects and resubmits', async () => {
    await ready('trust'); ok(await act({ action: 'send_treasury', note: 'Demo external stage.' })); await upload('treasury_confirmation_demo', budget, sourceId)
    ok(await act({ action: 'confirm_treasury', reference: 'DEMO-OLD', confirmationDate: today, note: 'Original demo confirmation.' }))
    const first = ok(await act({ action: 'forward_accounting', note: 'Original handoff.' })).outgoing!
    const oldHandoff = structuredClone(first.budgetHandoff)
    ok(await act({ action: 'accounting_return', note: 'Correct voucher remarks and attachment.' }, accounting, first.id))
    assert.equal((await db.entity('documentRouting').get(sourceId))!.budgetProcessing!.status, 'accounting_returned')
    ok(await act({ action: 'save_voucher', voucher: { ...voucher(), remarks: 'Corrected demo voucher remarks.' }, fund: 'trust', accountingUserId: accounting.actor.id }))
    assert.equal((await db.entity('documentRouting').get(sourceId))!.budgetProcessing!.treasury, null)
    assert.deepEqual((await db.entity('documentRouting').get(first.id))!.budgetHandoff, oldHandoff)
    ok(await act({ action: 'review', result: 'ready', note: 'Rechecked corrected voucher.' }))
    denied(await act({ action: 'forward_accounting', note: 'Old Treasury confirmation must not apply' }), 'invalid_transition')
    ok(await act({ action: 'send_treasury', note: 'Fresh external-stage request for corrected packet.' })); await upload('treasury_confirmation_demo', budget, sourceId)
    ok(await act({ action: 'confirm_treasury', reference: 'DEMO-NEW', confirmationDate: today, note: 'New demo external confirmation received.' }))
    const second = ok(await act({ action: 'forward_accounting', note: 'Corrected handoff.' })).outgoing!
    assert.notEqual(second.id, first.id); assert.equal(second.budgetHandoff!.treasury!.reference, 'DEMO-NEW')
    assert.equal((await db.entity('documentRouting').get(first.id))!.workflowStatus, 'returned')
    assert.deepEqual((await db.entity('documentRouting').get(first.id))!.budgetHandoff, oldHandoff)
    db.close(); await db.open(); services = createMockDataServices(db)
    assert.equal(ok(await services.budget.overview(accounting)).packets.length, 2)
    assert.ok((await db.entity('documentRouting').get(sourceId))!.budgetProcessing!.history.some(e => e.action === 'accounting_return' && e.note.includes('Correct voucher')))
  })

  it('enforces assigned roles and municipality permissions for metadata, files and commands', async () => {
    const otherUser = ok(await services.administration.createUser(admin, { name: 'Other Budget Officer', username: 'other.budget', email: 'other.budget@example.test', role: 'budget_office', departmentId: 'botolan-dept-general' }))
    const otherBudget = await session(otherUser), remoteBudget = await context('budget_office', 'san_antonio')
    for (const ctx of [otherBudget, remoteBudget]) {
      assert.ok(!ok(await services.budget.overview(ctx)).packets.some(p => p.id === sourceId))
      denied(await act({ action: 'receive', note: 'Unauthorized' }, ctx), 'not_found')
    }
    denied(await act({ action: 'receive', note: 'Wrong role' }, property), 'forbidden')
    await ready('regular')
    denied(await services.entities.documentRouting.update(budget, sourceId, (await db.entity('documentRouting').get(sourceId))!.version, { remarks: 'Bypass' }), 'forbidden')
    const outgoing = ok(await act({ action: 'forward_accounting', note: 'Reviewed packet.' })).outgoing!
    const otherAccount = ok(await services.administration.createUser(admin, { name: 'Other Accountant', username: 'other.accounting', email: 'other.accounting@example.test', role: 'accounting_officer', departmentId: 'botolan-dept-general' }))
    for (const ctx of [await session(otherAccount), await context('accounting_officer', 'san_antonio')]) {
      assert.equal(ok(await services.budget.overview(ctx)).packets.length, 0)
      denied(await services.entities.projects.getById(ctx, projectId), 'not_found')
      denied(await services.documents.download(ctx, outgoing.documentId), 'not_found')
      denied(await act({ action: 'accounting_receive', note: 'Unauthorized receipt' }, ctx, outgoing.id), 'not_found')
    }
    const grant = (await db.entity('permissions').where('[municipalityId+role]').equals(['botolan', 'accounting_officer']).toArray()).find(g => g.resource === 'cip_costs' && g.action === 'update')!
    await db.entity('permissions').delete(grant.id)
    denied(await act({ action: 'accounting_receive', note: 'Revoked permission' }, accounting, outgoing.id), 'forbidden')
  })

  it('rolls back forwarding and receipt on persistence failure and prevents import rewriting history', async () => {
    await ready('regular')
    const before = await db.snapshot(), fail = () => { throw new Error('Simulated notification/audit failure') }
    db.entity('auditLogs').hook('creating', fail)
    denied(await act({ action: 'forward_accounting', note: 'Failed transaction' }))
    db.entity('auditLogs').hook('creating').unsubscribe(fail)
    assert.deepEqual(await db.snapshot(), before)
    const outgoing = ok(await act({ action: 'forward_accounting', note: 'Successful retry.' })).outgoing!
    const beforeReceipt = await db.snapshot()
    db.entity('auditLogs').hook('creating', fail)
    denied(await act({ action: 'accounting_receive', note: 'Failed receipt' }, accounting, outgoing.id))
    db.entity('auditLogs').hook('creating').unsubscribe(fail)
    assert.deepEqual(await db.snapshot(), beforeReceipt)
    const exported = JSON.parse(ok(await services.dataset.exportJson(admin)).json)
    exported.data.documentRouting.find((r: { id: string }) => r.id === outgoing.id).budgetHandoff.voucher.remarks = 'Rewrite authorized handoff'
    denied(await services.dataset.importJson(admin, JSON.stringify(exported)), 'conflict')
  })

  it('returns received packets to Engineering and supports Budget paperwork after physical completion', async () => {
    ok(await act({ action: 'receive', note: 'Received before return.' }))
    ok(await act({ action: 'save_voucher', voucher: { ...voucher(), reference: 'DEMO-OLD-VOUCHER' }, fund: 'regular', accountingUserId: accounting.actor.id }))
    denied(await projectAct({ action: 'return', note: 'Legacy return must not bypass Budget state.' }, budget), 'invalid_transition')
    ok(await act({ action: 'return_engineering', note: 'Engineering report requires clarification.' }))
    assert.equal((await db.entity('projects').get(projectId))!.construction!.stage, 'returned')
    assert.equal((await db.entity('documentRouting').get(sourceId))!.budgetProcessing!.status, 'returned_to_engineering')
    await upload('engineering_report', engineering)
    ok(await projectAct({ action: 'review', subject: 'construction', result: 'accepted', note: 'Rechecked plan.' })); ok(await projectAct({ action: 'review', subject: 'fund', result: 'accepted', note: 'Rechecked fund.' }))
    ok(await projectAct({ action: 'forward', note: 'Corrected Engineering packet.' }))
    const newSource = (await db.entity('documentRouting').where('projectId').equals(projectId).filter(r => r.toRole === 'budget_office' && r.workflowStatus === 'submitted').first())!
    assert.notEqual(newSource.id, sourceId); sourceId = newSource.id
    ok(await projectAct({ action: 'progress', percent: 100, note: 'Physically completed construction.' }, property)); await upload('completion_certificate', property); await upload('acceptance_report', property)
    ok(await projectAct({ action: 'complete', actualCompletionDate: today, note: 'Physical completion; not capitalization.' }, property))
    await ready('regular')
    denied(await act({ action: 'save_voucher', voucher: { ...voucher(), reference: 'demo-old-voucher' }, fund: 'regular', accountingUserId: accounting.actor.id }), 'duplicate')
    assert.equal((await db.entity('projects').get(projectId))!.projectStatus, 'completed')
    ok(await act({ action: 'forward_accounting', note: 'Post-completion Budget paperwork.' }))
  })
})
