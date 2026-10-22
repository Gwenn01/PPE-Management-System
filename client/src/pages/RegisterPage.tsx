import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import AuthLayout from '../components/auth/AuthLayout'
import TextField from '../components/auth/TextField'
import SelectField from '../components/auth/SelectField'
import { municipalities, requestableRoles } from '../data/options'

type FormState = {
  fullName: string
  email: string
  municipality: string
  role: string
  password: string
  confirmPassword: string
}

type Errors = Partial<Record<keyof FormState, string>>

const initialState: FormState = {
  fullName: '',
  email: '',
  municipality: '',
  role: '',
  password: '',
  confirmPassword: '',
}

function validate(form: FormState): Errors {
  const errors: Errors = {}
  if (!form.fullName.trim()) errors.fullName = 'Enter your full name.'
  if (!form.email.trim()) errors.email = 'Enter your email.'
  else if (!/^\S+@\S+\.\S+$/.test(form.email))
    errors.email = 'Enter a valid email address.'
  if (!municipalities.some((municipality) => municipality === form.municipality)) errors.municipality = 'Select a municipality.'
  if (!requestableRoles.includes(form.role)) errors.role = 'Select a role.'
  if (form.password.length < 8)
    errors.password = 'Use at least 8 characters.'
  if (form.confirmPassword !== form.password)
    errors.confirmPassword = 'Passwords do not match.'
  return errors
}

export default function RegisterPage() {
  const [form, setForm] = useState<FormState>(initialState)
  const [errors, setErrors] = useState<Errors>({})

  const update =
    (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const next = validate(form)
    setErrors(next)
    if (Object.keys(next).length > 0) return

    // Future phase: submit an account request through a typed mock service.
  }

  return (
    <AuthLayout
      heading="Request your account."
      blurb="Register to start recording, approving, and reporting on local government assets. Your role and access are confirmed by an administrator."
    >
      <h1 className="text-2xl font-bold text-charcoal">Sign up</h1>

      <form onSubmit={handleSubmit} noValidate className="mt-8">
        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
          <TextField
            wrapperClassName="sm:col-span-2"
            label="Full name"
            name="fullName"
            autoComplete="name"
            placeholder="Juan Dela Cruz"
            value={form.fullName}
            onChange={update('fullName')}
            error={errors.fullName}
          />
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
            name="municipality"
            placeholder="Select municipality"
            options={municipalities}
            value={form.municipality}
            onChange={update('municipality')}
            error={errors.municipality}
          />
          <SelectField
            label="Role"
            name="role"
            placeholder="Select role"
            options={requestableRoles}
            value={form.role}
            onChange={update('role')}
            error={errors.role}
          />
          <TextField
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={form.password}
            onChange={update('password')}
            error={errors.password}
          />
          <TextField
            label="Confirm password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            placeholder="Repeat your password"
            value={form.confirmPassword}
            onChange={update('confirmPassword')}
            error={errors.confirmPassword}
          />
        </div>

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
            Sign up
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </form>

      <p className="mt-10 border-t border-line pt-5 text-center text-xs leading-5 text-gray">
        Authorized municipal personnel only. Access to records depends on your
        assigned role and municipality.
      </p>
    </AuthLayout>
  )
}
