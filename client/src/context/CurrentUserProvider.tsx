import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { AuthSession, AuthStatus } from '../domain/auth'
import { DEMO_SESSION_KEY } from '../domain/auth'
import type { LoginRequest } from '../services/authContracts'
import { CurrentUserContext } from './CurrentUserContext'
import { authClient } from '../services/authClient'

/**
 * Nullable mock authentication only. No role preference grants a session.
 */
export default function CurrentUserProvider({
  children,
}: {
  children: ReactNode
}) {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [checkedAt, setCheckedAt] = useState(Date.now)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const generation = useRef(0)
  const changing = useRef(false)
  const current = useRef<AuthSession | null>(null)
  const apply = useCallback((next: AuthSession | null) => {
    current.current = next; setSession(next); setStatus(next ? 'authenticated' : 'anonymous'); setError(null); setCheckedAt(Date.now())
  }, [])
  const refreshSession = useCallback(async () => {
    if (changing.current) return
    const revision = ++generation.current
    const result = await authClient.restore()
    if (revision !== generation.current) return
    if (result.ok) {
      if (current.current && !result.data) setNotice('Your session ended. Sign in again.')
      apply(result.data)
    } else {
      current.current = null; setSession(null); setStatus('error'); setError(result.error.message)
    }
  }, [apply])
  useEffect(() => {
    let active = true
    const revision = ++generation.current
    void authClient.restore().then((result) => {
      if (!active || revision !== generation.current) return
      if (result.ok) apply(result.data)
      else { current.current = null; setSession(null); setStatus('error'); setError(result.error.message) }
    })
    const focused = () => { void refreshSession() }
    const stored = (event: StorageEvent) => { if (event.key === DEMO_SESSION_KEY || event.key === null) void refreshSession() }
    const timer = window.setInterval(focused, 30000)
    window.addEventListener('focus', focused)
    window.addEventListener('storage', stored)
    return () => {
      active = false; window.clearInterval(timer)
      window.removeEventListener('focus', focused); window.removeEventListener('storage', stored)
    }
  }, [refreshSession, apply])
  useEffect(() => {
    if (!session) return
    const timer = window.setTimeout(() => { void refreshSession() }, Math.max(0, Date.parse(session.expiresAt) - Date.now()))
    return () => window.clearTimeout(timer)
  }, [session, refreshSession])
  const login = useCallback(async (request: LoginRequest) => {
    const revision = ++generation.current; changing.current = true
    const result = await authClient.login(request)
    if (revision === generation.current) {
      apply(result.ok ? result.data : null)
      if (result.ok) setNotice('Signed in successfully.')
    }
    changing.current = false
    return result
  }, [apply])
  const logout = useCallback(async (message = 'You have signed out.') => {
    ++generation.current; changing.current = true
    const id = current.current?.sessionId
    apply(null); setNotice(message)
    const result = await authClient.logout(id)
    changing.current = false
    if (!result.ok) { setError(result.error.message); setNotice('Signed out of this view. Session cleanup needs attention: ' + result.error.message) }
    return result
  }, [apply])
  const switchAccount = useCallback(async (id: string) => {
    const revision = ++generation.current; changing.current = true
    const result = await authClient.switchAccount(id)
    if (revision === generation.current && result.ok) apply(result.data)
    changing.current = false
    if (!result.ok) await refreshSession()
    return result
  }, [apply, refreshSession])
  const value = useMemo(() => ({ user: session?.user ?? null, session, status, checkedAt, error, notice, login, logout, switchAccount, refreshSession }), [session, status, checkedAt, error, notice, login, logout, switchAccount, refreshSession])

  return (
    <CurrentUserContext.Provider value={value}>
      {children}
    </CurrentUserContext.Provider>
  )
}
