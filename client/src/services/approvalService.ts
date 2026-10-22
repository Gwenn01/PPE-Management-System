import { z } from 'zod'
import type { ApprovalHistoryEntry, ApprovalRequest, ApprovalSubject, Asset, AssetRegistration, ConstructionProject, Document, InventoryDiscrepancy, WorkflowStatus } from '../domain/models.js'
import { validateInventoryCorrection } from './inventoryValidation.js'
import { postCapitalization } from './capitalizationPosting.js'
import { approvalResources, approvalTransitionRules } from '../domain/workflow.js'
import { hasRolePermission } from '../domain/permissions.js'
import type { MockDatabase } from '../mock/database.js'
import { database as defaultDatabase } from '../mock/database.js'
import { subjectTables } from '../mock/validation/dataset.js'
import { parseEntity } from '../mock/validation/schemas.js'
import { authorize, commitMutation, writeAudit } from '../mock/unitOfWork.js'
import type { RequestContext } from './contracts.js'
import { DataError, respond } from './errors.js'
import { validateRegistrationFields } from './registrationValidation.js'

export const approvalTypes: readonly ApprovalSubject[] = ['registration', 'capitalization', 'correction', 'transfer', 'maintenance', 'disposal', 'reconciliation']
export const approvalTypeLabels: Record<ApprovalSubject, string> = {
  registration: 'Asset registration', capitalization: 'Construction capitalization', correction: 'Inventory correction',
  transfer: 'Asset transfer', maintenance: 'Maintenance request', disposal: 'Asset disposal', reconciliation: 'Reconciliation correction',
}
export const actionableApprovalStatuses = ['submitted', 'under_review'] as const
export type ApprovalDecision = 'review' | 'approve' | 'return' | 'reject'
const decisionSchema = z.strictObject({ id: z.string().trim().min(1).max(160), version: z.number().int().positive(), decision: z.enum(['review', 'approve', 'return', 'reject']), remarks: z.string().max(4000) })

export type ApprovalSubjectDetails = {
  approval: ApprovalRequest
  requester: { id: string; name: string; username: string }
  subject: Record<string, unknown>
  documents: Document[]
  actors: Record<string, string>
  /** Reflects the local permission snapshot; absent grants cannot become available via the UI. */
  capabilities: { review: boolean; approve: boolean; return: boolean; reject: boolean }
}

/** Central approval workflow. Registration and prepared CIP capitalization execute their
 * authorized registry/accounting handoffs inside the same decision transaction.
 */
