import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { MockDatabase } from '../src/mock/database.js'
import { createMockDataServices, type MockDataServices } from '../src/services/mockDataService.js'
import type { RequestContext, ServiceResult } from '../src/services/contracts.js'
import type { Role } from '../src/config/roles.js'
import type { InventoryCheckInput } from '../src/services/inventoryService.js'
import { normalizePropertyCode } from '../src/domain/inventory.js'
import { validateDataset } from '../src/mock/validation/dataset.js'

function ok<T>(r: ServiceResult<T>): T { if (!r.ok) assert.fail(JSON.stringify(r.error)); return r.data }
function denied<T>(r: ServiceResult<T>, code?: string) { assert.equal(r.ok, false); if (!r.ok && code) assert.equal(r.error.code, code, r.error.message) }
describe('Physical inventory, investigation and authorized correction', () => {
  let db: MockDatabase, services: MockDataServices, inventory: RequestContext, property: RequestContext, approver: RequestContext, admin: RequestContext, sid: string
  async function context(role: Role, municipalityId = 'botolan') {
    const actor = (await db.entity('users').toArray()).find(u => u.role === role && u.municipalityId === municipalityId)!, sessionId = crypto.randomUUID()
    await db.sessions.add({ id: sessionId, userId: actor.id, role, municipalityId: actor.municipalityId, issuedAt: new Date().toISOString(), expiresAt: '2099-01-01T00:00:00.000Z', remember: false })
    return { actor, sessionId, municipalityId: actor.municipalityId }
  }
  async function sessionRow() { return (await db.entity('inventorySessions').get(sid))! }
  async function observation(assetId = 'botolan-asset-1'): Promise<InventoryCheckInput> { const a = (await db.entity('assets').get(assetId))!; return { sessionId: sid, assetId, assetVersion: a.version, found: true, observedLocation: a.location, observedCustodianId: a.custodianId, observedCondition: a.condition, notes: 'Physical check performed.' } }
  async function mismatch() { return ok(await services.inventory.inspect(inventory, { ...await observation(), observedLocation: 'Verified new archive location', notes: 'Found in another room.' })).discrepancy! }
  async function propose() { let d = await mismatch(); d = ok(await services.inventory.investigate(property, d.id, d.version, { finding: 'Inspected relocation evidence and confirmed intended room.', assetLocated: true })); return ok(await services.inventory.prepareCorrection(property, d.id, d.version, { resolution: 'correct_record', reason: 'Correct location after physical investigation.', changes: { location: 'Verified new archive location' } })) }
  async function decide(subjectId: string, decision: 'approve' | 'return' | 'reject', remarks = '') { const a = (await db.entity('approvals').where('subjectId').equals(subjectId).first())!; return services.approvals.decide(approver, { id: a.id, version: a.version, decision, remarks }) }
  beforeEach(async () => {
    db = new MockDatabase(`inventory-${crypto.randomUUID()}`); services = createMockDataServices(db); ok(await services.initialize())
    inventory = await context('inventory_personnel'); property = await context('property_officer'); approver = await context('approving_officer'); admin = await context('administrator')
    const s = ok(await services.inventory.createSession(inventory, { title: 'Physical inventory test', departmentId: 'botolan-dept-general', locationScope: null, scheduledDate: '2020-01-01', assignedUserIds: [inventory.actor.id] })); sid = s.id
    ok(await services.inventory.sessionAction(inventory, sid, s.version, 'start', 'Scheduled inspection started.'))
  })
  afterEach(async () => { await db.delete() })

  it('captures scope, verifies matching assets, completes a session and persists after reopen', async () => {
    const s = await sessionRow(); assert.ok(s.inventory!.assetIds.length)
    denied(await services.inventory.sessionAction(inventory, sid, s.version, 'complete', 'Incomplete checks.'), 'validation')
    for (const id of s.inventory!.assetIds) { const result = ok(await services.inventory.inspect(inventory, await observation(id))); assert.equal(result.check.checkedById, inventory.actor.id); assert.equal(result.check.inspection!.attempts.length, 1) }
    const latest = await sessionRow(); ok(await services.inventory.sessionAction(inventory, sid, latest.version, 'complete', 'Every included asset inspected.'))
    db.close(); await db.open(); const data = ok(await createMockDataServices(db).inventory.overview(inventory)); assert.equal(data.sessions.find(s => s.id === sid)!.sessionStatus, 'completed'); assert.equal(data.checks.filter(c => c.sessionId === sid).length, s.inventory!.assetIds.length)
    validateDataset(await db.snapshot())
  })

  it('creates discrepancies atomically without silently changing official fields and rejects duplicates', async () => {
    const before = await db.entity('assets').get('botolan-asset-1'), input = { ...await observation(), observedLocation: 'Wrong room', observedCondition: 'poor' as const }
    const r = ok(await services.inventory.inspect(inventory, input)); assert.deepEqual(r.discrepancy!.investigation!.flags, ['location', 'condition']); assert.deepEqual(await db.entity('assets').get(before!.id), before)
    denied(await services.inventory.inspect(inventory, input), 'duplicate')
    assert.equal(await db.entity('inventoryChecks').where('sessionId').equals(sid).count(), 1)
    assert.ok(await db.entity('notifications').filter(n => n.recipientId === property.actor.id && n.href?.endsWith('/discrepancies') === true).count())
    denied(await services.inventory.reopen(property, r.check.id, r.check.version, 'Premature repeat'), 'invalid_transition')
  })

  it('requires investigation and justification, then approval applies only saved changes with audit', async () => {
    const d = await propose(), before = (await db.entity('assets').get(d.assetId))!
    assert.equal(before.location === d.proposedCorrection.location, false)
    const file = ok(await services.documents.upload(property, { entityType: 'correction', entityId: d.id, fileName: 'investigation.txt', file: new Blob(['Demo location evidence'], { type: 'text/plain' }) }))
    const attached = (await db.entity('discrepancies').get(d.id))!
    ok(await services.inventory.submitCorrection(property, d.id, attached.version))
    const details = ok(await services.approvals.overview(approver)).find(r => r.approval.subjectId === d.id)!; assert.equal(details.documents[0].id, file.id); assert.ok(details.approval.history[0].submission!.payload.includes('officialAsset'))
    const result = ok(await decide(d.id, 'approve')), asset = (await db.entity('assets').get(d.assetId))!
    assert.equal(asset.location, d.proposedCorrection.location); assert.equal(asset.version, before.version + 1); assert.equal(asset.acquisitionCost, before.acquisitionCost); assert.ok((await db.entity('discrepancies').get(d.id))!.resolvedAt); assert.equal(result.asset!.id, asset.id)
    denied(await decide(d.id, 'approve'), 'invalid_transition'); assert.equal((await db.entity('assets').get(d.assetId))!.version, asset.version)
    assert.ok(await db.entity('auditLogs').filter(a => a.entityId === asset.id && a.action === 'approved_inventory_correction').count()); validateDataset(await db.snapshot())
  })

  it('returns for revision, preserves earlier submissions, and resubmits successfully', async () => {
    let d = await propose(); ok(await services.inventory.submitCorrection(property, d.id, d.version)); denied(await decide(d.id, 'return'), 'validation'); ok(await decide(d.id, 'return', 'Clarify the room reference.'))
    d = (await db.entity('discrepancies').get(d.id))!; assert.equal(d.resolvedAt, null)
    d = ok(await services.inventory.investigate(property, d.id, d.version, { finding: 'Updated investigation with room register reference.', assetLocated: true })); assert.equal(d.investigation!.proposal, null)
    d = ok(await services.inventory.prepareCorrection(property, d.id, d.version, { resolution: 'correct_record', reason: 'Room reference checked.', changes: { location: 'Updated approved room' } })); ok(await services.inventory.submitCorrection(property, d.id, d.version)); ok(await decide(d.id, 'approve'))
    const a = (await db.entity('approvals').where('subjectId').equals(d.id).first())!; assert.equal(a.history.filter(e => e.submission).length, 2); assert.ok(a.history[0].submission!.payload.includes('Verified new archive location'))
  })

  it('keeps missing and rejected cases unresolved and does not permit premature reinspection', async () => {
    let d = ok(await services.inventory.inspect(inventory, { ...await observation(), found: false, observedLocation: '', notes: 'Unable to locate asset in assigned room.' })).discrepancy!
    d = ok(await services.inventory.investigate(property, d.id, d.version, { finding: 'Search ongoing, asset not located.', assetLocated: false }))
    denied(await services.inventory.prepareCorrection(property, d.id, d.version, { resolution: 'confirm_record', reason: 'Close without locating.', changes: {} }), 'validation')
    assert.equal((await db.entity('discrepancies').get(d.id))!.resolvedAt, null)
    d = ok(await services.inventory.investigate(property, d.id, d.version, { finding: 'Asset subsequently located in official room.', assetLocated: true })); d = ok(await services.inventory.prepareCorrection(property, d.id, d.version, { resolution: 'confirm_record', reason: 'Record is correct after located asset review.', changes: {} })); ok(await services.inventory.submitCorrection(property, d.id, d.version)); const before = await db.entity('assets').get(d.assetId); ok(await decide(d.id, 'reject', 'Insufficient evidence for closure.')); assert.deepEqual(await db.entity('assets').get(d.assetId), before); assert.equal((await db.entity('discrepancies').get(d.id))!.resolvedAt, null)
    denied(await services.inventory.reopen(property, d.inventoryCheckId, (await db.entity('inventoryChecks').get(d.inventoryCheckId))!.version, 'Repeat'), 'invalid_transition')
  })

  it('requires controlled reopening and retains earlier matching observations', async () => {
    const first = ok(await services.inventory.inspect(inventory, await observation())).check
    assert.equal(first.inspection!.attempts[0].result, 'verified')
    denied(await services.inventory.reopen(property, first.id, first.version, ''), 'validation')
    ok(await services.inventory.reopen(property, first.id, first.version, 'Follow-up verification requested by Property.'))
    denied(await services.inventory.reopen(property, first.id, first.version, 'Stale attempt.'), 'conflict')
    const second = ok(await services.inventory.inspect(inventory, { ...await observation(), observedLocation: 'Different room', notes: 'Follow-up found relocation.' })).check
    assert.equal(second.id, first.id); assert.equal(second.inspection!.attempts.length, 2); assert.deepEqual(second.inspection!.attempts[0], first.inspection!.attempts[0]); assert.equal(second.inspection!.reopen, null); assert.equal(second.inspection!.reopens.length, 1)
  })

  it('prevents stale correction approval atomically and supports explicit no-change confirmation', async () => {
    const d = await propose(); ok(await services.inventory.submitCorrection(property, d.id, d.version))
    const asset = (await db.entity('assets').get(d.assetId))!; await db.entity('assets').put({ ...asset, version: asset.version + 1, location: 'Concurrent authorized update fixture' })
    const count = await db.entity('auditLogs').count(); denied(await decide(d.id, 'approve'), 'conflict'); assert.equal(await db.entity('auditLogs').count(), count); assert.equal((await db.entity('discrepancies').get(d.id))!.workflowStatus, 'submitted')
    ok(await decide(d.id, 'return', 'Review current official version.')); let next = (await db.entity('discrepancies').get(d.id))!; next = ok(await services.inventory.prepareCorrection(property, next.id, next.version, { resolution: 'confirm_record', reason: 'Current record reviewed and confirmed by investigator.', changes: {} })); ok(await services.inventory.submitCorrection(property, next.id, next.version)); const before = await db.entity('assets').get(d.assetId); ok(await decide(d.id, 'approve')); assert.deepEqual(await db.entity('assets').get(d.assetId), before); assert.ok((await db.entity('discrepancies').get(d.id))!.resolvedAt)
  })

  it('enforces assignment, municipality, roles and manual lookup scope', async () => {
    const other = await context('inventory_personnel', 'san_antonio'), observationInput = await observation()
    denied(await services.inventory.inspect(other, observationInput), 'not_found'); denied(await services.inventory.inspect(property, observationInput), 'forbidden'); denied(await services.inventory.overview(approver), 'forbidden')
    const extra = { ...inventory.actor, id: 'extra-inventory', email: 'extra@example.invalid', username: 'extra_inventory' }; await db.entity('users').add(extra); const unassigned = await context('inventory_personnel'); const token = crypto.randomUUID(); await db.sessions.add({ id: token, userId: extra.id, role: extra.role, municipalityId: extra.municipalityId, issuedAt: new Date().toISOString(), expiresAt: '2099-01-01T00:00:00.000Z', remember: false }); Object.assign(unassigned, { actor: extra, sessionId: token }); denied(await services.inventory.inspect(unassigned, observationInput), 'forbidden'); assert.equal(ok(await services.inventory.overview(unassigned)).sessions.some(s => s.id === sid), false)
    const a = (await db.entity('assets').get(observationInput.assetId))!; assert.equal(ok(await services.inventory.lookup(inventory, sid, `PPE:${a.propertyNumber.toLowerCase()}`)).id, a.id); denied(await services.inventory.lookup(inventory, sid, 'https://example.com/track'), 'validation'); denied(await services.inventory.lookup(inventory, sid, 'CABANGAN-UNKNOWN'), 'not_found'); assert.equal(normalizePropertyCode(' PPE:ABC-123 '), 'abc-123')
  })

  it('rejects invalid values, future inspections, spoofed actors and generic mutation bypasses', async () => {
    const input = await observation(); denied(await services.inventory.inspect(inventory, { ...input, found: true, observedLocation: '' }), 'validation'); denied(await services.inventory.inspect(inventory, { ...input, checkedById: admin.actor.id } as unknown as InventoryCheckInput), 'validation'); denied(await services.inventory.inspect(inventory, { ...input, assetVersion: -1 }), 'validation'); denied(await services.entities.inventoryChecks.create(inventory, input), 'forbidden')
    const future = ok(await services.inventory.createSession(inventory, { title: 'Future', departmentId: null, locationScope: null, scheduledDate: '2099-01-01', assignedUserIds: [inventory.actor.id] })); denied(await services.inventory.sessionAction(inventory, future.id, future.version, 'start', 'Too early'), 'validation')
    const d = await mismatch(); denied(await services.inventory.prepareCorrection(property, d.id, d.version, { resolution: 'correct_record', reason: 'Uninvestigated', changes: { location: 'Changed' } }), 'validation'); denied(await services.approvals.decide(inventory, { id: 'unknown', version: 1, decision: 'approve', remarks: '' }), 'not_found')
  })

  it('protects inventory history from import rewrites and rejects inconsistent preserved results', async () => {
    const r = ok(await services.inventory.inspect(inventory, await observation())); const exported = JSON.parse(ok(await services.dataset.exportJson(admin)).json)
    exported.data.inventoryChecks.find((c: { id: string }) => c.id === r.check.id).notes = 'Rewritten history'
    denied(await services.dataset.importJson(admin, JSON.stringify(exported)), 'validation')
    const valid = JSON.parse(ok(await services.dataset.exportJson(admin)).json); valid.data.inventorySessions.find((s: { id: string }) => s.id === sid).title = 'Rewritten session'; denied(await services.dataset.importJson(admin, JSON.stringify(valid)), 'conflict')
    const bypass = JSON.parse(ok(await services.dataset.exportJson(admin)).json); bypass.data.assets.find((a: { id: string }) => a.id === r.check.assetId).location = 'Unapproved imported correction'; denied(await services.dataset.importJson(admin, JSON.stringify(bypass)), 'conflict')
    const snapshot = await db.snapshot(); snapshot.inventoryChecks.find(c => c.id === r.check.id)!.inspection!.attempts[0].result = 'discrepancy'; assert.throws(() => validateDataset(snapshot))
  })

  it('rolls back the official correction, resolution, approval and audits together on storage failure', async () => {
    const d = await propose(); ok(await services.inventory.submitCorrection(property, d.id, d.version))
    const before = await db.snapshot()
    const fail = (_key: unknown, value: { action?: string }) => { if (value.action === 'approved_inventory_correction') throw new Error('Simulated persistence failure after official asset write') }
    db.entity('auditLogs').hook('creating', fail)
    denied(await decide(d.id, 'approve'))
    db.entity('auditLogs').hook('creating').unsubscribe(fail)
    assert.deepEqual(await db.snapshot(), before)
    ok(await decide(d.id, 'approve'))
  })

  it('rechecks revoked permissions and rejects unauthorized or financial correction fields', async () => {
    let d = await mismatch(); d = ok(await services.inventory.investigate(property, d.id, d.version, { finding: 'Physical location checked.', assetLocated: true }))
    denied(await services.inventory.prepareCorrection(property, d.id, d.version, { resolution: 'correct_record', reason: 'Unapproved financial alteration', changes: { acquisitionCost: 1 } } as unknown as Parameters<typeof services.inventory.prepareCorrection>[3]), 'validation')
    const otherCustodian = (await db.entity('users').where('municipalityId').equals('san_antonio').first())!
    denied(await services.inventory.prepareCorrection(property, d.id, d.version, { resolution: 'correct_record', reason: 'Invalid custodian', changes: { custodianId: otherCustodian.id } }), 'validation')
    d = ok(await services.inventory.prepareCorrection(property, d.id, d.version, { resolution: 'correct_record', reason: 'Location checked.', changes: { location: 'Reviewed room' } })); ok(await services.inventory.submitCorrection(property, d.id, d.version))
    const grant = (await db.entity('permissions').where('[municipalityId+role]').equals(['botolan', 'approving_officer']).toArray()).find(g => g.resource === 'correction_approvals' && g.action === 'approve')!
    await db.entity('permissions').delete(grant.id); denied(await decide(d.id, 'approve'), 'forbidden'); assert.equal((await db.entity('discrepancies').get(d.id))!.resolvedAt, null)
    const read = (await db.entity('permissions').where('[municipalityId+role]').equals(['botolan', 'inventory_personnel']).toArray()).find(g => g.resource === 'inventory_checks' && g.action === 'read')!
    await db.entity('permissions').delete(read.id); denied(await services.inventory.overview(inventory), 'forbidden')
  })
})
