import { parseRegistrationRules } from '../../domain/registration.js'
import { depreciationSchedule } from '../../domain/accounting.js'
import { treasuryConfirmed } from '../../domain/budget.js'
import type { Dataset, EntityMap, EntityName } from '../../domain/data.js'
import type { MunicipalityId } from '../../domain/models.js'
import { permissionRules, isLockedGrant } from '../../domain/permissions.js'
import { validApprovalEvent } from '../../domain/workflow.js'
import type { WorkflowStatus } from '../../domain/models.js'
import { DataError } from '../../services/errors.js'
import { datasetSchema, entityNames } from './schemas.js'
import { upgradeLegacyDataset } from './usernames.js'
import { inspectionFlags } from '../../domain/inventory.js'
import { lifecyclePolicySchema } from '../../domain/lifecycle.js'
import { balancesEqual, difference, reconciliationPolicySchema } from '../../domain/reconciliation.js'

export const subjectTables = { registration: 'registrations', capitalization: 'projects', correction: 'discrepancies', transfer: 'transfers', maintenance: 'maintenance', disposal: 'disposals', reconciliation: 'reconciliations', project: 'projects', inventory: 'inventorySessions', cip_cost: 'cipCosts' } as const

export function recordMunicipality(name: EntityName, record: EntityMap[EntityName]): MunicipalityId {
  return name === 'municipalities' ? (record as EntityMap['municipalities']).id : (record as Exclude<EntityMap[EntityName], EntityMap['municipalities']>).municipalityId
}