export function createApprovalManagementService(db: MockDatabase = defaultDatabase) {
  async function reader(ctx: RequestContext) {
    const actor = await authorize(db, ctx, 'dashboard', 'read')
    if (actor.role !== 'approving_officer') throw new DataError('forbidden', 'Only the assigned Approving Officer may access this queue.')
    const grants = await db.entity('permissions').where('[municipalityId+role]').equals([actor.municipalityId, actor.role]).toArray()
    const allowed = (subject: ApprovalSubject, action: 'read' | 'approve' | 'reject') =>
      hasRolePermission(actor.role, { resource: approvalResources[subject], action }) &&
      grants.some((item) => item.resource === approvalResources[subject] && item.action === action && item.scope === 'municipality')
    if (!approvalTypes.some((type) => allowed(type, 'read'))) throw new DataError('forbidden', 'No local approval queue grant is active.')
    return { actor, allowed }
  }
  async function details(ctx: RequestContext, approval: ApprovalRequest, allowed: Awaited<ReturnType<typeof reader>>['allowed']): Promise<ApprovalSubjectDetails> {
    if (approval.municipalityId !== ctx.municipalityId || !allowed(approval.subjectType, 'read')) throw new DataError('not_found', 'Approval is not accessible in this municipality.')
    const table = subjectTables[approval.subjectType]
    const target = await db.entity(table).get(approval.subjectId)
    if (!target || target.municipalityId !== ctx.municipalityId || (approval.subjectType === 'capitalization' ? (target as ConstructionProject).capitalization?.requestedById ?? target.requestedById : target.requestedById) !== approval.requestedById || target.workflowStatus !== approval.workflowStatus)
      throw new DataError('conflict', 'The originating request and approval no longer agree.')
    const requester = await db.entity('users').get(approval.requestedById)
    if (!requester || requester.municipalityId !== ctx.municipalityId) throw new DataError('not_found', 'Requester is unavailable.')
    const files = await Promise.all((approval.subjectType === 'capitalization' && (target as ConstructionProject).capitalization ? approval.documentIds : target.documentIds).map((id) => db.entity('documents').get(id)))
    const documents = files.filter((file): file is Document => !!file && file.municipalityId === ctx.municipalityId && file.entityId === target.id && (file.entityType === approval.subjectType || (approval.subjectType === 'capitalization' && file.entityType === 'project')))
    const actors: Record<string, string> = {}
    for (const id of new Set([approval.requestedById, ...approval.history.map((entry) => entry.actorId)])) {
      const account = await db.entity('users').get(id)
      actors[id] = account?.municipalityId === ctx.municipalityId ? account.name : 'Unavailable actor'
    }
    return {
      approval, requester: { id: requester.id, name: requester.name, username: requester.username },
      subject: { ...target } as unknown as Record<string, unknown>, documents, actors,
      capabilities: { review: allowed(approval.subjectType, 'approve'), approve: allowed(approval.subjectType, 'approve'), return: allowed(approval.subjectType, 'reject'), reject: allowed(approval.subjectType, 'reject') },
    }
  }
  return {
    overview: (ctx: RequestContext) => respond(() => db.transaction('r', db.tables, async () => {
      const { allowed } = await reader(ctx)
      const approvals = await db.entity('approvals').where('municipalityId').equals(ctx.municipalityId).toArray()
      const permitted = approvals.filter((approval) => allowed(approval.subjectType, 'read'))
      const records: ApprovalSubjectDetails[] = []
      for (const approval of permitted) records.push(await details(ctx, approval, allowed))
      return records.sort((a, b) => b.approval.updatedAt.localeCompare(a.approval.updatedAt))
    })),
    getById: (ctx: RequestContext, id: string) => respond(() => db.transaction('r', db.tables, async () => {
      const { allowed } = await reader(ctx)
      const approval = await db.entity('approvals').get(z.string().min(1).parse(id))
      if (!approval) throw new DataError('not_found', 'Approval not found.')
      return details(ctx, approval, allowed)
    })),
    decide: (ctx: RequestContext, input: { id: string; version: number; decision: ApprovalDecision; remarks: string }) => respond(() => commitMutation(db, async (transactionId) => {
      const parsed = decisionSchema.parse(input)
      // The subject-specific resource and action are checked again inside the write transaction.
      const old = await db.entity('approvals').get(parsed.id)
      if (!old || old.municipalityId !== ctx.municipalityId || old.assignedRole !== 'approving_officer') throw new DataError('not_found', 'Approval unavailable in this municipality.')
      const rule = approvalTransitionRules[parsed.decision]
      const actor = await authorize(db, ctx, approvalResources[old.subjectType], rule.permission)
      if (actor.role !== 'approving_officer') throw new DataError('forbidden', 'Only the assigned Approving Officer may decide requests.')
      if (old.version !== parsed.version) throw new DataError('conflict', 'This approval was already changed. Reload before deciding.')
      if (old.requestedById === actor.id) throw new DataError('forbidden', 'Self-approval is disabled by the demo policy.')
      if (!rule.from.includes(old.workflowStatus)) throw new DataError('invalid_transition', 'This approval transition is unavailable in its current state.')
      const reason = parsed.remarks.trim()
      if ((parsed.decision === 'return' || parsed.decision === 'reject') && !reason) throw new DataError('validation', 'A reason is mandatory when returning or rejecting a request.', { remarks: 'Explain the correction or rejection.' })
      const table = subjectTables[old.subjectType]
      const target = await db.entity(table).get(old.subjectId)
      if (!target || target.municipalityId !== actor.municipalityId || (old.subjectType === 'capitalization' ? (target as ConstructionProject).capitalization?.requestedById ?? target.requestedById : target.requestedById) !== old.requestedById || target.workflowStatus !== old.workflowStatus)
        throw new DataError('conflict', 'The originating record changed. Reload the approval.')
      const status: WorkflowStatus = rule.to
      const at = new Date().toISOString()
      let updatedTarget = parseEntity(table, { ...target, workflowStatus: status, version: target.version + 1, updatedAt: at })
      let registryAsset: Asset | null = null
      if (old.subjectType === 'correction') {
        const discrepancy = target as InventoryDiscrepancy
        if (status === 'approved') {
          const asset = await validateInventoryCorrection(db, discrepancy)
          if (discrepancy.investigation!.proposal!.resolution === 'correct_record') {
            registryAsset = parseEntity('assets', { ...asset, ...discrepancy.proposedCorrection, version: asset.version + 1, updatedAt: at })
            await db.entity('assets').put(registryAsset)
            await writeAudit(db, actor, transactionId, 'assets', asset, registryAsset, 'approved_inventory_correction', discrepancy.investigation!.proposal!.reason)
          }
        }
        if (discrepancy.investigation) updatedTarget = parseEntity('discrepancies', { ...updatedTarget, resolvedAt: status === 'approved' ? at : null, investigation: { ...discrepancy.investigation, history: [...discrepancy.investigation.history, { id: crypto.randomUUID(), actorId: actor.id, occurredAt: at, action: `approval_${parsed.decision}`, note: reason || 'Authorized inventory correction decision.' }] } })
      }
      if (old.subjectType === 'capitalization' && status === 'approved' && !(target as ConstructionProject).capitalization) throw new DataError('invalid_transition', 'Accounting must prepare qualifying CIP costs, completion evidence and depreciation requirements before capitalization approval.')
      if (old.subjectType === 'capitalization' && (target as ConstructionProject).capitalization && status !== 'approved') {
        const project = target as ConstructionProject, construction = structuredClone(project.construction!)
        construction.timeline.push({ id: crypto.randomUUID(), actorId: actor.id, occurredAt: at, action: `capitalization_${parsed.decision}`, note: reason || 'Capitalization request under review.', documentIds: project.capitalization!.evidenceIds, progressPercent: construction.progressPercent })
        updatedTarget = parseEntity('projects', { ...updatedTarget, construction })
      }
      if (old.subjectType === 'capitalization' && status === 'approved' && (target as ConstructionProject).capitalization) {
        const posted = await postCapitalization(db, target as ConstructionProject, actor, at, transactionId)
        registryAsset = posted.asset
        updatedTarget = posted.project
      }
      if (old.subjectType === 'registration' && status === 'approved') {
        const registration = target as AssetRegistration
        // A previously recognized asset cannot be approved twice, even by a stale client.
        if (registration.recognizedAssetId) throw new DataError('conflict', 'This registration already has a registry asset.')
        await validateRegistrationFields(db, actor, registration)
        const assetId = crypto.randomUUID()
        const assetCandidate: Asset = {
          id: assetId, municipalityId: actor.municipalityId, version: 1, createdAt: at, updatedAt: at,
          propertyNumber: registration.proposedPropertyNumber, description: registration.description,
          category: registration.category, departmentId: registration.departmentId, custodianId: registration.custodianId,
          location: registration.location, acquisitionDate: registration.acquisitionDate, acquisitionCost: registration.acquisitionCost,
          lifecycleStatus: 'idle', condition: 'good', registrationId: registration.id, constructionProjectId: null,
          recognitionStatus: 'awaiting_recognition',
        }
        registryAsset = parseEntity('assets', assetCandidate)
        updatedTarget = parseEntity(table, { ...updatedTarget, recognizedAssetId: registryAsset.id })
        await db.entity('assets').add(registryAsset)
        await writeAudit(db, actor, transactionId, 'assets', null, registryAsset, 'register_awaiting_recognition', 'Approved property record; accounting recognition and depreciation are not posted.')
      }
      const event: ApprovalHistoryEntry = { actorId: actor.id, actorRole: actor.role, action: parsed.decision, fromStatus: old.workflowStatus, toStatus: status, reason, occurredAt: at }
      const updatedApproval = parseEntity('approvals', {
        ...old, workflowStatus: status, version: old.version + 1, updatedAt: at, history: [...old.history, event],
        decidedAt: ['approved', 'rejected'].includes(status) ? at : null,
      })
      await db.entity(table).put(updatedTarget)
      await db.entity('approvals').put(updatedApproval)
      await writeAudit(db, actor, transactionId, table, target, updatedTarget, `approval_${parsed.decision}`, reason)
      await writeAudit(db, actor, transactionId, 'approvals', old, updatedApproval, parsed.decision, reason)
      const notification = parseEntity('notifications', {
        id: crypto.randomUUID(), municipalityId: actor.municipalityId, version: 1, createdAt: at, updatedAt: at,
        recipientId: old.requestedById, title: `${approvalTypeLabels[old.subjectType]} ${status.replaceAll('_', ' ')}`,
        message: reason || (status === 'approved' && old.subjectType === 'correction' ? 'The authorized inventory correction was applied and the discrepancy resolved.' : status === 'approved' ? old.subjectType === 'capitalization' && (target as ConstructionProject).capitalization ? 'Approved qualifying CIP transferred to recognized PPE. Review its saved depreciation requirements.' : 'Your request was approved. Accounting recognition, if applicable, is a separate step.' : 'Your request is now under review.'),
        severity: status === 'approved' ? 'success' : status === 'rejected' ? 'error' : status === 'returned' ? 'warning' : 'info',
        href: old.subjectType === 'correction' ? '/dashboard/discrepancies' : old.subjectType === 'registration' ? '/dashboard/asset-registration' : old.subjectType === 'capitalization' && (target as ConstructionProject).capitalization ? '/dashboard/cip-costs' : '/dashboard', readAt: null,
      })
      await db.entity('notifications').add(notification)
      await writeAudit(db, actor, transactionId, 'notifications', null, notification, 'approval_notice')
      return { approval: updatedApproval, subject: updatedTarget, asset: registryAsset }
    })),
    /** Compatibility with Phase 02/03 call sites; same transaction and transition engine. */
    changeStatus: (ctx: RequestContext, id: string, version: number, status: WorkflowStatus, reason: string) => {
      const decision = ({ submitted: undefined, under_review: 'review', approved: 'approve', returned: 'return', rejected: 'reject' } as Partial<Record<WorkflowStatus, ApprovalDecision>>)[status]
      if (!decision) return respond(async () => { throw new DataError('invalid_transition', 'Use a supported approval decision.') })
      return respond(async () => {
        const result = await createApprovalManagementService(db).decide(ctx, { id, version, decision, remarks: reason })
        if (!result.ok) throw new DataError(result.error.code, result.error.message, result.error.fields)
        return result.data.approval
      })
    },
  }
}

export type ApprovalManagementService = ReturnType<typeof createApprovalManagementService>
export type ApprovalOverview = Extract<Awaited<ReturnType<ApprovalManagementService['overview']>>, { ok: true }>['data']
