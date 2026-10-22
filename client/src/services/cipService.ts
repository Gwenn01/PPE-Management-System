import { z } from 'zod'
import { cipCategories } from '../domain/cip.js'
import type { ConstructionProject } from '../domain/models.js'
import { database, type MockDatabase } from '../mock/database.js'
import { authorize, commitMutation, writeAudit } from '../mock/unitOfWork.js'
import { moneySchema, parseEntity } from '../mock/validation/schemas.js'
import type { RequestContext } from './contracts.js'
import { scopedRecord, visibleRecord } from './entityAccess.js'
import { DataError, respond } from './errors.js'
import { accountingReceipts, assertCIPMutable, cipDocument, cipNotification, projectCIPBalance, safeTotal, validateCapitalization } from './cipValidation.js'

const text = z.string().trim().min(1).max(2000)
const costSchema = z.strictObject({ projectId: z.string().min(1), reference: z.string().trim().min(1).max(100), description: text, category: z.enum(cipCategories), amount: moneySchema.refine(v => v > 0), date: z.iso.date(), supportingDocumentId: z.string().min(1), budgetPacketId: z.string().min(1) })
export type CIPCostInput = z.infer<typeof costSchema>
const preparationSchema = z.strictObject({ costIds: z.array(z.string().min(1)).min(1).max(100), propertyNumber: z.string().trim().min(1).max(100), category: z.string().min(1), custodianId: z.string().nullable(), policyId: z.string().min(1), policyVersion: z.number().int().positive(), treatment: z.enum(['depreciable_ppe', 'non_depreciable_ppe']), usefulLifeMonths: z.number().int().min(0).max(1200), residualValue: moneySchema, verificationNote: text })
export type CapitalizationInput = z.infer<typeof preparationSchema>

