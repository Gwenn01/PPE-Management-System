import { validateRegistrationFields, validateRegistrationSubmission } from './registrationValidation.js'
import { z } from 'zod'
import type { EntityMap, EntityName } from '../domain/data.js'
import type { ApprovalSubject, AssetRegistration, ScopedEntity, User, WorkflowEntity, WorkflowStatus } from '../domain/models.js'
import type { MockDatabase } from '../mock/database.js'
import { entityRepository } from '../mock/repositories/entityRepository.js'
import { commitMutation, writeAudit } from '../mock/unitOfWork.js'
import { entityNames, entitySchemas, parseEntity, workflowStatusSchema } from '../mock/validation/schemas.js'
import type { RequestContext } from './contracts.js'
import type { CreateInput, EntityQuery, EntityService, EntityServices, MutationCommand, WritableEntity, WorkflowEntityName } from './dataContracts.js'
import { protectedFields, writableEntities, workflowEntities } from './dataContracts.js'
import { authorizeEntity, scopedRecord, visibleRecord } from './entityAccess.js'
import { authorize } from '../mock/unitOfWork.js'
import { DataError, respond } from './errors.js'

const positiveVersion = z.number().int().positive()
const recordId = z.string().min(1).max(160)
const approvalSubjects: Partial<Record<WorkflowEntityName, ApprovalSubject>> = { projects: 'capitalization', registrations: 'registration', discrepancies: 'correction', transfers: 'transfer', maintenance: 'maintenance', disposals: 'disposal', reconciliations: 'reconciliation' }
const workflowSet: ReadonlySet<string> = new Set(workflowEntities)
const writableSet: ReadonlySet<string> = new Set(writableEntities)

function inputFields(input: unknown): Record<string, unknown> {
  const fields = z.record(z.string(), z.unknown()).parse(input)
  if (!Object.keys(fields).length || Object.keys(fields).some((key) => (protectedFields as readonly string[]).includes(key))) throw new DataError('validation', 'Supply editable fields only; IDs, scope, versions and workflow metadata are service-managed.')
  return fields
}

function defaults(name: WritableEntity, actor: User): Record<string, unknown> {
  const map: Partial<Record<WritableEntity, Record<string, unknown>>> = {
    users: { status: 'pending', isDemo: true }, registrations: { recognizedAssetId: null },
    projects: { projectStatus: 'planned', capitalizedAssetId: null }, documentRouting: { fromRole: actor.role },
    cipCosts: { accountingRecordId: null }, inventorySessions: { sessionStatus: 'planned' }, discrepancies: { resolvedAt: null },
    inventoryChecks: { checkedById: actor.id, checkedAt: new Date().toISOString() },
    maintenance: { completedAt: null }, disposals: { disposedAt: null, accountingRecordId: null },
    depreciationPolicies: { isDemo: true }, settings: { isDemo: true },
  }
  return { ...map[name], ...(workflowSet.has(name) ? { workflowStatus: 'draft', requestedById: actor.id, submittedAt: null, documentIds: [] } : {}) }
}

function checkVersion(record: ScopedEntity, expectedVersion: number) {
  positiveVersion.parse(expectedVersion)
  if (record.version !== expectedVersion) throw new DataError('conflict', 'The record changed. Reload before trying again.')
}

function editableWorkflow(record: EntityMap[WritableEntity], actor: User, name: WritableEntity) {
  if ('workflowStatus' in record) {
    if (!['draft', 'returned'].includes(record.workflowStatus)) throw new DataError('invalid_transition', 'Only draft or returned requests can be edited.')
    if (record.requestedById !== actor.id && !(name === 'documentRouting' && 'toRole' in record && record.toRole === actor.role)) throw new DataError('forbidden', 'Only the requester or assigned routing office can edit this draft.')
  }
}

