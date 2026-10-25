import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authClient } from '../../services/authClient'
import type { AuthOptions } from '../../domain/auth'
import { roleLabels } from '../../config/roles'
import { useAuthenticatedUser } from '../../hooks/useAuthenticatedUser'

export default function DemoAccountSwitcher() {
  const { user, switchAccount } = useAuthenticatedUser()
  const [accounts, setAccounts] = useState<AuthOptions['demoAccounts']>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const navigate = useNavigate()
  useEffect(() => {
    let active = true
    if (import.meta.env.DEV) void authClient.getOptions().then((result) => {
      if (active) { setAccounts(result.ok ? result.data.demoAccounts : []); setError(result.ok ? '' : result.error.message) }
    })
    return () => { active = false }
  }, [attempt])
  if (!import.meta.env.DEV) return null
  return <div className="text-xs text-gray">
    <label className="flex flex-wrap items-center gap-2">
      <span className="rounded bg-chip px-2 py-0.5 font-semibold text-navy">DEV ONLY</span>
      <select aria-label="Switch development account" value={accounts.some((account) => account.id === user.id) ? user.id : ''} disabled={busy || !accounts.length} className="w-44 max-w-full rounded border border-line bg-white px-2 py-1.5 text-xs text-charcoal focus:border-navy" onChange={(event) => {
        const id = event.target.value
        setBusy(true); setError('')
        void switchAccount(id).then((result) => {
          setBusy(false)
          if (result.ok) navigate('/dashboard', { replace: true })
          else setError(result.error.message)
        })
      }}>
        <option value="" disabled>{accounts.length ? 'Choose a seeded account' : 'Loading accounts…'}</option>
        {accounts.map((account) => <option key={account.id} value={account.id} disabled={account.status !== 'active'}>{account.municipalityId === 'botolan' ? 'Botolan' : 'San Antonio'} — {roleLabels[account.role]}</option>)}
      </select>
    </label>
    {error && <p className="mt-1 max-w-xs text-red-700" role="alert">{error} <button type="button" onClick={() => setAttempt((value) => value + 1)} className="text-navy underline">Reload accounts</button></p>}
  </div>
}
