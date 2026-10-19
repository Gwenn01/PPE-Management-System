import { createContext } from 'react'
import type { Role } from '../config/roles'

export type CurrentUser = {
  name: string
  email: string
  role: Role
}

export type CurrentUserContextValue = {
  user: CurrentUser
  /** Dev-only: switch the static role to preview each role's navigation. */
  setRole: (role: Role) => void
}

export const CurrentUserContext = createContext<CurrentUserContextValue | null>(
  null,
)
