import { registrationDocumentTypes, type RegistrationDocumentType } from '../domain/registration.js'
import { projectDocumentTypes, type ProjectDocumentType } from '../domain/construction.js'
import type { ConstructionProject } from '../domain/models.js'
import { z } from 'zod'
import type { Document } from '../domain/models.js'
import type { MockDatabase } from '../mock/database.js'
import { authorize, commitMutation, writeAudit } from '../mock/unitOfWork.js'
import { subjectTables } from '../mock/validation/dataset.js'
import { approvalResources } from '../domain/workflow.js'
import { documentNameSchema, parseEntity } from '../mock/validation/schemas.js'
import type { RequestContext } from './contracts.js'
import { scopedRecord, tableResources, visibleRecord } from './entityAccess.js'
import { DataError, respond } from './errors.js'
import { budgetDocumentTypes } from '../domain/budget.js'
import { appendBudgetEvent, editableBudgetStatuses } from './budgetValidation.js'
import type { ProjectDocumentRouting } from '../domain/models.js'
import { accountingReceipts, assertCIPMutable } from './cipValidation.js'

export const documentLimits = { maxBytes: 5 * 1024 * 1024, mimeTypes: ['application/pdf', 'image/png', 'image/jpeg', 'text/plain'] } as const
export interface DocumentUpload { fileName: string; file: Blob; entityType: Document['entityType']; entityId: string; documentType?: RegistrationDocumentType; projectDocumentType?: ProjectDocumentType; budgetRoutingId?: string }

