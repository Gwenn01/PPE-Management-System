import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import type { MunicipalityId } from '../../domain/models'
import type { PermissionRequirement } from '../../domain/permissions'
import { canAccess } from '../../domain/permissions'
import { useCurrentUser } from '../../hooks/useCurrentUser'

/** Record/detail routes must supply the record's municipality, not a user-selected filter. */
export default function RequirePermission({ permission, municipalityId, children }: {
  permission: PermissionRequirement
  municipalityId?: MunicipalityId
  children: ReactNode
}) {
  const { user } = useCurrentUser()
  if (!canAccess(user, permission, { municipalityId: municipalityId ?? user.municipalityId })) {
    return <Navigate to="/dashboard/access-denied" replace />
  }
  return <>{children}</>
}
