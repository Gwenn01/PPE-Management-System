import { z } from 'zod'
import { assetSnapshot, inspectionFlags, normalizePropertyCode, type InventoryEvent } from '../domain/inventory.js'
import type { Asset, InventorySession, InventoryDiscrepancy, User } from '../domain/models.js'
import { database, type MockDatabase } from '../mock/database.js'
import { authorize, commitMutation, writeAudit } from '../mock/unitOfWork.js'
import { parseEntity } from '../mock/validation/schemas.js'
import type { RequestContext } from './contracts.js'
import { DataError, respond } from './errors.js'
import { validateInventoryCorrection } from './inventoryValidation.js'

const text = z.string().trim().min(1).max(4000), id = z.string().min(1).max(160)
const condition = z.enum(['good', 'fair', 'poor', 'unserviceable'])
const sessionInput = z.strictObject({ title: text, departmentId: id.nullable(), locationScope: text.nullable(), scheduledDate: z.iso.date(), assignedUserIds: z.array(id).min(1).max(100) })
const checkInput = z.strictObject({ sessionId: id, assetId: id, assetVersion: z.number().int().positive(), found: z.boolean(), observedLocation: z.string().trim().max(4000), observedCustodianId: id.nullable(), observedCondition: condition, notes: z.string().trim().max(10000) })
const proposalInput = z.strictObject({ resolution: z.enum(['correct_record', 'confirm_record']), reason: text, changes: z.strictObject({ location: text.optional(), custodianId: id.nullable().optional(), condition: condition.optional(), description: text.optional() }) })
export type InventorySessionInput = z.infer<typeof sessionInput>
export type InventoryCheckInput = z.infer<typeof checkInput>
export type InventoryProposalInput = z.infer<typeof proposalInput>
const event = (actorId: string, action: string, note: string, at: string): InventoryEvent => ({ id: crypto.randomUUID(), actorId, action, note, occurredAt: at })
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