const uniqueFields: Partial<Record<EntityName, string[]>> = {
  departments: ['code'], users: ['email', 'username'], assetCategories: ['code'], assets: ['propertyNumber'], registrations: ['proposedPropertyNumber'],
  projects: ['projectNumber'], documents: ['storageKey'], settings: ['key'],
}
export function validateDataset(input: unknown): Dataset {
  const data: Dataset = datasetSchema.parse(upgradeLegacyDataset(input))
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
    const registration = ref('registrations', row.registrationId, row.municipalityId)
    ref('assetCategories', row.category, row.municipalityId)
    ref('projects', row.constructionProjectId, row.municipalityId)
    if (registration ? registration.recognizedAssetId !== row.id || registration.workflowStatus !== 'approved' : !row.constructionProjectId || !data.projects.some(p => p.id === row.constructionProjectId && p.capitalizedAssetId === row.id && p.capitalization && p.workflowStatus === 'approved')) throw new DataError('validation', 'Assets require approved registration or approved construction capitalization provenance.')
  }
  for (const row of data.registrations) {
    ref('assetCategories', row.category, row.municipalityId)
    const asset = ref('assets', row.recognizedAssetId, row.municipalityId)
    if (asset && asset.registrationId !== row.id) throw new DataError('validation', 'Registration/asset links must be reciprocal.')
  }
  for (const row of data.projects) {
    if (row.readyForUse) {
      const ready = row.readyForUse
      ref('users', ready.confirmedById, row.municipalityId)
      if (!row.completionDate || ready.date < row.completionDate.slice(0, 10)) throw new DataError('validation', 'Readiness must follow documented completion.')
      for (const id of ready.documentIds) { const doc = ref('documents', id, row.municipalityId); if (!doc || doc.entityId !== row.id || !row.documentIds.includes(id)) throw new DataError('validation', 'Intended-use evidence must belong to the project.') }
    }
    if (row.capitalization) {
      const cap = row.capitalization
      ref('users', cap.requestedById, row.municipalityId); ref('assetCategories', cap.category, row.municipalityId); ref('depreciationPolicies', cap.policyId, row.municipalityId)
      for (const id of cap.costIds) if (ref('cipCosts', id, row.municipalityId)?.projectId !== row.id) throw new DataError('validation', 'Capitalization costs must belong to this project.')
      if (!row.readyForUse || cap.depreciation.cost !== cap.total) throw new DataError('validation', 'Capitalization requires intended-use readiness and consistent accounting values.')
      if (row.projectStatus === 'capitalized') {
        const transfers = data.accountingRecords.filter(e => e.projectId === row.id && e.kind === 'capitalization')
        if (transfers.length !== 2 || !transfers.some(e => e.accountCode === 'DEMO-CIP' && e.credit === cap.total && e.debit === 0) || !transfers.some(e => e.accountCode === 'DEMO-PPE' && e.debit === cap.total && e.credit === 0 && e.assetId === row.capitalizedAssetId)) throw new DataError('validation', 'Capitalization requires one balanced CIP-to-PPE transfer pair.')
        if (cap.costIds.some(id => data.cipCosts.find(c => c.id === id)?.accounting?.status !== 'capitalized')) throw new DataError('validation', 'Capitalized costs must be marked transferred exactly once.')
      }
    }
    if (row.construction) {
      const c = row.construction
      const engineer = ref('users', c.engineeringUserId, row.municipalityId)
      const budget = ref('users', c.budgetUserId, row.municipalityId)
      if (engineer?.role !== 'engineering_office' || budget?.role !== 'budget_office' || c.expectedCompletionDate < row.startDate.slice(0, 10)) throw new DataError('validation', 'Invalid project assignments or expected completion date.')
      if (!c.timeline.length || new Set(c.timeline.map(e => e.id)).size !== c.timeline.length || c.timeline.at(-1)!.progressPercent !== c.progressPercent) throw new DataError('validation', 'Project timeline and progress disagree.')
      let previous = ''
      for (const event of c.timeline) {
        ref('users', event.actorId, row.municipalityId)
        if (event.occurredAt < previous) throw new DataError('validation', 'Project timeline must be chronological.')
        previous = event.occurredAt
        for (const id of event.documentIds) { const d = ref('documents', id, row.municipalityId); if (!d || d.entityId !== row.id || !row.documentIds.includes(id)) throw new DataError('validation', 'Timeline evidence must belong to its project.') }
      }
      if (row.projectStatus === 'completed' && (!row.completionDate || c.progressPercent !== 100 || !c.timeline.some(e => e.action === 'complete'))) throw new DataError('validation', 'Completed projects require completion evidence and history.')
    }
    const asset = ref('assets', row.capitalizedAssetId, row.municipalityId)
    if (asset && (asset.constructionProjectId !== row.id || row.projectStatus !== 'capitalized')) throw new DataError('validation', 'Invalid capitalization link.')
    if ((row.projectStatus === 'capitalized') !== (row.capitalizedAssetId !== null)) throw new DataError('validation', 'Capitalized projects require a linked asset.')
    if (row.completionDate && row.completionDate < row.startDate) throw new DataError('validation', 'Project completion precedes its start.')
  }
  for (const row of data.documents) {
    if (row.budgetRoutingId) {
      const packet = ref('documentRouting', row.budgetRoutingId, row.municipalityId)
      if (!packet?.budgetProcessing || packet.projectId !== row.entityId || !packet.documentIds.includes(row.id) || !['voucher', 'budget_review', 'treasury_confirmation_demo'].includes(row.projectDocumentType ?? '')) throw new DataError('validation', 'Budget evidence requires a matching processing packet.')
    }
    if (row.projectDocumentType && row.entityType !== 'project') throw new DataError('validation', 'Project evidence types require a project.')
    if (row.documentType && row.entityType !== 'registration') throw new DataError('validation', 'Registration document types cannot be assigned to another subject.')
    ref('users', row.uploadedById, row.municipalityId)
    ref(subjectTables[row.entityType], row.entityId, row.municipalityId)
  }
  for (const row of data.documentRouting) {
    const document = ref('documents', row.documentId, row.municipalityId)!
    if (document.entityType !== 'project' || document.entityId !== row.projectId) throw new DataError('validation', 'Routed document must belong to its project.')
    const assigned = ref('users', row.assignedUserId, row.municipalityId)
    if (assigned && assigned.role !== row.toRole) throw new DataError('validation', 'Routing assignee must have the destination role.')
    const project = ref('projects', row.projectId, row.municipalityId)!
    for (const id of row.documentIds) { const d = ref('documents', id, row.municipalityId)!; if (d.entityId !== project.id || d.entityType !== 'project' || !project.documentIds.includes(id)) throw new DataError('validation', 'Packet evidence must belong to its project.') }
    if (row.budgetProcessing) {
      const p = row.budgetProcessing
      if (row.fromRole !== 'engineering_office' || row.toRole !== 'budget_office' || !project.construction || !row.receivedAt || !p.history.length) throw new DataError('validation', 'Budget processing requires an assigned, received Engineering packet.')
      const accounting = ref('users', p.accountingUserId, row.municipalityId)
      if (accounting && accounting.role !== 'accounting_officer') throw new DataError('validation', 'Invalid Accounting assignee.')
      if (['ready', 'treasury_pending', 'treasury_confirmed', 'forwarded', 'completed'].includes(p.status) && (!p.voucher || !p.fund || !accounting)) throw new DataError('validation', 'Reviewed processing requires voucher, fund and Accounting assignment.')
      if ((p.status === 'treasury_pending' || p.status === 'treasury_confirmed') && (p.fund !== 'trust' || !p.treasury)) throw new DataError('validation', 'Treasury stages require Trust Fund processing.')
      if (['treasury_confirmed', 'forwarded', 'completed'].includes(p.status) && !treasuryConfirmed(p)) throw new DataError('validation', 'Trust Fund processing requires external Treasury confirmation.')
      if (p.fund === 'regular' && p.treasury) throw new DataError('validation', 'Regular Fund processing cannot contain a Treasury stage.')
      if (p.treasury?.evidenceId) {
        const d = ref('documents', p.treasury.evidenceId, row.municipalityId)
        if (!d || d.budgetRoutingId !== row.id || d.projectDocumentType !== 'treasury_confirmation_demo' || !p.treasury.confirmedAt || !p.treasury.confirmationDate || !p.treasury.reference || p.treasury.confirmationDate < p.treasury.sentAt.slice(0, 10) || p.treasury.confirmedAt < p.treasury.sentAt) throw new DataError('validation', 'Invalid external Treasury confirmation evidence.')
      }
      let previous = ''
      for (const event of p.history) {
        ref('users', event.actorId, row.municipalityId)
        if (event.occurredAt < previous) throw new DataError('validation', 'Budget history must be chronological.')
        previous = event.occurredAt
        for (const id of event.documentIds) if (!row.documentIds.includes(id)) throw new DataError('validation', 'Budget history evidence must belong to the source packet.')
      }
      if (p.status === 'completed' && !p.accountingReceivedAt) throw new DataError('validation', 'Completed processing requires Accounting receipt.')
    }
    if (row.budgetSourceRoutingId || row.budgetHandoff) {
      const source = row.budgetSourceRoutingId ? ref('documentRouting', row.budgetSourceRoutingId, row.municipalityId) : undefined
      if (!source?.budgetProcessing || source.projectId !== row.projectId || row.fromRole !== 'budget_office' || row.toRole !== 'accounting_officer' || !row.budgetHandoff || !treasuryConfirmed(row.budgetHandoff)) throw new DataError('validation', 'Invalid or unconfirmed Budget-to-Accounting handoff.')
      if (row.budgetHandoff.fund === 'trust') {
        const d = ref('documents', row.budgetHandoff.treasury?.evidenceId ?? null, row.municipalityId)
        if (!d || !row.documentIds.includes(d.id) || d.budgetRoutingId !== source.id || d.projectDocumentType !== 'treasury_confirmation_demo') throw new DataError('validation', 'Trust Fund handoff requires preserved Treasury evidence.')
      }
      if (data.documentRouting.filter(r => r.budgetSourceRoutingId === source.id && r.workflowStatus === 'submitted').length > 1) throw new DataError('validation', 'Duplicate outstanding Accounting forwarding.')
    }
  }
  for (const row of data.inventorySessions) {
    for (const userId of row.assignedUserIds) ref('users', userId, row.municipalityId)
    if (new Set(row.assignedUserIds).size !== row.assignedUserIds.length) throw new DataError('validation', 'Duplicate assigned inventory personnel.')
    if (row.inventory) {
      if (new Set(row.inventory.assetIds).size !== row.inventory.assetIds.length) throw new DataError('validation', 'Duplicate inventory scope asset.')
      for (const id of row.inventory.assetIds) ref('assets', id, row.municipalityId)
      for (const e of row.inventory.history) ref('users', e.actorId, row.municipalityId)
      if (row.sessionStatus === 'completed' && row.inventory.assetIds.some(id => !data.inventoryChecks.some(c => c.sessionId === row.id && c.assetId === id && !c.inspection?.reopen))) throw new DataError('validation', 'Completed inventory sessions require every scoped asset inspection.')
    }
  }
  const checkedAssets = new Set<string>()
  for (const row of data.inventoryChecks) {
    const key = `${row.sessionId}:${row.assetId}`
    if (checkedAssets.has(key)) throw new DataError('duplicate', 'This inventory session already contains a check for the asset.')
    checkedAssets.add(key)
    const session = ref('inventorySessions', row.sessionId, row.municipalityId)!
    ref('users', row.checkedById, row.municipalityId)
    if (!session.assignedUserIds.includes(row.checkedById)) throw new DataError('validation', 'Inventory checks require an assigned session participant.')
    ref('users', row.observedCustodianId, row.municipalityId)
    if (row.inspection) {
      if (!session.inventory?.assetIds.includes(row.assetId)) throw new DataError('validation', 'Managed inspections require captured session membership.')
      for (const [index, a] of row.inspection.attempts.entries()) {
        ref('users', a.checkedById, row.municipalityId); ref('users', a.observedCustodianId, row.municipalityId); ref('users', a.baseline.custodianId, row.municipalityId)
        const flags = inspectionFlags(a.baseline, a)
        if (a.revision !== index + 1 || JSON.stringify(flags) !== JSON.stringify(a.flags) || a.result !== (flags.length ? 'discrepancy' : 'verified') || !session.assignedUserIds.includes(a.checkedById)) throw new DataError('validation', 'Invalid preserved inspection result.')
      }
      const latest = row.inspection.attempts.at(-1)!
      for (const key of ['checkedById', 'checkedAt', 'found', 'observedLocation', 'observedCustodianId', 'observedCondition', 'notes'] as const) if (row[key] !== latest[key]) throw new DataError('validation', 'Latest observation must agree with preserved inspection history.')
      for (const e of row.inspection.reopens) ref('users', e.actorId, row.municipalityId)
    }
  }
  for (const row of data.discrepancies) {
    const check = ref('inventoryChecks', row.inventoryCheckId, row.municipalityId)!
    if (check.assetId !== row.assetId) throw new DataError('validation', 'Discrepancy does not match the inventory check.')
    if (row.proposedCorrection.custodianId !== undefined) ref('users', row.proposedCorrection.custodianId, row.municipalityId)
    if (row.investigation) {
      const i = row.investigation
      if (i.sessionId !== check.sessionId || i.investigatorId && i.investigatorId !== row.requestedById || row.resolvedAt && row.workflowStatus !== 'approved' || row.workflowStatus === 'approved' && (!row.resolvedAt || !i.proposal)) throw new DataError('validation', 'Invalid discrepancy investigation or resolution.')
      ref('users', i.detectedById, row.municipalityId); ref('users', i.investigatorId, row.municipalityId)
      for (const e of i.history) ref('users', e.actorId, row.municipalityId)
      if (check.inspection && !check.inspection.attempts.some(a => a.revision === i.checkRevision && a.result === 'discrepancy' && JSON.stringify(a.flags) === JSON.stringify(i.flags))) throw new DataError('validation', 'Discrepancy must retain its original flagged inspection.')
    }
  }
  for (const row of data.transfers) {
    for (const id of [row.fromDepartmentId, row.toDepartmentId]) ref('departments', id, row.municipalityId)
    for (const id of [row.fromCustodianId, row.toCustodianId]) ref('users', id, row.municipalityId)
  }
  for (const row of data.accountingRecords) {
    if (row.recognitionDetails) {
      const details = row.recognitionDetails
      depreciationSchedule(details, details.startDate)
      if (!['recognition', 'capitalization'].includes(row.kind) || details.cost !== row.debit || row.credit !== 0 || details.startDate !== row.postingDate || (row.kind === 'recognition' ? row.accountCode !== details.treatment : row.accountCode !== 'DEMO-PPE')) throw new DataError('validation', 'Recognition details and authorized accounting values disagree.')
      const asset = ref('assets', row.assetId, row.municipalityId)
      if (!asset || asset.acquisitionCost !== details.cost || (row.kind === 'recognition' ? asset.registrationId !== row.sourceId : asset.constructionProjectId !== row.sourceId) || asset.recognitionStatus !== 'recognized') throw new DataError('validation', 'Recognition requires matching asset accounting status and acquisition cost.')
      if (data.accountingRecords.filter(r => r.assetId === row.assetId && !!r.recognitionDetails).length !== 1) throw new DataError('validation', 'Duplicate asset recognition.')
    }
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
  for (const row of data.cipCosts) if (row.accounting) {
    const a = row.accounting, project = ref('projects', row.projectId, row.municipalityId)!
    const supporting = ref('documents', a.supportingDocumentId, row.municipalityId), packet = ref('documentRouting', a.budgetPacketId, row.municipalityId)
    if (!project.construction || !supporting || supporting.entityId !== project.id || supporting.projectDocumentType !== 'cip_support' || packet?.projectId !== project.id || packet.toRole !== 'accounting_officer' || packet.workflowStatus !== 'approved') throw new DataError('validation', 'CIP expenditure requires project support and an acknowledged Accounting handoff.')
    ref('users', a.reviewedById, row.municipalityId)
    if (['approved', 'capitalized'].includes(a.status) && (!row.accountingRecordId || !a.reviewedById || !a.reviewedAt)) throw new DataError('validation', 'Qualifying costs require review and an authorized CIP posting.')
    if (a.reversalRecordId) { const reversal = ref('accountingRecords', a.reversalRecordId, row.municipalityId); if (!reversal || reversal.kind !== 'cip' || reversal.sourceId !== row.id || reversal.credit !== row.amount || reversal.debit !== 0 || a.status !== 'excluded') throw new DataError('validation', 'Excluded posted CIP costs require a matching reversing credit.') }
    if (a.status === 'capitalized' && (!a.transferredAt || project.projectStatus !== 'capitalized' || !project.capitalization?.costIds.includes(row.id))) throw new DataError('validation', 'Transferred costs require approved project capitalization.')
  }
  for (const row of data.disposals) if (row.accountingRecordId) {
    const posting = ref('accountingRecords', row.accountingRecordId, row.municipalityId)!
    if (posting.kind !== 'disposal' || posting.sourceId !== row.id || posting.assetId !== row.assetId) throw new DataError('validation', 'Disposal and accounting entry do not agree.')
  }
  for (const row of data.reconciliations) {
    if (row.periodEnd < row.periodStart) throw new DataError('validation', 'Invalid reconciliation period.')
    for (const difference of row.differences) ref('assets', difference.assetId, row.municipalityId)
    for (const id of row.adjustmentRecordIds) ref('accountingRecords', id, row.municipalityId)
    if (row.reconciliationSession && row.reconciliationCorrection) throw new DataError('validation', 'A reconciliation record cannot be both a session and a correction.')
    if (row.reconciliationSession) {
      const s = row.reconciliationSession
      if (row.workflowStatus !== 'draft' || (s.status === 'completed') !== (s.completedAt !== null) || s.status === 'completed' && s.rows.some(r => r.status === 'discrepancy')) throw new DataError('validation', 'Invalid reconciliation session completion or authorization status.')
      ref('assetCategories', s.categoryId, row.municipalityId)
      const keys = new Set<string>()
      for (const comparison of s.rows) {
        ref(comparison.entityType === 'asset' ? 'assets' : 'projects', comparison.entityId, row.municipalityId)
        if (comparison.key !== `${comparison.entityType}:${comparison.entityId}` || keys.has(comparison.key)) throw new DataError('validation', 'Invalid or duplicate reconciliation comparison key.')
        keys.add(comparison.key)
        if (JSON.stringify(comparison.difference) !== JSON.stringify(difference(comparison.reference, comparison.accounting))) throw new DataError('validation', 'Reconciliation differences must be calculated from the saved balances.')
        const matched = !!comparison.accounting && balancesEqual(comparison.reference, comparison.accounting)
        if ((comparison.status === 'matched') !== matched || comparison.status === 'accounted_for' && (!s.policy.allowDocumentedExceptions || !comparison.accounting || !s.exceptions.some(e => e.rowKey === comparison.key && balancesEqual(e.reference, comparison.reference) && balancesEqual(e.accounting, comparison.accounting!)))) throw new DataError('validation', 'Reconciliation status must agree with saved balances or an authorized exception.')
      }
      if (s.rows.reduce((sum, r) => sum + BigInt(r.reference.cost), 0n) !== BigInt(row.propertyBalance) || s.rows.reduce((sum, r) => sum + BigInt(r.accounting?.cost ?? 0), 0n) !== BigInt(row.accountingBalance)) throw new DataError('validation', 'Reconciliation totals must be recalculated from stored comparison rows.')
      for (const e of s.history) ref('users', e.actorId, row.municipalityId)
      for (const capture of s.captures) ref('users', capture.actorId, row.municipalityId)
      for (const imported of s.importHistory) {
        ref('users', imported.actorId, row.municipalityId)
        if (imported.dataset.municipalityId !== row.municipalityId || imported.dataset.periodStart !== row.periodStart || imported.dataset.periodEnd !== row.periodEnd) throw new DataError('validation', 'Imported reconciliation balances must retain the session municipality and period.')
      }
      for (const reference of [...s.overrides, ...s.exceptions]) {
        const correction = ref('reconciliations', reference.correctionId, row.municipalityId)!
        if (correction.reconciliationCorrection?.sessionId !== row.id || !correction.reconciliationCorrection.appliedAt || correction.workflowStatus !== 'approved') throw new DataError('validation', 'Imported overrides and exceptions require an applied approved correction.')
      }
    }
    if (row.reconciliationCorrection) {
      const c = row.reconciliationCorrection, parent = ref('reconciliations', c.sessionId, row.municipalityId)!
      if (!parent.reconciliationSession || parent.requestedById !== row.requestedById || parent.periodStart !== row.periodStart || parent.periodEnd !== row.periodEnd || (row.workflowStatus === 'approved') !== (c.appliedAt !== null)) throw new DataError('validation', 'Correction parent, accounting period and applied decision must agree.')
      for (const e of c.history) ref('users', e.actorId, row.municipalityId)
      if (c.supersedesId) { const prior = ref('reconciliations', c.supersedesId, row.municipalityId)!; if (prior.workflowStatus !== 'rejected' || prior.reconciliationCorrection?.sessionId !== parent.id) throw new DataError('validation', 'A replacement must retain its rejected originating correction.') }
      if (c.appliedAt && c.mode === 'adjust_local_ledger') {
        const postings = row.adjustmentRecordIds.map(id => ref('accountingRecords', id, row.municipalityId)!)
        if (!postings.length || postings.some(e => e.kind !== 'adjustment' || e.sourceId !== row.id) || postings.reduce((sum, e) => sum + BigInt(e.debit) - BigInt(e.credit), 0n) !== 0n) throw new DataError('validation', 'Approved ledger corrections require a balanced adjustment journal.')
      }
    }
  }
  const openApprovals = new Set<string>()
  for (const row of data.approvals) {
    const target = ref(subjectTables[row.subjectType], row.subjectId, row.municipalityId)!
    if (row.assignedRole !== 'approving_officer') throw new DataError('validation', 'Business approvals must route to an Approving Officer.')
    if (row.workflowStatus !== target.workflowStatus) throw new DataError('validation', 'Approval and subject workflow statuses must agree.')
    if (row.requestedById !== (row.subjectType === 'capitalization' && 'capitalization' in target && target.capitalization ? target.capitalization.requestedById : target.requestedById)) throw new DataError('validation', 'Approval and subject requester must agree.')
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
    if (row.history.some((event) => event.submission && (event.action !== 'submit' || !event.submission.documentIds.every((id) => typeof id === 'string')))) throw new DataError('validation', 'Invalid approval submission snapshot.')
    if (row.history.length && row.history.at(-1)!.toStatus !== row.workflowStatus) throw new DataError('validation', 'Approval history does not match its current status.')
    if (['approved', 'rejected'].includes(row.workflowStatus) !== (row.decidedAt !== null)) throw new DataError('validation', 'Approval decision timestamps must match the workflow state.')
  }
  for (const name of ['registrations', 'discrepancies', 'transfers', 'maintenance', 'disposals', 'reconciliations'] as const) for (const row of data[name]) {
    const meta = 'lifecycle' in row ? row.lifecycle : undefined
    const policyAuthorized = meta && meta.approvalRequired === false && meta.authorization?.source === 'configured_policy' && name !== 'disposals' && row.workflowStatus === 'approved'
    const lifecycleCancelled = (['transfers', 'maintenance', 'disposals'].includes(name) || name === 'reconciliations' && 'reconciliationCorrection' in row && row.reconciliationCorrection) && row.workflowStatus === 'cancelled'
    if (row.workflowStatus !== 'draft' && !lifecycleCancelled && !policyAuthorized && !data.approvals.some((approval) => approval.subjectId === row.id)) throw new DataError('validation', 'A submitted or decided request requires its approval record.')
    if (meta) {
      if (policyAuthorized && (!meta.policy || meta.authorization!.actorId !== row.requestedById || name === 'transfers' && meta.policy.transferRequiresApproval || name === 'maintenance' && (meta.policy.maintenanceApproval === 'always' || meta.policy.maintenanceApproval === 'above_threshold' && 'estimatedCost' in row && row.estimatedCost >= meta.policy.maintenanceThreshold))) throw new DataError('validation', 'The saved demonstration policy must explicitly authorize approval-free processing.')
      ref('users', meta.baseline.custodianId, row.municipalityId); ref('departments', meta.baseline.departmentId, row.municipalityId)
      for (const e of meta.history) ref('users', e.actorId, row.municipalityId)
      if (meta.authorization) ref('users', meta.authorization.actorId, row.municipalityId)
      if (meta.review) ref('users', meta.review.actorId, row.municipalityId)
      if (['authorized', 'in_progress', 'completed'].includes(meta.stage) && (row.workflowStatus !== 'approved' || !meta.authorization || !meta.policy)) throw new DataError('validation', 'Lifecycle execution requires retained authorization and policy.')
      if ((meta.completedAt !== null) !== (meta.stage === 'completed')) throw new DataError('validation', 'Lifecycle completion history and stage disagree.')
      if (name === 'disposals' && ['reviewed', 'approval', 'authorized', 'completed'].includes(meta.stage) && (!meta.review || meta.approvalRequired !== true)) throw new DataError('validation', 'Disposal requires Accounting review and centralized approval.')
      if (name === 'disposals' && meta.stage === 'completed') {
        if (!('disposedAt' in row) || !row.disposedAt || !row.accountingRecordId || ref('assets', row.assetId, row.municipalityId)!.lifecycleStatus !== 'disposed') throw new DataError('validation', 'Completed disposal requires the official retirement and posting.')
        const postings = data.accountingRecords.filter(e => e.sourceId === row.id && e.kind === 'disposal')
        if (!postings.length || postings.reduce((sum, e) => sum + BigInt(e.debit) - BigInt(e.credit), 0n) !== 0n) throw new DataError('validation', 'Mock disposal journal must balance.')
      }
    }
  }
  for (const row of data.notifications) ref('users', row.recipientId, row.municipalityId)
  for (const row of data.auditLogs) ref('users', row.actorId, row.municipalityId)
  for (const row of data.settings) {
    if (row.key === 'reconciliation_policy') { try { reconciliationPolicySchema.parse(JSON.parse(String(row.value))) } catch { throw new DataError('validation', 'Invalid reconciliation demonstration policy.') } }
    if (row.key === 'lifecycle_policy') { try { lifecyclePolicySchema.parse(JSON.parse(String(row.value))) } catch { throw new DataError('validation', 'Invalid lifecycle demonstration policy.') } }
    if (row.key === 'fiscal_year' && (typeof row.value !== 'number' || row.value < 1900 || row.value > 2200)) throw new DataError('validation', 'Demo fiscal year must be an integer between 1900 and 2200.')
    if (row.key === 'registration_document_rules') {
      try { if (typeof row.value !== 'string') throw new Error('Rules must be JSON'); parseRegistrationRules(JSON.parse(row.value)) } catch { throw new DataError('validation', 'Invalid configured registration document requirements.') }
    }
    if (row.key === 'demo_notice' && (typeof row.value !== 'string' || !row.value.trim())) throw new DataError('validation', 'Demo notice must contain text.')
  }
  for (const municipality of data.municipalities) {
    if (municipality.name !== (municipality.id === 'botolan' ? 'Botolan' : 'San Antonio')) throw new DataError('validation', 'Municipality name/ID mismatch.')
    if (!data.users.some((user) => user.municipalityId === municipality.id && user.role === 'administrator' && user.status === 'active')) throw new DataError('validation', 'Keep an active demo Administrator in each municipality.')
    const local = data.permissions.filter((rule) => rule.municipalityId === municipality.id)
    const actual = local.map((rule) => `${rule.role}:${rule.resource}:${rule.action}`)
    const allowed = new Set(permissionRules.map((rule) => `${rule.role}:${rule.resource}:${rule.action}`))
    if (new Set(actual).size !== actual.length || actual.some((entry) => !allowed.has(entry))) throw new DataError('validation', 'Unknown or duplicate municipal permission grant.')
    for (const locked of permissionRules.filter(isLockedGrant)) {
      if (!actual.includes(`${locked.role}:${locked.resource}:${locked.action}`)) throw new DataError('validation', 'Immutable municipal bootstrap grants must be preserved.')
    }
  }
  return data
}

