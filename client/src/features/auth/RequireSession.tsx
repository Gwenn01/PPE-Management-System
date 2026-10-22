import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { authRouteAccess } from '../../domain/authAccess'
import type { PermissionRequirement } from '../../domain/permissions'
import type { MunicipalityId } from '../../domain/models'
import type { Role } from '../../config/roles'

export default function RequireSession({ children, permission, municipalityId, roles }: {
  children: ReactNode; permission?: PermissionRequirement; municipalityId?: MunicipalityId; roles?: readonly Role[]
}) {
  const auth = useCurrentUser()
  const location = useLocation()
  const access = authRouteAccess(auth.status, auth.session, permission, municipalityId, roles, auth.checkedAt)
  if (access === 'loading' || access === 'error') return (
    <main className="flex min-h-svh items-center justify-center bg-mist p-6">
      <section className="max-w-lg rounded-2xl border border-line bg-white p-8" role={access === 'error' ? 'alert' : 'status'}>
        <h1 className="text-xl font-bold text-navy">{access === 'loading' ? 'Restoring demo session…' : 'Demo session unavailable'}</h1>
        {access === 'error' && <><p className="mt-3 text-sm text-charcoal">{auth.error}</p><div className="mt-4 flex flex-wrap gap-3"><button type="button" onClick={() => { void auth.refreshSession() }} className="rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white">Retry session</button><button type="button" onClick={() => { void auth.logout('Demo session cleared. Sign in again.') }} className="rounded-lg border border-line px-4 py-2 text-sm text-navy">Clear session and sign in</button></div></>}
      </section>
    </main>
  )
  if (access === 'login') return <Navigate to="/login" replace state={{ from: location.pathname + location.search + location.hash }} />
  if (access === 'forbidden') return <Navigate to="/dashboard/access-denied" replace />
  return children
}
