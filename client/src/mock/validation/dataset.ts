import type { Dataset, EntityMap, EntityName } from '../../domain/data.js'
import type { MunicipalityId } from '../../domain/models.js'
import { permissionRules } from '../../domain/permissions.js'
import { validApprovalEvent } from '../../domain/workflow.js'
import type { WorkflowStatus } from '../../domain/models.js'
import { DataError } from '../../services/errors.js'
import { datasetSchema, entityNames } from './schemas.js'

export const subjectTables = { registration: 'registrations', capitalization: 'projects', correction: 'discrepancies', transfer: 'transfers', maintenance: 'maintenance', disposal: 'disposals', reconciliation: 'reconciliations', project: 'projects', inventory: 'inventorySessions', cip_cost: 'cipCosts' } as const

export function recordMunicipality(name: EntityName, record: EntityMap[EntityName]): MunicipalityId {
  return name === 'municipalities' ? (record as EntityMap['municipalities']).id : (record as Exclude<EntityMap[EntityName], EntityMap['municipalities']>).municipalityId
}

const uniqueFields: Partial<Record<EntityName, string[]>> = {
  departments: ['code'], users: ['email'], assetCategories: ['code'], assets: ['propertyNumber'], registrations: ['proposedPropertyNumber'],
  projects: ['projectNumber'], documents: ['storageKey'], settings: ['key'],
}
export function validateDataset(input: unknown): Dataset {
  const data: Dataset = datasetSchema.parse(input)
  const globalIds = new Set<string>()
  for (const name of entityNames) {
    const unique = new Set<string>()
    for (const record of data[name]) {
      if (globalIds.has(record.id)) throw new DataError('duplicate', `Duplicate identifier: ${record.id}.`)
      globalIds.add(record.id)
      const municipalityId = recordMunicipality(name, record)
      if (!data.municipalities.some((municipality) => municipality.id === municipalityId)) throw new DataError('validation', `Unknown municipality on ${name}.`)
      if ('createdAt' in record && record.updatedAt < record.createdAt) throw new DataError('validation', `Invalid timestamps on ${name}.`)
      for (const field of uniqueFields[name] ?? []) {
        const value: unknown = (record as unknown as Record<string, unknown>)[field]
        const key = `${municipalityId}:${field}:${String(value).trim().toLowerCase()}`
        if (unique.has(key)) throw new DataError('duplicate', `Duplicate ${name} ${field} in this municipality.`)
        unique.add(key)
      }
    }
  }
  function ref<K extends EntityName>(table: K, id: string | null, municipalityId: MunicipalityId): EntityMap[K] | undefined {
    if (id === null) return undefined
    const row = data[table].find((record) => record.id === id)
    if (!row || recordMunicipality(table, row) !== municipalityId) throw new DataError('validation', `Invalid or cross-municipality reference to ${table}: ${id}.`)
    return row
  }
  for (const name of entityNames) for (const row of data[name]) {
    if (!('municipalityId' in row)) continue
    const m = row.municipalityId
    if ('departmentId' in row) ref('departments', row.departmentId, m)
    if ('custodianId' in row) ref('users', row.custodianId, m)
    if ('requestedById' in row) {
      ref('users', row.requestedById, m)
      for (const documentId of row.documentIds) {
        const document = ref('documents', documentId, m)!
        if (name !== 'approvals' && name !== 'documentRouting' && document.entityId !== row.id) throw new DataError('validation', 'A supporting document must belong to its record.')
      }
      if (row.workflowStatus === 'draft' && row.submittedAt !== null) throw new DataError('validation', 'Draft records cannot have a submission date.')
      if (['submitted', 'under_review', 'approved', 'returned', 'rejected'].includes(row.workflowStatus) && !row.submittedAt) throw new DataError('validation', 'Submitted workflow records require a submission date.')
    }
    if ('assetId' in row) ref('assets', row.assetId, m)
    if ('projectId' in row) ref('projects', row.projectId, m)
    if ('accountingRecordId' in row) ref('accountingRecords', row.accountingRecordId, m)
  }
  for (const row of data.users) ref('departments', row.departmentId, row.municipalityId)
  for (const row of data.assets) {
    const registration = ref('registrations', row.registrationId, row.municipalityId)!
    ref('assetCategories', row.category, row.municipalityId)
    ref('projects', row.constructionProjectId, row.municipalityId)
    if (registration.recognizedAssetId !== row.id || registration.workflowStatus !== 'approved') throw new DataError('validation', 'Assets require an approved, linked registration.')
  }
  for (const row of data.registrations) {
    ref('assetCategories', row.category, row.municipalityId)
    const asset = ref('assets', row.recognizedAssetId, row.municipalityId)
    if (asset && asset.registrationId !== row.id) throw new DataError('validation', 'Registration/asset links must be reciprocal.')
  }
  for (const row of data.projects) {
    const asset = ref('assets', row.capitalizedAssetId, row.municipalityId)
    if (asset && (asset.constructionProjectId !== row.id || row.projectStatus !== 'capitalized')) throw new DataError('validation', 'Invalid capitalization link.')
    if ((row.projectStatus === 'capitalized') !== (row.capitalizedAssetId !== null)) throw new DataError('validation', 'Capitalized projects require a linked asset.')
    if (row.completionDate && row.completionDate < row.startDate) throw new DataError('validation', 'Project completion precedes its start.')
  }
  for (const row of data.documents) {
    ref('users', row.uploadedById, row.municipalityId)
    ref(subjectTables[row.entityType], row.entityId, row.municipalityId)
  }
  for (const row of data.documentRouting) {
    const document = ref('documents', row.documentId, row.municipalityId)!
    if (document.entityType !== 'project' || document.entityId !== row.projectId) throw new DataError('validation', 'Routed document must belong to its project.')
    const assigned = ref('users', row.assignedUserId, row.municipalityId)
    if (assigned && assigned.role !== row.toRole) throw new DataError('validation', 'Routing assignee must have the destination role.')
  }
  for (const row of data.inventorySessions) for (const userId of row.assignedUserIds) ref('users', userId, row.municipalityId)
  const checkedAssets = new Set<string>()
  for (const row of data.inventoryChecks) {
    const key = `${row.sessionId}:${row.assetId}`
    if (checkedAssets.has(key)) throw new DataError('duplicate', 'This inventory session already contains a check for the asset.')
    checkedAssets.add(key)
    const session = ref('inventorySessions', row.sessionId, row.municipalityId)!
    ref('users', row.checkedById, row.municipalityId)
    if (!session.assignedUserIds.includes(row.checkedById)) throw new DataError('validation', 'Inventory checks require an assigned session participant.')
    ref('users', row.observedCustodianId, row.municipalityId)
  }
  for (const row of data.discrepancies) {
    const check = ref('inventoryChecks', row.inventoryCheckId, row.municipalityId)!
    if (check.assetId !== row.assetId) throw new DataError('validation', 'Discrepancy does not match the inventory check.')
    if (row.proposedCorrection.custodianId !== undefined) ref('users', row.proposedCorrection.custodianId, row.municipalityId)
  }
  for (const row of data.transfers) {
    for (const id of [row.fromDepartmentId, row.toDepartmentId]) ref('departments', id, row.municipalityId)
    for (const id of [row.fromCustodianId, row.toCustodianId]) ref('users', id, row.municipalityId)
  }
  for (const row of data.accountingRecords) {
    ref('users', row.postedById, row.municipalityId)
    const policy = ref('depreciationPolicies', row.policyId, row.municipalityId)
    if ((row.policyId === null) !== (row.policyVersion === null) || (policy && row.policyVersion! > policy.version)) throw new DataError('validation', 'Invalid accounting policy version.')
    const source = row.kind === 'recognition' ? 'registrations' : row.kind === 'cip' ? 'cipCosts' : row.kind === 'capitalization' ? 'projects' : row.kind === 'disposal' ? 'disposals' : row.kind === 'adjustment' ? 'reconciliations' : 'assets'
    ref(source, row.sourceId, row.municipalityId)
    if (!row.assetId && !row.projectId) throw new DataError('validation', 'Accounting records require an asset or project.')
    if (row.debit > 0 && row.credit > 0) throw new DataError('validation', 'A posting line cannot be both debit and credit.')
  }
  for (const row of data.cipCosts) if (row.accountingRecordId) {
    const posting = ref('accountingRecords', row.accountingRecordId, row.municipalityId)!
    if (posting.kind !== 'cip' || posting.sourceId !== row.id || posting.projectId !== row.projectId || posting.debit !== row.amount) throw new DataError('validation', 'CIP cost and accounting entry do not agree.')
  }
  for (const row of data.disposals) if (row.accountingRecordId) {
    const posting = ref('accountingRecords', row.accountingRecordId, row.municipalityId)!
    if (posting.kind !== 'disposal' || posting.sourceId !== row.id || posting.assetId !== row.assetId) throw new DataError('validation', 'Disposal and accounting entry do not agree.')
  }
  for (const row of data.reconciliations) {
    if (row.periodEnd < row.periodStart) throw new DataError('validation', 'Invalid reconciliation period.')
    for (const difference of row.differences) ref('assets', difference.assetId, row.municipalityId)
    for (const id of row.adjustmentRecordIds) ref('accountingRecords', id, row.municipalityId)
  }
  const openApprovals = new Set<string>()
  for (const row of data.approvals) {
    const target = ref(subjectTables[row.subjectType], row.subjectId, row.municipalityId)!
    if (row.assignedRole !== 'approving_officer') throw new DataError('validation', 'Business approvals must route to an Approving Officer.')
    if (row.workflowStatus !== target.workflowStatus) throw new DataError('validation', 'Approval and subject workflow statuses must agree.')
    if (row.requestedById !== target.requestedById) throw new DataError('validation', 'Approval and subject requester must agree.')
    const key = `${row.subjectType}:${row.subjectId}`
    if (openApprovals.has(key)) throw new DataError('duplicate', 'Duplicate approval for this request.')
    openApprovals.add(key)
    if (!row.history.length) throw new DataError('validation', 'An approval requires its submission or cancellation history.')
    let previousStatus: WorkflowStatus = 'draft'
    let previousTime = 0
    for (const event of row.history) {
      ref('users', event.actorId, row.municipalityId)
      if (event.fromStatus !== previousStatus || Date.parse(event.occurredAt) < previousTime || !validApprovalEvent(row.subjectType, event, row.requestedById)) throw new DataError('validation', 'Invalid approval history sequence, actor permission or transition.')
      previousStatus = event.toStatus
      previousTime = Date.parse(event.occurredAt)
    }
    if (row.history.length && row.history.at(-1)!.toStatus !== row.workflowStatus) throw new DataError('validation', 'Approval history does not match its current status.')
    if (['approved', 'rejected'].includes(row.workflowStatus) !== (row.decidedAt !== null)) throw new DataError('validation', 'Approval decision timestamps must match the workflow state.')
  }
  for (const name of ['registrations', 'discrepancies', 'transfers', 'maintenance', 'disposals', 'reconciliations'] as const) for (const row of data[name]) {
    if (row.workflowStatus !== 'draft' && !data.approvals.some((approval) => approval.subjectId === row.id)) throw new DataError('validation', 'A submitted or decided request requires its approval record.')
  }
  for (const row of data.notifications) ref('users', row.recipientId, row.municipalityId)
  for (const row of data.auditLogs) ref('users', row.actorId, row.municipalityId)
  for (const row of data.settings) {
    if (row.key === 'fiscal_year' && (typeof row.value !== 'number' || row.value < 1900 || row.value > 2200)) throw new DataError('validation', 'Demo fiscal year must be an integer between 1900 and 2200.')
    if (row.key === 'demo_notice' && (typeof row.value !== 'string' || !row.value.trim())) throw new DataError('validation', 'Demo notice must contain text.')
  }
  for (const municipality of data.municipalities) {
    if (municipality.name !== (municipality.id === 'botolan' ? 'Botolan' : 'San Antonio')) throw new DataError('validation', 'Municipality name/ID mismatch.')
    if (!data.users.some((user) => user.municipalityId === municipality.id && user.role === 'administrator' && user.status === 'active')) throw new DataError('validation', 'Keep an active demo Administrator in each municipality.')
    const actual = data.permissions.filter((rule) => rule.municipalityId === municipality.id).map((rule) => `${rule.role}:${rule.resource}:${rule.action}`).sort()
    const expected = permissionRules.map((rule) => `${rule.role}:${rule.resource}:${rule.action}`).sort()
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new DataError('validation', 'Permission snapshots must match the centrally defined demo policy.')
  }
  return data
}
