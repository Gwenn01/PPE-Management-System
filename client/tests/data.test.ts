import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { Dexie } from 'dexie'
import type { Role } from '../src/config/roles.js'
import { roleList } from '../src/config/roles.js'
import type { MunicipalityId, User } from '../src/domain/models.js'
import type { RequestContext, ServiceResult } from '../src/services/contracts.js'
import { MockDatabase, versionOneSchema } from '../src/mock/database.js'
import { originalDataset } from '../src/mock/seeds/index.js'
import { createDemoUser } from '../src/mock/demoIdentityRepository.js'
import { entityNames, envelopeSchema } from '../src/mock/validation/schemas.js'
import { validateDataset } from '../src/mock/validation/dataset.js'
import { createMockDataServices } from '../src/services/mockDataService.js'
import type { MockDataServices } from '../src/services/mockDataService.js'
import { documentLimits } from '../src/services/documentService.js'

function success<T>(result: ServiceResult<T>): T {
  if (!result.ok) assert.fail(`${result.error.code}: ${result.error.message} ${JSON.stringify(result.error.fields ?? {})}`)
  return result.data
}
function error<T>(result: ServiceResult<T>, code: string) {
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error.code, code, JSON.stringify(result.error))
}
function context(role: Role, municipalityId: MunicipalityId = 'botolan'): RequestContext {
  const actor = createDemoUser(role, municipalityId)
  return { actor, municipalityId, sessionId: `${actor.id}-test-session` }
}
async function fixtureSession(db: MockDatabase, actor: User): Promise<RequestContext> {
  const sessionId = `${actor.id}-test-session`
  await db.sessions.put({ id: sessionId, userId: actor.id, municipalityId: actor.municipalityId, role: actor.role, issuedAt: new Date().toISOString(), expiresAt: '2099-01-01T00:00:00.000Z', remember: false })
  return { actor, municipalityId: actor.municipalityId, sessionId }
}
const admin = context('administrator'), property = context('property_officer'), accounting = context('accounting_officer'), approver = context('approving_officer')
const registrationInput = {
  proposedPropertyNumber: 'BOT-DEMO-NEW', description: 'Fictional scanner', category: 'botolan-category-ict', departmentId: 'botolan-dept-general',
  custodianId: property.actor.id, location: 'Demo records desk', acquisitionDate: '2026-10-20', acquisitionCost: 1250050, acquisitionMethod: 'purchase' as const,
}

