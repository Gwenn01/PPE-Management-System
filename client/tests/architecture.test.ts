import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isRole, roleLabels, roleList, roleResponsibilities, staticUsers } from '../src/config/roles.js'
import type { Role } from '../src/config/roles.js'
import { canAccessRoute, getNavGroups, hrefFor, navItems } from '../src/config/navigation.js'
import { actions, canAccess, hasRolePermission, permissionRules, resources } from '../src/domain/permissions.js'
import type { Action, PermissionRequirement } from '../src/domain/permissions.js'
import type { AssetLifecycleStatus, MunicipalityId, WorkflowStatus } from '../src/domain/models.js'
import { municipalityList } from '../src/domain/municipalities.js'
import { createDemoUser } from '../src/mock/demoIdentityRepository.js'

const local = { municipalityId: 'botolan' } as const
const other = { municipalityId: 'san_antonio' } as const

describe('eight-role registry and demo identities', () => {
  it('contains exactly the eight required roles with complete labels and responsibilities', () => {
    assert.deepEqual([...roleList], [
      'administrator', 'property_officer', 'accounting_officer', 'inventory_personnel',
      'approving_officer', 'auditor', 'engineering_office', 'budget_office',
    ])
    assert.equal(new Set(roleList).size, 8)
    for (const role of roleList) {
      assert.ok(roleLabels[role].length > 0)
      assert.ok(roleResponsibilities[role].length > 0)
      assert.ok(staticUsers[role].email.endsWith('@example.com'))
      assert.ok(isRole(role))
    }
    for (const invalid of [null, undefined, '', 'Administrator', 'owner', 0, {}, '__proto__']) {
      assert.equal(isRole(invalid), false)
    }
  })

  it('creates a distinct, scoped demo identity for every role in both municipalities', () => {
    const identities = municipalityList.flatMap((municipality) => roleList.map((role) => createDemoUser(role, municipality.id)))
    assert.equal(new Set(identities.map((user) => user.id)).size, 16)
    for (const user of identities) {
      assert.equal(user.isDemo, true)
      assert.equal(user.status, 'active')
      assert.equal(user.role in roleLabels, true)
      assert.ok(municipalityList.some((municipality) => municipality.id === user.municipalityId))
    }
  })
})

describe('municipality-scoped action permissions', () => {
  it('denies every cross-municipality grant, including administrator management', () => {
    for (const rule of permissionRules) {
      assert.equal(rule.scope, 'municipality')
      for (const municipality of municipalityList) {
        const user = createDemoUser(rule.role, municipality.id)
        assert.equal(canAccess(user, rule, { municipalityId: municipality.id }), true)
        const foreign = municipality.id === 'botolan' ? 'san_antonio' : 'botolan'
        assert.equal(canAccess(user, rule, { municipalityId: foreign }), false)
      }
    }
    const admin = createDemoUser('administrator', 'botolan')
    assert.equal(canAccess(admin, { resource: 'users', action: 'manage' }, other), false)
    assert.equal(canAccess(admin, { resource: 'registration_approvals', action: 'approve' }, local), false)
    assert.equal(canAccess(admin, { resource: 'assets', action: 'read' }, local), false)
  })

  it('does not grant mutating actions to the auditor', () => {
    const auditor = createDemoUser('auditor', 'botolan')
    const mutations: Action[] = ['create', 'update', 'submit', 'approve', 'reject', 'manage']
    for (const resource of resources) for (const action of mutations) {
      assert.equal(canAccess(auditor, { resource, action }, local), false, `${resource}:${action}`)
    }
    assert.equal(canAccess(auditor, { resource: 'reports', action: 'export' }, local), true)
    assert.equal(canAccess(auditor, { resource: 'audit_logs', action: 'read' }, local), true)
  })

  it('separates preparation, submission and approval without implicit action escalation', () => {
    const property = createDemoUser('property_officer', 'botolan')
    const approver = createDemoUser('approving_officer', 'botolan')
    assert.equal(canAccess(property, { resource: 'asset_registrations', action: 'submit' }, local), true)
    assert.equal(canAccess(property, { resource: 'registration_approvals', action: 'approve' }, local), false)
    assert.equal(canAccess(approver, { resource: 'registration_approvals', action: 'approve' }, local), true)
    assert.equal(canAccess(approver, { resource: 'registration_approvals', action: 'reject' }, local), true)
    assert.equal(canAccess(approver, { resource: 'asset_registrations', action: 'create' }, local), false)
    assert.equal(hasRolePermission('engineering_office', { resource: 'engineering_documents', action: 'submit' }), true)
    assert.equal(hasRolePermission('budget_office', { resource: 'budget_documents', action: 'submit' }), true)
    assert.equal(hasRolePermission('engineering_office', { resource: 'budget_documents', action: 'update' }), false)
    assert.equal(hasRolePermission('budget_office', { resource: 'engineering_documents', action: 'submit' }), false)
  })

  it('fails closed for missing/inactive identities, unknown roles, resources, actions and scope', () => {
    const user = createDemoUser('administrator', 'botolan')
    const read: PermissionRequirement = { resource: 'dashboard', action: 'read' }
    assert.equal(canAccess(null, read, local), false)
    assert.equal(canAccess(undefined, read, local), false)
    for (const status of ['disabled', 'pending'] as const) assert.equal(canAccess({ ...user, status }, read, local), false)
    assert.equal(canAccess({ ...user, id: '' }, read, local), false)
    assert.equal(canAccess({ ...user, role: 'owner' as Role }, read, local), false)
    assert.equal(canAccess({ ...user, municipalityId: 'unknown' as MunicipalityId }, read, { municipalityId: 'unknown' as MunicipalityId }), false)
    assert.equal(canAccess(user, { resource: 'dashboard', action: 'delete' as Action }, local), false)
    assert.equal(canAccess(user, { resource: 'unknown', action: 'read' } as unknown as PermissionRequirement, local), false)
  })

  it('has unique explicit immutable grants using supported resources and actions', () => {
    assert.equal(new Set(permissionRules.map((rule) => `${rule.role}:${rule.resource}:${rule.action}`)).size, permissionRules.length)
    assert.ok(Object.isFrozen(permissionRules))
    for (const rule of permissionRules) {
      assert.ok(Object.isFrozen(rule))
      assert.ok(resources.includes(rule.resource))
      assert.ok(actions.includes(rule.action))
    }
  })
})

