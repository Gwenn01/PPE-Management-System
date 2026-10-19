import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Lock } from 'lucide-react'
import AuthLayout from '../components/auth/AuthLayout'
import TextField from '../components/auth/TextField'

type Errors = { login?: string; password?: string }

export default function LoginPage() {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [errors, setErrors] = useState<Errors>({})

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    const next: Errors = {}
    if (!login.trim()) next.login = 'Enter your email or username.'
    if (!password) next.password = 'Enter your password.'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    // TODO: call the login API (axios) with { login, password, remember },
    // then redirect to the dashboard for the user's role and municipality.
  }

  return (
    <AuthLayout
      heading="Welcome back."
      blurb="Sign in to manage property, plant, and equipment records for your municipality."
    >
      <h1 className="text-2xl font-bold text-charcoal">Sign in</h1>

      <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-7">
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
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Enter your password"
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
            Remember me
          </label>
          <Link
            to="/forgot-password"
            className="flex items-center gap-1.5 text-xs font-semibold text-navy hover:underline"
          >
            <Lock className="h-3.5 w-3.5" />
            Forgot password?
          </Link>
        </div>

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
            Sign in
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </form>

      <p className="mt-12 border-t border-line pt-5 text-center text-xs leading-5 text-gray">
        Authorized municipal personnel only. Access to records depends on your
        assigned role and municipality.
      </p>
    </AuthLayout>
  )
}