export async function applyCreate<K extends WritableEntity>(database: MockDatabase, context: RequestContext, name: K, input: CreateInput<K>, transactionId: string): Promise<EntityMap[K]> {
  if (['inventorySessions', 'inventoryChecks', 'discrepancies', 'transfers', 'maintenance', 'disposals', 'reconciliations'].includes(name)) throw new DataError('forbidden', 'Use the controlled Inventory or Lifecycle Management workflow to preserve authorization and history.')
  if (name === 'cipCosts' && ('accounting' in input || 'projectId' in input && (await database.entity('projects').get(String(input.projectId)))?.construction)) throw new DataError('forbidden', 'Record tracked construction costs through CIP Accounting.')
  if (name === 'projects') throw new DataError('forbidden', 'Register projects through the construction workflow.')
  if (name === 'documentRouting' && 'projectId' in input && (await database.entity('projects').get(String(input.projectId)))?.construction) throw new DataError('forbidden', 'Forward documents through Engineering processing.')
  if (!writableSet.has(name)) throw new DataError('forbidden', 'This entity is not directly creatable.')
  const actor = await authorizeEntity(database, context, name, 'create')
  const at = new Date().toISOString()
  const record = parseEntity(name, { ...inputFields(input), ...defaults(name, actor), id: crypto.randomUUID(), municipalityId: context.municipalityId, version: 1, createdAt: at, updatedAt: at })
  if (name === 'registrations') await validateRegistrationFields(database, actor, record as EntityMap['registrations'])
  await entityRepository(database, name).create(record)
  await writeAudit(database, actor, transactionId, name, null, record, 'create')
  return record
}

export async function applyUpdate<K extends WritableEntity>(database: MockDatabase, context: RequestContext, name: K, id: string, version: number, changes: Partial<CreateInput<K>>, transactionId: string): Promise<EntityMap[K]> {
  if (['inventorySessions', 'inventoryChecks', 'discrepancies', 'transfers', 'maintenance', 'disposals', 'reconciliations'].includes(name)) throw new DataError('forbidden', 'Use the controlled Inventory or Lifecycle Management workflow for changes.')
  if (!writableSet.has(name)) throw new DataError('forbidden', 'This entity is not directly editable.')
  const actor = await authorizeEntity(database, context, name, 'update')
  const old = await scopedRecord(database, actor, name, recordId.parse(id))
  if (name === 'cipCosts' && ((old as EntityMap['cipCosts']).accounting || 'accounting' in changes || 'projectId' in changes && (await database.entity('projects').get(String(changes.projectId)))?.construction)) throw new DataError('forbidden', 'Use CIP Accounting to review tracked expenditures.')
  if (name === 'documentRouting' && 'projectId' in changes && (await database.entity('projects').get(String(changes.projectId)))?.construction) throw new DataError('forbidden', 'Use the construction forwarding workflow for tracked projects.')
  if ((name === 'projects' && (old as EntityMap['projects']).construction) || (name === 'projects' && 'construction' in changes) || (name === 'documentRouting' && (await database.entity('projects').get((old as EntityMap['documentRouting']).projectId))?.construction)) throw new DataError('forbidden', 'Use the construction workflow for project changes.')
  checkVersion(old, version)
  editableWorkflow(old, actor, name)
  const record = parseEntity(name, { ...old, ...inputFields(changes), version: old.version + 1, updatedAt: new Date().toISOString() })
  if (name === 'users') {
    const candidate = record as EntityMap['users']
    const previous = old as EntityMap['users']
    if (candidate.role !== previous.role && previous.role === 'administrator' && previous.status === 'active') {
      const other = await database.entity('users').where('municipalityId').equals(previous.municipalityId).filter((user) => user.id !== previous.id && user.role === 'administrator' && user.status === 'active').count()
      if (!other) throw new DataError('validation', 'Keep at least one active local Administrator.')
    }
    if (candidate.departmentId) {
      const dep = await database.entity('departments').get(candidate.departmentId)
      if (!dep?.active || dep.municipalityId !== candidate.municipalityId) throw new DataError('validation', 'Choose an active department in the same municipality.')
    }
  }
  if (name === 'departments' && (old as EntityMap['departments']).active && !(record as EntityMap['departments']).active) {
    const dependents = await database.entity('users').where('municipalityId').equals(context.municipalityId).filter((user) => user.departmentId === id && user.status !== 'disabled').count()
    const assets = await database.entity('assets').where('municipalityId').equals(context.municipalityId).filter((asset) => asset.departmentId === id).count()
    const registrations = await database.entity('registrations').where('municipalityId').equals(context.municipalityId).filter((record) => record.departmentId === id && !['cancelled', 'rejected'].includes(record.workflowStatus)).count()
    const projects = await database.entity('projects').where('municipalityId').equals(context.municipalityId).filter((record) => record.departmentId === id && !['cancelled', 'capitalized'].includes(record.projectStatus)).count()
    const sessions = await database.entity('inventorySessions').where('municipalityId').equals(context.municipalityId).filter((record) => record.departmentId === id && !['completed', 'cancelled'].includes(record.sessionStatus)).count()
    const transfers = await database.entity('transfers').where('municipalityId').equals(context.municipalityId).filter((record) => (record.fromDepartmentId === id || record.toDepartmentId === id) && !['approved', 'rejected', 'cancelled'].includes(record.workflowStatus)).count()
    if (dependents || assets || registrations || projects || sessions || transfers) throw new DataError('validation', 'Department still has dependent users, assets or unfinished business records.')
  }
  if (name === 'registrations') await validateRegistrationFields(database, actor, record as EntityMap['registrations'])
  await entityRepository(database, name).update(record)
  if (name === 'users' && 'role' in old && 'role' in record && old.role !== record.role) await database.sessions.where('userId').equals(record.id).delete()
  await writeAudit(database, actor, transactionId, name, old, record, 'update')
  return record
}