export function createInventoryService(db: MockDatabase = database) {
  async function local<T extends 'inventorySessions' | 'discrepancies' | 'inventoryChecks' | 'assets'>(table: T, key: string, ctx: RequestContext) {
    const row = await db.entity(table).get(id.parse(key))
    if (!row || row.municipalityId !== ctx.municipalityId) throw new DataError('not_found', 'Inventory record unavailable in this municipality.')
    return row
  }
  function version(old: { version: number }, expected: number) { if (old.version !== z.number().int().positive().parse(expected)) throw new DataError('conflict', 'The record changed. Reload before continuing.') }
  function participant(session: InventorySession, actor: User, inspect = false) {
    if (!session.assignedUserIds.includes(actor.id) && (inspect || session.requestedById !== actor.id)) throw new DataError('forbidden', 'Only assigned inventory personnel may inspect this session.')
  }
  async function scope(session: InventorySession): Promise<Asset[]> {
    return db.entity('assets').where('municipalityId').equals(session.municipalityId).filter(a => session.inventory ? session.inventory.assetIds.includes(a.id) : (!session.departmentId || a.departmentId === session.departmentId) && a.lifecycleStatus !== 'disposed').toArray()
  }
  async function notify(actor: User, role: User['role'], title: string, href: string, tx: string) {
    const at = new Date().toISOString()
    for (const recipient of await db.entity('users').where('municipalityId').equals(actor.municipalityId).filter(u => u.role === role && u.status === 'active').toArray()) {
      const row = parseEntity('notifications', { id: crypto.randomUUID(), municipalityId: actor.municipalityId, version: 1, createdAt: at, updatedAt: at, recipientId: recipient.id, title, message: title, severity: 'info', href, readAt: null })
      await db.entity('notifications').add(row); await writeAudit(db, actor, tx, 'notifications', null, row, 'inventory_notice')
    }
  }
  async function caseFor(ctx: RequestContext, key: string, expected: number, action: 'update' | 'submit') {
    const actor = await authorize(db, ctx, 'inventory_discrepancies', action), old = await local('discrepancies', key, ctx)
    version(old, expected)
    if (old.resolvedAt || !['draft', 'returned'].includes(old.workflowStatus)) throw new DataError('invalid_transition', 'Only unresolved draft or returned cases can be edited.')
    if (old.investigation?.investigatorId && old.investigation.investigatorId !== actor.id) throw new DataError('forbidden', 'This investigation belongs to another Property Officer.')
    return { actor, old }
  }
  return {
    overview: (ctx: RequestContext) => respond(() => db.transaction('r', db.tables, async () => {
      const property = ctx.actor.role === 'property_officer'
      const actor = await authorize(db, ctx, property ? 'inventory_discrepancies' : 'inventory_sessions', 'read')
      if (!['inventory_personnel', 'property_officer'].includes(actor.role)) throw new DataError('forbidden', 'Inventory access requires an authorized operational role.')
      await authorize(db, ctx, 'assets', 'read')
      if (!property) await authorize(db, ctx, 'inventory_checks', 'read')
      const sessions = await db.entity('inventorySessions').where('municipalityId').equals(actor.municipalityId).filter(s => property || s.requestedById === actor.id || s.assignedUserIds.includes(actor.id)).toArray()
      const sessionIds = new Set(sessions.map(s => s.id))
      const checks = await db.entity('inventoryChecks').where('municipalityId').equals(actor.municipalityId).filter(c => sessionIds.has(c.sessionId)).toArray()
      const checkIds = new Set(checks.map(c => c.id))
      const discrepancies = await db.entity('discrepancies').where('municipalityId').equals(actor.municipalityId).filter(d => property || checkIds.has(d.inventoryCheckId)).toArray()
      const assetIds = new Set((await Promise.all(sessions.map(scope))).flat().map(a => a.id))
      const assets = await db.entity('assets').where('municipalityId').equals(actor.municipalityId).filter(a => property || assetIds.has(a.id)).toArray()
      const users = (await db.entity('users').where('municipalityId').equals(actor.municipalityId).filter(u => u.status === 'active').toArray()).map(u => ({ id: u.id, name: u.name, role: u.role, departmentId: u.departmentId }))
      const departments = await db.entity('departments').where('municipalityId').equals(actor.municipalityId).toArray()
      const caseIds = new Set(discrepancies.map(d => d.id))
      const documents = property ? await db.entity('documents').where('municipalityId').equals(actor.municipalityId).filter(d => d.entityType === 'correction' && caseIds.has(d.entityId)).toArray() : []
      const approvals = property ? await db.entity('approvals').where('municipalityId').equals(actor.municipalityId).filter(a => a.subjectType === 'correction' && caseIds.has(a.subjectId)).toArray() : []
      return { sessions, checks, discrepancies, assets, users, departments, documents, approvals }
    })),
    createSession: (ctx: RequestContext, input: InventorySessionInput) => respond(() => commitMutation(db, async tx => {
      const actor = await authorize(db, ctx, 'inventory_sessions', 'create'), draft = sessionInput.parse(input)
      await authorize(db, ctx, 'assets', 'read')
      if (new Set(draft.assignedUserIds).size !== draft.assignedUserIds.length) throw new DataError('validation', 'Choose each assigned participant once.')
      if (draft.departmentId) { const dept = await db.entity('departments').get(draft.departmentId); if (!dept || dept.municipalityId !== actor.municipalityId || !dept.active) throw new DataError('validation', 'Choose an active local department.') }
      for (const key of draft.assignedUserIds) { const u = await db.entity('users').get(key); if (!u || u.municipalityId !== actor.municipalityId || u.status !== 'active' || u.role !== 'inventory_personnel') throw new DataError('validation', 'Assign active local inventory personnel.') }
      const assets = await db.entity('assets').where('municipalityId').equals(actor.municipalityId).filter(a => a.lifecycleStatus !== 'disposed' && (!draft.departmentId || a.departmentId === draft.departmentId) && (!draft.locationScope || a.location.trim().toLowerCase() === draft.locationScope.toLowerCase())).toArray()
      if (!assets.length) throw new DataError('validation', 'The chosen scope contains no eligible assets.')
      const at = new Date().toISOString()
      const { locationScope, ...sessionFields } = draft
      const row = parseEntity('inventorySessions', { ...sessionFields, id: crypto.randomUUID(), municipalityId: actor.municipalityId, version: 1, createdAt: at, updatedAt: at, requestedById: actor.id, submittedAt: null, documentIds: [], workflowStatus: 'draft', sessionStatus: 'planned', inventory: { locationScope, assetIds: assets.map(a => a.id), history: [event(actor.id, 'created', 'Asset scope captured at creation.', at)] } })
      await db.entity('inventorySessions').add(row); await writeAudit(db, actor, tx, 'inventorySessions', null, row, 'create_inventory_session')
      return row
    })),
    sessionAction: (ctx: RequestContext, key: string, expected: number, action: 'start' | 'complete' | 'cancel', reason: string) => respond(() => commitMutation(db, async tx => {
      const actor = await authorize(db, ctx, 'inventory_sessions', 'update'), old = await local('inventorySessions', key, ctx)
      version(old, expected); participant(old, actor); z.enum(['start', 'complete', 'cancel']).parse(action)
      if (old.sessionStatus === 'cancelled' || old.sessionStatus === 'completed' || action === 'start' && old.sessionStatus !== 'planned' || action === 'complete' && old.sessionStatus !== 'in_progress') throw new DataError('invalid_transition', 'This session transition is unavailable.')
      if (action === 'start' && old.scheduledDate.slice(0, 10) > today()) throw new DataError('validation', 'Inspection cannot start before its scheduled date.')
      if (action === 'cancel' && old.requestedById !== actor.id) throw new DataError('forbidden', 'Only the session creator can cancel it.')
      const assets = await scope(old), checks = await db.entity('inventoryChecks').where('sessionId').equals(old.id).toArray()
      if (action === 'complete' && assets.some(a => !checks.some(c => c.assetId === a.id && !c.inspection?.reopen))) throw new DataError('validation', 'Inspect all included assets and finish reopened checks before completing the session.')
      const at = new Date().toISOString(), note = text.parse(reason)
      const row = parseEntity('inventorySessions', { ...old, version: old.version + 1, updatedAt: at, sessionStatus: action === 'start' ? 'in_progress' : action === 'complete' ? 'completed' : 'cancelled', inventory: { ...(old.inventory ?? { locationScope: null, assetIds: assets.map(a => a.id), history: [] }), history: [...(old.inventory?.history ?? []), event(actor.id, action, note, at)] } })
      await db.entity('inventorySessions').put(row); await writeAudit(db, actor, tx, 'inventorySessions', old, row, `inventory_${action}`, note); return row
    })),
    lookup: (ctx: RequestContext, sessionId: string, code: string) => respond(() => db.transaction('r', db.tables, async () => {
      const actor = await authorize(db, ctx, 'inventory_checks', 'read'), session = await local('inventorySessions', sessionId, ctx); participant(session, actor)
      await authorize(db, ctx, 'assets', 'read')
      let value: string; try { value = normalizePropertyCode(z.string().parse(code)) } catch { throw new DataError('validation', 'Enter a valid property number or PPE property code.') }
      const asset = (await scope(session)).find(a => [a.id.toLowerCase(), a.propertyNumber.toLowerCase()].includes(value))
      if (!asset) throw new DataError('not_found', 'Code is not included in this assigned inventory session.'); return asset
    })),
    inspect: (ctx: RequestContext, input: InventoryCheckInput) => respond(() => commitMutation(db, async tx => {
      const actor = await authorize(db, ctx, 'inventory_checks', 'create'), draft = checkInput.parse(input), session = await local('inventorySessions', draft.sessionId, ctx)
      participant(session, actor, true)
      await authorize(db, ctx, 'assets', 'read')
      if (session.sessionStatus !== 'in_progress' || session.scheduledDate.slice(0, 10) > today()) throw new DataError('invalid_transition', 'Start the scheduled session before inspecting assets.')
      const asset = await local('assets', draft.assetId, ctx); version(asset, draft.assetVersion)
      if (!(await scope(session)).some(a => a.id === asset.id)) throw new DataError('forbidden', 'The asset is outside the captured session scope.')
      const old = await db.entity('inventoryChecks').where('[sessionId+assetId]').equals([session.id, asset.id]).first()
      if (old && !old.inspection?.reopen) throw new DataError('duplicate', 'This asset has already been inspected. A Property Officer must explicitly reopen it.')
      if (draft.found && !draft.observedLocation) throw new DataError('validation', 'Record the observed physical location.')
      if (draft.observedCustodianId) { const u = await db.entity('users').get(draft.observedCustodianId); if (!u || u.municipalityId !== actor.municipalityId || u.status !== 'active') throw new DataError('validation', 'Choose a local active observed custodian.') }
      const observed = { found: draft.found, observedLocation: draft.found ? draft.observedLocation : 'Not located', observedCustodianId: draft.found ? draft.observedCustodianId : null, observedCondition: draft.found ? draft.observedCondition : asset.condition }
      const flags = inspectionFlags(assetSnapshot(asset), observed)
      if (flags.length && !draft.notes) throw new DataError('validation', 'Explain the missing, damaged or mismatched observation.')
      const at = new Date().toISOString(), revision = (old?.inspection?.attempts.length ?? 0) + 1
      const attempt = { ...observed, checkedById: actor.id, checkedAt: at, notes: draft.notes, revision, baseline: assetSnapshot(asset), flags, result: flags.length ? 'discrepancy' : 'verified' }
      const check = parseEntity('inventoryChecks', { ...(old ?? { id: crypto.randomUUID(), municipalityId: actor.municipalityId, createdAt: at }), sessionId: session.id, assetId: asset.id, ...observed, checkedById: actor.id, checkedAt: at, notes: draft.notes, updatedAt: at, version: (old?.version ?? 0) + 1, inspection: { attempts: [...(old?.inspection?.attempts ?? []), attempt], reopen: null, reopens: old?.inspection?.reopens ?? [] } })
      await db.entity('inventoryChecks').put(check); await writeAudit(db, actor, tx, 'inventoryChecks', old ?? null, check, 'inspect_asset', draft.notes)
      let discrepancy: InventoryDiscrepancy | null = null
      if (flags.length) {
        discrepancy = parseEntity('discrepancies', { id: crypto.randomUUID(), municipalityId: actor.municipalityId, version: 1, createdAt: at, updatedAt: at, workflowStatus: 'draft', requestedById: actor.id, submittedAt: null, documentIds: [], inventoryCheckId: check.id, assetId: asset.id, kind: flags[0], description: draft.notes, proposedCorrection: {}, resolvedAt: null, investigation: { sessionId: session.id, checkRevision: revision, detectedById: actor.id, flags, investigatorId: null, finding: '', assetLocated: draft.found, proposal: null, history: [event(actor.id, 'detected', draft.notes, at)] } })
        await db.entity('discrepancies').add(discrepancy); await writeAudit(db, actor, tx, 'discrepancies', null, discrepancy, 'detect_discrepancy'); await notify(actor, 'property_officer', 'Inventory discrepancy requires investigation', '/dashboard/discrepancies', tx)
      }
      const row = parseEntity('inventorySessions', { ...session, version: session.version + 1, updatedAt: at, inventory: { ...(session.inventory ?? { locationScope: null, assetIds: (await scope(session)).map(a => a.id), history: [] }), history: [...(session.inventory?.history ?? []), event(actor.id, flags.length ? 'discrepancy' : 'verified', `${asset.propertyNumber}: inspection ${revision}`, at)] } })
      await db.entity('inventorySessions').put(row); await writeAudit(db, actor, tx, 'inventorySessions', session, row, 'inventory_progress'); return { check, discrepancy }
    })),
    reopen: (ctx: RequestContext, key: string, expected: number, reason: string) => respond(() => commitMutation(db, async tx => {
      const actor = await authorize(db, ctx, 'inventory_discrepancies', 'update'), old = await local('inventoryChecks', key, ctx); version(old, expected)
      const note = text.parse(reason), session = await local('inventorySessions', old.sessionId, ctx)
      if (!old.inspection || old.inspection.reopen || session.sessionStatus === 'cancelled') throw new DataError('invalid_transition', 'Only a completed managed check in a non-cancelled session can be reopened. Legacy checks remain read-only.')
      if (await db.entity('discrepancies').where('assetId').equals(old.assetId).filter(d => d.inventoryCheckId === old.id && !d.resolvedAt).count()) throw new DataError('invalid_transition', 'Resolve existing discrepancies before reopening this check.')
      const at = new Date().toISOString(), reopened = { actorId: actor.id, occurredAt: at, reason: note }
      const row = parseEntity('inventoryChecks', { ...old, version: old.version + 1, updatedAt: at, inspection: { ...old.inspection, reopen: reopened, reopens: [...old.inspection.reopens, reopened] } })
      const nextSession = parseEntity('inventorySessions', { ...session, version: session.version + 1, updatedAt: at, sessionStatus: 'in_progress', inventory: { ...session.inventory!, history: [...session.inventory!.history, event(actor.id, 'reopen_check', note, at)] } })
      await db.entity('inventoryChecks').put(row); await db.entity('inventorySessions').put(nextSession)
      await writeAudit(db, actor, tx, 'inventoryChecks', old, row, 'controlled_reopen', note); await writeAudit(db, actor, tx, 'inventorySessions', session, nextSession, 'controlled_reopen', note); return row
    })),
    investigate: (ctx: RequestContext, key: string, expected: number, input: { finding: string; assetLocated: boolean }) => respond(() => commitMutation(db, async tx => {
      const { actor, old } = await caseFor(ctx, key, expected, 'update'), draft = z.strictObject({ finding: text, assetLocated: z.boolean() }).parse(input)
      const check = await local('inventoryChecks', old.inventoryCheckId, ctx), at = new Date().toISOString()
      const investigation = old.investigation ?? { sessionId: check.sessionId, checkRevision: 1, detectedById: check.checkedById, flags: [old.kind], investigatorId: null, finding: '', assetLocated: check.found, proposal: null, history: [] }
      const row = parseEntity('discrepancies', { ...old, requestedById: actor.id, version: old.version + 1, updatedAt: at, proposedCorrection: {}, investigation: { ...investigation, ...draft, investigatorId: actor.id, proposal: null, history: [...investigation.history, event(actor.id, 'investigated', draft.finding, at)] } })
      await db.entity('discrepancies').put(row); await writeAudit(db, actor, tx, 'discrepancies', old, row, 'investigate', draft.finding); return row
    })),
    prepareCorrection: (ctx: RequestContext, key: string, expected: number, input: InventoryProposalInput) => respond(() => commitMutation(db, async tx => {
      const { actor, old } = await caseFor(ctx, key, expected, 'update'), draft = proposalInput.parse(input), asset = await local('assets', old.assetId, ctx), at = new Date().toISOString()
      if (!old.investigation?.finding || old.investigation.investigatorId !== actor.id) throw new DataError('validation', 'Record your investigation before proposing corrections.')
      const row = parseEntity('discrepancies', { ...old, version: old.version + 1, updatedAt: at, proposedCorrection: draft.changes, investigation: { ...old.investigation, proposal: { assetVersion: asset.version, baseline: assetSnapshot(asset), reason: draft.reason, resolution: draft.resolution, preparedAt: at }, history: [...old.investigation.history, event(actor.id, 'correction_prepared', draft.reason, at)] } })
      await validateInventoryCorrection(db, row); await db.entity('discrepancies').put(row); await writeAudit(db, actor, tx, 'discrepancies', old, row, 'prepare_correction', draft.reason); return row
    })),
    submitCorrection: (ctx: RequestContext, key: string, expected: number) => respond(() => commitMutation(db, async tx => {
      const { actor, old } = await caseFor(ctx, key, expected, 'submit'); const asset = await validateInventoryCorrection(db, old)
      if (old.investigation?.investigatorId !== actor.id) throw new DataError('forbidden', 'Only the investigator may submit the prepared correction.')
      const at = new Date().toISOString(), previous = await db.entity('approvals').where('subjectId').equals(old.id).filter(a => a.subjectType === 'correction').first()
      const row = parseEntity('discrepancies', { ...old, workflowStatus: 'submitted', submittedAt: at, updatedAt: at, version: old.version + 1, investigation: { ...old.investigation, history: [...old.investigation.history, event(actor.id, 'submitted', old.investigation.proposal!.reason, at)] } })
      const check = await local('inventoryChecks', old.inventoryCheckId, ctx)
      const approval = parseEntity('approvals', { ...(previous ?? { id: crypto.randomUUID(), municipalityId: actor.municipalityId, createdAt: at, subjectType: 'correction', subjectId: row.id, assignedRole: 'approving_officer', history: [] }), requestedById: actor.id, version: (previous?.version ?? 0) + 1, updatedAt: at, workflowStatus: 'submitted', submittedAt: at, documentIds: row.documentIds, decidedAt: null, history: [...(previous?.history ?? []), { actorId: actor.id, actorRole: actor.role, action: 'submit', fromStatus: old.workflowStatus, toStatus: 'submitted', reason: old.investigation.proposal!.reason, occurredAt: at, submission: { subjectVersion: row.version, documentIds: row.documentIds, payload: JSON.stringify({ discrepancy: row, check, officialAsset: asset }) } }] })
      await db.entity('discrepancies').put(row); await db.entity('approvals').put(approval)
      await writeAudit(db, actor, tx, 'discrepancies', old, row, 'submit_correction'); await writeAudit(db, actor, tx, 'approvals', previous ?? null, approval, 'submit_correction'); await notify(actor, 'approving_officer', 'Inventory correction submitted for review', '/dashboard/approvals/corrections', tx); return row
    })),
  }
}
export type InventoryOverview = Extract<Awaited<ReturnType<ReturnType<typeof createInventoryService>['overview']>>, { ok: true }>['data']