export function createCIPService(db: MockDatabase = database) {
  async function projectForAccounting(ctx: RequestContext, id: string, action: 'create' | 'update' | 'submit') {
    const actor = await authorize(db, ctx, 'cip_costs', action)
    const project = await scopedRecord(db, actor, 'projects', id)
    assertCIPMutable(project)
    if (!(await accountingReceipts(db, project, actor.id)).length) throw new DataError('forbidden', 'Accounting must acknowledge a completed Budget document handoff for this project.')
    return { actor, project }
  }
  return {
    overview: (ctx: RequestContext) => respond(() => db.transaction('r', db.tables, async () => {
      const actor = await authorize(db, ctx, 'cip_costs', 'read')
      const projects: ConstructionProject[] = []
      for (const p of await db.entity('projects').where('municipalityId').equals(ctx.municipalityId).toArray()) if (p.construction && await visibleRecord(db, actor, 'projects', p) && (await accountingReceipts(db, p, actor.id)).length) projects.push(p)
      const ids = new Set(projects.map(p => p.id))
      const costs = await db.entity('cipCosts').where('municipalityId').equals(ctx.municipalityId).filter(c => ids.has(c.projectId)).toArray()
      const documents = await db.entity('documents').where('municipalityId').equals(ctx.municipalityId).filter(d => d.entityType === 'project' && ids.has(d.entityId)).toArray()
      const packets = await db.entity('documentRouting').where('municipalityId').equals(ctx.municipalityId).filter(r => ids.has(r.projectId) && r.toRole === 'accounting_officer' && r.assignedUserId === actor.id && r.workflowStatus === 'approved').toArray()
      const balances = await Promise.all(projects.map(async p => ({ projectId: p.id, cipBalance: await projectCIPBalance(db, p.id), approvedCosts: safeTotal(costs.filter(c => c.projectId === p.id && ['approved', 'capitalized'].includes(c.accounting?.status ?? '')).map(c => c.amount)) })))
      const policies = await db.entity('depreciationPolicies').where('municipalityId').equals(ctx.municipalityId).toArray()
      const categories = await db.entity('assetCategories').where('municipalityId').equals(ctx.municipalityId).toArray()
      const users = (await db.entity('users').where('municipalityId').equals(ctx.municipalityId).filter(u => u.status === 'active').toArray()).map(u => ({ id: u.id, name: u.name, departmentId: u.departmentId }))
      const approvals = await db.entity('approvals').where('municipalityId').equals(ctx.municipalityId).filter(a => a.subjectType === 'capitalization' && ids.has(a.subjectId)).toArray()
      const entries = await db.entity('accountingRecords').where('municipalityId').equals(ctx.municipalityId).filter(e => !!e.projectId && ids.has(e.projectId)).toArray()
      return { projects, costs, documents, packets, balances, policies, categories, users, approvals, entries }
    })),
    recordCost: (ctx: RequestContext, input: CIPCostInput) => respond(() => commitMutation(db, async tx => {
      const draft = costSchema.parse(input), { actor, project } = await projectForAccounting(ctx, draft.projectId, 'create')
      const packet = (await accountingReceipts(db, project, actor.id)).find(r => r.id === draft.budgetPacketId)
      if (!packet?.budgetHandoff || draft.date < project.startDate.slice(0, 10) || draft.date > new Date().toISOString().slice(0, 10)) throw new DataError('validation', 'Choose an acknowledged Budget packet and a transaction date between project start and today.')
      const evidence = await cipDocument(db, project, draft.supportingDocumentId)
      if (evidence.projectDocumentType !== 'cip_support') throw new DataError('validation', 'Choose a classified CIP supporting document.')
      const costs = await db.entity('cipCosts').where('municipalityId').equals(actor.municipalityId).toArray()
      if (costs.some(c => c.accounting?.reference.toLowerCase() === draft.reference.toLowerCase())) throw new DataError('duplicate', 'Cost reference already exists in this municipality.')
      const active = costs.filter(c => c.projectId === project.id && c.accounting && c.accounting.status !== 'excluded')
      if (safeTotal([...active.map(c => c.amount), draft.amount]) > project.budgetAmount || safeTotal([...active.filter(c => c.accounting!.budgetPacketId === packet.id).map(c => c.amount), draft.amount]) > packet.budgetHandoff.voucher.amount) throw new DataError('validation', 'Demo eligible expenditures cannot exceed project budget or the acknowledged packet voucher amount.')
      const at = new Date().toISOString()
      const row = parseEntity('cipCosts', { id: crypto.randomUUID(), municipalityId: actor.municipalityId, version: 1, createdAt: at, updatedAt: at, workflowStatus: 'draft', requestedById: actor.id, submittedAt: null, documentIds: [], projectId: project.id, description: draft.description, amount: draft.amount, incurredDate: draft.date, accountingRecordId: null, accounting: { reference: draft.reference, category: draft.category, supportingDocumentId: evidence.id, budgetPacketId: packet.id, status: 'pending_review', reviewNote: '', reviewedById: null, reviewedAt: null, transferredAt: null } })
      await db.entity('cipCosts').add(row); await writeAudit(db, actor, tx, 'cipCosts', null, row, 'record_cip_expenditure')
      return row
    })),
    reviewCost: (ctx: RequestContext, id: string, version: number, decision: 'approve' | 'exclude', note: string) => respond(() => commitMutation(db, async tx => {
      const result = z.enum(['approve', 'exclude']).parse(decision), reason = text.parse(note)
      const actor = await authorize(db, ctx, 'cip_costs', 'update'), old = await scopedRecord(db, actor, 'cipCosts', id)
      const { project } = await projectForAccounting(ctx, old.projectId, 'update')
      if (old.version !== z.number().int().positive().parse(version)) throw new DataError('conflict', 'The cost changed. Reload before reviewing.')
      if (!old.accounting || old.accounting.status !== 'pending_review' && !(old.accounting.status === 'approved' && result === 'exclude')) throw new DataError('invalid_transition', 'Only pending costs can be approved; approved untransferred costs can be excluded with a reversing CIP entry.')
      await cipDocument(db, project, old.accounting.supportingDocumentId)
      const at = new Date().toISOString(), reversing = old.accounting.status === 'approved' && result === 'exclude'
      let postingId = old.accountingRecordId, reversalRecordId = old.accounting.reversalRecordId
      if (result === 'approve' || reversing) {
        const posting = parseEntity('accountingRecords', { id: crypto.randomUUID(), municipalityId: actor.municipalityId, version: 1, createdAt: at, updatedAt: at, assetId: null, projectId: project.id, sourceId: old.id, kind: 'cip', postingDate: reversing ? at.slice(0, 10) : old.incurredDate.slice(0, 10), accountCode: 'DEMO-CIP', debit: reversing ? 0 : old.amount, credit: reversing ? old.amount : 0, policyId: null, policyVersion: null, postedById: actor.id })
        await db.entity('accountingRecords').add(posting); await writeAudit(db, actor, tx, 'accountingRecords', null, posting, reversing ? 'reverse_excluded_cip' : 'approve_qualifying_cip', reason)
        if (reversing) reversalRecordId = posting.id; else postingId = posting.id
      }
      const row = parseEntity('cipCosts', { ...old, version: old.version + 1, updatedAt: at, workflowStatus: result === 'approve' ? 'approved' : 'rejected', submittedAt: old.submittedAt ?? at, accountingRecordId: postingId, accounting: { ...old.accounting, ...(reversalRecordId ? { reversalRecordId } : {}), status: result === 'approve' ? 'approved' : 'excluded', reviewNote: reason, reviewedById: actor.id, reviewedAt: at } })
      await db.entity('cipCosts').put(row); await writeAudit(db, actor, tx, 'cipCosts', old, row, `review_cip_${result}`, reason)
      return row
    })),
    prepare: (ctx: RequestContext, projectId: string, version: number, input: CapitalizationInput) => respond(() => commitMutation(db, async tx => {
      const draft = preparationSchema.parse(input), { actor, project } = await projectForAccounting(ctx, projectId, 'update')
      if (project.version !== z.number().int().positive().parse(version)) throw new DataError('conflict', 'The project changed. Reload before preparing capitalization.')
      if (project.capitalization && project.capitalization.requestedById !== actor.id) throw new DataError('forbidden', 'Only the capitalization preparer can revise this request.')
      const policy = await scopedRecord(db, actor, 'depreciationPolicies', draft.policyId)
      if (policy.version !== draft.policyVersion) throw new DataError('conflict', 'Policy changed. Review its current version.')
      const costs = (await db.entity('cipCosts').where('projectId').equals(projectId).toArray()).filter(c => c.accounting?.status === 'approved').sort((a, b) => a.id.localeCompare(b.id))
      const total = safeTotal(costs.map(c => c.amount)), at = new Date().toISOString()
      const packets = await accountingReceipts(db, project)
      const evidenceIds = [...new Set([...(project.readyForUse?.documentIds ?? []), ...costs.map(c => c.accounting!.supportingDocumentId), ...packets.flatMap(r => r.documentIds)])]
      const row = parseEntity('projects', { ...project, version: project.version + 1, updatedAt: at, capitalization: { requestedById: actor.id, costIds: draft.costIds, costSnapshot: JSON.stringify(costs), total, propertyNumber: draft.propertyNumber, category: draft.category, custodianId: draft.custodianId, evidenceIds, verificationNote: draft.verificationNote, preparedAt: at, policyId: policy.id, policyVersion: policy.version, depreciation: { treatment: draft.treatment, cost: total, residualValue: draft.residualValue, usefulLifeMonths: draft.usefulLifeMonths, startDate: project.readyForUse?.date ?? at.slice(0, 10), startConvention: policy.startConvention, reason: draft.verificationNote, policySnapshot: JSON.stringify(policy) } } })
      await validateCapitalization(db, row)
      await db.entity('projects').put(row); await writeAudit(db, actor, tx, 'projects', project, row, 'prepare_capitalization', draft.verificationNote)
      return row
    })),
    submit: (ctx: RequestContext, projectId: string, version: number) => respond(() => commitMutation(db, async tx => {
      const { actor, project } = await projectForAccounting(ctx, projectId, 'submit')
      if (project.version !== z.number().int().positive().parse(version)) throw new DataError('conflict', 'The project changed. Reload before submission.')
      if (!project.capitalization || project.capitalization.requestedById !== actor.id || !['draft', 'returned'].includes(project.workflowStatus)) throw new DataError('invalid_transition', 'Prepare a draft or returned capitalization request before submission.')
      await validateCapitalization(db, project)
      const at = new Date().toISOString(), old = await db.entity('approvals').where('subjectId').equals(projectId).filter(a => a.subjectType === 'capitalization').first()
      const construction = structuredClone(project.construction!)
      construction.timeline.push({ id: crypto.randomUUID(), actorId: actor.id, occurredAt: at, action: 'capitalization_submitted', note: project.capitalization.verificationNote, documentIds: project.capitalization.evidenceIds, progressPercent: construction.progressPercent })
      const row = parseEntity('projects', { ...project, construction, workflowStatus: 'submitted', submittedAt: at, updatedAt: at, version: project.version + 1 })
      const approval = parseEntity('approvals', { ...(old ?? { id: crypto.randomUUID(), municipalityId: actor.municipalityId, version: 0, createdAt: at, subjectType: 'capitalization', subjectId: projectId, assignedRole: 'approving_officer', history: [] }), requestedById: actor.id, version: (old?.version ?? 0) + 1, updatedAt: at, workflowStatus: 'submitted', submittedAt: at, documentIds: project.capitalization.evidenceIds, decidedAt: null, history: [...(old?.history ?? []), { actorId: actor.id, actorRole: actor.role, action: 'submit', fromStatus: project.workflowStatus, toStatus: 'submitted', reason: project.capitalization.verificationNote, occurredAt: at, submission: { subjectVersion: row.version, documentIds: project.capitalization.evidenceIds, payload: JSON.stringify({ project: row, costs: JSON.parse(project.capitalization.costSnapshot) }) } }] })
      await db.entity('projects').put(row); await db.entity('approvals').put(approval)
      await writeAudit(db, actor, tx, 'projects', project, row, 'submit_capitalization'); await writeAudit(db, actor, tx, 'approvals', old ?? null, approval, 'submit_capitalization')
      for (const officer of await db.entity('users').where('municipalityId').equals(actor.municipalityId).filter(u => u.role === 'approving_officer' && u.status === 'active').toArray()) await cipNotification(db, actor, project, officer.id, 'Capitalization request awaiting review', '/dashboard/approvals/capitalization', tx)
      await cipNotification(db, actor, project, project.requestedById, 'Accounting submitted the construction capitalization request', '/dashboard/construction-projects', tx)
      return approval
    })),
  }
}
export type CIPOverview = Extract<Awaited<ReturnType<ReturnType<typeof createCIPService>['overview']>>, { ok: true }>['data']
