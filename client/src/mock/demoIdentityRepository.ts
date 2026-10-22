import { staticUsers } from '../config/roles.js'
import type { Role } from '../config/roles.js'
import type { MunicipalityId, User } from '../domain/models.js'

/** Permission-test fixture only. Runtime authentication resolves persisted users. */
export function createDemoUser(role: Role, municipalityId: MunicipalityId): User {
  return {
    ...staticUsers[role],
    id: `demo-${municipalityId}-${role}`,
    role, username: role, municipalityId, departmentId: null, status: 'active', isDemo: true,
    version: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }
}
