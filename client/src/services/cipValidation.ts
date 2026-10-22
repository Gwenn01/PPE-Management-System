import type { ConstructionProject, User } from '../domain/models.js'
import { treasuryConfirmed } from '../domain/budget.js'
import { depreciationSchedule } from '../domain/accounting.js'
import type { MockDatabase } from '../mock/database.js'
import { DataError } from './errors.js'
import { parseEntity } from '../mock/validation/schemas.js'
import { writeAudit } from '../mock/unitOfWork.js'

export function safeTotal(values: number[]): number {
  const result = values.reduce((a, b) => { if (!Number.isSafeInteger(b)) throw new DataError('validation', 'Amounts must be safe integer centavos.'); return a + BigInt(b) }, 0n)
  if (result < -BigInt(Number.MAX_SAFE_INTEGER) || result > BigInt(Number.MAX_SAFE_INTEGER)) throw new DataError('validation', 'The accounting total exceeds safe integer centavos.')
  return Number(result)
}
export async function cipDocument(db: MockDatabase, project: ConstructionProject, id: string) {
  const d = await db.entity('documents').get(id), blob = d && await db.blobs.get(d.storageKey)
  if (!d || d.entityType !== 'project' || d.entityId !== project.id || d.municipalityId !== project.municipalityId || !project.documentIds.includes(id) || !blob || blob.documentId !== d.id || blob.municipalityId !== d.municipalityId || blob.blob.size !== d.sizeBytes || blob.blob.type !== d.mimeType) throw new DataError('validation', 'Supporting evidence requires a matching local project file; metadata-only imports do not qualify.')
  return d
}
export async function accountingReceipts(db: MockDatabase, project: ConstructionProject, actorId?: string) {
  const candidates = await db.entity('documentRouting').where('projectId').equals(project.id).filter(r => r.municipalityId === project.municipalityId && r.toRole === 'accounting_officer' && (!actorId || r.assignedUserId === actorId) && !!r.budgetHandoff && treasuryConfirmed(r.budgetHandoff) && r.workflowStatus === 'approved' && !!r.receivedAt).toArray()
  const receipts = []
  for (const r of candidates) {
    const source = r.budgetSourceRoutingId && await db.entity('documentRouting').get(r.budgetSourceRoutingId)
    if (source && source.projectId === project.id && source.municipalityId === project.municipalityId && source.budgetProcessing?.status === 'completed' && treasuryConfirmed(source.budgetProcessing)) receipts.push(r)
  }
  return receipts
}
export function assertCIPMutable(project: ConstructionProject) {
  if (!project.construction || project.projectStatus === 'capitalized' || project.projectStatus === 'cancelled' || project.capitalization && ['submitted', 'under_review', 'approved', 'rejected'].includes(project.workflowStatus)) throw new DataError('invalid_transition', 'This project is historical, capitalized or locked for a capitalization decision.')
}
export async function projectCIPBalance(db: MockDatabase, projectId: string): Promise<number> {
  const entries = await db.entity('accountingRecords').where('projectId').equals(projectId).toArray()
  return safeTotal(entries.filter(e => e.kind === 'cip' || ['capitalization', 'adjustment'].includes(e.kind) && e.accountCode === 'DEMO-CIP').map(e => e.debit - e.credit))
}
export async function validateCapitalization(db: MockDatabase, project: ConstructionProject) {
  const cap = project.capitalization
  if (!cap || !project.construction || project.projectStatus !== 'completed' || !project.completionDate || !project.readyForUse || project.construction.progressPercent !== 100 || project.readyForUse.date < project.completionDate.slice(0, 10)) throw new DataError('validation', 'Capitalization requires completed construction, acceptance evidence and Property confirmation of readiness for intended use.')
  if (project.capitalizedAssetId || await db.entity('assets').where('municipalityId').equals(project.municipalityId).filter(a => a.constructionProjectId === project.id).count()) throw new DataError('conflict', 'This project is already capitalized.')
  const readyDocs = await Promise.all(project.readyForUse.documentIds.map(id => cipDocument(db, project, id)))
  if (!['completion_certificate', 'acceptance_report'].every(t => readyDocs.some(d => d.projectDocumentType === t))) throw new DataError('validation', 'Both completion and acceptance evidence are required.')
  const costs = await db.entity('cipCosts').where('projectId').equals(project.id).toArray()
  if (costs.some(c => c.accounting?.status === 'pending_review')) throw new DataError('validation', 'Review or exclude every pending expenditure before capitalization.')
  const eligible = costs.filter(c => c.accounting?.status === 'approved').sort((a, b) => a.id.localeCompare(b.id))
  if (!eligible.length || new Set(cap.costIds).size !== cap.costIds.length || cap.costIds.length !== eligible.length || eligible.some(c => !cap.costIds.includes(c.id))) throw new DataError('validation', 'Select all approved, qualifying, untransferred project costs; pending and excluded costs cannot be capitalized.')
  if (cap.costSnapshot !== JSON.stringify(eligible)) throw new DataError('conflict', 'Qualifying costs changed. Prepare the capitalization again.')
  const total = safeTotal(eligible.map(c => c.amount))
  if (total <= 0 || total !== cap.total || total !== cap.depreciation.cost || await projectCIPBalance(db, project.id) !== total) throw new DataError('validation', 'Approved costs and available posted CIP balance must agree exactly.')
  const receipts = await accountingReceipts(db, project)
  const expectedEvidence = [...project.readyForUse.documentIds, ...eligible.map(c => c.accounting!.supportingDocumentId), ...receipts.flatMap(r => r.documentIds)]
  if (expectedEvidence.some(id => !cap.evidenceIds.includes(id)) || cap.depreciation.startDate !== project.readyForUse.date) throw new DataError('conflict', 'Completion, intended-use or processed document evidence changed. Accounting must prepare the request again.')
  for (const cost of eligible) {
    if (!receipts.some(r => r.id === cost.accounting!.budgetPacketId)) throw new DataError('validation', 'Each cost requires a completed Budget-to-Accounting receipt.')
    await cipDocument(db, project, cost.accounting!.supportingDocumentId)
    const posting = cost.accountingRecordId && await db.entity('accountingRecords').get(cost.accountingRecordId)
    if (!posting || posting.kind !== 'cip' || posting.sourceId !== cost.id || posting.debit !== cost.amount || posting.credit !== 0) throw new DataError('validation', 'Qualifying costs require their authorized CIP debit postings.')
  }
  for (const id of cap.evidenceIds) await cipDocument(db, project, id)
  const policy = await db.entity('depreciationPolicies').get(cap.policyId)
  if (!policy || policy.municipalityId !== project.municipalityId || policy.version !== cap.policyVersion || !policy.active || total < policy.recognitionThreshold || policy.effectiveFrom.slice(0, 10) > new Date().toISOString().slice(0, 10)) throw new DataError('validation', 'Review the current effective demonstration PPE policy and capitalization threshold.')
  if (!['depreciable_ppe', 'non_depreciable_ppe'].includes(cap.depreciation.treatment) || cap.depreciation.policySnapshot !== JSON.stringify(policy)) throw new DataError('validation', 'A reviewed PPE depreciation treatment and policy snapshot are required.')
  try { depreciationSchedule(cap.depreciation, cap.depreciation.startDate) } catch { throw new DataError('validation', 'Invalid useful life, residual value or depreciation settings.') }
  const category = await db.entity('assetCategories').get(cap.category), custodian = cap.custodianId && await db.entity('users').get(cap.custodianId)
  if (!category || category.municipalityId !== project.municipalityId || cap.custodianId && (!custodian || custodian.municipalityId !== project.municipalityId || custodian.status !== 'active' || custodian.departmentId !== project.departmentId)) throw new DataError('validation', 'Choose a local category and active project-department custodian.')
  if (await db.entity('assets').where('municipalityId').equals(project.municipalityId).filter(a => a.propertyNumber.trim().toLowerCase() === cap.propertyNumber.trim().toLowerCase()).count() || await db.entity('registrations').where('municipalityId').equals(project.municipalityId).filter(r => r.proposedPropertyNumber.trim().toLowerCase() === cap.propertyNumber.trim().toLowerCase()).count()) throw new DataError('duplicate', 'This property number is already in use.')
  return { eligible, total }
}
export async function cipNotification(db: MockDatabase, actor: User, project: ConstructionProject, recipientId: string, title: string, href: string, tx: string) {
  const at = new Date().toISOString()
  const row = parseEntity('notifications', { id: crypto.randomUUID(), municipalityId: project.municipalityId, version: 1, createdAt: at, updatedAt: at, recipientId, title, message: `${project.projectNumber}: ${project.name}. Local demonstration accounting only.`, severity: 'info', href, readAt: null })
  await db.entity('notifications').add(row); await writeAudit(db, actor, tx, 'notifications', null, row, 'cip_notification')
}
