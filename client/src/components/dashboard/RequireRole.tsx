import type { ReactNode } from 'react'
import type { Role } from '../../config/roles'
import RequireSession from '../../features/auth/RequireSession'

export default function RequireRole({
  roles,
  children,
}: {
  roles: Role[]
  children: ReactNode
}) {
  return <RequireSession roles={roles}>{children}</RequireSession>
}
