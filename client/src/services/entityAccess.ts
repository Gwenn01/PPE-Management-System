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
    : name === 'depreciationPolicies' && context?.actor?.role === 'administrator' ? 'settings'
    : tableResources[name]
  return authorize(database, context, resource, action)
}

export async function visibleRecord<K extends EntityName>(database: MockDatabase, actor: User, name: K, row: EntityMap[K]): Promise<boolean> {
  if (recordMunicipality(name, row) !== actor.municipalityId) return false
  if (name === 'notifications') return (row as EntityMap['notifications']).recipientId === actor.id
  if (name === 'documentRouting') {
    const route = row as EntityMap['documentRouting']
    return route.fromRole === actor.role || route.toRole === actor.role
  }
  if (name === 'documents') {
    const document = row as EntityMap['documents']
    const owner = subjectTables[document.entityType]
    const target = await database.entity(owner).get(document.entityId)
    if (!target || recordMunicipality(owner, target) !== actor.municipalityId) return false
    if (canAccess(actor, { resource: tableResources[owner], action: 'read' }, actor)) return true
    if (document.entityType !== 'project' && document.entityType !== 'inventory' && document.entityType !== 'cip_cost' && canAccess(actor, { resource: approvalResources[document.entityType], action: 'read' }, actor)) return true
    return document.entityType === 'registration' && 'recognizedAssetId' in target && target.recognizedAssetId !== null && actor.role === 'auditor'
  }
  return true
}

export async function scopedRecord<K extends EntityName>(database: MockDatabase, actor: User, name: K, id: string): Promise<EntityMap[K]> {
  const record = await database.entity(name).get(id)
  if (!record || !await visibleRecord(database, actor, name, record)) throw new DataError('not_found', 'Record not found in the current municipality or personal queue.')
  return record
}
