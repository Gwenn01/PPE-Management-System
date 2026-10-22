import type { Department, Municipality, MunicipalityId, User } from './models.js'
import type { PermissionRule } from './permissions.js'

/** Public, shared demonstration password. Never use a real or personal password. */
export const DEMO_PASSWORD = 'PPE-DEMO-2026'
export const DEMO_SESSION_KEY = 'ppe-demo-session-v1'
export const demoSessionLifetime = { tab: 12 * 60 * 60 * 1000, remembered: 7 * 24 * 60 * 60 * 1000 } as const

export interface DemoSessionRecord {
  id: string
  userId: string
  municipalityId: MunicipalityId
  role: User['role']
  issuedAt: string
  expiresAt: string
  remember: boolean
}
export interface AuthSession {
  sessionId: string
  user: User
  municipality: Municipality
  permissions: PermissionRule[]
  expiresAt: string
  remember: boolean
}
export type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'error'
export interface AuthOptions {
  municipalities: Municipality[]
  departments: Department[]
  demoAccounts: Pick<User, 'id' | 'name' | 'username' | 'email' | 'role' | 'municipalityId' | 'status'>[]
}