describe('route metadata, sidebar and guard rules', () => {
  const expected: Record<Role, string[]> = {
    administrator: ['', 'users', 'account-requests', 'departments', 'permissions', 'settings', 'audit-trail'],
    property_officer: ['', 'assets', 'asset-registration', 'construction-projects', 'discrepancies', 'transfers', 'maintenance', 'disposal'],
    accounting_officer: ['', 'assets', 'accounting-documents', 'recognition', 'depreciation', 'cip-costs', 'disposal-review', 'reconciliation', 'reports'],
    inventory_personnel: ['', 'assets', 'physical-inventory', 'asset-monitoring'],
    approving_officer: ['', 'approvals', 'approvals/returned', 'approvals/history', 'approvals/registrations', 'approvals/capitalization', 'approvals/corrections', 'approvals/lifecycle', 'reports'],
    auditor: ['', 'assets', 'reports', 'audit-trail'],
    engineering_office: ['', 'construction-projects', 'engineering'],
    budget_office: ['', 'construction-projects', 'budget'],
  }

  for (const role of roleList) it(`enforces the exact route allowlist for ${role}`, () => {
    for (const municipality of municipalityList) {
      const user = createDemoUser(role, municipality.id)
      const context = { municipalityId: municipality.id }
      const visible = getNavGroups(user).flatMap((group) => group.items.map((item) => item.path))
      assert.deepEqual(visible, expected[role])
      for (const item of navItems) {
        assert.equal(canAccessRoute(user, item, context), expected[role].includes(item.path))
        const foreign = municipality.id === 'botolan' ? other : local
        assert.equal(canAccessRoute(user, item, foreign), false)
      }
    }
  })

  it('has unique routes and no unreachable module for any role', () => {
    assert.equal(new Set(navItems.map((item) => item.path)).size, navItems.length)
    for (const item of navItems) {
      assert.ok(roleList.some((role) => canAccessRoute(createDemoUser(role, 'botolan'), item, local)))
      assert.equal(hrefFor(item), item.path ? `/dashboard/${item.path}` : '/dashboard')
      assert.equal(item.permission.action, 'read')
      assert.ok(item.label && item.description && item.group)
    }
  })

  it('hides all navigation for inactive identities and mismatched municipality contexts', () => {
    const user = createDemoUser('administrator', 'botolan')
    assert.deepEqual(getNavGroups(user, other), [])
    assert.deepEqual(getNavGroups({ ...user, status: 'disabled' }), [])
    for (const item of navItems) assert.equal(canAccessRoute(null, item, local), false)
  })
})

// Compile-time contract checks: approval and operational statuses cannot be interchanged.
const workflow: WorkflowStatus = 'approved'
const lifecycle: AssetLifecycleStatus = 'in_service'
// @ts-expect-error Approval status is not an operational asset state.
const invalidLifecycle: AssetLifecycleStatus = workflow
// @ts-expect-error Operational asset state is not an approval status.
const invalidWorkflow: WorkflowStatus = lifecycle
void invalidLifecycle
void invalidWorkflow
