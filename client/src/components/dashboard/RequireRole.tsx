import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { Role } from '../../config/roles'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { canAccess } from '../../domain/permissions'

export default function RequireRole({
  roles,
  children,
}: {
  roles: Role[]
  children: ReactNode
}) {
  const { user } = useCurrentUser()
  // Compatibility wrapper; new routes use resource/action RequirePermission.
  if (!roles.includes(user.role) || !canAccess(user, { resource: 'dashboard', action: 'read' }, user)) {
    return <Navigate to="/dashboard/access-denied" replace />
  }
  return <>{children}</>
}
