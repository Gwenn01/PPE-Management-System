import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useCurrentUser } from '../../hooks/useCurrentUser'

export default function GuestOnly({ children }: { children: ReactNode }) {
  const { status, session, checkedAt } = useCurrentUser()
  if (status === 'loading') return <p role="status" className="p-8 text-center text-sm text-navy">Checking demo session…</p>
  if (status === 'authenticated' && session && Date.parse(session.expiresAt) > checkedAt) return <Navigate to="/dashboard" replace />
  return children
}
