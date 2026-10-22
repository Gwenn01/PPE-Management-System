import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { beforeEach, afterEach, describe, it } from 'node:test'
import { MockDatabase } from '../src/mock/database.js'
import { createMockDataServices, type MockDataServices } from '../src/services/mockDataService.js'
import type { RequestContext, ServiceResult } from '../src/services/contracts.js'
import type { ConstructionCommand, ConstructionDraft } from '../src/services/constructionService.js'
import type { ProjectDocumentType } from '../src/domain/construction.js'
import type { Role } from '../src/config/roles.js'
import { createDashboardService } from '../src/services/dashboardService.js'

function ok<T>(r: ServiceResult<T>): T { if (!r.ok) assert.fail(JSON.stringify(r.error)); return r.data }
function denied<T>(r: ServiceResult<T>, code?: string) { assert.equal(r.ok, false); if (!r.ok && code) assert.equal(r.error.code, code, r.error.message) }

describe('construction registration and assigned Engineering processing', () => {
  let db: MockDatabase, services: MockDataServices, property: RequestContext, engineering: RequestContext, budget: RequestContext, admin: RequestContext
  let draft: ConstructionDraft
  async function context(role: Role, municipalityId = 'botolan') {
    const actor = (await db.entity('users').toArray()).find(u => u.role === role && u.municipalityId === municipalityId)!
    return session(actor)
  }
  async function session(actor: RequestContext['actor']) {
    const sessionId = crypto.randomUUID()
    await db.sessions.add({ id: sessionId, userId: actor.id, municipalityId: actor.municipalityId, role: actor.role, issuedAt: new Date().toISOString(), expiresAt: '2099-01-01T00:00:00.000Z', remember: false })
    return { actor, municipalityId: actor.municipalityId, sessionId }
  }
  async function upload(id: string, type: ProjectDocumentType, ctx = property) {
    return ok(await services.documents.upload(ctx, { entityType: 'project', entityId: id, projectDocumentType: type, fileName: `${type}.txt`, file: new Blob(['Fictional Phase 09 demonstration evidence; no real municipal authorization.'], { type: 'text/plain' }) }))
  }
  async function act(id: string, command: ConstructionCommand, ctx = property) {
    const row = (await db.entity('projects').get(id))!
    return services.construction.act(ctx, id, row.version, command)
  }
  async function received() {
    const p = ok(await services.construction.create(property, draft))
    await upload(p.id, 'mpdo_proposal')
    ok(await act(p.id, { action: 'proposal', note: 'External MPDO proposal demonstration recorded.' }))
    await upload(p.id, 'mayor_authorization_simulation')
    ok(await act(p.id, { action: 'simulate_mayor', note: 'Simulated external authorization only.' }))
    ok(await act(p.id, { action: 'receive', note: 'Received evidence-backed demo project.' }, engineering))
    return p.id
  }
  async function processed(id: string) {
    await upload(id, 'construction_plan', engineering); await upload(id, 'availability_of_fund', engineering)
    ok(await act(id, { action: 'review', subject: 'construction', result: 'accepted', note: 'Technical plan reviewed.' }, engineering))
    ok(await act(id, { action: 'review', subject: 'fund', result: 'accepted', note: 'Availability of Fund reviewed.' }, engineering))
  }
  beforeEach(async () => {
    db = new MockDatabase(`construction-${crypto.randomUUID()}`); services = createMockDataServices(db); ok(await services.initialize())
    property = await context('property_officer'); engineering = await context('engineering_office'); budget = await context('budget_office'); admin = await context('administrator')
    draft = { name: 'Fictional community facility', projectNumber: 'DEMO-P09-001', location: 'Demo municipal site', departmentId: 'botolan-dept-general', budgetAmount: 123456789, contractor: 'Fictional contractor', startDate: '2026-01-15', expectedCompletionDate: '2026-10-20', engineeringUserId: engineering.actor.id, budgetUserId: budget.actor.id }
  })
  afterEach(async () => { await db.delete() })

  it('validates project fields, money, dates, assignments, duplicate reference and role', async () => {
    for (const change of [{ budgetAmount: 0 }, { budgetAmount: -1 }, { budgetAmount: 1.5 }, { budgetAmount: Number.MAX_SAFE_INTEGER + 1 }, { name: ' ' }, { contractor: '' }, { expectedCompletionDate: '2025-01-01' }, { startDate: '2026-02-30' }, { engineeringUserId: property.actor.id }, { budgetUserId: 'demo-san_antonio-budget_office' }, { departmentId: 'san_antonio-dept-general' }]) denied(await services.construction.create(property, { ...draft, ...change }), 'validation')
    denied(await services.construction.create(engineering, draft), 'forbidden')
    const p = ok(await services.construction.create(property, draft))
    assert.equal(p.municipalityId, 'botolan'); assert.equal(p.budgetAmount, 123456789); assert.equal(p.construction!.stage, 'awaiting_proposal')
    denied(await services.construction.create(property, { ...draft, projectNumber: 'demo-p09-001' }), 'duplicate')
    denied(await services.entities.projects.create(property, { projectNumber: 'BYPASS', name: 'Bypass', departmentId: draft.departmentId, location: 'Desk', budgetAmount: 100, startDate: draft.startDate, completionDate: null }), 'forbidden')
    denied(await services.entities.projects.update(property, p.id, p.version, { name: 'Bypass' }), 'forbidden')
    denied(await services.entities.projects.submit(property, p.id, p.version), 'forbidden')
    denied(await services.entities.documentRouting.update(engineering, 'botolan-routing-plan', 1, { projectId: p.id }), 'forbidden')
  })

  it('requires real stored evidence and ordered, explicitly labeled external simulations', async () => {
    const p = ok(await services.construction.create(property, draft))
    denied(await act(p.id, { action: 'simulate_mayor', note: 'Skip proposal' }), 'invalid_transition')
    denied(await act(p.id, { action: 'proposal', note: 'No evidence' }), 'validation')
    denied(await act(p.id, { action: 'receive', note: 'Premature' }, engineering), 'invalid_transition')
    denied(await services.documents.upload(property, { entityType: 'project', entityId: p.id, fileName: 'plan.pdf', file: new Blob(['invalid'], { type: 'application/pdf' }), projectDocumentType: 'construction_plan' }), 'validation')
    denied(await services.documents.upload(property, { entityType: 'project', entityId: p.id, fileName: 'empty.txt', file: new Blob([], { type: 'text/plain' }), projectDocumentType: 'mpdo_proposal' }), 'validation')
    denied(await services.documents.upload(property, { entityType: 'project', entityId: p.id, fileName: 'untyped.txt', file: new Blob(['Demo'], { type: 'text/plain' }) }), 'validation')
    const doc = await upload(p.id, 'mpdo_proposal')
    const blob = (await db.blobs.get(doc.storageKey))!
    await db.blobs.delete(doc.storageKey)
    denied(await act(p.id, { action: 'proposal', note: 'Metadata only' }), 'validation')
    await db.blobs.add(blob)
    ok(await act(p.id, { action: 'proposal', note: 'External proposal evidence recorded.' }))
    denied(await act(p.id, { action: 'simulate_mayor', note: 'Missing authorization' }), 'validation')
    await upload(p.id, 'mayor_authorization_simulation')
    ok(await act(p.id, { action: 'simulate_mayor', note: 'Fictional external-stage demo.' }))
    const current = (await db.entity('projects').get(p.id))!
    assert.match(current.construction!.timeline.at(-1)!.note, /not a real Mayor approval/)
    assert.equal(current.workflowStatus, 'draft')
    assert.equal((await db.entity('approvals').where('subjectId').equals(p.id).count()), 0)
  })

  it('enforces assignment and municipality scope across overview, generic reads, document access and commands', async () => {
    const id = await received(), doc = await upload(id, 'progress_report')
    const otherUser = ok(await services.administration.createUser(admin, { name: 'Other Engineer', username: 'other.engineer', email: 'other.engineer@example.test', role: 'engineering_office', departmentId: draft.departmentId }))
    const other = await session(otherUser), otherMunicipality = await context('engineering_office', 'san_antonio')
    for (const ctx of [other, otherMunicipality]) {
      assert.ok(!ok(await services.construction.overview(ctx, 'engineering')).projects.some(p => p.id === id))
      denied(await services.entities.projects.getById(ctx, id), 'not_found')
      denied(await services.documents.download(ctx, doc.id), 'not_found')
      denied(await act(id, { action: 'receive', note: 'Unauthorized' }, ctx), 'not_found')
      denied(await services.documents.upload(ctx, { entityType: 'project', entityId: id, projectDocumentType: 'progress_report', fileName: 'private.txt', file: new Blob(['Demo'], { type: 'text/plain' }) }), 'not_found')
      assert.ok(!ok(await createDashboardService(db).getSnapshot(ctx)).records.some(r => r.title === draft.name))
    }
    assert.ok(!ok(await services.construction.overview(budget)).projects.some(p => p.id === id))
    denied(await services.documents.download(budget, doc.id), 'not_found')
    const grant = (await db.entity('permissions').where('[municipalityId+role]').equals(['botolan', 'engineering_office']).toArray()).find(p => p.resource === 'engineering_documents' && p.action === 'update')!
    await db.entity('permissions').delete(grant.id)
    denied(await act(id, { action: 'progress', note: 'Revoked grant', percent: 50 }, engineering), 'forbidden')
  })

  it('records reviews and progress, forwards immutable packets, handles returns and survives refresh', async () => {
    const id = await received()
    denied(await act(id, { action: 'forward', note: 'Incomplete' }, engineering), 'invalid_transition')
    denied(await act(id, { action: 'review', subject: 'fund', result: 'accepted', note: 'Missing fund document' }, engineering), 'validation')
    await processed(id)
    denied(await act(id, { action: 'forward', note: 'No engineering progress' }, engineering), 'validation')
    await upload(id, 'progress_report', engineering)
    denied(await act(id, { action: 'progress', note: '', percent: 10 }, engineering), 'validation')
    denied(await act(id, { action: 'progress', note: 'Invalid', percent: 101 }, engineering), 'validation')
    ok(await act(id, { action: 'progress', note: 'Site implementation check', percent: 35 }, engineering))
    denied(await act(id, { action: 'progress', note: 'Cannot silently decrease', percent: 20 }), 'validation')
    denied(await act(id, { action: 'forward', note: 'Missing report' }, engineering), 'validation')
    denied(await services.documents.upload(property, { entityType: 'project', entityId: id, projectDocumentType: 'engineering_report', fileName: 'report.txt', file: new Blob(['Demo'], { type: 'text/plain' }) }), 'forbidden')
    await upload(id, 'engineering_report', engineering)
    const beforeForward = await db.snapshot(), failForward = () => { throw new Error('Simulated forwarding audit failure') }
    db.entity('auditLogs').hook('creating', failForward)
    denied(await act(id, { action: 'forward', note: 'Rollback forwarding' }, engineering))
    db.entity('auditLogs').hook('creating').unsubscribe(failForward)
    assert.deepEqual(await db.snapshot(), beforeForward)
    ok(await act(id, { action: 'forward', note: 'Reviewed construction and fund documents sent for Budget processing.' }, engineering))
    const packet = (await db.entity('documentRouting').where('projectId').equals(id).first())!
    assert.equal(packet.toRole, 'budget_office'); assert.equal(packet.assignedUserId, budget.actor.id)
    assert.ok(ok(await services.construction.overview(budget, 'budget')).projects.some(p => p.id === id))
    denied(await act(id, { action: 'forward', note: 'Duplicate' }, engineering), 'invalid_transition')
    ok(await act(id, { action: 'return', note: 'Please clarify the fund reference.' }, budget))
    assert.equal((await db.entity('documentRouting').get(packet.id))!.workflowStatus, 'returned')
    const originalIds = [...packet.documentIds]
    await upload(id, 'availability_of_fund', engineering)
    denied(await act(id, { action: 'forward', note: 'Reviews reset' }, engineering), 'invalid_transition')
    ok(await act(id, { action: 'review', subject: 'fund', result: 'accepted', note: 'Corrected fund reference reviewed.' }, engineering))
    ok(await act(id, { action: 'review', subject: 'construction', result: 'accepted', note: 'Construction rechecked.' }, engineering))
    ok(await act(id, { action: 'forward', note: 'Resubmitted clarified packet.' }, engineering))
    assert.deepEqual((await db.entity('documentRouting').get(packet.id))!.documentIds, originalIds)
    assert.equal(await db.entity('documentRouting').where('projectId').equals(id).count(), 2)
    db.close(); await db.open(); services = createMockDataServices(db)
    const persisted = ok(await services.construction.overview(engineering, 'engineering')).projects.find(p => p.id === id)!
    assert.equal(persisted.construction!.stage, 'forwarded'); assert.equal(persisted.construction!.progressPercent, 35)
    assert.ok(persisted.construction!.timeline.some(e => e.action === 'return' && e.note.includes('fund reference')))
    assert.equal(persisted.capitalizedAssetId, null)
    assert.equal(await db.entity('accountingRecords').where('projectId').equals(id).count(), 0)
  })

  it('requires completion evidence and accepted processing, prevents stale updates and rolls back failures', async () => {
    const id = await received(); await processed(id); await upload(id, 'progress_report')
    denied(await act(id, { action: 'complete', note: 'Not at 100%', actualCompletionDate: '2026-10-20' }), 'validation')
    const stale = (await db.entity('projects').get(id))!
    ok(await act(id, { action: 'progress', note: 'Property monitoring: work completed.', percent: 100 }))
    denied(await services.construction.act(property, id, stale.version, { action: 'progress', note: 'Stale version', percent: 100 }), 'conflict')
    denied(await act(id, { action: 'complete', note: 'Missing evidence', actualCompletionDate: '2026-10-20' }), 'validation')
    await upload(id, 'completion_certificate'); await upload(id, 'acceptance_report')
    denied(await act(id, { action: 'complete', note: 'Invalid actual date', actualCompletionDate: '2025-12-31' }), 'validation')
    denied(await act(id, { action: 'complete', note: 'Future date', actualCompletionDate: '2099-01-01' }), 'validation')
    const before = await db.snapshot(), failAudit = () => { throw new Error('Simulated audit persistence failure') }
    db.entity('auditLogs').hook('creating', failAudit)
    denied(await act(id, { action: 'complete', note: 'Completion and acceptance submitted.', actualCompletionDate: '2026-10-20' }))
    db.entity('auditLogs').hook('creating').unsubscribe(failAudit)
    assert.deepEqual(await db.snapshot(), before)
    const completed = ok(await act(id, { action: 'complete', note: 'Completion and acceptance evidence submitted.', actualCompletionDate: '2026-10-20' }))
    assert.equal(completed.projectStatus, 'completed'); assert.equal(completed.completionDate, '2026-10-20'); assert.equal(completed.capitalizedAssetId, null)
    assert.equal(await db.entity('assets').filter(a => a.constructionProjectId === id).count(), 0)
    denied(await act(id, { action: 'progress', note: 'Closed', percent: 100 }), 'invalid_transition')
    denied(await services.documents.upload(property, { entityType: 'project', entityId: id, projectDocumentType: 'progress_report', fileName: 'closed.txt', file: new Blob(['Demo'], { type: 'text/plain' }) }), 'invalid_transition')
    const exported = JSON.parse(ok(await services.dataset.exportJson(admin)).json)
    exported.data.projects.find((p: { id: string }) => p.id === id).construction.contractor = 'Rewrite history'
    denied(await services.dataset.importJson(admin, JSON.stringify(exported)), 'conflict')
  })
})
