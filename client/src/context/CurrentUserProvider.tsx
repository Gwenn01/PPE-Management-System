import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { roleList, staticUsers } from '../config/roles'
import type { Role } from '../config/roles'
import { CurrentUserContext } from './CurrentUserContext'

const STORAGE_KEY = 'ppe-dev-role'

function readStoredRole(): Role {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as Role | null
    if (stored && roleList.includes(stored)) return stored
  } catch {
    // storage can be unavailable; fall through to the default
  }
  return 'administrator'
}

/**
 * STATIC placeholder. Replace this provider with the real session/user from
 * the backend once the API is ready. Everything else only reads `user.role`
 * through useCurrentUser(), so the swap stays in this one file.
 */
export default function CurrentUserProvider({
  children,
}: {
  children: ReactNode
}) {
  const [role, setRoleState] = useState<Role>(readStoredRole)

  const value = useMemo(
    () => ({
      user: { ...staticUsers[role], role },
      setRole: (next: Role) => {
        setRoleState(next)
        try {
          localStorage.setItem(STORAGE_KEY, next)
        } catch {
          // ignore
        }
      },
    }),
    [role],
  )

  return (
    <CurrentUserContext.Provider value={value}>
      {children}
    </CurrentUserContext.Provider>
  )
}
