import { hasRolePermission } from '../domain/permissions.js'
import type { AssetRegistration } from '../domain/models.js'
import { parseRegistrationRules, type RegistrationDocumentRules } from '../domain/registration.js'
import type { MockDatabase } from '../mock/database.js'
import { database as defaultDatabase } from '../mock/database.js'
import { authorize, commitMutation, writeAudit } from '../mock/unitOfWork.js'
import { parseEntity } from '../mock/validation/schemas.js'
import type { RequestContext } from './contracts.js'
import { respond } from './errors.js'
import { getRegistrationRules } from './registrationValidation.js'
import { createEntityServices } from './entityService.js'

export function createRegistrationService(db: MockDatabase = defaultDatabase) {
  const entities = createEntityServices(db)
  return {
    overview: (ctx: RequestContext) => respond(() => db.transaction('r', db.tables, async () => {
      await authorize(db, ctx, 'reference_data', 'read')
      await authorize(db, ctx, 'asset_categories', 'read')
      const scope = ctx.municipalityId
      const local = async <K extends 'assets' | 'registrations' | 'departments' | 'users' | 'assetCategories' | 'documents' | 'approvals'>(name: K) => db.entity(name).where('municipalityId').equals(scope).toArray()
      const grants = await db.entity('permissions').where('[municipalityId+role]').equals([scope, ctx.actor.role]).toArray()
      const allowed = (resource: 'assets' | 'asset_registrations' | 'documents', action: 'read' | 'create' | 'update' | 'submit') =>
        hasRolePermission(ctx.actor.role, { resource, action }) && grants.some((grant) => grant.resource === resource && grant.action === action)
      const readAssets = allowed('assets', 'read')
      const readRequests = allowed('asset_registrations', 'read')
      if (readAssets) await authorize(db, ctx, 'assets', 'read')
      else if (readRequests) await authorize(db, ctx, 'asset_registrations', 'read')
      else await authorize(db, ctx, 'assets', 'read') // Deliberately fails closed.
      const [assets, departments, users, categories, rules] = await Promise.all([
        readAssets ? local('assets') : Promise.resolve([]), local('departments'), local('users'), local('assetCategories'), getRegistrationRules(db, scope),
      ])
      const [registrations, documents, approvals] = readRequests ? await Promise.all([
        local('registrations'), allowed('documents', 'read') ? local('documents') : Promise.resolve([]), local('approvals'),
      ]) : [[], [], []] as const
      // Property officers see their municipality's requests; other authorized asset readers see only the registry.
      // The accounting ledger is intentionally not exported through this read projection.
      return { capabilities: { readAssets, readRequests, create: readRequests && allowed('asset_registrations', 'create'), update: readRequests && allowed('asset_registrations', 'update'), submit: readRequests && allowed('asset_registrations', 'submit'), documents: readRequests && allowed('documents', 'read') && allowed('documents', 'create') }, assets, registrations, departments, users: users.map((u) => ({ id: u.id, name: u.name, departmentId: u.departmentId, status: u.status })), categories, documents: documents.filter((d) => d.entityType === 'registration' && registrations.some((r) => r.id === d.entityId)), approvals: approvals.filter((a) => a.subjectType === 'registration'), rules }
    })),
    create: (ctx: RequestContext, input: Parameters<typeof entities.registrations.create>[1]) => entities.registrations.create(ctx, input),
    update: (ctx: RequestContext, id: string, version: number, input: Parameters<typeof entities.registrations.update>[3]) => entities.registrations.update(ctx, id, version, input),
    submit: (ctx: RequestContext, id: string, version: number) => entities.registrations.submit(ctx, id, version),
    saveDocumentRules: (ctx: RequestContext, rules: RegistrationDocumentRules) => respond(() => commitMutation(db, async (transactionId) => {
      const actor = await authorize(db, ctx, 'settings', 'manage')
      const validated = parseRegistrationRules(rules)
      const old = await db.entity('settings').where('[municipalityId+key]').equals([ctx.municipalityId, 'registration_document_rules']).first()
      const at = new Date().toISOString()
      const row = parseEntity('settings', { ...(old ?? { id: crypto.randomUUID(), municipalityId: ctx.municipalityId, createdAt: at }), key: 'registration_document_rules', value: JSON.stringify(validated), version: old ? old.version + 1 : 1, updatedAt: at, isDemo: true })
      await db.entity('settings').put(row)
      await writeAudit(db, actor, transactionId, 'settings', old ?? null, row, 'update_registration_document_rules', 'Municipality-specific demo registration requirements. Existing submitted requests are not retroactively invalidated.')
      return row
    })),
  }
}
export type RegistrationService = ReturnType<typeof createRegistrationService>
export type RegistrationOverview = Extract<Awaited<ReturnType<RegistrationService['overview']>>, { ok: true }>['data']
export const registrationService = createRegistrationService()
export type RegistrationDraft = Pick<AssetRegistration, 'description' | 'proposedPropertyNumber' | 'category' | 'departmentId' | 'custodianId' | 'location' | 'acquisitionDate' | 'acquisitionCost' | 'acquisitionMethod'>