describe('persistent mock data layer', () => {
  let db: MockDatabase
  let services: MockDataServices
  beforeEach(async () => {
    db = new MockDatabase(`ppe-test-${crypto.randomUUID()}`)
    services = createMockDataServices(db)
    success(await services.initialize())
    for (const actor of await db.entity('users').toArray()) await fixtureSession(db, actor)
  })
  afterEach(async () => { await db.delete() })

  it('validates all JSON seeds and includes all roles and relationships in both municipalities', async () => {
    const data = validateDataset(await db.snapshot())
    assert.equal(entityNames.length, 24)
    assert.equal(data.users.length, 16)
    for (const municipality of data.municipalities) for (const role of roleList) {
      assert.ok(data.users.some((user) => user.role === role && user.municipalityId === municipality.id && user.isDemo))
    }
    for (const name of entityNames) assert.ok(data[name].length > 0, name)
    assert.equal(data.assets[0].acquisitionCost, 6500000)
    assert.equal(await db.blobs.count(), 0)
    assert.equal(success(await services.entities.accountingRecords.getAll(accounting)).length, 3)
  })

  it('seeds once across simultaneous initialization and preserves edited data on reopen', async () => {
    const before = await db.entity('departments').count()
    await Promise.all([services.initialize(), services.initialize()])
    assert.equal(await db.entity('departments').count(), before)
    const changed = success(await services.entities.departments.update(admin, 'botolan-dept-general', 1, { name: 'Edited demo services' }))
    const name = db.name
    db.close()
    db = new MockDatabase(name)
    services = createMockDataServices(db)
    success(await services.initialize())
    assert.deepEqual(success(await services.entities.departments.getById(admin, changed.id)), changed)
    assert.equal(await db.entity('departments').count(), before)
  })

  it('allows two connections to initialize a new database without duplicate seeding', async () => {
    const name = `ppe-shared-${crypto.randomUUID()}`
    const first = new MockDatabase(name), second = new MockDatabase(name)
    try {
      const initialized = await Promise.all([createMockDataServices(first).initialize(), createMockDataServices(second).initialize()])
      initialized.forEach(success)
      assert.equal(await first.entity('users').count(), 16)
      assert.equal(await second.entity('assets').count(), 4)
    } finally { second.close(); await first.delete() }
  })

  it('creates, reads, updates and filters records with optimistic versions and audit events', async () => {
    const created = success(await services.entities.departments.create(admin, { code: 'DEMO-ARCHIVE', name: 'Fictional Archive', active: true }))
    assert.equal(created.version, 1)
    assert.equal(created.municipalityId, 'botolan')
    const updated = success(await services.entities.departments.update(admin, created.id, 1, { name: 'Fictional Archive Office' }))
    assert.equal(updated.version, 2)
    assert.equal(success(await services.entities.departments.getById(admin, created.id)).name, updated.name)
    const filtered = success(await services.entities.departments.getAll(property, { filters: { active: true }, search: 'archive', offset: 0, limit: 1 }))
    assert.equal(filtered.length, 1)
    assert.equal(filtered[0].id, created.id)
    error(await services.entities.departments.update(admin, created.id, 1, { name: 'Stale' }), 'conflict')
    const events = await db.entity('auditLogs').filter((row) => row.entityId === created.id).toArray()
    assert.deepEqual(events.map((row) => row.action).sort(), ['create', 'update'])
    assert.ok(events.every((row) => row.actorId === admin.actor.id && row.changes.length > 0))
    error(await services.entities.departments.getById(admin, 'missing'), 'not_found')
  })

  it('rejects natural-key duplicates, including case variants and concurrent creates, without partial writes', async () => {
    const before = await db.entity('auditLogs').count()
    error(await services.entities.departments.create(admin, { code: 'general', name: 'Duplicate case', active: true }), 'duplicate')
    assert.equal(await db.entity('auditLogs').count(), before)
    const results = await Promise.all([
      services.entities.departments.create(admin, { code: 'CONCURRENT', name: 'First', active: true }),
      services.entities.departments.create(admin, { code: 'CONCURRENT', name: 'Second', active: true }),
    ])
    assert.equal(results.filter((result) => result.ok).length, 1)
    error(results.find((result) => !result.ok)!, 'duplicate')
    assert.equal(await db.entity('auditLogs').count(), before + 1)
  })

  it('validates centavos, dates, immutable metadata, unknown fields and references', async () => {
    error(await services.entities.registrations.create(property, { ...registrationInput, acquisitionCost: 1250.25 }), 'validation')
    error(await services.entities.registrations.create(property, { ...registrationInput, acquisitionCost: -1 }), 'validation')
    error(await services.entities.registrations.create(property, { ...registrationInput, acquisitionCost: Number.MAX_SAFE_INTEGER + 1 }), 'validation')
    error(await services.entities.registrations.create(property, { ...registrationInput, acquisitionDate: '2026-02-30' }), 'validation')
    error(await services.entities.registrations.create(property, { ...registrationInput, departmentId: 'san_antonio-dept-general' }), 'validation')
    error(await services.entities.registrations.create(property, { ...registrationInput, category: 'missing' }), 'validation')
    error(await services.entities.departments.update(admin, 'botolan-dept-general', 1, { municipalityId: 'san_antonio' } as unknown as { name: string }), 'validation')
    error(await services.entities.departments.update(admin, 'botolan-dept-general', 1, { secret: 'ignored?' } as unknown as { name: string }), 'validation')
    error(await services.entities.departments.getAll(admin, { filters: { unknown: true } } as unknown as { search: string }), 'validation')
    error(await services.entities.departments.getAll(admin, { limit: -1 }), 'validation')
  })

  it('enforces role and municipality permissions inside every service call using the stored identity', async () => {
    for (const role of roleList) {
      const localContext = context(role)
      error(await services.entities.departments.getById(localContext, 'san_antonio-dept-general'), 'not_found')
      error(await services.entities.departments.getAll({ ...localContext, municipalityId: 'san_antonio' }), 'forbidden')
      error(await services.entities.departments.getAll(localContext, { filters: { municipalityId: 'san_antonio' } }), 'forbidden')
    }
    error(await services.entities.departments.create(property, { code: 'NO', name: 'Forbidden', active: true }), 'forbidden')
    error(await services.entities.registrations.create(context('auditor'), registrationInput), 'forbidden')
    error(await services.entities.departments.update({ ...admin, actor: { ...property.actor, role: 'administrator' } }, 'botolan-dept-general', 1, { name: 'Spoofed' }), 'forbidden')
    error(await services.entities.departments.getAll({ ...admin, actor: { ...admin.actor, id: 'invented' } }), 'forbidden')
    success(await services.users.changeStatus(admin, property.actor.id, 1, 'disabled'))
    error(await services.entities.registrations.getAll(property), 'forbidden')
    error(await services.users.changeStatus(admin, admin.actor.id, 1, 'disabled'), 'validation')
  })

  it('exposes only appropriate capabilities and keeps audit/posting/asset writes private', () => {
    for (const name of ['assets', 'accountingRecords', 'municipalities', 'permissions', 'documents', 'approvals', 'notifications', 'auditLogs'] as const) {
      assert.equal('create' in services.entities[name], false, name)
      assert.equal('update' in services.entities[name], false, name)
    }
    assert.equal('submit' in services.entities.departments, false)
    assert.equal('submit' in services.entities.registrations, true)
  })

  async function attachRegistrationDocuments(id: string) {
    for (const documentType of ['purchase_order', 'inspection_acceptance_report', 'property_acknowledgement_receipt'] as const) {
      success(await services.documents.upload(property, { entityType: 'registration', entityId: id, documentType, fileName: documentType + '.pdf', file: new Blob(['%PDF-1.7 Demo'], { type: 'application/pdf' }) }))
    }
    return (await db.entity('registrations').get(id))!
  }

  it('submits requests and creates linked approvals, notifications and audits atomically', async () => {
    const draft = success(await services.entities.registrations.create(property, registrationInput))
    const attached = await attachRegistrationDocuments(draft.id)
    const submitted = success(await services.entities.registrations.submit(property, draft.id, attached.version))
    assert.equal(submitted.workflowStatus, 'submitted')
    const approval = (await db.entity('approvals').where('subjectId').equals(draft.id).toArray())[0]
    assert.equal(approval.workflowStatus, 'submitted')
    assert.equal(approval.history[0].action, 'submit')
    const events = await db.entity('auditLogs').where('transactionId').equals((await db.entity('auditLogs').filter((row) => row.entityId === draft.id && row.action === 'submit').first())!.transactionId).toArray()
    assert.deepEqual(events.map((event) => event.resource).sort(), ['approvals', 'notifications', 'registrations'])
    error(await services.entities.registrations.submit(property, draft.id, submitted.version), 'invalid_transition')
    error(await services.entities.registrations.update(property, draft.id, submitted.version, { description: 'Edit after submission' }), 'invalid_transition')
  })

  it('reviews, returns and resubmits with consistent histories and source record versions', async () => {
    const approvalId = 'botolan-approval-registration'
    error(await services.approvals.changeStatus(property, approvalId, 1, 'approved', ''), 'forbidden')
    error(await services.approvals.changeStatus(approver, approvalId, 1, 'returned', ''), 'validation')
    const review = success(await services.approvals.changeStatus(approver, approvalId, 1, 'under_review', 'Reviewing demo details'))
    assert.equal(review.history.at(-1)!.action, 'review')
    const returned = success(await services.approvals.changeStatus(approver, approvalId, 2, 'returned', 'Provide demo acquisition details'))
    assert.equal(returned.history.at(-1)!.action, 'return')
    const source = success(await services.entities.registrations.getById(property, returned.subjectId))
    assert.equal(source.workflowStatus, 'returned')
    success(await services.entities.registrations.update(property, source.id, source.version, { description: 'Corrected fictional tablet details' }))
    const corrected = await attachRegistrationDocuments(source.id)
    success(await services.entities.registrations.submit(property, source.id, corrected.version))
    const resubmitted = (await db.entity('approvals').get(approvalId))!
    const approved = success(await services.approvals.changeStatus(approver, approvalId, resubmitted.version, 'approved', 'Demo review complete'))
    assert.equal(approved.history.at(-1)!.action, 'approve')
    assert.equal((await db.entity('registrations').get(source.id))!.workflowStatus, 'approved')
    error(await services.approvals.changeStatus(approver, approvalId, approved.version, 'returned', 'Too late'), 'invalid_transition')
    assert.ok((await db.entity('registrations').get(source.id))!.recognizedAssetId)
  })

  it('cancels linked approvals consistently and rejects unsupported direct approval transitions', async () => {
    error(await services.entities.transfers.changeStatus(property, 'botolan-transfer-pump', 1, 'approved', 'Bypass'), 'invalid_transition')
    const cancelled = success(await services.entities.transfers.changeStatus(property, 'botolan-transfer-pump', 1, 'cancelled', 'Demo withdrawal'))
    assert.equal(cancelled.workflowStatus, 'cancelled')
    assert.equal((await db.entity('approvals').get('botolan-approval-transfer'))!.workflowStatus, 'cancelled')
    error(await services.entities.transfers.submit(property, cancelled.id, cancelled.version), 'invalid_transition')
  })

  it('prevents self-approval and stale concurrent approval decisions', async () => {
    const user = (await db.entity('users').get(property.actor.id))!
    await db.entity('users').put({ ...user, role: 'approving_officer' }) // Test fixture: requester later changes role.
    error(await services.approvals.changeStatus(await fixtureSession(db, { ...user, role: 'approving_officer' }), 'botolan-approval-registration', 1, 'approved', 'Self'), 'forbidden')
    const results = await Promise.all([
      services.approvals.changeStatus(approver, 'botolan-approval-transfer', 1, 'approved', 'Approve'),
      services.approvals.changeStatus(approver, 'botolan-approval-transfer', 1, 'rejected', 'Reject'),
    ])
    assert.equal(results.filter((result) => result.ok).length, 1)
    error(results.find((result) => !result.ok)!, 'conflict')
  })

  it('rolls back every table and audit event when a batch command fails', async () => {
    const before = await db.snapshot()
    error(await services.batch(admin, [
      { entity: 'departments', operation: 'update', id: 'botolan-dept-general', expectedVersion: 1, changes: { name: 'Must roll back' } },
      { entity: 'departments', operation: 'create', input: { code: 'GENERAL', name: 'Duplicate', active: true } },
    ]), 'duplicate')
    assert.deepEqual(await db.snapshot(), before)
    success(await services.batch(admin, [
      { entity: 'departments', operation: 'update', id: 'botolan-dept-general', expectedVersion: 1, changes: { name: 'Committed general' } },
      { entity: 'departments', operation: 'update', id: 'botolan-dept-budget', expectedVersion: 1, changes: { name: 'Committed budget' } },
    ]))
    const events = await db.entity('auditLogs').filter((row) => row.action === 'update').toArray()
    assert.equal(events.length, 2)
    assert.equal(events[0].transactionId, events[1].transactionId)
  })

  it('returns validation errors for malformed batches and does not repair missing metadata by reseeding', async () => {
    error(await services.batch(admin, []), 'validation')
    error(await services.batch(admin, [null] as unknown as Parameters<typeof services.batch>[1]), 'validation')
    const count = await db.entity('departments').count()
    await db.metadata.delete('state')
    error(await services.initialize(), 'storage_unavailable')
    assert.equal(await db.entity('departments').count(), count)
  })

  it('rolls back submissions when audit persistence fails and returns storage errors', async () => {
    const before = await db.snapshot()
    const fail = () => { throw new Error('Simulated quota failure') }
    db.entity('auditLogs').hook('creating', fail)
    error(await services.entities.transfers.changeStatus(property, 'botolan-transfer-pump', 1, 'cancelled', 'Cannot persist audit'), 'storage_unavailable')
    db.entity('auditLogs').hook('creating').unsubscribe(fail)
    assert.deepEqual(await db.snapshot(), before)
    db.close()
    error(await services.entities.departments.getAll(admin), 'storage_unavailable')
  })

  it('scopes personal notifications and audits mark-read mutations', async () => {
    assert.equal(success(await services.entities.notifications.getAll(property)).length, 0)
    error(await services.notifications.markRead(property, 'botolan-notification-approval', 1), 'not_found')
    const notification = success(await services.notifications.markRead(approver, 'botolan-notification-approval', 1))
    assert.ok(notification.readAt)
    assert.equal((await db.entity('auditLogs').filter((row) => row.entityId === notification.id && row.action === 'markRead').toArray()).length, 1)
  })

  it('exports scoped JSON records and imports validated changes while preserving the other municipality', async () => {
    const otherBefore = success(await services.dataset.exportJson(context('administrator', 'san_antonio')))
    const exported = success(await services.dataset.exportJson(admin))
    const envelope = envelopeSchema.parse(JSON.parse(exported.json))
    assert.equal(envelope.attachmentsIncluded, false)
    assert.equal(envelope.data.municipalities.length, 1)
    assert.equal(envelope.data.users.length, 8)
    envelope.data.departments[0].name = 'Imported demo department'
    success(await services.dataset.importJson(admin, JSON.stringify(envelope)))
    assert.equal((await db.entity('departments').get(envelope.data.departments[0].id))!.name, 'Imported demo department')
    const otherAfter = success(await services.dataset.exportJson(context('administrator', 'san_antonio')))
    assert.deepEqual(JSON.parse(otherAfter.json).data, JSON.parse(otherBefore.json).data)
    // A fresh export remains importable even after locally generated audit records.
    await fixtureSession(db, (await db.entity('users').get(admin.actor.id))!)
    success(await services.dataset.importJson(admin, success(await services.dataset.exportJson(admin)).json))
  })

  it('rejects corrupt, cross-municipality, duplicate, invalid-policy and orphaned imports atomically', async () => {
    const original = success(await services.dataset.exportJson(admin)).json
    const before = await db.snapshot()
    error(await services.dataset.importJson(admin, '{ broken'), 'validation')
    error(await services.dataset.importJson(property, original), 'forbidden')
    error(await services.dataset.importJson(context('administrator', 'san_antonio'), original), 'forbidden')
    const invalid = envelopeSchema.parse(JSON.parse(original))
    invalid.data.assets[0].departmentId = 'missing'
    error(await services.dataset.importJson(admin, JSON.stringify(invalid)), 'validation')
    const duplicate = envelopeSchema.parse(JSON.parse(original))
    duplicate.data.assets.push(duplicate.data.assets[0])
    error(await services.dataset.importJson(admin, JSON.stringify(duplicate)), 'duplicate')
    const permissions = envelopeSchema.parse(JSON.parse(original))
    permissions.data.permissions.pop()
    error(await services.dataset.importJson(admin, JSON.stringify(permissions)), 'validation')
    const history = envelopeSchema.parse(JSON.parse(original))
    history.data.auditLogs[0].reason = 'Rewrite history'
    error(await services.dataset.importJson(admin, JSON.stringify(history)), 'conflict')
    assert.deepEqual(await db.snapshot(), before)
  })

  it('requires a fresh identity-bound exact reset confirmation and restores only local seed records', async () => {
    success(await services.entities.departments.update(admin, 'botolan-dept-general', 1, { name: 'Modified before reset' }))
    const otherBefore = (await db.snapshot()).departments.filter((row) => row.municipalityId === 'san_antonio')
    const preview = success(await services.dataset.prepareReset(admin))
    error(await services.dataset.reset(admin, { confirmationId: preview.confirmationId, confirmationText: 'yes' }), 'validation')
    error(await services.dataset.reset(context('administrator', 'san_antonio'), { confirmationId: preview.confirmationId, confirmationText: preview.confirmationText }), 'validation')
    success(await services.dataset.reset(admin, { confirmationId: preview.confirmationId, confirmationText: preview.confirmationText }))
    assert.equal((await db.entity('departments').get('botolan-dept-general'))!.name, 'Demo General Services')
    assert.equal((await db.entity('departments').get('botolan-dept-general'))!.version, 3)
    assert.deepEqual((await db.snapshot()).departments.filter((row) => row.municipalityId === 'san_antonio'), otherBefore)
    assert.ok(await db.entity('auditLogs').filter((row) => row.action === 'reset').count())
    error(await services.dataset.reset(admin, { confirmationId: preview.confirmationId, confirmationText: preview.confirmationText }), 'validation')
    error(await services.dataset.prepareReset(property), 'forbidden')
  })

  it('rejects stale reset previews and preserves audit history across seed reset', async () => {
    const preview = success(await services.dataset.prepareReset(admin))
    const created = success(await services.entities.departments.create(admin, { code: 'EXTRA', name: 'Remove on reset', active: true }))
    error(await services.dataset.reset(admin, { confirmationId: preview.confirmationId, confirmationText: preview.confirmationText }), 'conflict')
    const fresh = success(await services.dataset.prepareReset(admin))
    success(await services.dataset.reset(admin, { confirmationId: fresh.confirmationId, confirmationText: fresh.confirmationText }))
    assert.equal(await db.entity('departments').get(created.id), undefined)
    assert.equal(await db.entity('auditLogs').filter((row) => row.entityId === created.id).count(), 2)
  })

  it('rejects expired reset confirmations without changing any records', async () => {
    const preview = success(await services.dataset.prepareReset(admin))
    const before = await db.snapshot()
    const realNow = Date.now
    try {
      Date.now = () => Date.parse(preview.expiresAt) + 1
      error(await services.dataset.reset(admin, { confirmationId: preview.confirmationId, confirmationText: preview.confirmationText }), 'validation')
    } finally { Date.now = realNow }
    assert.deepEqual(await db.snapshot(), before)
  })

  it('archives removed historical actors during reset so their audit records remain resolvable', async () => {
    const actor = success(await services.administration.createUser(admin, { name: 'Fictional Temporary Officer', username: 'temporary_officer', email: 'temporary@example.com', role: 'property_officer', departmentId: 'botolan-dept-general' }))
    const request = success(await services.entities.registrations.create(await fixtureSession(db, actor), registrationInput))
    const preview = success(await services.dataset.prepareReset(admin))
    success(await services.dataset.reset(admin, { confirmationId: preview.confirmationId, confirmationText: preview.confirmationText }))
    assert.equal(await db.entity('registrations').get(request.id), undefined)
    const archived = (await db.entity('users').get(actor.id))!
    assert.equal(archived.status, 'disabled')
    assert.equal(archived.departmentId, null)
    assert.ok(archived.name.includes('archived'))
    assert.ok(await db.entity('auditLogs').filter((row) => row.actorId === actor.id).count())
    validateDataset(await db.snapshot())
  })

  it('stamps the inventory observer and prevents a second check for the same session and asset', async () => {
    const inventory = context('inventory_personnel')
    const input = { sessionId: 'botolan-inventory-october', assetId: 'botolan-asset-2', found: true, observedLocation: 'Demo equipment store', observedCustodianId: property.actor.id, observedCondition: 'good' as const, notes: 'Fictional observation' }
    const check = success(await services.entities.inventoryChecks.create(inventory, input))
    assert.equal(check.checkedById, inventory.actor.id)
    assert.ok(check.checkedAt)
    error(await services.entities.inventoryChecks.create(inventory, input), 'duplicate')
    error(await services.entities.inventoryChecks.create(inventory, { ...input, checkedById: admin.actor.id } as unknown as typeof input), 'validation')
  })

  it('rejects inconsistent CIP/accounting links on dataset import', async () => {
    const envelope = envelopeSchema.parse(JSON.parse(success(await services.dataset.exportJson(admin)).json))
    envelope.data.cipCosts[0].accountingRecordId = 'botolan-account-recognition-1'
    error(await services.dataset.importJson(admin, JSON.stringify(envelope)), 'validation')
  })

  it('rejects fabricated approval permissions, broken history sequences and missing approval records', async () => {
    const exported = success(await services.dataset.exportJson(admin)).json
    const permissions = envelopeSchema.parse(JSON.parse(exported))
    permissions.data.approvals[0].history[0].actorRole = 'auditor'
    error(await services.dataset.importJson(admin, JSON.stringify(permissions)), 'validation')
    const sequence = envelopeSchema.parse(JSON.parse(exported))
    sequence.data.approvals[0].history[0].fromStatus = 'approved'
    error(await services.dataset.importJson(admin, JSON.stringify(sequence)), 'validation')
    const orphaned = envelopeSchema.parse(JSON.parse(exported))
    orphaned.data.approvals = []
    error(await services.dataset.importJson(admin, JSON.stringify(orphaned)), 'validation')
  })

  it('stores validated files atomically with metadata and owner links, and persists blobs on reopen', async () => {
    const engineer = context('engineering_office')
    const file = new Blob(['%PDF-1.7\nFictional demo file'], { type: 'application/pdf' })
    const document = success(await services.documents.upload(engineer, { fileName: 'demo-plan.pdf', file, entityType: 'project', entityId: 'botolan-project-hall' }))
    assert.ok((await db.entity('projects').get('botolan-project-hall'))!.documentIds.includes(document.id))
    const downloaded = success(await services.documents.download(engineer, document.id))
    assert.equal(await downloaded.file.text(), await file.text())
    const dbName = db.name
    db.close()
    db = new MockDatabase(dbName)
    services = createMockDataServices(db)
    success(await services.initialize())
    assert.equal(await success(await services.documents.download(engineer, document.id)).file.text(), await file.text())
    const exportData = success(await services.dataset.exportJson(admin))
    assert.equal(JSON.parse(exportData.json).attachmentsIncluded, false)
    success(await services.dataset.importJson(admin, exportData.json))
    await fixtureSession(db, (await db.entity('users').get(engineer.actor.id))!)
    assert.equal(await success(await services.documents.download(engineer, document.id)).file.text(), await file.text())
  })

  it('validates file size, content, extension, owner scope and draft state without orphan blobs', async () => {
    const engineer = context('engineering_office')
    const upload = { fileName: 'demo-plan.pdf', file: new Blob(['%PDF-1.7 Demo'], { type: 'application/pdf' }), entityType: 'project' as const, entityId: 'botolan-project-hall' }
    error(await services.documents.upload(engineer, { ...upload, file: new Blob(['invalid'], { type: 'application/pdf' }) }), 'validation')
    error(await services.documents.upload(engineer, { ...upload, file: new Blob([], { type: 'application/pdf' }) }), 'validation')
    error(await services.documents.upload(engineer, { ...upload, file: new Blob([new Uint8Array(documentLimits.maxBytes + 1)], { type: 'application/pdf' }) }), 'validation')
    error(await services.documents.upload(engineer, { ...upload, fileName: 'plan.exe' }), 'validation')
    error(await services.documents.upload(engineer, { ...upload, fileName: '../plan.pdf' }), 'validation')
    error(await services.documents.upload(engineer, { ...upload, entityId: 'san_antonio-project-hall' }), 'not_found')
    error(await services.documents.upload(context('auditor'), upload), 'forbidden')
    error(await services.documents.upload(property, { ...upload, entityType: 'registration', documentType: 'purchase_order', entityId: 'botolan-registration-pending' }), 'invalid_transition')
    error(await services.documents.download(engineer, 'botolan-document-plan'), 'not_found')
    assert.equal(await db.blobs.count(), 0)
    assert.equal(await db.entity('documents').count(), 2)
  })

  it('clears uploaded files only after a confirmed scoped reset and preserves their audit history', async () => {
    const engineer = context('engineering_office')
    const document = success(await services.documents.upload(engineer, { fileName: 'plan.pdf', file: new Blob(['%PDF-1.7 Demo'], { type: 'application/pdf' }), entityType: 'project', entityId: 'botolan-project-hall' }))
    const preview = success(await services.dataset.prepareReset(admin))
    assert.equal(preview.attachmentCount, 1)
    assert.ok(preview.warning.includes('uploaded files'))
    error(await services.dataset.reset(admin, { confirmationId: preview.confirmationId, confirmationText: 'no' }), 'validation')
    assert.equal(await db.blobs.count(), 1)
    success(await services.dataset.reset(admin, { confirmationId: preview.confirmationId, confirmationText: preview.confirmationText }))
    assert.equal(await db.blobs.count(), 0)
    assert.equal(await db.entity('documents').get(document.id), undefined)
    assert.equal(await db.entity('auditLogs').filter((row) => row.entityId === document.id).count(), 2)
  })

  it('rolls back metadata, file storage and parent updates when upload auditing fails', async () => {
    const before = await db.snapshot()
    const fail = () => { throw new Error('Audit unavailable') }
    db.entity('auditLogs').hook('creating', fail)
    error(await services.documents.upload(context('engineering_office'), { fileName: 'plan.pdf', file: new Blob(['%PDF-1.7 Demo'], { type: 'application/pdf' }), entityType: 'project', entityId: 'botolan-project-hall' }), 'storage_unavailable')
    db.entity('auditLogs').hook('creating').unsubscribe(fail)
    assert.equal(await db.blobs.count(), 0)
    assert.deepEqual(await db.snapshot(), before)
  })
})

describe('versioned schema migration', () => {
  it('upgrades v1 records in place without reapplying seed data', async () => {
    const name = `ppe-v1-${crypto.randomUUID()}`
    const legacy = new Dexie(name)
    legacy.version(1).stores(versionOneSchema)
    await legacy.open()
    await legacy.table('departments').add({ ...originalDataset().departments[0], name: 'Kept from v1' })
    await legacy.table('metadata').add({ id: 'state', schemaVersion: 1, seedVersion: 1, revision: 7 })
    legacy.close()
    const upgraded = new MockDatabase(name)
    try {
      await upgraded.open()
      assert.equal(await upgraded.entity('departments').count(), 1)
      assert.equal((await upgraded.entity('departments').toArray())[0].name, 'Kept from v1')
      assert.equal(await upgraded.entity('users').count(), 0)
      assert.equal(await upgraded.blobs.count(), 0)
      assert.deepEqual(await upgraded.metadata.get('state'), { id: 'state', schemaVersion: 3, seedVersion: 1, revision: 7 })
    } finally { await upgraded.delete() }
  })
})