async function synchronizeApproval(database: MockDatabase, actor: User, name: WorkflowEntityName, before: WorkflowEntity, after: WorkflowEntity, reason: string, transactionId: string) {
  const subjectType = approvalSubjects[name]
  if (!subjectType) return
  const old = await database.entity('approvals').where('subjectId').equals(after.id).first()
  const at = new Date().toISOString()
  // A historical submission snapshot is immutable even when a returned draft replaces its documents.
  const documentsAtSubmission = after.workflowStatus === 'submitted' ? (await Promise.all(after.documentIds.map((id) => database.entity('documents').get(id)))).filter((doc) => !!doc) : []
  const event = { actorId: actor.id, actorRole: actor.role, action: after.workflowStatus === 'submitted' ? 'submit' as const : 'cancel' as const, fromStatus: before.workflowStatus, toStatus: after.workflowStatus, reason, occurredAt: at, ...(after.workflowStatus === 'submitted' ? { submission: { subjectVersion: after.version, documentIds: [...after.documentIds], payload: JSON.stringify({ request: after, documents: documentsAtSubmission }) } } : {}) }
  const row = parseEntity('approvals', {
    ...(old ?? { id: crypto.randomUUID(), municipalityId: actor.municipalityId, version: 0, createdAt: at, requestedById: after.requestedById, subjectType, subjectId: after.id, assignedRole: 'approving_officer', history: [] }),
    version: (old?.version ?? 0) + 1, updatedAt: at, workflowStatus: after.workflowStatus, submittedAt: after.submittedAt, documentIds: after.documentIds,
    history: [...(old?.history ?? []), event], decidedAt: null,
  })
  await database.entity('approvals').put(row)
  await writeAudit(database, actor, transactionId, 'approvals', old ?? null, row, event.action, reason)
  if (after.workflowStatus === 'submitted') {
    const recipients = await database.entity('users').where('municipalityId').equals(actor.municipalityId).filter((user) => user.role === 'approving_officer' && user.status === 'active').toArray()
    for (const recipient of recipients) {
      const notification = parseEntity('notifications', { id: crypto.randomUUID(), municipalityId: actor.municipalityId, version: 1, createdAt: at, updatedAt: at, recipientId: recipient.id, title: 'Demo approval requested', message: `A ${subjectType} request is ready for review.`, severity: 'info', href: '/dashboard', readAt: null })
      await database.entity('notifications').add(notification)
      await writeAudit(database, actor, transactionId, 'notifications', null, notification, 'create')
    }
  }
}

