import { isRole, roleList } from '../config/roles.js'
import type { Role } from '../config/roles.js'
import type { MunicipalityId, User } from './models.js'

export const actions = ['read', 'create', 'update', 'submit', 'approve', 'reject', 'export', 'manage'] as const
export type Action = (typeof actions)[number]
export const resources = [
  'dashboard', 'users', 'departments', 'permissions', 'settings', 'assets',
  'asset_registrations', 'construction_projects', 'engineering_documents', 'budget_documents',
  'inventory_sessions', 'inventory_checks', 'inventory_discrepancies', 'asset_transfers',
  'maintenance_requests', 'disposal_requests', 'recognition', 'depreciation', 'cip_costs',
  'disposal_review', 'reconciliations', 'registration_approvals', 'capitalization_approvals',
  'correction_approvals', 'lifecycle_approvals', 'reports', 'audit_logs', 'documents', 'notifications',
  'asset_categories', 'accounting_records', 'demo_data', 'reference_data',
] as const
export type Resource = (typeof resources)[number]
export interface PermissionRequirement { resource: Resource; action: Action }
export interface PermissionRule extends PermissionRequirement {
  role: Role
  scope: 'municipality'
}

const grants: PermissionRule[] = []
function grant(resource: Resource, roles: readonly Role[], allowed: readonly Action[]) {
  for (const role of roles) for (const action of allowed) {
    grants.push({ resource, role, action, scope: 'municipality' })
  }
}

// Explicit grants only. Manage does not implicitly grant any other action.
grant('dashboard', roleList, ['read'])
grant('reference_data', roleList, ['read'])
grant('asset_categories', roleList, ['read'])
grant('asset_categories', ['administrator'], ['create', 'update'])
grant('accounting_records', ['accounting_officer', 'auditor'], ['read'])
grant('demo_data', ['administrator'], ['read', 'export', 'manage'])
for (const resource of ['users', 'departments', 'permissions', 'settings'] as const) {
  grant(resource, ['administrator'], ['read', 'create', 'update', 'manage'])
}
grant('assets', ['property_officer', 'accounting_officer', 'inventory_personnel', 'auditor'], ['read'])
grant('asset_registrations', ['property_officer'], ['read', 'create', 'update', 'submit'])
grant('construction_projects', ['property_officer', 'engineering_office', 'budget_office'], ['read'])
grant('construction_projects', ['property_officer'], ['create', 'update', 'submit'])
grant('engineering_documents', ['engineering_office'], ['read', 'create', 'update', 'submit'])
grant('budget_documents', ['budget_office'], ['read', 'update', 'submit'])
for (const resource of ['inventory_sessions', 'inventory_checks'] as const) {
  grant(resource, ['inventory_personnel'], ['read', 'create', 'update', 'submit'])
}
for (const resource of ['inventory_discrepancies', 'asset_transfers', 'maintenance_requests', 'disposal_requests'] as const) {
  grant(resource, ['property_officer'], ['read', 'create', 'update', 'submit'])
}
for (const resource of ['recognition', 'depreciation', 'cip_costs', 'disposal_review', 'reconciliations'] as const) {
  grant(resource, ['accounting_officer'], ['read', 'create', 'update', 'submit'])
}
for (const resource of ['registration_approvals', 'capitalization_approvals', 'correction_approvals', 'lifecycle_approvals'] as const) {
  grant(resource, ['approving_officer'], ['read', 'approve', 'reject'])
}
grant('reports', ['accounting_officer', 'approving_officer', 'auditor'], ['read', 'export'])
grant('audit_logs', ['administrator', 'auditor'], ['read'])
grant('documents', roleList, ['read'])
grant('documents', ['property_officer', 'accounting_officer', 'inventory_personnel', 'engineering_office', 'budget_office'], ['create'])
grant('notifications', roleList, ['read'])
grant('notifications', roleList.filter((role) => role !== 'auditor'), ['update'])

export const permissionRules: readonly Readonly<PermissionRule>[] = Object.freeze(grants.map((rule) => Object.freeze(rule)))

export type AccessIdentity = Pick<User, 'id' | 'role' | 'municipalityId' | 'status'>
export interface AccessContext { municipalityId: MunicipalityId }

export function hasRolePermission(role: Role, requirement: PermissionRequirement): boolean {
  return isRole(role) && permissionRules.some((rule) => rule.role === role &&
    rule.resource === requirement.resource && rule.action === requirement.action)
}

/** Fail closed: all resources, including administration and dashboard, require local scope.
 * Notifications additionally require recipient ownership in their future service implementation.
 */
export function canAccess(
  user: AccessIdentity | null | undefined,
  requirement: PermissionRequirement,
  context: AccessContext,
): boolean {
  return !!user && user.status === 'active' && !!user.id &&
    (user.municipalityId === 'botolan' || user.municipalityId === 'san_antonio') &&
    user.municipalityId === context.municipalityId && hasRolePermission(user.role, requirement)
}
