import type { EntityId, MunicipalityId, ScopedEntity, User } from '../domain/models.js'

export type ServiceErrorCode = 'forbidden' | 'not_found' | 'validation' | 'conflict' | 'storage_unavailable' | 'invalid_transition' | 'duplicate' | 'invalid_credentials' | 'account_pending' | 'account_disabled'
export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ServiceErrorCode; message: string; fields?: Record<string, string> } }

export interface PageRequest { page: number; pageSize: number; search?: string }
export interface Page<T> { items: T[]; total: number; page: number; pageSize: number }
export interface RequestContext {
  sessionId: string
  actor: User
  municipalityId: MunicipalityId
}
export interface UpdateRequest<T> { id: EntityId; expectedVersion: number; changes: T }

/** Future mock and HTTP services share these request/response contracts.
 * Implementations must authorize every call; a route guard is insufficient.
 */
export interface ReadService<T extends ScopedEntity> {
  list(context: RequestContext, request: PageRequest): Promise<ServiceResult<Page<T>>>
  get(context: RequestContext, id: EntityId): Promise<ServiceResult<T>>
}
