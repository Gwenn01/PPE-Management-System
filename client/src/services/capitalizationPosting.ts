import type { ConstructionProject, User } from '../domain/models.js'
import type { MockDatabase } from '../mock/database.js'
import { parseEntity } from '../mock/validation/schemas.js'
import { writeAudit } from '../mock/unitOfWork.js'
import { cipNotification, validateCapitalization } from './cipValidation.js'

/** Called only inside the Approving Officer's existing atomic decision transaction. */
export async function postCapitalization(db: MockDatabase, project: ConstructionProject, actor: User, at: string, tx: string) {
  const { eligible, total } = await validateCapitalization(db, project)
  const cap = project.capitalization!, assetId = crypto.randomUUID(), postingDate = at.slice(0, 10)
  const asset = parseEntity('assets', { id: assetId, municipalityId: project.municipalityId, version: 1, createdAt: at, updatedAt: at, propertyNumber: cap.propertyNumber, description: project.name, category: cap.category, departmentId: project.departmentId, custodianId: cap.custodianId, location: project.location, acquisitionDate: postingDate, acquisitionCost: total, lifecycleStatus: 'in_service', recognitionStatus: 'recognized', condition: 'good', registrationId: null, constructionProjectId: project.id })
  await db.entity('assets').add(asset); await writeAudit(db, actor, tx, 'assets', null, asset, 'capitalize_completed_construction')
  for (const accountCode of ['DEMO-CIP', 'DEMO-PPE']) {
    const ppe = accountCode === 'DEMO-PPE'
    const row = parseEntity('accountingRecords', { id: crypto.randomUUID(), municipalityId: project.municipalityId, version: 1, createdAt: at, updatedAt: at, assetId: ppe ? assetId : null, projectId: project.id, sourceId: project.id, kind: 'capitalization', postingDate, accountCode, debit: ppe ? total : 0, credit: ppe ? 0 : total, policyId: cap.policyId, policyVersion: cap.policyVersion, postedById: actor.id, ...(ppe ? { recognitionDetails: { ...cap.depreciation, startDate: postingDate } } : {}) })
    await db.entity('accountingRecords').add(row); await writeAudit(db, actor, tx, 'accountingRecords', null, row, 'transfer_cip_to_ppe', cap.verificationNote)
  }
  for (const old of eligible) {
    const row = parseEntity('cipCosts', { ...old, version: old.version + 1, updatedAt: at, accounting: { ...old.accounting!, status: 'capitalized', transferredAt: at } })
    await db.entity('cipCosts').put(row); await writeAudit(db, actor, tx, 'cipCosts', old, row, 'transfer_qualifying_cost_to_ppe')
  }
  const construction = structuredClone(project.construction!)
  construction.timeline.push({ id: crypto.randomUUID(), actorId: actor.id, occurredAt: at, action: 'capitalization_approved', note: `Approved qualifying CIP ${total} centavos transferred atomically to PPE. Depreciation starts no earlier than capitalization approval.`, documentIds: cap.evidenceIds, progressPercent: 100 })
  const updatedProject = parseEntity('projects', { ...project, construction, workflowStatus: 'approved', projectStatus: 'capitalized', capitalizedAssetId: assetId, version: project.version + 1, updatedAt: at })
  await cipNotification(db, actor, project, project.requestedById, 'Construction capitalization completed; recognized PPE created', '/dashboard/construction-projects', tx)
  return { asset, project: updatedProject }
}
