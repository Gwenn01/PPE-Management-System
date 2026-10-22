import type { AuthSession, AuthStatus } from './auth.js'
import type { MunicipalityId } from './models.js'
import type { Role } from '../config/roles.js'
import { canAccess } from './permissions.js'
import type { PermissionRequirement } from './permissions.js'

export function authRouteAccess(status: AuthStatus, session: AuthSession | null, permission: PermissionRequirement = { resource: 'dashboard', action: 'read' }, municipalityId?: MunicipalityId, roles?: readonly Role[], now = Date.now()): 'loading' | 'error' | 'login' | 'forbidden' | 'allow' {
  if (status === 'loading' || status === 'error') return status
  if (status !== 'authenticated' || !session || !Number.isFinite(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt) <= now) return 'login'
  if (roles && !roles.includes(session.user.role)) return 'forbidden'
  if (!canAccess(session.user, permission, { municipalityId: municipalityId ?? session.user.municipalityId }) ||
    !session.permissions.some((rule) => rule.role === session.user.role && rule.scope === 'municipality' && rule.resource === permission.resource && rule.action === permission.action)) return 'forbidden'
  return 'allow'
}

export function loginDestination(from: unknown): string {
  if (typeof from !== 'string' || from.includes('\\') || !/^\/dashboard(?:[/?#]|$)/.test(from)) return '/dashboard'
  try {
    const url = new URL(from, 'https://ppe-demo.invalid')
    return url.origin === 'https://ppe-demo.invalid' && (url.pathname === '/dashboard' || url.pathname.startsWith('/dashboard/')) ? url.pathname + url.search + url.hash : '/dashboard'
  } catch { return '/dashboard' }
}