async function applyWorkflow<K extends WorkflowEntityName>(database: MockDatabase, context: RequestContext, name: K, id: string, version: number, next: WorkflowStatus, reason: string, transactionId: string): Promise<EntityMap[K]> {
  if (['inventorySessions', 'discrepancies', 'transfers', 'maintenance', 'disposals', 'reconciliations'].includes(name)) throw new DataError('forbidden', 'Submit through the controlled Inventory or Lifecycle Management workflow.')
  if (name === 'cipCosts' && (await database.entity('cipCosts').get(id))?.accounting) throw new DataError('forbidden', 'Tracked CIP costs require qualifying-cost review.')
  if (name === 'projects' && (await database.entity('projects').get(id))?.construction) throw new DataError('forbidden', 'Construction processing does not submit capitalization approvals.')
  if (name === 'documentRouting') {
    const route = await database.entity('documentRouting').get(id)
    if (route && (await database.entity('projects').get(route.projectId))?.construction) throw new DataError('forbidden', 'Use the construction forwarding workflow.')
  }
  workflowStatusSchema.parse(next)
  if (!['submitted', 'cancelled'].includes(next)) throw new DataError('invalid_transition', 'Use the approval service for review decisions; lifecycle execution belongs to its workflow phase.')
  if (next === 'cancelled' && !reason.trim()) throw new DataError('validation', 'Cancellation requires a reason.')
  const actor = await authorizeEntity(database, context, name, next === 'submitted' ? 'submit' : 'update')
  const old = await scopedRecord(database, actor, name, recordId.parse(id))
  checkVersion(old, version)
  if (old.requestedById !== actor.id && !(name === 'documentRouting' && 'toRole' in old && old.toRole === actor.role)) throw new DataError('forbidden', 'Only the requester or assigned routing office can submit this request.')
  const allowed = next === 'submitted' ? ['draft', 'returned'] : ['draft', 'returned', 'submitted']
  if (!allowed.includes(old.workflowStatus)) throw new DataError('invalid_transition', 'The workflow does not allow this transition.')
  if (name === 'registrations' && next === 'submitted') await validateRegistrationSubmission(database, actor, old as AssetRegistration)
  const row = parseEntity(name, { ...old, workflowStatus: next, submittedAt: next === 'submitted' ? new Date().toISOString() : old.submittedAt, version: old.version + 1, updatedAt: new Date().toISOString() })
  await database.entity(name).put(row)
  await writeAudit(database, actor, transactionId, name, old, row, next === 'submitted' ? 'submit' : 'cancel', reason)
  await synchronizeApproval(database, actor, name, old, row, reason, transactionId)
  return row
}

export function createEntityServices(database: MockDatabase): EntityServices {
  function build<K extends EntityName>(name: K): EntityService<K> {
    const reader = {
      getAll: (context: RequestContext, query: EntityQuery<K> = {}) => respond(() => database.transaction('r', database.tables, async () => {
        const actor = await authorizeEntity(database, context, name, 'read')
        const parsed = z.strictObject({ filters: z.record(z.string(), z.union([z.string(), z.number().finite(), z.boolean(), z.null()])).optional(), search: z.string().max(200).optional(), offset: z.number().int().min(0).optional(), limit: z.number().int().min(1).max(1000).optional() }).parse(query)
        const keys = Object.keys(entitySchemas[name].shape)
        if (Object.keys(parsed.filters ?? {}).some((key) => !keys.includes(key))) throw new DataError('validation', 'Unknown query field.')
        if (parsed.filters && 'municipalityId' in parsed.filters && parsed.filters.municipalityId !== context.municipalityId) throw new DataError('forbidden', 'Queries cannot change municipality scope.')
        const rows = await entityRepository(database, name).getAll(context.municipalityId)
        const visible: EntityMap[K][] = []
        for (const row of rows) {
          if (!await visibleRecord(database, actor, name, row)) continue
          const record = row as unknown as Record<string, unknown>
          if (!Object.entries(parsed.filters ?? {}).every(([key, value]) => record[key] === value)) continue
          if (parsed.search && !Object.values(record).some((value) => typeof value === 'string' && value.toLowerCase().includes(parsed.search!.toLowerCase()))) continue
          visible.push(row)
        }
        const offset = parsed.offset ?? 0
        return visible.sort((a, b) => a.id.localeCompare(b.id)).slice(offset, parsed.limit ? offset + parsed.limit : undefined)
      })),
      getById: (context: RequestContext, id: string) => respond(() => database.transaction('r', database.tables, async () => {
        const actor = await authorizeEntity(database, context, name, 'read')
        return scopedRecord(database, actor, name, recordId.parse(id))
      })),
    }
    const writer = writableSet.has(name) ? {
      create: (context: RequestContext, input: CreateInput<WritableEntity>) => respond(() => commitMutation(database, (tx) => applyCreate(database, context, name as WritableEntity, input, tx))),
      update: (context: RequestContext, id: string, version: number, input: Partial<CreateInput<WritableEntity>>) => respond(() => commitMutation(database, (tx) => applyUpdate(database, context, name as WritableEntity, id, version, input, tx))),
    } : {}
    const workflow = workflowSet.has(name) ? {
      submit: (context: RequestContext, id: string, version: number) => respond(() => commitMutation(database, (tx) => applyWorkflow(database, context, name as WorkflowEntityName, id, version, 'submitted', 'Submitted for demo review.', tx))),
      changeStatus: (context: RequestContext, id: string, version: number, status: WorkflowStatus, reason: string) => respond(() => commitMutation(database, (tx) => applyWorkflow(database, context, name as WorkflowEntityName, id, version, status, z.string().max(4000).parse(reason), tx))),
    } : {}
    // Runtime capability sets exactly match the conditional EntityService contracts.
    return { ...reader, ...writer, ...workflow } as EntityService<K>
  }
  return Object.fromEntries(entityNames.map((name) => [name, build(name)])) as EntityServices
}

