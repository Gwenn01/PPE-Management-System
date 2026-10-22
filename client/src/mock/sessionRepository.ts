import { z } from 'zod'
import { DEMO_SESSION_KEY } from '../domain/auth.js'
import { DataError } from '../services/errors.js'

export interface SessionStorageAdapter {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}
export interface SessionStores { local?: SessionStorageAdapter; session?: SessionStorageAdapter }
const referenceSchema = z.strictObject({ version: z.literal(1), sessionId: z.uuid() })

export function createSessionRepository(stores: SessionStores) {
  const clear = () => {
    for (const storage of [stores.local, stores.session]) {
      storage?.removeItem(DEMO_SESSION_KEY)
      storage?.removeItem('ppe-dev-role')
      storage?.removeItem('ppe-dev-municipality')
    }
  }
  return {
    clear,
    read(): string | null {
      const raw = stores.session?.getItem(DEMO_SESSION_KEY) ?? stores.local?.getItem(DEMO_SESSION_KEY)
      if (!raw) return null
      let value: unknown
      try { value = JSON.parse(raw) } catch { clear(); return null }
      const parsed = referenceSchema.safeParse(value)
      if (!parsed.success) { clear(); return null }
      return parsed.data.sessionId
    },
    save(sessionId: string, remember: boolean): void {
      const storage = remember ? stores.local : stores.session
      if (!storage) throw new DataError('storage_unavailable', 'Demo session storage is unavailable. Enable browser storage and retry.')
      clear()
      storage.setItem(DEMO_SESSION_KEY, JSON.stringify(referenceSchema.parse({ version: 1, sessionId })))
    },
  }
}
