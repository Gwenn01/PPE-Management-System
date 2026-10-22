import type { EntityMap, EntityName } from '../domain/data.js'
import type { User } from '../domain/models.js'
import { canAccess } from '../domain/permissions.js'
import type { Action, Resource } from '../domain/permissions.js'
import type { MockDatabase } from '../mock/database.js'
import { authorize } from '../mock/unitOfWork.js'
import { recordMunicipality, subjectTables } from '../mock/validation/dataset.js'
import type { RequestContext } from './contracts.js'
import { DataError } from './errors.js'
import { approvalResources } from '../domain/workflow.js'
import { treasuryConfirmed } from '../domain/budget.js'
export { approvalResources } from '../domain/workflow.js'

export const tableResources: Record<EntityName, Resource> = {
  municipalities: 'dashboard', departments: 'departments', users: 'users', permissions: 'permissions', assetCategories: 'asset_categories', assets: 'assets',
  registrations: 'asset_registrations', documents: 'documents', projects: 'construction_projects', documentRouting: 'engineering_documents',
  cipCosts: 'cip_costs', inventorySessions: 'inventory_sessions', inventoryChecks: 'inventory_checks', discrepancies: 'inventory_discrepancies',
  transfers: 'asset_transfers', maintenance: 'maintenance_requests', disposals: 'disposal_requests', accountingRecords: 'accounting_records',
  depreciationPolicies: 'depreciation', reconciliations: 'reconciliations', approvals: 'registration_approvals', notifications: 'notifications', auditLogs: 'audit_logs', settings: 'settings',
}

export async function authorizeEntity(database: MockDatabase, context: RequestContext, name: EntityName, action: Action): Promise<User> {
  const resource = action === 'read' && (name === 'departments' || name === 'users') ? 'reference_data'
    : name === 'documentRouting' && context?.actor?.role === 'budget_office' ? 'budget_documents'
    : action === 'read' && (name === 'projects' || name === 'documentRouting') && context?.actor?.role === 'accounting_officer' ? 'cip_costs'
    : name === 'depreciationPolicies' && context?.actor?.role === 'administrator' ? 'settings'
    : tableResources[name]
  return authorize(database, context, resource, action)
}

