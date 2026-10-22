import type { ReactNode } from 'react'
import type { MunicipalityId } from '../../domain/models'
import type { PermissionRequirement } from '../../domain/permissions'
import RequireSession from '../auth/RequireSession'

/** Record/detail routes must supply the record's municipality, not a user-selected filter. */
export default function RequirePermission({ permission, municipalityId, children }: {
  permission: PermissionRequirement
  municipalityId?: MunicipalityId
  children: ReactNode
}) {
  return <RequireSession permission={permission} municipalityId={municipalityId}>{children}</RequireSession>
}
