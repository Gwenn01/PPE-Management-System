import type { EntityMap, EntityName } from '../domain/data.js'
import type { AuditLog, User } from '../domain/models.js'
import { canAccess } from '../domain/permissions.js'
import type { Action, Resource } from '../domain/permissions.js'
import type { RequestContext } from '../services/contracts.js'
import { DataError } from '../services/errors.js'
import type { MockDatabase } from './database.js'
import { recordMunicipality, validateDataset } from './validation/dataset.js'

export async function authorize(database: MockDatabase, context: RequestContext, resource: Resource, action: Action): Promise<User> {
  if (!context?.actor?.id) throw new DataError('forbidden', 'An active demo identity is required.')
  const actor = await database.entity('users').get(context.actor.id)
  if (!actor || actor.role !== context.actor.role || actor.municipalityId !== context.actor.municipalityId || context.actor.status !== 'active' ||
    !canAccess(actor, { resource, action }, context)) throw new DataError('forbidden', 'This action is unavailable for this role or municipality.')
  const stored = await database.entity('permissions').where('[municipalityId+role]').equals([actor.municipalityId, actor.role]).toArray()
  if (!stored.some((rule) => rule.resource === resource && rule.action === action && rule.scope === 'municipality')) throw new DataError('forbidden', 'The local permission grant is unavailable.')
  return actor
}

function auditValue(value: unknown): string | number | boolean | null {
  return value === undefined || value === null ? null : typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : JSON.stringify(value)
}

export async function writeAudit<K extends EntityName>(database: MockDatabase, actor: User, transactionId: string, name: K,
  before: EntityMap[K] | null, after: EntityMap[K] | null, action: string, reason = ''): Promise<void> {
  const at = new Date().toISOString()
  const old = (before ?? {}) as Record<string, unknown>
  const next = (after ?? {}) as Record<string, unknown>
  const record = after ?? before
  if (!record) throw new DataError('validation', 'An audit event requires a record.')
  const audit: AuditLog = {
    id: crypto.randomUUID(), municipalityId: recordMunicipality(name, record), version: 1, createdAt: at, updatedAt: at,
    actorId: actor.id, actorRole: actor.role, resource: name, entityId: record.id, action, occurredAt: at, reason, transactionId,
    changes: [...new Set([...Object.keys(old), ...Object.keys(next)])].filter((field) => JSON.stringify(old[field]) !== JSON.stringify(next[field])).map((field) => ({ field, before: auditValue(old[field]), after: auditValue(next[field]) })),
  }
  await database.entity('auditLogs').add(audit)
}

export async function commitMutation<T>(database: MockDatabase, operation: (transactionId: string) => Promise<T>): Promise<T> {
  return database.transaction('rw', database.tables, async () => {
    const result = await operation(crypto.randomUUID())
    validateDataset(await database.snapshot())
    const state = await database.metadata.get('state')
    if (!state) throw new DataError('storage_unavailable', 'Database metadata is missing; do not reseed automatically.')
    await database.metadata.put({ ...state, revision: state.revision + 1 })
    return result
  })
}
