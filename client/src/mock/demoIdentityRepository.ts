import { isRole, staticUsers } from '../config/roles.js'
import type { Role } from '../config/roles.js'
import { isMunicipalityId } from '../domain/municipalities.js'
import type { MunicipalityId, User } from '../domain/models.js'

export interface PreferenceStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export const demoPreferenceKeys = { role: 'ppe-dev-role', municipality: 'ppe-dev-municipality' } as const

export function createDemoUser(role: Role, municipalityId: MunicipalityId): User {
  return {
    ...staticUsers[role],
    id: `demo-${municipalityId}-${role}`,
    role, municipalityId, departmentId: null, status: 'active', isDemo: true,
    version: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

/** Stores only lightweight preview preferences. No business records or credentials. */
export function createDemoIdentityRepository(store: PreferenceStore | undefined) {
  return {
    restore(): User {
      try {
        const role = store?.getItem(demoPreferenceKeys.role)
        const municipality = store?.getItem(demoPreferenceKeys.municipality)
        return createDemoUser(isRole(role) ? role : 'administrator', isMunicipalityId(municipality) ? municipality : 'botolan')
      } catch {
        return createDemoUser('administrator', 'botolan')
      }
    },
    save(user: User): void {
      try {
        store?.setItem(demoPreferenceKeys.role, user.role)
        store?.setItem(demoPreferenceKeys.municipality, user.municipalityId)
      } catch {
        // Preview still works in memory when browser preference storage is unavailable.
      }
    },
  }
}
