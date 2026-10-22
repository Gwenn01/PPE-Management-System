import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Lock } from 'lucide-react'
import AuthLayout from '../components/auth/AuthLayout'
import TextField from '../components/auth/TextField'
import SelectField from '../components/auth/SelectField'
import { DEMO_PASSWORD } from '../domain/auth'
import type { AuthOptions } from '../domain/auth'
import { roleLabels } from '../config/roles'
import { authClient } from '../services/authClient'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { fieldErrors, loginSchema } from '../features/auth/validation'
import { loginDestination } from '../domain/authAccess'

type Errors = Record<string, string>

export default function LoginPage() {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [municipalityId, setMunicipalityId] = useState('')
  const [options, setOptions] = useState<AuthOptions | null>(null)
  const [loadError, setLoadError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [recovery, setRecovery] = useState(false)
  const auth = useCurrentUser()
  const navigate = useNavigate()
  const location = useLocation()
  useEffect(() => {
    let active = true
    void authClient.getOptions().then((result) => {
      if (!active) return
      setOptions(result.ok ? result.data : null); setLoadError(result.ok ? '' : result.error.message)
    })
    return () => { active = false }
  }, [attempt])

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (busy) return
    const parsed = loginSchema.safeParse({ login, password, municipalityId, remember })
    setErrors(parsed.success ? {} : fieldErrors(parsed.error.issues)); setMessage('')
    if (!parsed.success) return
    setBusy(true)
    const result = await auth.login(parsed.data)
    setBusy(false)
    if (!result.ok) { setErrors(result.error.fields ?? {}); setMessage(result.error.message); return }
    const state: unknown = location.state
    navigate(loginDestination(state && typeof state === 'object' && 'from' in state ? state.from : undefined), { replace: true })
  }

  return (
    <AuthLayout
      heading="Welcome back."
      blurb="Sign in to manage property, plant, and equipment records for your municipality."
    >
      <h1 className="text-2xl font-bold text-charcoal">Sign in</h1>
      <div className="mt-4 rounded-lg border border-line bg-mist p-3 text-xs leading-5 text-charcoal">
        <strong className="text-navy">DEMO ONLY.</strong> Browser-side mock authentication. Use fictional details and the public password <code className="font-semibold">{DEMO_PASSWORD}</code>. This is not secure or production authentication.
      </div>
      {auth.notice && <p className="mt-4 text-sm text-navy" role="status">{auth.notice}</p>}
      {auth.error && <p className="mt-4 text-sm text-red-700" role="alert">{auth.error}</p>}
      {!options && !loadError && <p className="mt-4 text-sm text-gray" role="status">Loading municipalities and demo accounts…</p>}
      {loadError && <div className="mt-4 text-sm text-red-700" role="alert">{loadError} <button type="button" onClick={() => { setLoadError(''); setAttempt((value) => value + 1) }} className="font-semibold text-navy underline">Retry</button></div>}
      {options && <details className="mt-4 text-xs text-charcoal">
        <summary className="cursor-pointer font-semibold text-navy">Demo credentials for all eight roles</summary>
        <div className="mt-3"><SelectField label="Fill a seeded demo account" name="demoAccount" placeholder="Choose an account to fill the form" options={options.demoAccounts.map((account) => ({ value: account.id, label: `${account.municipalityId === 'botolan' ? 'Botolan' : 'San Antonio'} — ${roleLabels[account.role]} (${account.email})`, disabled: account.status !== 'active' }))} value="" onChange={(event) => {
          const account = options.demoAccounts.find((item) => item.id === event.target.value)
          if (account) { setLogin(account.username); setMunicipalityId(account.municipalityId); setPassword(DEMO_PASSWORD); setErrors({}); setMessage('') }
        }} /></div>
      </details>}

      <form onSubmit={(event) => { void handleSubmit(event) }} noValidate className="mt-8" aria-busy={busy}>
        <fieldset disabled={busy || !options} className="space-y-7">
        <SelectField label="Municipality" name="municipalityId" placeholder="Select municipality" options={options?.municipalities.map((municipality) => ({ value: municipality.id, label: municipality.name })) ?? []} value={municipalityId} onChange={(event) => setMunicipalityId(event.target.value)} error={errors.municipalityId} />
        <TextField
          label="Login"
          name="login"
          autoComplete="username"
          placeholder="Email or username"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          error={errors.login}
        />
        <TextField
          label="Demo password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Enter the public demo password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />

        <div className="flex items-center justify-between gap-4 text-sm">
          <label className="flex cursor-pointer items-center gap-3 text-charcoal">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 rounded border-line accent-navy"
            />
            Remember me (7 days)
          </label>
          <button
            type="button"
            onClick={() => setRecovery((value) => !value)}
            className="flex items-center gap-1.5 text-xs font-semibold text-navy hover:underline"
          >
            <Lock className="h-3.5 w-3.5" />
            Forgot password?
          </button>
        </div>
        {recovery && <p className="rounded-lg bg-mist p-3 text-xs leading-5 text-charcoal" role="status">Demo limitation: there is no password reset service. Every demo account uses {DEMO_PASSWORD}. Pending or disabled accounts need a municipal demo Administrator's review.</p>}
        {message && <p className="text-sm text-red-700" role="alert">{message}</p>}
        {!message && Object.keys(errors).length > 0 && <p className="text-sm text-red-700" role="alert">Review the highlighted fields before signing in.</p>}

        <div className="flex items-center justify-between gap-4 pt-2">
          <p className="text-sm text-charcoal">
            No account?{' '}
            <Link
              to="/register"
              className="font-semibold text-navy hover:underline"
            >
              Sign up
            </Link>
          </p>
          <button
            type="submit"
            className="flex items-center gap-3 rounded-full bg-navy px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-navy-dark"
          >
            {busy ? 'Signing in…' : 'Sign in'}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
        </fieldset>
      </form>

      <p className="mt-12 border-t border-line pt-5 text-center text-xs leading-5 text-gray">
        Unchecked Remember Me uses this tab's sessionStorage, up to 12 hours. Remembered sessions use localStorage, up to 7 days. Access still requires an active mock account and matching municipality permissions.
      </p>
    </AuthLayout>
  )
}
