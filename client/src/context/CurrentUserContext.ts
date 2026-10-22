import { createContext } from 'react'
import type { User } from '../domain/models'
import type { AuthSession, AuthStatus } from '../domain/auth'
import type { AuthService } from '../services/authContracts'
import type { ServiceResult } from '../services/contracts'

export type CurrentUser = User

export type CurrentUserContextValue = {
  user: CurrentUser | null
  session: AuthSession | null
  status: AuthStatus
  checkedAt: number
  error: string | null
  notice: string
  login: AuthService['login']
  logout: (message?: string) => Promise<ServiceResult<void>>
  switchAccount: AuthService['switchAccount']
  refreshSession: () => Promise<void>
}

export const CurrentUserContext = createContext<CurrentUserContextValue | null>(
  null,
)