export { createApprovalManagementService as createApprovalService } from './approvalService.js'

export function createBatchService(database: MockDatabase) {
  return (context: RequestContext, commands: readonly MutationCommand[]) => respond(() => commitMutation(database, async (transactionId) => {
    const commandSchema = z.discriminatedUnion('operation', [
      z.strictObject({ entity: z.enum(writableEntities), operation: z.literal('create'), input: z.record(z.string(), z.unknown()) }),
      z.strictObject({ entity: z.enum(writableEntities), operation: z.literal('update'), id: recordId, expectedVersion: positiveVersion, changes: z.record(z.string(), z.unknown()) }),
    ])
    const parsed = commandSchema.array().min(1).max(100).parse(commands)
    const results: EntityMap[WritableEntity][] = []
    for (const command of parsed) {
      if (!writableSet.has(command.entity)) throw new DataError('forbidden', 'Unsupported batch entity.')
      if (command.operation === 'create') results.push(await applyCreate(database, context, command.entity, command.input as CreateInput<WritableEntity>, transactionId))
      else if (command.operation === 'update') results.push(await applyUpdate(database, context, command.entity, command.id, command.expectedVersion, command.changes, transactionId))
      else throw new DataError('validation', 'Unsupported batch operation.')
    }
    return results
  }))
}

export function createIdentityStatusService(database: MockDatabase) {
  return (context: RequestContext, id: string, version: number, status: User['status']) => respond(() => commitMutation(database, async (transactionId) => {
    const actor = await authorize(database, context, 'users', 'manage')
    const old = await scopedRecord(database, actor, 'users', recordId.parse(id))
    checkVersion(old, version)
    if (old.status === 'pending' && status === 'active') {
      const department = old.departmentId ? await database.entity('departments').get(old.departmentId) : undefined
      if (!department?.active || department.municipalityId !== old.municipalityId) throw new DataError('validation', 'Activate the requested department before approving this account.')
    }
    if (old.status === 'pending' && status === 'active') throw new DataError('invalid_transition', 'Pending registrations must be approved through the account review service.')
    if (status === 'pending') throw new DataError('invalid_transition', 'Managed accounts cannot be returned to Pending.')
    if (old.status === 'disabled' && status === 'active') {
      const rejected = await database.entity('auditLogs').where('municipalityId').equals(context.municipalityId).filter((event) => event.entityId === old.id && event.action === 'reject_account').count()
      if (rejected) throw new DataError('invalid_transition', 'Rejected registrations cannot be reactivated without a new registration.')
    }
    const row = parseEntity('users', { ...old, status: z.enum(['pending', 'active', 'disabled']).parse(status), version: old.version + 1, updatedAt: new Date().toISOString() })
    await database.entity('users').put(row)
    await database.sessions.where('userId').equals(row.id).delete()
    await writeAudit(database, actor, transactionId, 'users', old, row, old.status === 'pending' && status === 'active' ? 'approve_account' : 'changeStatus')
    return row
  }))
}

export function createNotificationService(database: MockDatabase) {
  return (context: RequestContext, id: string, version: number) => respond(() => commitMutation(database, async (transactionId) => {
    const actor = await authorize(database, context, 'notifications', 'update')
    const old = await scopedRecord(database, actor, 'notifications', recordId.parse(id))
    checkVersion(old, version)
    if (old.readAt) return old
    const row = { ...old, readAt: new Date().toISOString(), version: old.version + 1, updatedAt: new Date().toISOString() }
    await database.entity('notifications').put(row)
    await writeAudit(database, actor, transactionId, 'notifications', old, row, 'markRead')
    return row
  }))
}

