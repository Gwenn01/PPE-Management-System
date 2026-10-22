import type { EntityId, MunicipalityId, ScopedEntity, User } from '../domain/models.js'

export type ServiceErrorCode = 'forbidden' | 'not_found' | 'validation' | 'conflict' | 'storage_unavailable'
export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ServiceErrorCode; message: string; fields?: Record<string, string> } }

export interface PageRequest { page: number; pageSize: number; search?: string }
export interface Page<T> { items: T[]; total: number; page: number; pageSize: number }
export interface RequestContext {
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

/** Retains the existing role-preview behavior, without claiming authentication. */
export interface DemoIdentityService {
  restore(): User
  preview(role: User['role'], municipalityId: MunicipalityId): ServiceResult<User>
}
