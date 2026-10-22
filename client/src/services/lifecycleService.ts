import { z } from 'zod'
import { lifecyclePolicySchema, lifecycleResources, lifecycleTables, type LifecycleDetails, type LifecycleKind, type LifecyclePolicy } from '../domain/lifecycle.js'
import { assetSnapshot, type InventoryEvent } from '../domain/inventory.js'
import type { Asset, DisposalRequest, User } from '../domain/models.js'
import { database, type MockDatabase } from '../mock/database.js'
import { authorize, commitMutation, writeAudit } from '../mock/unitOfWork.js'
import { moneySchema, parseEntity } from '../mock/validation/schemas.js'
import type { RequestContext } from './contracts.js'
import { DataError, respond } from './errors.js'
import { disposalImpact, lifecycleEvidence, lifecyclePolicy, lifecycleToday, validateLifecycle, validateLifecycleAuthorization, type LifecycleRequest } from './lifecycleValidation.js'

const text = z.string().trim().min(1).max(4000), id = z.string().min(1).max(160), kindSchema = z.enum(['transfer', 'maintenance', 'disposal'])
const common = { assetId: id, proposedDate: z.iso.date(), remarks: z.string().trim().max(4000) }
const draftSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...common, kind: z.literal('transfer'), toDepartmentId: id, toCustodianId: id.nullable(), destinationLocation: text, reason: text }),
  z.strictObject({ ...common, kind: z.literal('maintenance'), description: text, category: text, estimatedCost: moneySchema }),
  z.strictObject({ ...common, kind: z.literal('disposal'), reason: text, method: z.enum(['sale', 'donation', 'destruction', 'other']), proceeds: moneySchema }),
])
export type LifecycleDraft = z.infer<typeof draftSchema>
const event = (actor: User, action: string, note: string, at: string): InventoryEvent => ({ id: crypto.randomUUID(), actorId: actor.id, occurredAt: at, action, note })
export function createLifecycleService(db: MockDatabase = database) {
  async function local(kind: LifecycleKind, key: string, ctx: RequestContext) {
    const row = await db.entity(lifecycleTables[kindSchema.parse(kind)]).get(id.parse(key))
    if (!row || row.municipalityId !== ctx.municipalityId) throw new DataError('not_found', 'Lifecycle request is unavailable in this municipality.')
    return row
  }
  function checkVersion(row: { version: number }, expected: number) { if (row.version !== z.number().int().positive().parse(expected)) throw new DataError('conflict', 'This record changed. Reload before continuing.') }
  function owner(row: LifecycleRequest, actor: User) { if (row.requestedById !== actor.id) throw new DataError('forbidden', 'Only the originating Property Officer can change this request.') }
  function editable(row: LifecycleRequest) { if (!['draft', 'returned'].includes(row.workflowStatus) || row.lifecycle && !['draft', 'returned', 'reviewed'].includes(row.lifecycle.stage)) throw new DataError('invalid_transition', 'Only draft or returned lifecycle requests can be corrected.') }
  async function put(kind: LifecycleKind, old: LifecycleRequest | null, candidate: LifecycleRequest, actor: User, tx: string, action: string, reason = '') {
    const table = lifecycleTables[kind], row = parseEntity(table, candidate)
    await db.entity(table).put(row); await writeAudit(db, actor, tx, table, old, row, action, reason); return row
  }
  async function notify(actor: User, role: User['role'], title: string, href: string, tx: string, recipientId?: string) {
    const at = new Date().toISOString(), recipients = await db.entity('users').where('municipalityId').equals(actor.municipalityId).filter(u => u.status === 'active' && u.role === role && (!recipientId || u.id === recipientId)).toArray()
    for (const recipient of recipients) { const row = parseEntity('notifications', { id: crypto.randomUUID(), municipalityId: actor.municipalityId, version: 1, createdAt: at, updatedAt: at, recipientId: recipient.id, title, message: title, href, severity: 'info', readAt: null }); await db.entity('notifications').add(row); await writeAudit(db, actor, tx, 'notifications', null, row, 'lifecycle_notice') }
  }
  async function propertyRow(ctx: RequestContext, kind: LifecycleKind, key: string, expected: number, action: 'update' | 'submit') {
    const actor = await authorize(db, ctx, lifecycleResources[kindSchema.parse(kind)], action), row = await local(kind, key, ctx); owner(row, actor); checkVersion(row, expected); return { actor, row }
  }
  return {
    overview: (ctx: RequestContext) => respond(() => db.transaction('r', db.tables, async () => {
      const accounting = ctx.actor.role === 'accounting_officer'
      const actor = await authorize(db, ctx, accounting ? 'disposal_review' : 'asset_transfers', 'read')
      if (!accounting) { await authorize(db, ctx, 'maintenance_requests', 'read'); await authorize(db, ctx, 'disposal_requests', 'read') }
      await authorize(db, ctx, 'assets', 'read')
      const transfers = accounting ? [] : await db.entity('transfers').where('municipalityId').equals(actor.municipalityId).toArray()
      const maintenance = accounting ? [] : await db.entity('maintenance').where('municipalityId').equals(actor.municipalityId).toArray()
      const disposals = await db.entity('disposals').where('municipalityId').equals(actor.municipalityId).filter(d => !accounting || !!d.lifecycle && d.lifecycle.stage !== 'draft').toArray()
      const ids = new Set([...transfers, ...maintenance, ...disposals].map(r => r.id))
      const assets = await db.entity('assets').where('municipalityId').equals(actor.municipalityId).toArray()
      const users = (await db.entity('users').where('municipalityId').equals(actor.municipalityId).toArray()).map(u => ({ id: u.id, name: u.name, departmentId: u.departmentId, status: u.status }))
      const departments = await db.entity('departments').where('municipalityId').equals(actor.municipalityId).toArray()
      const documents = await db.entity('documents').where('municipalityId').equals(actor.municipalityId).filter(d => ['transfer', 'maintenance', 'disposal'].includes(d.entityType) && ids.has(d.entityId)).toArray()
      const approvals = await db.entity('approvals').where('municipalityId').equals(actor.municipalityId).filter(a => ids.has(a.subjectId) && ['transfer', 'maintenance', 'disposal'].includes(a.subjectType)).toArray()
      return { transfers, maintenance, disposals, assets, users, departments, documents, approvals, policy: await lifecyclePolicy(db, actor.municipalityId) }
    })),
    policy: (ctx: RequestContext) => respond(() => db.transaction('r', db.tables, async () => { await authorize(db, ctx, 'settings', 'read'); const setting = await db.entity('settings').where('[municipalityId+key]').equals([ctx.municipalityId, 'lifecycle_policy']).first(); return { policy: await lifecyclePolicy(db, ctx.municipalityId), version: setting?.version ?? 0 } })),
    impact: (ctx: RequestContext, key: string) => respond(() => db.transaction('r', db.tables, async () => { await authorize(db, ctx, 'disposal_review', 'read'); const row = await local('disposal', key, ctx) as DisposalRequest; if (row.lifecycle?.stage !== 'accounting_review') throw new DataError('invalid_transition', 'Choose a disposal awaiting Accounting review.'); await validateLifecycle(db, 'disposal', row); return disposalImpact(db, row) })),
    savePolicy: (ctx: RequestContext, expected: number, input: LifecyclePolicy) => respond(() => commitMutation(db, async tx => {
      const actor = await authorize(db, ctx, 'settings', 'manage'), policy = lifecyclePolicySchema.parse(input), old = await db.entity('settings').where('[municipalityId+key]').equals([ctx.municipalityId, 'lifecycle_policy']).first(), at = new Date().toISOString()
      if ((old?.version ?? 0) !== z.number().int().min(0).parse(expected)) throw new DataError('conflict', 'The lifecycle policy changed. Reload before saving.')
      const row = parseEntity('settings', { ...(old ?? { id: crypto.randomUUID(), municipalityId: actor.municipalityId, createdAt: at }), version: (old?.version ?? 0) + 1, updatedAt: at, isDemo: true, key: 'lifecycle_policy', value: JSON.stringify(policy) })
      await db.entity('settings').put(row); await writeAudit(db, actor, tx, 'settings', old ?? null, row, 'configure_demo_lifecycle_policy'); return row
    })),
    save: (ctx: RequestContext, key: string | null, expected: number, input: LifecycleDraft) => respond(() => commitMutation(db, async tx => {
      const draft = draftSchema.parse(input), kind = draft.kind, actor = await authorize(db, ctx, lifecycleResources[kind], key ? 'update' : 'create'), old = key ? await local(kind, key, ctx) : null
      if (old) { owner(old, actor); checkVersion(old, expected); editable(old); if (old.assetId !== draft.assetId) throw new DataError('validation', 'A lifecycle request retains its original asset. Create a new request for another asset.') }
      const asset = await db.entity('assets').get(draft.assetId)
      if (!asset || asset.municipalityId !== actor.municipalityId) throw new DataError('not_found', 'Choose a local asset.')
      const at = new Date().toISOString(), lifecycle: LifecycleDetails = { baseline: assetSnapshot(asset), priorStatus: asset.lifecycleStatus, stage: 'draft', policy: null, approvalRequired: null, authorization: null, completedAt: null, completionNote: '', category: draft.kind === 'maintenance' ? draft.category : draft.kind, remarks: draft.remarks, startedDate: null, proposedDate: draft.proposedDate, review: null, history: [...(old?.lifecycle?.history ?? []), event(actor, old ? 'draft_corrected' : 'draft_created', draft.remarks || 'Lifecycle request prepared; official asset unchanged.', at)] }
      const fields = draft.kind === 'transfer' ? { fromDepartmentId: asset.departmentId, fromCustodianId: asset.custodianId, toDepartmentId: draft.toDepartmentId, toCustodianId: draft.toCustodianId, destinationLocation: draft.destinationLocation, effectiveDate: draft.proposedDate, reason: draft.reason } : draft.kind === 'maintenance' ? { description: draft.description, estimatedCost: draft.estimatedCost, scheduledDate: draft.proposedDate, actualCost: null, completedAt: null } : { reason: draft.reason, method: draft.method, proceeds: draft.proceeds, disposedAt: null, accountingRecordId: null }
      const candidate = parseEntity(lifecycleTables[kind], { ...(old ?? { id: crypto.randomUUID(), municipalityId: actor.municipalityId, createdAt: at, requestedById: actor.id, workflowStatus: 'draft', submittedAt: null, documentIds: [] }), assetId: asset.id, ...fields, version: (old?.version ?? 0) + 1, updatedAt: at, lifecycle })
      await validateLifecycle(db, kind, candidate)
      return put(kind, old, candidate, actor, tx, 'save_lifecycle_draft')
    })),
    submit: (ctx: RequestContext, kind: LifecycleKind, key: string, expected: number) => respond(() => commitMutation(db, async tx => {
      const { actor, row } = await propertyRow(ctx, kind, key, expected, 'submit'); editable(row)
      if (!row.lifecycle) throw new DataError('validation', 'Save and review the legacy request in Lifecycle Management before submission.')
      await validateLifecycle(db, kind, row)
      const at = new Date().toISOString(), policy = await lifecyclePolicy(db, actor.municipalityId), meta = structuredClone(row.lifecycle)
      const required = kind === 'disposal' || (kind === 'transfer' ? policy.transferRequiresApproval : policy.maintenanceApproval === 'always' || policy.maintenanceApproval === 'above_threshold' && 'estimatedCost' in row && row.estimatedCost >= policy.maintenanceThreshold)
      meta.policy = policy; meta.approvalRequired = required
      await lifecycleEvidence(db, kind, row, kind === 'disposal' || (kind === 'transfer' ? policy.transferDocumentsRequired : policy.maintenanceDocumentsRequired))
      if (kind === 'disposal' && meta.stage !== 'reviewed') {
        meta.stage = 'accounting_review'; meta.review = null; meta.history.push(event(actor, 'sent_to_accounting', 'Disposal accounting review requested. No asset or ledger changes.', at))
        const candidate = parseEntity('disposals', { ...row, lifecycle: meta, version: row.version + 1, updatedAt: at })
        const saved = await put(kind, row, candidate, actor, tx, 'request_disposal_accounting_review'); await notify(actor, 'accounting_officer', 'Disposal accounting review requested', '/dashboard/disposal-review', tx); return saved
      }
      await validateLifecycleAuthorization(db, kind, { ...row, lifecycle: meta })
      meta.stage = required ? 'approval' : 'authorized'; meta.history.push(event(actor, required ? 'submitted_for_approval' : 'authorized_by_configured_policy', required ? 'Submitted for centralized approval.' : 'Explicit Property submission authorized under the saved unverified demonstration policy.', at))
      if (!required) meta.authorization = { actorId: actor.id, occurredAt: at, source: 'configured_policy' }
      const candidate = parseEntity(lifecycleTables[kind], { ...row, workflowStatus: required ? 'submitted' : 'approved', submittedAt: at, lifecycle: meta, version: row.version + 1, updatedAt: at })
      const previous = await db.entity('approvals').where('subjectId').equals(row.id).filter(a => a.subjectType === kind).first()
      // Returned requests retain centralized authorization even if configuration later becomes less restrictive.
      if (previous && !required) throw new DataError('validation', 'A previously reviewed request must still use centralized approval. Re-enable approval or create a fresh request.')
      if (required) {
        const approval = parseEntity('approvals', { ...(previous ?? { id: crypto.randomUUID(), municipalityId: actor.municipalityId, createdAt: at, subjectType: kind, subjectId: row.id, assignedRole: 'approving_officer', history: [] }), requestedById: actor.id, version: (previous?.version ?? 0) + 1, updatedAt: at, workflowStatus: 'submitted', submittedAt: at, documentIds: row.documentIds, decidedAt: null, history: [...(previous?.history ?? []), { actorId: actor.id, actorRole: actor.role, action: 'submit', fromStatus: row.workflowStatus, toStatus: 'submitted', reason: 'Lifecycle authorization requested.', occurredAt: at, submission: { subjectVersion: candidate.version, documentIds: row.documentIds, payload: JSON.stringify({ request: candidate }) } }] })
        await db.entity('approvals').put(approval); await writeAudit(db, actor, tx, 'approvals', previous ?? null, approval, 'submit_lifecycle'); await notify(actor, 'approving_officer', 'Lifecycle request awaiting authorization', '/dashboard/approvals/lifecycle', tx)
      }
      return put(kind, row, candidate, actor, tx, required ? 'submit_lifecycle' : 'policy_authorized_lifecycle')
    })),
    reviewDisposal: (ctx: RequestContext, key: string, expected: number, decision: 'approve' | 'return', reason: string, expectedLedgerSnapshot?: string) => respond(() => commitMutation(db, async tx => {
      const actor = await authorize(db, ctx, 'disposal_review', 'update'), row = await local('disposal', key, ctx) as DisposalRequest; checkVersion(row, expected); const note = text.parse(reason); z.enum(['approve', 'return']).parse(decision)
      if (!row.lifecycle || row.lifecycle.stage !== 'accounting_review' || !['draft', 'returned'].includes(row.workflowStatus)) throw new DataError('invalid_transition', 'Only a disposal sent for Accounting review can be processed.')
      const at = new Date().toISOString(), meta = structuredClone(row.lifecycle)
      if (decision === 'approve') { await validateLifecycle(db, 'disposal', row); await lifecycleEvidence(db, 'disposal', row, true); const impact = await disposalImpact(db, row); if (expectedLedgerSnapshot !== impact.ledgerSnapshot) throw new DataError('conflict', 'Refresh and review the current ledger impact before approving Accounting review.'); meta.review = { actorId: actor.id, occurredAt: at, reason: note, impact }; meta.stage = 'reviewed' } else { meta.review = null; meta.stage = 'returned' }
      meta.history.push(event(actor, `accounting_${decision}`, meta.review ? `${note} Treatment: ${meta.review.impact.treatment}; cost ${meta.review.impact.cost}; posted depreciation ${meta.review.impact.accumulatedDepreciation}; carrying value ${meta.review.impact.carryingValue}; proposed proceeds ${meta.review.impact.proceeds} centavos.` : note, at))
      const saved = await put('disposal', row, { ...row, lifecycle: meta, version: row.version + 1, updatedAt: at }, actor, tx, `disposal_accounting_${decision}`, note)
      await notify(actor, 'property_officer', decision === 'approve' ? 'Disposal Accounting review complete; submit for approval' : 'Accounting returned disposal for correction', '/dashboard/disposal', tx, row.requestedById); return saved
    })),
    startMaintenance: (ctx: RequestContext, key: string, expected: number, date: string, note: string) => respond(() => commitMutation(db, async tx => {
      const { actor, row } = await propertyRow(ctx, 'maintenance', key, expected, 'update'), meta = structuredClone(row.lifecycle), startDate = z.iso.date().parse(date), reason = text.parse(note)
      if (!meta || row.workflowStatus !== 'approved' || meta.stage !== 'authorized' || !meta.authorization) throw new DataError('invalid_transition', 'Maintenance must be authorized before it starts.')
      const asset = await validateLifecycleAuthorization(db, 'maintenance', row)
      if (startDate < meta.proposedDate || startDate > lifecycleToday()) throw new DataError('validation', 'Start maintenance between its scheduled date and today.')
      const at = new Date().toISOString(), updated = parseEntity('assets', { ...asset, lifecycleStatus: 'under_maintenance', version: asset.version + 1, updatedAt: at })
      meta.stage = 'in_progress'; meta.startedDate = startDate; meta.baseline = assetSnapshot(updated); meta.history.push(event(actor, 'maintenance_started', reason, at))
      await db.entity('assets').put(updated); await writeAudit(db, actor, tx, 'assets', asset, updated, 'start_authorized_maintenance', reason)
      return put('maintenance', row, { ...row, lifecycle: meta, version: row.version + 1, updatedAt: at }, actor, tx, 'maintenance_started', reason)
    })),
    complete: (ctx: RequestContext, kind: LifecycleKind, key: string, expected: number, input: { date: string; note: string; actualCost?: number }) => respond(() => commitMutation(db, async tx => {
      const { actor, row } = await propertyRow(ctx, kind, key, expected, 'update'), draft = z.strictObject({ date: z.iso.date(), note: text, actualCost: moneySchema.optional() }).parse(input), meta = structuredClone(row.lifecycle)
      if (!meta || !meta.authorization || row.workflowStatus !== 'approved' || meta.stage !== (kind === 'maintenance' ? 'in_progress' : 'authorized')) throw new DataError('invalid_transition', 'Only an authorized, uncompleted transaction can be completed.')
      const asset = await validateLifecycleAuthorization(db, kind, row)
      if (draft.date > lifecycleToday() || draft.date < (meta.startedDate ?? meta.proposedDate) || kind !== 'maintenance' && draft.date !== meta.proposedDate) throw new DataError('validation', 'Use the authorized transfer/disposal date, or a maintenance completion date between start and today.')
      if (kind === 'maintenance' && (!('estimatedCost' in row) || draft.actualCost === undefined || draft.actualCost > row.estimatedCost)) throw new DataError('validation', 'Record actual cost within the authorized estimate. A higher cost requires a new authorization request.')
      const at = new Date().toISOString(); let updated: Asset = asset, accountingRecordId: string | null = null
      if (kind === 'transfer' && 'toDepartmentId' in row) updated = parseEntity('assets', { ...asset, departmentId: row.toDepartmentId, custodianId: row.toCustodianId, location: row.destinationLocation, version: asset.version + 1, updatedAt: at })
      if (kind === 'maintenance') updated = parseEntity('assets', { ...asset, lifecycleStatus: meta.priorStatus, version: asset.version + 1, updatedAt: at })
      if (kind === 'disposal') {
        const impact = meta.review!.impact
        const lines = [{ accountCode: 'DEMO-PPE', debit: 0, credit: impact.cost }, { accountCode: 'DEMO-ACCUMULATED-DEPRECIATION', debit: impact.accumulatedDepreciation, credit: 0 }, { accountCode: 'DEMO-DISPOSAL-RECEIVABLE', debit: impact.proceeds, credit: 0 }, { accountCode: 'DEMO-DISPOSAL-LOSS', debit: Math.max(0, impact.carryingValue - impact.proceeds), credit: 0 }, { accountCode: 'DEMO-DISPOSAL-GAIN', debit: 0, credit: Math.max(0, impact.proceeds - impact.carryingValue) }].filter(e => e.debit || e.credit)
        if (!lines.length) lines.push({ accountCode: 'DEMO-NON-PPE-RETIREMENT', debit: 0, credit: 0 })
        for (const line of lines) { const entry = parseEntity('accountingRecords', { id: crypto.randomUUID(), municipalityId: actor.municipalityId, version: 1, createdAt: at, updatedAt: at, assetId: asset.id, projectId: null, sourceId: row.id, kind: 'disposal', postingDate: draft.date, ...line, policyId: null, policyVersion: null, postedById: actor.id }); await db.entity('accountingRecords').add(entry); accountingRecordId ??= entry.id; await writeAudit(db, actor, tx, 'accountingRecords', null, entry, 'post_mock_disposal', meta.review!.reason) }
        updated = parseEntity('assets', { ...asset, lifecycleStatus: 'disposed', disposedDate: draft.date, version: asset.version + 1, updatedAt: at })
      }
      meta.stage = 'completed'; meta.completedAt = at; meta.completionNote = draft.note; meta.history.push(event(actor, `${kind}_completed`, draft.note, at))
      const extra = kind === 'maintenance' ? { actualCost: draft.actualCost, completedAt: `${draft.date}T00:00:00.000Z` } : kind === 'disposal' ? { disposedAt: `${draft.date}T00:00:00.000Z`, accountingRecordId } : {}
      await db.entity('assets').put(updated); await writeAudit(db, actor, tx, 'assets', asset, updated, `complete_authorized_${kind}`, draft.note)
      return put(kind, row, parseEntity(lifecycleTables[kind], { ...row, ...extra, lifecycle: meta, version: row.version + 1, updatedAt: at }), actor, tx, `${kind}_completed`, draft.note)
    })),
    cancel: (ctx: RequestContext, kind: LifecycleKind, key: string, expected: number, reason: string) => respond(() => commitMutation(db, async tx => {
      const { actor, row } = await propertyRow(ctx, kind, key, expected, 'update'), note = text.parse(reason)
      if (row.workflowStatus === 'approved' && row.lifecycle?.stage === 'authorized') {
        const at = new Date().toISOString()
        return put(kind, row, { ...row, version: row.version + 1, updatedAt: at, lifecycle: { ...row.lifecycle, stage: 'cancelled', history: [...row.lifecycle.history, event(actor, 'unused_authorization_withdrawn', note, at)] } }, actor, tx, 'withdraw_unused_lifecycle_authorization', note)
      }
      if (!['draft', 'returned', 'submitted'].includes(row.workflowStatus)) throw new DataError('invalid_transition', 'Only unapproved draft, returned or submitted requests can be cancelled.')
      const at = new Date().toISOString(), previous = await db.entity('approvals').where('subjectId').equals(row.id).filter(a => a.subjectType === kind).first()
      if (previous) { const approval = parseEntity('approvals', { ...previous, version: previous.version + 1, updatedAt: at, workflowStatus: 'cancelled', decidedAt: null, history: [...previous.history, { actorId: actor.id, actorRole: actor.role, action: 'cancel', fromStatus: row.workflowStatus, toStatus: 'cancelled', reason: note, occurredAt: at }] }); await db.entity('approvals').put(approval); await writeAudit(db, actor, tx, 'approvals', previous, approval, 'cancel_lifecycle', note) }
      return put(kind, row, { ...row, workflowStatus: 'cancelled', updatedAt: at, version: row.version + 1, ...(row.lifecycle ? { lifecycle: { ...row.lifecycle, stage: 'cancelled', history: [...row.lifecycle.history, event(actor, 'cancelled', note, at)] } } : {}) }, actor, tx, 'cancel_lifecycle', note)
    })),
  }
}
export type LifecycleOverview = Extract<Awaited<ReturnType<ReturnType<typeof createLifecycleService>['overview']>>, { ok: true }>['data']
