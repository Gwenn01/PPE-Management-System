import type { AuthService } from './authContracts.js'
import type { ServiceResult } from './contracts.js'
import type { SessionStores } from '../mock/sessionRepository.js'

let client: Promise<AuthService> | undefined
function load(): Promise<AuthService> {
  client ??= Promise.all([import('./authService.js'), import('../mock/database.js')]).then(([{ createAuthService }, { database }]) => {
    const stores: SessionStores = {}
    try { stores.local = window.localStorage } catch { /* Service reports inaccessible storage. */ }
    try { stores.session = window.sessionStorage } catch { /* Service reports inaccessible storage. */ }
    return createAuthService(database, stores, { development: import.meta.env.DEV })
  }).catch((error: unknown) => { client = undefined; throw error })
  return client
}
/** Lazy browser adapter. Import/type loading failures are handled as structured results. */
async function invoke<T>(operation: (service: AuthService) => Promise<ServiceResult<T>>): Promise<ServiceResult<T>> {
  try { return await operation(await load()) } catch {
    return { ok: false, error: { code: 'storage_unavailable', message: 'Account services could not load. Check browser storage or reload and retry.' } }
  }
}
// Explicit forwarding keeps public request/response types independent of Dexie.
export const authClient: AuthService = {
  getOptions: () => invoke((service) => service.getOptions()),
  login: (request) => invoke((service) => service.login(request)),
  register: (request) => invoke((service) => service.register(request)),
  restore: () => invoke((service) => service.restore()),
  logout: (id) => invoke((service) => service.logout(id)),
  switchAccount: (id) => invoke((service) => service.switchAccount(id)),
  reviewAccount: (...args) => invoke((service) => service.reviewAccount(...args)),
}