async function validateFile(input: DocumentUpload): Promise<void> {
  z.strictObject({ fileName: documentNameSchema, file: z.instanceof(Blob), entityType: z.enum(['registration', 'capitalization', 'correction', 'transfer', 'maintenance', 'disposal', 'reconciliation', 'project', 'inventory', 'cip_cost']), entityId: z.string().min(1), documentType: z.enum(registrationDocumentTypes).optional(), projectDocumentType: z.enum(projectDocumentTypes).optional(), budgetRoutingId: z.string().min(1).max(160).optional() }).parse(input)
  if (input.entityType === 'registration' && !input.documentType) throw new DataError('validation', 'Choose a supporting-document type before uploading.')
  if (input.projectDocumentType && input.entityType !== 'project') throw new DataError('validation', 'Project document classification requires a construction project.')
  if (input.budgetRoutingId && (input.entityType !== 'project' || !budgetDocumentTypes.some(t => t === input.projectDocumentType))) throw new DataError('validation', 'Budget packet references apply only to voucher, budget review or external Treasury confirmation evidence.')
  if (input.entityType !== 'registration' && input.documentType) throw new DataError('validation', 'This classification applies only to asset registrations.')
  const file = input.file
  if (file.size < 1 || file.size > documentLimits.maxBytes || !(documentLimits.mimeTypes as readonly string[]).includes(file.type)) throw new DataError('validation', 'Use a nonempty PDF, PNG, JPEG or text file up to 5 MiB.')
  const extensions: Record<string, RegExp> = { 'application/pdf': /\.pdf$/i, 'image/png': /\.png$/i, 'image/jpeg': /\.jpe?g$/i, 'text/plain': /\.txt$/i }
  if (!extensions[file.type].test(input.fileName)) throw new DataError('validation', 'File extension and declared type must agree.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const signature = file.type === 'application/pdf' ? new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-'
    : file.type === 'image/png' ? [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)
    : file.type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : !bytes.includes(0)
  if (!signature) throw new DataError('validation', 'The file content does not match its declared type.')
}

export function createDocumentService(database: MockDatabase) {
  return {
    upload: (context: RequestContext, input: DocumentUpload) => respond(async () => {
      // Blob I/O is completed before entering an IndexedDB transaction.
      await validateFile(input)
      return commitMutation(database, async (transactionId) => {
        const actor = await authorize(database, context, 'documents', 'create')
        const table = subjectTables[input.entityType]
        const owner = await scopedRecord(database, actor, table, input.entityId)
        const resource = table === 'projects' && actor.role === 'accounting_officer' ? 'cip_costs' : table === 'projects' && (actor.role === 'engineering_office' || actor.role === 'budget_office')
          ? actor.role === 'engineering_office' ? 'engineering_documents' : 'budget_documents' : tableResources[table]
        await authorize(database, context, resource, 'update')
        if (input.entityType === 'registration' && owner.requestedById !== actor.id) throw new DataError('forbidden', 'Only the registration requester may manage its draft documents.')
        if (input.documentType) {
          const attached = await Promise.all(owner.documentIds.map((id) => database.entity('documents').get(id)))
          if (attached.some((doc) => doc?.documentType === input.documentType)) throw new DataError('duplicate', 'Replace an existing document of this type by removing it first.')
        }
        const project = table === 'projects' ? owner as ConstructionProject : null
        const cipUpload = input.projectDocumentType === 'cip_support'
        if (project?.capitalization && ['submitted', 'under_review', 'approved', 'rejected'].includes(project.workflowStatus)) throw new DataError('invalid_transition', 'Capitalization evidence is locked for review or after a final decision.')
        if (cipUpload) {
          if (actor.role !== 'accounting_officer' || !project) throw new DataError('forbidden', 'CIP support documents belong to Accounting processing.')
          assertCIPMutable(project)
          if (!(await accountingReceipts(database, project, actor.id)).length) throw new DataError('forbidden', 'Acknowledge the processed Budget packet before attaching CIP support.')
        } else if (actor.role === 'accounting_officer' && project) throw new DataError('forbidden', 'Accounting uploads only CIP supporting evidence in this module.')
        const budgetType = budgetDocumentTypes.some(t => t === input.projectDocumentType)
        let budgetRoute: ProjectDocumentRouting | null = null
        if (budgetType) {
          if (actor.role !== 'budget_office' || !project?.construction || !input.budgetRoutingId) throw new DataError('forbidden', 'Budget evidence requires the assigned Budget officer and a received packet.')
          budgetRoute = await scopedRecord(database, actor, 'documentRouting', input.budgetRoutingId)
          const processing = budgetRoute.budgetProcessing
          if (budgetRoute.projectId !== project.id || budgetRoute.toRole !== 'budget_office' || budgetRoute.assignedUserId !== actor.id || !processing) throw new DataError('forbidden', 'This is not your received Engineering packet.')
          if (project.construction.stage !== 'forwarded' || (input.projectDocumentType === 'treasury_confirmation_demo' ? processing.status !== 'treasury_pending' : !editableBudgetStatuses.includes(processing.status))) throw new DataError('invalid_transition', 'This packet is not accepting that document at this processing stage.')
        }
        if (project?.construction) {
          if (!input.projectDocumentType) throw new DataError('validation', 'Choose a project evidence type.')
          if (input.projectDocumentType === 'engineering_report' && actor.role !== 'engineering_office') throw new DataError('forbidden', 'Engineering reports must be uploaded by the assigned Engineering officer.')
          if (['capitalized', 'cancelled'].includes(project.projectStatus) || (project.projectStatus === 'completed' && !budgetRoute && !cipUpload && !(actor.role === 'property_officer' && project.capitalization && ['draft', 'returned'].includes(project.workflowStatus) && ['completion_certificate', 'acceptance_report'].includes(input.projectDocumentType)) && !(actor.role === 'engineering_office' && ['returned', 'engineering_received', 'processed'].includes(project.construction.stage)))) throw new DataError('invalid_transition', 'Closed project documents are read-only.')
          const engineering = ['construction_plan', 'availability_of_fund', 'engineering_report', 'progress_report']
          if ((actor.role === 'budget_office' && !budgetRoute) || (actor.role === 'engineering_office' && (!engineering.includes(input.projectDocumentType) || !['engineering_received', 'processed', 'returned'].includes(project.construction.stage)))) throw new DataError('forbidden', 'This evidence cannot be uploaded at the current processing stage.')
          if (actor.role === 'property_officer' && ['construction_plan', 'availability_of_fund'].includes(input.projectDocumentType) && !['awaiting_proposal', 'proposal_recorded', 'mayor_simulated', 'returned'].includes(project.construction.stage)) throw new DataError('invalid_transition', 'Engineering is processing these documents; replacements require a return.')
        } else if (!['draft', 'returned'].includes(owner.workflowStatus)) throw new DataError('invalid_transition', 'Attach documents only to draft or returned requests.')
        const at = new Date().toISOString(), id = crypto.randomUUID()
        const document = parseEntity('documents', { id, municipalityId: actor.municipalityId, version: 1, createdAt: at, updatedAt: at, ...(input.documentType ? { documentType: input.documentType } : {}), ...(input.projectDocumentType ? { projectDocumentType: input.projectDocumentType } : {}), ...(input.budgetRoutingId ? { budgetRoutingId: input.budgetRoutingId } : {}), fileName: input.fileName, mimeType: input.file.type, sizeBytes: input.file.size, uploadedById: actor.id, entityType: input.entityType, entityId: input.entityId, storageKey: `upload:${id}` })
        const construction = project?.construction ? { ...project.construction, ...(input.projectDocumentType === 'construction_plan' ? { constructionReview: 'pending', stage: project.construction.stage === 'processed' ? 'engineering_received' : project.construction.stage } : {}), ...(input.projectDocumentType === 'availability_of_fund' ? { fundReview: 'pending', stage: project.construction.stage === 'processed' ? 'engineering_received' : project.construction.stage } : {}), timeline: [...project.construction.timeline, { id: crypto.randomUUID(), actorId: actor.id, occurredAt: at, action: 'document_uploaded', note: `${input.projectDocumentType}: ${input.fileName}`, documentIds: [document.id], progressPercent: project.construction.progressPercent }] } : undefined
        const updated = parseEntity(table, { ...owner, ...(construction ? { construction } : {}), documentIds: [...owner.documentIds, document.id], version: owner.version + 1, updatedAt: at })
        await database.entity('documents').add(document)
        await database.blobs.add({ id: document.storageKey, documentId: document.id, municipalityId: actor.municipalityId, blob: input.file })
        await database.entity(table).put(updated)
        if (budgetRoute?.budgetProcessing) {
          const processing = structuredClone(budgetRoute.budgetProcessing)
          if (input.projectDocumentType !== 'treasury_confirmation_demo') { processing.status = 'under_review'; processing.treasury = null }
          appendBudgetEvent(processing, actor, 'upload_document', `${input.projectDocumentType}: ${input.fileName}`, [document.id], at)
          const changed = parseEntity('documentRouting', { ...budgetRoute, budgetProcessing: processing, documentIds: [...budgetRoute.documentIds, document.id], version: budgetRoute.version + 1, updatedAt: at })
          await database.entity('documentRouting').put(changed)
          await writeAudit(database, actor, transactionId, 'documentRouting', budgetRoute, changed, 'budget_upload_document')
        }
        await writeAudit(database, actor, transactionId, 'documents', null, document, 'upload')
        await writeAudit(database, actor, transactionId, table, owner, updated, 'attachDocument')
        return document
      })
    }),
    remove: (context: RequestContext, id: string) => respond(() => commitMutation(database, async (transactionId) => {
      const actor = await authorize(database, context, 'documents', 'create')
      const document = await scopedRecord(database, actor, 'documents', z.string().min(1).parse(id))
      if (document.entityType !== 'registration') throw new DataError('forbidden', 'Only draft registration attachments can be removed from this module.')
      const owner = await scopedRecord(database, actor, 'registrations', document.entityId)
      await authorize(database, context, 'asset_registrations', 'update')
      if (owner.requestedById !== actor.id) throw new DataError('forbidden', 'Only the requester can remove this document.')
      if (!['draft', 'returned'].includes(owner.workflowStatus)) throw new DataError('invalid_transition', 'Submitted or approved documents cannot be removed.')
      if (!owner.documentIds.includes(id)) throw new DataError('validation', 'The document is not linked to this registration.')
      const updated = parseEntity('registrations', { ...owner, documentIds: owner.documentIds.filter((key) => key !== id), version: owner.version + 1, updatedAt: new Date().toISOString() })
      await database.entity('registrations').put(updated)
      await database.entity('documents').delete(id)
      await database.blobs.delete(document.storageKey)
      await writeAudit(database, actor, transactionId, 'documents', document, null, 'remove_draft_document', `Removed draft ${document.documentType ?? 'unclassified'} attachment. Metadata retained in audit history.`)
      await writeAudit(database, actor, transactionId, 'registrations', owner, updated, 'detachDocument')
      return updated
    })),
    download: (context: RequestContext, id: string) => respond(() => database.transaction('r', database.tables, async () => {
      const actor = await authorize(database, context, 'documents', 'read')
      const document = await scopedRecord(database, actor, 'documents', z.string().min(1).parse(id))
      if (!await visibleRecord(database, actor, 'documents', document)) throw new DataError('not_found', 'Document is not accessible.')
      if (actor.role === 'approving_officer') {
        // Permission for an approval TYPE alone cannot expose unsubmitted drafts.
        const subjectType = document.entityType === 'project' ? 'capitalization' : document.entityType
        if (subjectType === 'inventory' || subjectType === 'cip_cost') throw new DataError('forbidden', 'This file is not assigned to an approval.')
        const linked = await database.entity('approvals').where('subjectId').equals(document.entityId)
          .filter((row) => row.municipalityId === actor.municipalityId && row.subjectType === subjectType && row.workflowStatus !== 'cancelled' && row.documentIds.includes(document.id)).first()
        // Older seeded approvals can omit documentIds, but the subject still must reference the document.
        const owner = await database.entity(subjectTables[document.entityType]).get(document.entityId)
        if (!linked && (!owner || !owner.documentIds.includes(document.id) || !(await database.entity('approvals').where('subjectId').equals(document.entityId).filter((row) => row.municipalityId === actor.municipalityId && row.subjectType === subjectType && !['draft', 'cancelled'].includes(row.workflowStatus)).first())))
          throw new DataError('not_found', 'This document is not linked to a submitted approval.')
      }
      if (document.entityType === 'registration') {
        const registration = await scopedRecord(database, actor, 'registrations', document.entityId)
        if (actor.role === 'approving_officer') await authorize(database, context, 'registration_approvals', 'read')
        else if (actor.role === 'auditor' && registration.recognizedAssetId) await authorize(database, context, 'assets', 'read')
        else await authorize(database, context, 'asset_registrations', 'read')
      } else {
        const resource = actor.role === 'accounting_officer' && document.entityType === 'project' ? 'cip_costs' : actor.role === 'approving_officer' && document.entityType === 'project' ? 'capitalization_approvals'
          : document.entityType !== 'project' && document.entityType !== 'inventory' && document.entityType !== 'cip_cost' && actor.role === 'approving_officer'
          ? approvalResources[document.entityType] : tableResources[subjectTables[document.entityType]]
        await authorize(database, context, resource, 'read')
      }
      const stored = await database.blobs.get(document.storageKey)
      if (!stored) throw new DataError('not_found', 'This metadata-only demo document has no local file. JSON exports do not include attachment binaries.')
      if (stored.documentId !== document.id || stored.municipalityId !== actor.municipalityId || stored.blob.size !== document.sizeBytes || stored.blob.type !== document.mimeType) throw new DataError('storage_unavailable', 'The stored document does not match its metadata.')
      return { document, file: stored.blob }
    })),
  }
}

