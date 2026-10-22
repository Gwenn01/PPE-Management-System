import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Role } from '../config/roles'
import type { MunicipalityId } from '../domain/models'
import { CurrentUserContext } from './CurrentUserContext'
import { demoIdentityService } from '../services/demoIdentityService'

/**
 * Demo preview only. Mock session/login integration belongs to a later phase.
 */
export default function CurrentUserProvider({
  children,
}: {
  children: ReactNode
}) {
  const [user, setUser] = useState(() => demoIdentityService.restore())
  const value = useMemo(() => {
    const preview = (role: Role, municipalityId: MunicipalityId) => {
      const result = demoIdentityService.preview(role, municipalityId)
      if (result.ok) setUser(result.data)
    }
    return {
      user,
      setRole: (role: Role) => preview(role, user.municipalityId),
      setMunicipality: (municipalityId: MunicipalityId) => preview(user.role, municipalityId),
    }
  }, [user])

  return (
    <CurrentUserContext.Provider value={value}>
      {children}
    </CurrentUserContext.Provider>
  )
}
