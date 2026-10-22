import { isRole } from '../config/roles.js'
import { isMunicipalityId } from '../domain/municipalities.js'
import { createDemoIdentityRepository, createDemoUser } from '../mock/demoIdentityRepository.js'
import type { PreferenceStore } from '../mock/demoIdentityRepository.js'
import type { DemoIdentityService } from './contracts.js'

export function createDemoIdentityService(store?: PreferenceStore): DemoIdentityService {
  const repository = createDemoIdentityRepository(store)
  return {
    restore: () => repository.restore(),
    preview(role, municipalityId) {
      if (!isRole(role) || !isMunicipalityId(municipalityId)) {
        return { ok: false, error: { code: 'validation', message: 'Select a valid demo role and municipality.' } }
      }
      const user = createDemoUser(role, municipalityId)
      repository.save(user)
      return { ok: true, data: user }
    },
  }
}

function browserPreferences(): PreferenceStore | undefined {
  try { return window.localStorage } catch { return undefined }
}

export const demoIdentityService = createDemoIdentityService(browserPreferences())
