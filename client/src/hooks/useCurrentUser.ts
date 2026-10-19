import { useContext } from 'react'
import { CurrentUserContext } from '../context/CurrentUserContext'

export function useCurrentUser() {
  const ctx = useContext(CurrentUserContext)
  if (!ctx) {
    throw new Error('useCurrentUser must be used inside CurrentUserProvider')
  }
  return ctx
}