export async function visibleRecord<K extends EntityName>(database: MockDatabase, actor: User, name: K, row: EntityMap[K]): Promise<boolean> {
  if (recordMunicipality(name, row) !== actor.municipalityId) return false
  if (name === 'projects') {
    const project = row as EntityMap['projects']
    if (project.capitalization && actor.role === 'approving_officer') {
      const grants = await database.entity('permissions').where('[municipalityId+role]').equals([actor.municipalityId, actor.role]).toArray()
      return grants.some(g => g.resource === 'capitalization_approvals' && g.action === 'read') && !!await database.entity('approvals').where('subjectId').equals(project.id).filter(a => a.subjectType === 'capitalization' && a.municipalityId === actor.municipalityId).first()
    }
    if (project.construction && actor.role === 'accounting_officer') {
      const packets = await database.entity('documentRouting').where('projectId').equals(project.id).filter(r => r.municipalityId === actor.municipalityId && r.toRole === 'accounting_officer' && r.assignedUserId === actor.id && !!r.budgetHandoff && !!r.budgetSourceRoutingId).toArray()
      return packets.some(r => treasuryConfirmed(r.budgetHandoff!))
    }
    if (project.construction) return actor.role === 'property_officer' ? project.requestedById === actor.id
      : actor.role === 'engineering_office' ? project.construction.engineeringUserId === actor.id
      : actor.role === 'budget_office' ? project.construction.budgetUserId === actor.id && project.construction.timeline.some(e => e.action === 'forward') : false
    if (actor.role === 'engineering_office' || actor.role === 'budget_office') return !!await database.entity('documentRouting').where('projectId').equals(project.id).filter(r => r.municipalityId === actor.municipalityId && (r.assignedUserId === actor.id || r.requestedById === actor.id)).first()
  }
  if (name === 'notifications') return (row as EntityMap['notifications']).recipientId === actor.id
  if (name === 'cipCosts' && (row as EntityMap['cipCosts']).accounting) {
    const cost = row as EntityMap['cipCosts'], project = await database.entity('projects').get(cost.projectId)
    return !!project && await visibleRecord(database, actor, 'projects', project)
  }
  if (name === 'documentRouting') {
    const route = row as EntityMap['documentRouting']
    const project = await database.entity('projects').get(route.projectId)
    return !!project && await visibleRecord(database, actor, 'projects', project) && (route.requestedById === actor.id || route.assignedUserId === actor.id || actor.role === 'property_officer')
  }
  if (name === 'approvals') {
    const approval = row as EntityMap['approvals']
    if (actor.role !== 'approving_officer' || !canAccess(actor, { resource: approvalResources[approval.subjectType], action: 'read' }, actor)) return false
    const grants = await database.entity('permissions').where('[municipalityId+role]').equals([actor.municipalityId, actor.role]).toArray()
    return grants.some((grant) => grant.resource === approvalResources[approval.subjectType] && grant.action === 'read' && grant.scope === 'municipality')
  }
  if (name === 'documents') {
    const document = row as EntityMap['documents']
    const ownerTable = subjectTables[document.entityType]
    const target = await database.entity(ownerTable).get(document.entityId)
    if (!target || recordMunicipality(ownerTable, target) !== actor.municipalityId || !target.documentIds.includes(document.id)) return false
    if (ownerTable === 'projects' && !await visibleRecord(database, actor, 'projects', target as EntityMap['projects'])) return false
    if (ownerTable === 'projects' && actor.role === 'accounting_officer') {
      const packets = await database.entity('documentRouting').where('projectId').equals(document.entityId).filter(r => r.municipalityId === actor.municipalityId && r.assignedUserId === actor.id && !!r.budgetHandoff && r.documentIds.includes(document.id)).toArray()
      const completionEvidence = ['cip_support', 'completion_certificate', 'acceptance_report'].includes(document.projectDocumentType ?? '') && !!await database.entity('documentRouting').where('projectId').equals(document.entityId).filter(r => r.municipalityId === actor.municipalityId && r.assignedUserId === actor.id && r.toRole === 'accounting_officer' && !!r.budgetHandoff && r.workflowStatus === 'approved' && !!r.receivedAt).first()
      return canAccess(actor, { resource: 'cip_costs', action: 'read' }, actor) && (packets.length > 0 || completionEvidence) && (await database.entity('permissions').where('[municipalityId+role]').equals([actor.municipalityId, actor.role]).toArray()).some(g => g.resource === 'cip_costs' && g.action === 'read')
    }
    const grants = await database.entity('permissions').where('[municipalityId+role]').equals([actor.municipalityId, actor.role]).toArray()
    const hasGrant = (resource: Resource) => canAccess(actor, { resource, action: 'read' }, actor) &&
      grants.some((grant) => grant.resource === resource && grant.action === 'read' && grant.scope === 'municipality')
    if (actor.role === 'approving_officer') {
      const subject = document.entityType === 'project' ? 'capitalization' : document.entityType
      if (subject === 'inventory' || subject === 'cip_cost' || !hasGrant(approvalResources[subject])) return false
      const linked = await database.entity('approvals').where('subjectId').equals(document.entityId).filter((approval) =>
        approval.municipalityId === actor.municipalityId && approval.subjectType === subject && !['draft', 'cancelled'].includes(approval.workflowStatus)).first()
      return !!linked
    }
    if (hasGrant(tableResources[ownerTable])) return true
    return document.entityType === 'registration' && 'recognizedAssetId' in target && target.recognizedAssetId !== null && actor.role === 'auditor' && hasGrant('assets')
  }
  return true
}

export async function scopedRecord<K extends EntityName>(database: MockDatabase, actor: User, name: K, id: string): Promise<EntityMap[K]> {
  const record = await database.entity(name).get(id)
  if (!record || !await visibleRecord(database, actor, name, record)) throw new DataError('not_found', 'Record not found in the current municipality or personal queue.')
  return record
}

