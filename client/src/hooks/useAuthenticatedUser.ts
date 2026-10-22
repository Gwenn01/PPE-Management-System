import { useCurrentUser } from './useCurrentUser'
import { useMemo } from 'react'
import type { RequestContext } from '../services/contracts'

/** Only use below RequireSession; public pages use nullable useCurrentUser. */
export function useAuthenticatedUser() {
  const auth = useCurrentUser()
  const requestContext = useMemo<RequestContext | null>(() => auth.session ? { actor: auth.session.user, municipalityId: auth.session.user.municipalityId, sessionId: auth.session.sessionId } : null, [auth.session])
  if (!requestContext || !auth.session || auth.status !== 'authenticated') throw new Error('This view requires an authenticated demo session.')
  return { ...auth, user: auth.session.user, session: auth.session, requestContext }
}
