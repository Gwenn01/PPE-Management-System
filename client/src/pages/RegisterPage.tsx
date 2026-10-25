import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import AuthLayout from '../components/auth/AuthLayout'
import TextField from '../components/auth/TextField'
import SelectField from '../components/auth/SelectField'
import type { AuthOptions } from '../domain/auth'
import { DEMO_PASSWORD } from '../domain/auth'
import type { User } from '../domain/models'
import { roleLabels, roleList } from '../config/roles'
import { authClient } from '../services/authClient'
import { fieldErrors, registrationSchema } from '../features/auth/validation'

type FormState = {
  fullName: string
  username: string
  email: string
  municipalityId: string
  departmentId: string
  requestedRole: string
  demoPassword: string
  confirmDemoPassword: string
  demoAcknowledged: boolean
}

type Errors = Partial<Record<keyof FormState, string>>

const initialState: FormState = {
  fullName: '',
  username: '',
  email: '',
  municipalityId: '',
  departmentId: '',
  requestedRole: '',
  demoPassword: '',
  confirmDemoPassword: '',
  demoAcknowledged: false,
}

export default function RegisterPage() {
  const [form, setForm] = useState<FormState>(initialState)
  const [errors, setErrors] = useState<Errors>({})
  const [options, setOptions] = useState<AuthOptions | null>(null)
  const [loadError, setLoadError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [registered, setRegistered] = useState<User | null>(null)
  useEffect(() => {
    let active = true
    void authClient.getOptions().then((result) => {
      if (!active) return
      setOptions(result.ok ? result.data : null); setLoadError(result.ok ? '' : result.error.message)
    })
    return () => { active = false }
  }, [attempt])

  const update =
    (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value, ...(field === 'municipalityId' ? { departmentId: '' } : {}) }))

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (busy) return
    const parsed = registrationSchema.safeParse(form)
    setErrors(parsed.success ? {} : fieldErrors(parsed.error.issues)); setMessage('')
    if (!parsed.success) return
    setBusy(true)
    const result = await authClient.register(parsed.data)
    setBusy(false)
    if (!result.ok) { setErrors(result.error.fields ?? {}); setMessage(result.error.message); return }
    setRegistered(result.data); setForm(initialState)
  }

  return (
    <AuthLayout
      heading="Request your account."
      blurb="Register to start recording, approving, and reporting on local government assets. Your role and access are confirmed by an administrator."
    >
      <h1 className="text-2xl font-bold text-charcoal">Sign up</h1>
      <p className="mt-4 rounded-lg border border-line bg-mist p-3 text-xs leading-5 text-charcoal"><strong className="text-navy">Account request.</strong> Use non-personal details. Accounts use the shared password <code className="font-semibold">{DEMO_PASSWORD}</code>. No personal passwords are stored. Do not use personal credentials. Requests are stored in this browser.</p>
      {!options && !loadError && <p className="mt-4 text-sm text-gray" role="status">Loading municipalities and departments…</p>}
      {loadError && <p className="mt-4 text-sm text-red-700" role="alert">{loadError} <button type="button" className="font-semibold text-navy underline" onClick={() => { setLoadError(''); setAttempt((value) => value + 1) }}>Retry</button></p>}

      {registered ? <section className="mt-8 rounded-xl border border-line bg-mist p-5" role="status">
        <h2 className="font-bold text-navy">Account request saved — Pending</h2>
        <p className="mt-3 text-sm leading-6 text-charcoal">Your request for <strong>{registered.username}</strong> is stored in this browser. A {registered.municipalityId === 'botolan' ? 'Botolan' : 'San Antonio'} Administrator must approve it in Users before you can sign in. No session was created.</p>
        <Link to="/login" className="mt-4 inline-block rounded-full bg-navy px-6 py-2 text-sm font-semibold text-white">Return to sign in</Link>
        <button type="button" className="mt-3 block text-sm font-semibold text-navy underline" onClick={() => setRegistered(null)}>Submit another request</button>
      </section> : <form onSubmit={(event) => { void handleSubmit(event) }} noValidate className="mt-8" aria-busy={busy}>
        <fieldset disabled={busy || !options}>
        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
          <TextField
            wrapperClassName="sm:col-span-2"
            label="Full name"
            name="fullName"
            autoComplete="name"
            placeholder="Municipal Officer"
            value={form.fullName}
            onChange={update('fullName')}
            error={errors.fullName}
          />
          <TextField wrapperClassName="sm:col-span-2" label="Username" name="username" autoComplete="username" placeholder="municipal.officer" value={form.username} onChange={update('username')} error={errors.username} />
          <TextField
            wrapperClassName="sm:col-span-2"
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="name@example.com"
            value={form.email}
            onChange={update('email')}
            error={errors.email}
          />
          <SelectField
            label="Municipality"
            name="municipalityId"
            placeholder="Select municipality"
            options={options?.municipalities.map((municipality) => ({ value: municipality.id, label: municipality.name })) ?? []}
            value={form.municipalityId}
            onChange={update('municipalityId')}
            error={errors.municipalityId}
          />
          <SelectField label="Department" name="departmentId" placeholder="Select department" disabled={!form.municipalityId} options={options?.departments.filter((department) => department.municipalityId === form.municipalityId).map((department) => ({ value: department.id, label: department.name })) ?? []} value={form.departmentId} onChange={update('departmentId')} error={errors.departmentId} />
          <SelectField
            label="Requested role"
            name="requestedRole"
            placeholder="Select role"
            options={roleList.filter((role) => role !== 'administrator').map((role) => ({ value: role, label: roleLabels[role] }))}
            value={form.requestedRole}
            onChange={update('requestedRole')}
            error={errors.requestedRole}
          />
          <TextField
            label="Account password"
            name="demoPassword"
            type="password"
            autoComplete="off"
            placeholder={DEMO_PASSWORD}
            value={form.demoPassword}
            onChange={update('demoPassword')}
            error={errors.demoPassword}
          />
          <TextField
            label="Confirm account password"
            name="confirmDemoPassword"
            type="password"
            autoComplete="off"
            placeholder="Repeat the shared password"
            value={form.confirmDemoPassword}
            onChange={update('confirmDemoPassword')}
            error={errors.confirmDemoPassword}
          />
        </div>
        <label className="mt-6 flex items-start gap-2 text-xs leading-5 text-charcoal"><input type="checkbox" checked={form.demoAcknowledged} onChange={(event) => setForm((previous) => ({ ...previous, demoAcknowledged: event.target.checked }))} className="mt-1 accent-navy" aria-describedby={errors.demoAcknowledged ? 'demo-ack-error' : undefined} aria-invalid={!!errors.demoAcknowledged} />I am using non-personal details and understand account requests are stored in this browser.</label>
        {errors.demoAcknowledged && <p id="demo-ack-error" className="mt-1 text-xs text-red-700">{errors.demoAcknowledged}</p>}
        {message && <p className="mt-4 text-sm text-red-700" role="alert">{message}</p>}
        {!message && Object.keys(errors).length > 0 && <p className="mt-4 text-sm text-red-700" role="alert">Review the highlighted fields before submitting.</p>}

        <div className="mt-8 flex items-center justify-between gap-4">
          <p className="text-sm text-charcoal">
            Have an account?{' '}
            <Link
              to="/login"
              className="font-semibold text-navy hover:underline"
            >
              Sign in
            </Link>
          </p>
          <button
            type="submit"
            className="flex items-center gap-3 rounded-full bg-navy px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-navy-dark"
          >
            {busy ? 'Submitting…' : 'Request account'}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
        </fieldset>
      </form>}

      <p className="mt-10 border-t border-line pt-5 text-center text-xs leading-5 text-gray">
        Authorized municipal personnel only. Access to records depends on your
        assigned role and municipality.
      </p>
    </AuthLayout>
  )
}
