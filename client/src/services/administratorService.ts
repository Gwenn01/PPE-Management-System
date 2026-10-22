import { z } from 'zod'
import type { Role } from '../config/roles.js'
import { roleList } from '../config/roles.js'
import type { AssetCategory, Department, DepreciationPolicy, User, DemoSetting } from '../domain/models.js'
import { hasRolePermission, isLockedGrant, permissionRules } from '../domain/permissions.js'
import type { Action, Resource } from '../domain/permissions.js'
import { database as defaultDatabase } from '../mock/database.js'
import type { MockDatabase } from '../mock/database.js'
import { authorize, commitMutation, writeAudit } from '../mock/unitOfWork.js'
import { parseEntity, usernameSchema } from '../mock/validation/schemas.js'
import type { RequestContext } from './contracts.js'
import { DataError, respond } from './errors.js'

const text = z.string().trim().min(1).max(160)
const email = z.email().transform((value) => value.toLowerCase())
const fields = z.strictObject({ name: text, username: usernameSchema, email, role: z.enum(roleList), departmentId: z.string().min(1) })
const departmentFields = z.strictObject({ code: z.string().trim().min(2).max(40), name: text })
const categoryFields = z.strictObject({ code: z.string().trim().min(2).max(40), name: text, usefulLifeMonths: z.number().int().min(1).max(1200) })
const policyFields = z.strictObject({ name: text, method: z.literal('straight_line'), usefulLifeMonths: z.number().int().min(1).max(1200), residualValuePercent: z.number().min(0).max(100), recognitionThreshold: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), startConvention: z.enum(['acquisition_month', 'following_month']), effectiveFrom: z.iso.date(), active: z.boolean() })
const checked = (version: number, current: number) => { if (!Number.isInteger(version) || version < 1 || version !== current) throw new DataError('conflict', 'This record changed. Refresh and try again.') }

export type UserDraft = z.infer<typeof fields>
export type DepartmentDraft = z.infer<typeof departmentFields>
export type CategoryDraft = z.infer<typeof categoryFields>
export type PolicyDraft = z.infer<typeof policyFields>

