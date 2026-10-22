import { createContext } from 'react'
import type { MunicipalityId, User } from '../domain/models'

export type CurrentUser = User

export type CurrentUserContextValue = {
  user: CurrentUser
  /** Dev-only: switch the static role to preview each role's navigation. */
  setRole: (role: User['role']) => void
  setMunicipality: (municipalityId: MunicipalityId) => void
}

export const CurrentUserContext = createContext<CurrentUserContextValue | null>(
  null,
)
