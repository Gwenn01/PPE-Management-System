import { z } from 'zod'
import { importedBalanceSchema, reconciliationPolicySchema, type ReconciliationCorrection, type ReconciliationSession } from '../domain/reconciliation.js'
import type { Reconciliation, User } from '../domain/models.js'
import { database, type MockDatabase } from '../mock/database.js'
import { authorize, commitMutation, writeAudit } from '../mock/unitOfWork.js'
import { parseEntity } from '../mock/validation/schemas.js'
import type { RequestContext } from './contracts.js'
import { DataError, respond } from './errors.js'
import { lifecycleToday } from './lifecycleValidation.js'
import { assertCurrentReconciliation, captureReconciliation, getReconciliationPolicy, reconciliationBalances, validateReconciliationCorrection } from './reconciliationValidation.js'

const text = z.string().trim().min(1).max(4000), id = z.string().min(1).max(160)
const sessionInput = z.strictObject({ periodStart: z.iso.date(), periodEnd: z.iso.date(), categoryId: id.nullable(), includeCIP: z.boolean() })
export type ReconciliationInput = z.infer<typeof sessionInput>
const correctionInput = z.strictObject({ rowKey: id, mode: z.enum(['adjust_local_ledger', 'correct_import', 'documented_exception']), reason: text, correctionId: id.nullable(), correctionVersion: z.number().int().min(0) })
export type ReconciliationProposal = z.infer<typeof correctionInput>
const event = (actor: User, at: string, action: string, note: string) => ({ id: crypto.randomUUID(), actorId: actor.id, occurredAt: at, action, note })
export function createReconciliationService(db: MockDatabase = database) {
  async function local(ctx: RequestContext, key: string) { const row = await db.entity('reconciliations').get(id.parse(key)); if (!row || row.municipalityId !== ctx.municipalityId) throw new DataError('not_found', 'Reconciliation unavailable in this municipality.'); return row }
  function checked(row: Reconciliation, expected: number) { if (row.version !== z.number().int().positive().parse(expected)) throw new DataError('conflict', 'This reconciliation changed. Reload before continuing.') }
  function owned(row: Reconciliation, actor: User) { if (row.requestedById !== actor.id) throw new DataError('forbidden', 'Only the originating Accounting Officer can edit this reconciliation.') }
  async function parentFor(ctx: RequestContext, key: string, expected: number, action: 'update' | 'submit' = 'update') { const actor = await authorize(db, ctx, 'reconciliations', action), row = await local(ctx, key); owned(row, actor); checked(row, expected); if (!row.reconciliationSession || row.reconciliationSession.status !== 'open') throw new DataError('invalid_transition', 'Choose an open managed reconciliation session.'); return { actor, row } }
  async function active(parentId: string, exceptId?: string) { return db.entity('reconciliations').filter(r => r.reconciliationCorrection?.sessionId === parentId && r.id !== exceptId && ['draft', 'returned', 'submitted', 'under_review'].includes(r.workflowStatus)).toArray() }
  async function notify(actor: User, role: User['role'], title: string, tx: string) { const at = new Date().toISOString(); for (const u of await db.entity('users').where('municipalityId').equals(actor.municipalityId).filter(u => u.role === role && u.status === 'active').toArray()) { const row = parseEntity('notifications', { id: crypto.randomUUID(), municipalityId: actor.municipalityId, version: 1, createdAt: at, updatedAt: at, recipientId: u.id, title, message: title, severity: 'info', href: role === 'approving_officer' ? '/dashboard/approvals/corrections' : '/dashboard/reconciliation', readAt: null }); await db.entity('notifications').add(row); await writeAudit(db, actor, tx, 'notifications', null, row, 'reconciliation_notice') } }
  return {
    overview: (ctx: RequestContext) => respond(() => db.transaction('r', db.tables, async () => {
      await authorize(db, ctx, 'reconciliations', 'read'); await authorize(db, ctx, 'accounting_records', 'read'); await authorize(db, ctx, 'assets', 'read')
      const records = await db.entity('reconciliations').where('municipalityId').equals(ctx.municipalityId).toArray(), ids = new Set(records.map(r => r.id))
      const categories = await db.entity('assetCategories').where('municipalityId').equals(ctx.municipalityId).toArray()
      const documents = await db.entity('documents').where('municipalityId').equals(ctx.municipalityId).filter(d => d.entityType === 'reconciliation' && ids.has(d.entityId)).toArray()
      const approvals = await db.entity('approvals').where('municipalityId').equals(ctx.municipalityId).filter(a => a.subjectType === 'reconciliation' && ids.has(a.subjectId)).toArray()
      return { sessions: records.filter(r => !r.reconciliationCorrection), corrections: records.filter(r => !!r.reconciliationCorrection), categories, documents, approvals, policy: await getReconciliationPolicy(db, ctx.municipalityId) }
    })),
    policy: (ctx: RequestContext) => respond(() => db.transaction('r', db.tables, async () => { await authorize(db, ctx, 'settings', 'read'); const old = await db.entity('settings').where('[municipalityId+key]').equals([ctx.municipalityId, 'reconciliation_policy']).first(); return { policy: await getReconciliationPolicy(db, ctx.municipalityId), version: old?.version ?? 0 } })),
    savePolicy: (ctx: RequestContext, expected: number, input: z.infer<typeof reconciliationPolicySchema>) => respond(() => commitMutation(db, async tx => { const actor = await authorize(db, ctx, 'settings', 'manage'), policy = reconciliationPolicySchema.parse(input), old = await db.entity('settings').where('[municipalityId+key]').equals([ctx.municipalityId, 'reconciliation_policy']).first(); if ((old?.version ?? 0) !== z.number().int().min(0).parse(expected)) throw new DataError('conflict', 'Reconciliation policy changed. Reload.'); const at = new Date().toISOString(), row = parseEntity('settings', { ...(old ?? { id: crypto.randomUUID(), municipalityId: actor.municipalityId, createdAt: at, isDemo: true }), version: (old?.version ?? 0) + 1, updatedAt: at, key: 'reconciliation_policy', value: JSON.stringify(policy) }); await db.entity('settings').put(row); await writeAudit(db, actor, tx, 'settings', old ?? null, row, 'configure_demo_reconciliation'); return row })),
    create: (ctx: RequestContext, input: ReconciliationInput) => respond(() => commitMutation(db, async tx => {
      const actor = await authorize(db, ctx, 'reconciliations', 'create'), draft = sessionInput.parse(input)
      if (draft.periodStart > draft.periodEnd || draft.periodEnd > lifecycleToday()) throw new DataError('validation', 'Use an ordered accounting period ending no later than today.')
      if (draft.categoryId) { const category = await db.entity('assetCategories').get(draft.categoryId); if (!category || category.municipalityId !== actor.municipalityId) throw new DataError('validation', 'Choose a local asset category.') }
      if (await db.entity('reconciliations').where('municipalityId').equals(actor.municipalityId).filter(r => r.periodStart === draft.periodStart && r.periodEnd === draft.periodEnd && r.reconciliationSession?.categoryId === draft.categoryId && r.reconciliationSession?.includeCIP === draft.includeCIP && r.reconciliationSession?.status === 'open').count()) throw new DataError('duplicate', 'An open session already covers this accounting period and scope.')
      const at = new Date().toISOString(), meta: ReconciliationSession = { status: 'open', categoryId: draft.categoryId, includeCIP: draft.includeCIP, policy: await getReconciliationPolicy(db, actor.municipalityId), rows: [], sourceSnapshot: '', captureId: crypto.randomUUID(), captures: [], imported: null, importHistory: [], overrides: [], exceptions: [], completedAt: null, completionNote: '', history: [] }
      const row = parseEntity('reconciliations', { id: crypto.randomUUID(), municipalityId: actor.municipalityId, version: 1, createdAt: at, updatedAt: at, requestedById: actor.id, workflowStatus: 'draft', submittedAt: null, documentIds: [], periodStart: draft.periodStart, periodEnd: draft.periodEnd, propertyBalance: 0, accountingBalance: 0, differences: [], adjustmentRecordIds: [], reconciliationSession: meta })
      await db.entity('reconciliations').add(row); await writeAudit(db, actor, tx, 'reconciliations', null, row, 'create_reconciliation')
      const saved = await captureReconciliation(db, row, actor, at, 'capture_source_balances', 'Initial local PPE, posted accounting and relevant CIP comparison.', tx)
      if (!saved.reconciliationSession!.rows.length) throw new DataError('validation', 'The chosen period and scope contain no PPE or CIP records.')
      return saved
    })),
    refresh: (ctx: RequestContext, key: string, expected: number) => respond(() => commitMutation(db, async tx => { const { actor, row } = await parentFor(ctx, key, expected); if ((await active(row.id)).length) throw new DataError('invalid_transition', 'Resolve or cancel draft/returned corrections before refreshing; submitted corrections must be decided first.'); return captureReconciliation(db, row, actor, new Date().toISOString(), 'refresh_balances', 'Explicit source refresh; all earlier captures retained.', tx) })),
    template: (ctx: RequestContext, key: string) => respond(() => db.transaction('r', db.tables, async () => { await authorize(db, ctx, 'reconciliations', 'read'); const parent = await local(ctx, key); if (!parent.reconciliationSession) throw new DataError('validation', 'Choose a managed session.'); return JSON.stringify({ format: 'ppe-mock-accounting-balances', version: 1, municipalityId: parent.municipalityId, periodStart: parent.periodStart, periodEnd: parent.periodEnd, rows: parent.reconciliationSession.rows.map(r => ({ entityType: r.entityType, entityId: r.entityId, values: r.accounting ?? r.reference })) }, null, 2) })),
    importBalances: (ctx: RequestContext, key: string, expected: number, json: string, name: string) => respond(async () => {
      if (typeof json !== 'string' || new TextEncoder().encode(json).length > 1024 * 1024) throw new DataError('validation', 'Import a mock balance JSON file up to 1 MiB.')
      let dataset: z.infer<typeof importedBalanceSchema>; try { dataset = importedBalanceSchema.parse(JSON.parse(json)) } catch { throw new DataError('validation', 'Use the supplied mock-balance JSON format and safe integer centavos; net book values must agree.') }
      return commitMutation(db, async tx => {
        const { actor, row } = await parentFor(ctx, key, expected), label = text.parse(name)
        if ((await active(row.id)).length) throw new DataError('invalid_transition', 'Resolve or cancel active corrections before importing another comparison.')
        if (dataset.municipalityId !== actor.municipalityId) throw new DataError('forbidden', 'Import balances for this municipality only.')
        if (dataset.periodStart !== row.periodStart || dataset.periodEnd !== row.periodEnd) throw new DataError('validation', 'Imported accounting period must match the session exactly.')
        const validRows = (await reconciliationBalances(db, row)).rows, keys = dataset.rows.map(r => `${r.entityType}:${r.entityId}`)
        if (new Set(keys).size !== keys.length) throw new DataError('duplicate', 'The mock accounting dataset contains duplicate entity balances.')
        if (keys.some(key => !validRows.some(r => r.key === key))) throw new DataError('validation', 'Imported balances contain an unknown, out-of-scope or foreign entity.')
        const at = new Date().toISOString(), imported = { name: label, actorId: actor.id, occurredAt: at, dataset }
        return captureReconciliation(db, row, actor, at, 'import_mock_accounting_balances', `${label}; original imported rows retained. Missing rows remain discrepancies.`, tx, { imported, importHistory: [...row.reconciliationSession!.importHistory, imported], overrides: [], exceptions: [] })
      })
    }),
    investigate: (ctx: RequestContext, key: string, expected: number, rowKey: string, finding: string) => respond(() => commitMutation(db, async tx => {
      const { actor, row } = await parentFor(ctx, key, expected); await assertCurrentReconciliation(db, row)
      if ((await active(row.id)).some(r => ['submitted', 'under_review'].includes(r.workflowStatus))) throw new DataError('invalid_transition', 'A submitted correction locks this comparison until a decision.')
      const note = text.parse(finding), meta = structuredClone(row.reconciliationSession!), comparison = meta.rows.find(r => r.key === id.parse(rowKey))
      if (!comparison || comparison.status !== 'discrepancy') throw new DataError('validation', 'Select a current discrepancy for investigation.')
      comparison.finding = note; const at = new Date().toISOString(); meta.history.push(event(actor, at, 'investigate_difference', `${comparison.label}: ${note}`))
      const saved = parseEntity('reconciliations', { ...row, reconciliationSession: meta, version: row.version + 1, updatedAt: at }); await db.entity('reconciliations').put(saved); await writeAudit(db, actor, tx, 'reconciliations', row, saved, 'investigate_difference', note); return saved
    })),
    prepare: (ctx: RequestContext, key: string, expected: number, input: ReconciliationProposal) => respond(() => commitMutation(db, async tx => {
      const { actor, row: parent } = await parentFor(ctx, key, expected), draft = correctionInput.parse(input); await assertCurrentReconciliation(db, parent)
      const old = draft.correctionId ? await local(ctx, draft.correctionId) : null
      if (old) { owned(old, actor); checked(old, draft.correctionVersion); if (old.reconciliationCorrection?.sessionId !== parent.id || !['draft', 'returned'].includes(old.workflowStatus)) throw new DataError('invalid_transition', 'Only a draft or returned correction for this session can be revised.') }
      if ((await active(parent.id, old?.id)).length) throw new DataError('invalid_transition', 'Process or cancel the existing active correction before preparing another.')
      const comparison = parent.reconciliationSession!.rows.find(r => r.key === draft.rowKey)
      if (!comparison || comparison.status !== 'discrepancy' || !comparison.finding.trim()) throw new DataError('validation', 'Investigate a current discrepancy before preparing a correction.')
      const prior = await db.entity('reconciliations').where('municipalityId').equals(actor.municipalityId).filter(r => r.reconciliationCorrection?.sessionId === parent.id && r.reconciliationCorrection.rowKey === comparison.key && r.workflowStatus === 'rejected').last()
      const at = new Date().toISOString(), correction: ReconciliationCorrection = { sessionId: parent.id, rowKey: comparison.key, captureId: parent.reconciliationSession!.captureId, mode: draft.mode, policy: structuredClone(parent.reconciliationSession!.policy), reason: draft.reason, finding: comparison.finding, before: structuredClone(comparison), target: structuredClone(comparison.reference), sourceSnapshot: parent.reconciliationSession!.sourceSnapshot, appliedAt: null, supersedesId: old?.reconciliationCorrection?.supersedesId ?? prior?.id ?? null, history: [...(old?.reconciliationCorrection?.history ?? []), event(actor, at, 'prepare_correction', draft.reason)] }
      const row = parseEntity('reconciliations', { ...(old ?? { id: crypto.randomUUID(), municipalityId: actor.municipalityId, createdAt: at, requestedById: actor.id, workflowStatus: 'draft', submittedAt: null, documentIds: [], adjustmentRecordIds: [] }), version: (old?.version ?? 0) + 1, updatedAt: at, periodStart: parent.periodStart, periodEnd: parent.periodEnd, propertyBalance: comparison.reference.cost, accountingBalance: comparison.accounting?.cost ?? 0, differences: [], reconciliationCorrection: correction })
      await validateReconciliationCorrection(db, row, false); await db.entity('reconciliations').put(row); await writeAudit(db, actor, tx, 'reconciliations', old, row, 'prepare_reconciliation_correction', draft.reason); return row
    })),
    submit: (ctx: RequestContext, key: string, expected: number) => respond(() => commitMutation(db, async tx => {
      const actor = await authorize(db, ctx, 'reconciliations', 'submit'), old = await local(ctx, key); owned(old, actor); checked(old, expected)
      if (!['draft', 'returned'].includes(old.workflowStatus)) throw new DataError('invalid_transition', 'Only draft or returned correction requests can be submitted.')
      const { parent } = await validateReconciliationCorrection(db, old)
      if ((await active(parent.id, old.id)).length) throw new DataError('invalid_transition', 'Another correction is active in this session.')
      const at = new Date().toISOString(), row = parseEntity('reconciliations', { ...old, version: old.version + 1, updatedAt: at, workflowStatus: 'submitted', submittedAt: at, reconciliationCorrection: { ...old.reconciliationCorrection!, history: [...old.reconciliationCorrection!.history, event(actor, at, 'submitted', old.reconciliationCorrection!.reason)] } }), previous = await db.entity('approvals').where('subjectId').equals(old.id).filter(a => a.subjectType === 'reconciliation').first()
      const approval = parseEntity('approvals', { ...(previous ?? { id: crypto.randomUUID(), municipalityId: actor.municipalityId, createdAt: at, assignedRole: 'approving_officer', subjectType: 'reconciliation', subjectId: row.id, history: [] }), requestedById: actor.id, version: (previous?.version ?? 0) + 1, updatedAt: at, submittedAt: at, workflowStatus: 'submitted', documentIds: row.documentIds, decidedAt: null, history: [...(previous?.history ?? []), { actorId: actor.id, actorRole: actor.role, action: 'submit', fromStatus: old.workflowStatus, toStatus: 'submitted', reason: old.reconciliationCorrection!.reason, occurredAt: at, submission: { subjectVersion: row.version, documentIds: row.documentIds, payload: JSON.stringify({ request: row, period: { start: parent.periodStart, end: parent.periodEnd }, policy: parent.reconciliationSession!.policy }) } }] })
      await db.entity('reconciliations').put(row); await db.entity('approvals').put(approval); await writeAudit(db, actor, tx, 'reconciliations', old, row, 'submit_reconciliation_correction'); await writeAudit(db, actor, tx, 'approvals', previous ?? null, approval, 'submit_reconciliation_correction'); await notify(actor, 'approving_officer', 'Reconciliation correction requires approval', tx); return row
    })),
    cancelCorrection: (ctx: RequestContext, key: string, expected: number, reason: string) => respond(() => commitMutation(db, async tx => {
      const actor = await authorize(db, ctx, 'reconciliations', 'update'), old = await local(ctx, key); owned(old, actor); checked(old, expected); const note = text.parse(reason)
      if (!old.reconciliationCorrection || !['draft', 'returned'].includes(old.workflowStatus)) throw new DataError('invalid_transition', 'Only draft or returned corrections can be cancelled.')
      const at = new Date().toISOString(), previous = await db.entity('approvals').where('subjectId').equals(old.id).filter(a => a.subjectType === 'reconciliation').first()
      if (previous) { const a = parseEntity('approvals', { ...previous, workflowStatus: 'cancelled', version: previous.version + 1, updatedAt: at, history: [...previous.history, { actorId: actor.id, actorRole: actor.role, action: 'cancel', fromStatus: old.workflowStatus, toStatus: 'cancelled', reason: note, occurredAt: at }] }); await db.entity('approvals').put(a); await writeAudit(db, actor, tx, 'approvals', previous, a, 'cancel_reconciliation_correction', note) }
      const row = parseEntity('reconciliations', { ...old, workflowStatus: 'cancelled', version: old.version + 1, updatedAt: at, reconciliationCorrection: { ...old.reconciliationCorrection, history: [...old.reconciliationCorrection.history, event(actor, at, 'cancelled', note)] } }); await db.entity('reconciliations').put(row); await writeAudit(db, actor, tx, 'reconciliations', old, row, 'cancel_reconciliation_correction', note); return row
    })),
    complete: (ctx: RequestContext, key: string, expected: number, note: string) => respond(() => commitMutation(db, async tx => {
      const { actor, row } = await parentFor(ctx, key, expected); await assertCurrentReconciliation(db, row); const reason = text.parse(note), meta = structuredClone(row.reconciliationSession!)
      if ((await active(row.id)).length || !meta.rows.length || meta.rows.some(r => r.status === 'discrepancy')) throw new DataError('validation', 'Resolve every required difference or obtain an approved configured exception, and finish all active correction requests before completing.')
      const at = new Date().toISOString(); meta.status = 'completed'; meta.completedAt = at; meta.completionNote = reason; meta.history.push(event(actor, at, 'reconciliation_completed', reason))
      const saved = parseEntity('reconciliations', { ...row, reconciliationSession: meta, version: row.version + 1, updatedAt: at }); await db.entity('reconciliations').put(saved); await writeAudit(db, actor, tx, 'reconciliations', row, saved, 'complete_reconciliation', reason); return saved
    })),
  }
}
export type ReconciliationOverview = Extract<Awaited<ReturnType<ReturnType<typeof createReconciliationService>['overview']>>, { ok: true }>['data']