export function createAdministratorService(db: MockDatabase = defaultDatabase) {
  const scoped = async <K extends 'users' | 'departments' | 'assets' | 'assetCategories' | 'permissions' | 'settings' | 'depreciationPolicies' | 'auditLogs'>(name: K, municipalityId: User['municipalityId']) =>
    db.entity(name).where('municipalityId').equals(municipalityId).toArray()
  async function department(id: string, municipalityId: User['municipalityId']) {
    const row = await db.entity('departments').get(id)
    if (!row || row.municipalityId !== municipalityId || !row.active) throw new DataError('validation', 'Choose an active department in your municipality.')
    return row
  }
  async function localUser(id: string, municipalityId: User['municipalityId']) {
    const row = await db.entity('users').get(id)
    if (!row || row.municipalityId !== municipalityId) throw new DataError('not_found', 'User unavailable in your municipality.')
    return row
  }
  async function identityUnique(municipalityId: User['municipalityId'], input: Pick<UserDraft, 'email' | 'username'>, exclude?: string) {
    const users = await scoped('users', municipalityId)
    if (users.some((row) => row.id !== exclude && row.username.toLowerCase() === input.username.toLowerCase())) throw new DataError('duplicate', 'This username is already assigned in the municipality.')
    if (users.some((row) => row.id !== exclude && row.email.toLowerCase() === input.email.toLowerCase())) throw new DataError('duplicate', 'This email is already assigned in the municipality.')
  }
  async function preserveAdmin(user: User, nextRole: Role, nextStatus: User['status']) {
    if (user.role !== 'administrator' || user.status !== 'active' || (nextRole === 'administrator' && nextStatus === 'active')) return
    const others = await scoped('users', user.municipalityId)
    if (!others.some((entry) => entry.id !== user.id && entry.role === 'administrator' && entry.status === 'active')) throw new DataError('validation', 'At least one active Administrator must remain in the municipality.')
  }
  async function departmentDependencies(id: string, municipalityId: User['municipalityId']) {
    const snapshot = await db.snapshot()
    const local = <T extends { municipalityId: User['municipalityId'] }>(list: T[]) => list.filter((row) => row.municipalityId === municipalityId)
    const users = local(snapshot.users).filter((row) => row.departmentId === id && row.status !== 'disabled').length
    const assets = local(snapshot.assets).filter((row) => row.departmentId === id).length
    const registrations = local(snapshot.registrations).filter((row) => row.departmentId === id && !['cancelled', 'rejected'].includes(row.workflowStatus)).length
    const projects = local(snapshot.projects).filter((row) => row.departmentId === id && !['cancelled', 'capitalized'].includes(row.projectStatus)).length
    const sessions = local(snapshot.inventorySessions).filter((row) => row.departmentId === id && !['completed', 'cancelled'].includes(row.sessionStatus)).length
    const transfers = local(snapshot.transfers).filter((row) => (row.fromDepartmentId === id || row.toDepartmentId === id) && !['approved', 'rejected', 'cancelled'].includes(row.workflowStatus)).length
    return { users, assets, registrations, projects, sessions, transfers }
  }
  return {
    getOverview: (ctx: RequestContext) => respond(() => db.transaction('r', db.tables, async () => {
      await authorize(db, ctx, 'users', 'read')
      await authorize(db, ctx, 'departments', 'read')
      await authorize(db, ctx, 'permissions', 'read')
      await authorize(db, ctx, 'settings', 'read')
      await authorize(db, ctx, 'audit_logs', 'read')
      const [users, departments, assets, assetCategories, permissions, settings, depreciationPolicies, auditLogs] = await Promise.all([
        scoped('users', ctx.municipalityId), scoped('departments', ctx.municipalityId), scoped('assets', ctx.municipalityId), scoped('assetCategories', ctx.municipalityId), scoped('permissions', ctx.municipalityId), scoped('settings', ctx.municipalityId), scoped('depreciationPolicies', ctx.municipalityId), scoped('auditLogs', ctx.municipalityId),
      ])
      return { users, departments, assets, assetCategories, permissions, settings, depreciationPolicies, auditLogs: auditLogs.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)) }
    })),
    createUser: (ctx: RequestContext, input: UserDraft) => respond(() => commitMutation(db, async (tx) => {
      const actor = await authorize(db, ctx, 'users', 'create')
      const draft = fields.parse(input)
      await department(draft.departmentId, ctx.municipalityId)
      await identityUnique(ctx.municipalityId, draft)
      const now = new Date().toISOString()
      const row = parseEntity('users', { ...draft, id: crypto.randomUUID(), municipalityId: ctx.municipalityId, version: 1, createdAt: now, updatedAt: now, status: 'active', isDemo: true })
      await db.entity('users').add(row)
      await writeAudit(db, actor, tx, 'users', null, row, 'provision_account', 'Administrator provisioned a mock account; public demo password applies.')
      return row
    })),
    updateUser: (ctx: RequestContext, id: string, version: number, input: UserDraft) => respond(() => commitMutation(db, async (tx) => {
      const actor = await authorize(db, ctx, 'users', 'update')
      const old = await localUser(id, ctx.municipalityId)
      checked(version, old.version)
      if (old.status === 'pending') throw new DataError('invalid_transition', 'Pending requests must be reviewed, not edited as active accounts.')
      const draft = fields.parse(input)
      await department(draft.departmentId, ctx.municipalityId)
      await identityUnique(ctx.municipalityId, draft, old.id)
      await preserveAdmin(old, draft.role, old.status)
      const row = parseEntity('users', { ...old, ...draft, version: old.version + 1, updatedAt: new Date().toISOString() })
      await db.entity('users').put(row)
      // Identity/scope/grants can change: invalidate all of this user's sessions.
      await db.sessions.where('userId').equals(id).delete()
      await writeAudit(db, actor, tx, 'users', old, row, 'edit_account', 'Administrative user update.')
      return row
    })),
    setUserStatus: (ctx: RequestContext, id: string, version: number, enabled: boolean) => respond(() => commitMutation(db, async (tx) => {
      const actor = await authorize(db, ctx, 'users', 'manage')
      const old = await localUser(id, ctx.municipalityId)
      checked(version, old.version)
      if (old.status === 'pending') throw new DataError('invalid_transition', 'Pending accounts need an approval or rejection decision.')
      if (old.status === (enabled ? 'active' : 'disabled')) throw new DataError('invalid_transition', 'Account already has that state.')
      await preserveAdmin(old, old.role, enabled ? 'active' : 'disabled')
      if (enabled && (await db.entity('auditLogs').where('municipalityId').equals(ctx.municipalityId).filter((event) => event.entityId === id && event.action === 'reject_account').count()) > 0) throw new DataError('invalid_transition', 'A rejected registration cannot be reactivated; register or provision a new approved account.')
      if (enabled) { if (!old.departmentId) throw new DataError('validation', 'Assign an active department first.'); await department(old.departmentId, ctx.municipalityId) }
      const row = parseEntity('users', { ...old, status: enabled ? 'active' : 'disabled', version: old.version + 1, updatedAt: new Date().toISOString() })
      await db.entity('users').put(row)
      await db.sessions.where('userId').equals(id).delete()
      await writeAudit(db, actor, tx, 'users', old, row, enabled ? 'activate_account' : 'deactivate_account')
      return row
    })),
    createDepartment: (ctx: RequestContext, input: DepartmentDraft) => respond(() => commitMutation(db, async (tx) => {
      const actor = await authorize(db, ctx, 'departments', 'create')
      const draft = departmentFields.parse(input)
      const now = new Date().toISOString()
      const row = parseEntity('departments', { ...draft, id: crypto.randomUUID(), municipalityId: ctx.municipalityId, version: 1, createdAt: now, updatedAt: now, active: true })
      await db.entity('departments').add(row)
      await writeAudit(db, actor, tx, 'departments', null, row, 'create_department')
      return row
    })),
    updateDepartment: (ctx: RequestContext, id: string, version: number, input: DepartmentDraft) => respond(() => commitMutation(db, async (tx) => {
      const actor = await authorize(db, ctx, 'departments', 'update')
      const old = await db.entity('departments').get(id)
      if (!old || old.municipalityId !== ctx.municipalityId) throw new DataError('not_found', 'Local department not found.')
      checked(version, old.version)
      const draft = departmentFields.parse(input)
      const row = parseEntity('departments', { ...old, ...draft, version: old.version + 1, updatedAt: new Date().toISOString() })
      await db.entity('departments').put(row)
      await writeAudit(db, actor, tx, 'departments', old, row, 'edit_department')
      return row
    })),
    setDepartmentActive: (ctx: RequestContext, id: string, version: number, active: boolean) => respond(() => commitMutation(db, async (tx) => {
      const actor = await authorize(db, ctx, 'departments', 'manage')
      const old = await db.entity('departments').get(id)
      if (!old || old.municipalityId !== ctx.municipalityId) throw new DataError('not_found', 'Local department not found.')
      checked(version, old.version)
      if (old.active === active) throw new DataError('invalid_transition', 'No status change requested.')
      if (!active) {
        const dependencies = await departmentDependencies(id, ctx.municipalityId)
        if (Object.values(dependencies).some(Boolean)) throw new DataError('validation', 'Cannot deactivate department with dependent users, assets, requests, projects or inventory assignments.')
      }
      const row = parseEntity('departments', { ...old, active, version: old.version + 1, updatedAt: new Date().toISOString() })
      await db.entity('departments').put(row)
      await writeAudit(db, actor, tx, 'departments', old, row, active ? 'activate_department' : 'deactivate_department')
      return row
    })),
    setPermission: (ctx: RequestContext, role: Role, resource: Resource, action: Action, enabled: boolean) => respond(() => commitMutation(db, async (tx) => {
      const actor = await authorize(db, ctx, 'permissions', 'manage')
      const valid = permissionRules.find((rule) => rule.role === role && rule.resource === resource && rule.action === action)
      if (!valid || !hasRolePermission(role, { resource, action })) throw new DataError('forbidden', 'Grant is not available in the approved demo policy.')
      if (isLockedGrant(valid)) throw new DataError('forbidden', 'Core access and municipality protections cannot be changed.')
      const old = (await scoped('permissions', ctx.municipalityId)).find((item) => item.role === role && item.resource === resource && item.action === action)
      if (enabled === !!old) throw new DataError('invalid_transition', 'That grant is already in the requested state.')
      const now = new Date().toISOString()
      const change = old ?? parseEntity('permissions', { id: crypto.randomUUID(), municipalityId: ctx.municipalityId, version: 1, createdAt: now, updatedAt: now, role, resource, action, scope: 'municipality' })
      if (old) await db.entity('permissions').delete(old.id)
      else await db.entity('permissions').add(change)
      const affected = await scoped('users', ctx.municipalityId)
      for (const target of affected.filter((user) => user.role === role)) await db.sessions.where('userId').equals(target.id).delete()
      await writeAudit(db, actor, tx, 'permissions', enabled ? null : change, enabled ? change : null, enabled ? 'grant_permission' : 'revoke_permission', `Approved allowlist only; ${role} / ${resource} / ${action}.`)
      return { role, resource, action, enabled }
    })),
    updateSetting: (ctx: RequestContext, id: string, version: number, value: DemoSetting['value']) => respond(() => commitMutation(db, async (tx) => {
      const actor = await authorize(db, ctx, 'settings', 'manage')
      const old = await db.entity('settings').get(id)
      if (!old || old.municipalityId !== ctx.municipalityId) throw new DataError('not_found', 'Local setting not found.')
      checked(version, old.version)
      const validated = old.key === 'fiscal_year' ? z.number().int().min(1900).max(2200).parse(value) : z.string().trim().min(1).max(1000).parse(value)
      const row = parseEntity('settings', { ...old, value: validated, version: old.version + 1, updatedAt: new Date().toISOString() })
      await db.entity('settings').put(row)
      await writeAudit(db, actor, tx, 'settings', old, row, 'change_demo_setting')
      return row
    })),
    saveCategory: (ctx: RequestContext, id: string | null, version: number, input: CategoryDraft) => respond(() => commitMutation(db, async (tx) => {
      const actor = await authorize(db, ctx, 'asset_categories', id ? 'update' : 'create')
      const draft = categoryFields.parse(input)
      const old = id ? await db.entity('assetCategories').get(id) : null
      if (id && (!old || old.municipalityId !== ctx.municipalityId)) throw new DataError('not_found', 'Local category not found.')
      if (old) checked(version, old.version)
      const now = new Date().toISOString()
      const row: AssetCategory = parseEntity('assetCategories', { ...(old ?? { id: crypto.randomUUID(), municipalityId: ctx.municipalityId, createdAt: now }), ...draft, version: old ? old.version + 1 : 1, updatedAt: now })
      await db.entity('assetCategories').put(row)
      await writeAudit(db, actor, tx, 'assetCategories', old, row, old ? 'edit_demo_category' : 'create_demo_category')
      return row
    })),
    savePolicy: (ctx: RequestContext, id: string, version: number, input: PolicyDraft) => respond(() => commitMutation(db, async (tx) => {
      const actor = await authorize(db, ctx, 'settings', 'manage')
      const old = await db.entity('depreciationPolicies').get(id)
      if (!old || old.municipalityId !== ctx.municipalityId) throw new DataError('not_found', 'Local accounting policy not found.')
      checked(version, old.version)
      const draft = policyFields.parse(input)
      const row: DepreciationPolicy = parseEntity('depreciationPolicies', { ...old, ...draft, version: old.version + 1, updatedAt: new Date().toISOString(), isDemo: true })
      await db.entity('depreciationPolicies').put(row)
      await writeAudit(db, actor, tx, 'depreciationPolicies', old, row, 'revise_demo_accounting_policy', 'Policy version advanced; posted accounting entries remain unchanged.')
      return row
    })),
    getDepartmentDependencies: (ctx: RequestContext, id: string) => respond(() => db.transaction('r', db.tables, async () => {
      await authorize(db, ctx, 'departments', 'read')
      const target = await db.entity('departments').get(id)
      if (!target || target.municipalityId !== ctx.municipalityId) throw new DataError('not_found', 'Local department not found.')
      return departmentDependencies(id, ctx.municipalityId)
    })),
  }
}

export type AdministratorService = ReturnType<typeof createAdministratorService>
export const administratorService = createAdministratorService()
export type AdministratorOverview = Extract<Awaited<ReturnType<AdministratorService['getOverview']>>, { ok: true }>['data']
export type { Department, User }
