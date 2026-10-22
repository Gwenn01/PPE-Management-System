import { useCurrentUser } from './useCurrentUser'
import type { RequestContext } from '../services/contracts'

/** Only use below RequireSession; public pages use nullable useCurrentUser. */
export function useAuthenticatedUser() {
  const auth = useCurrentUser()
  if (!auth.session || auth.status !== 'authenticated') throw new Error('This view requires an authenticated demo session.')
  const requestContext: RequestContext = { actor: auth.session.user, municipalityId: auth.session.user.municipalityId, sessionId: auth.session.sessionId }
  return { ...auth, user: auth.session.user, session: auth.session, requestContext }
}
