import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { Role } from '../../config/roles'
import { useCurrentUser } from '../../hooks/useCurrentUser'

export default function RequireRole({
  roles,
  children,
}: {
  roles: Role[]
  children: ReactNode
}) {
  const { user } = useCurrentUser()
  if (!roles.includes(user.role)) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}
