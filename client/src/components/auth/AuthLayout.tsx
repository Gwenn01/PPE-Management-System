import { ArrowLeft, Landmark } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

type AuthLayoutProps = {
  heading: string
  blurb: string
  children: ReactNode
  contentClassName?: string
}

export default function AuthLayout({
  heading,
  blurb,
  children,
  contentClassName = '',
}: AuthLayoutProps) {
  return (
    <main className="auth-screen min-h-dvh w-full bg-white md:grid md:min-h-dvh md:grid-cols-[0.72fr_1.28fr] lg:h-dvh lg:min-h-0 lg:grid-cols-[0.9fr_1.1fr] lg:grid-rows-[minmax(0,1fr)]">
        {/* Left: image panel */}
        <aside className="auth-visual-panel relative flex min-h-[230px] flex-col justify-between overflow-hidden bg-navy p-6 text-white sm:p-8 md:min-h-0 lg:rounded-tr-[96px] lg:p-10">
          <img
            src="/iamges/auth/auth.jpg"
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-navy/70" />

          <Link
            to="/"
            className="relative z-10 inline-flex w-fit items-center gap-2 text-sm text-white/80 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>

          <div className="relative z-10 my-8 max-w-sm md:my-4 lg:my-0">
            <h2 className="text-3xl font-extrabold leading-tight sm:text-4xl">
              {heading}
            </h2>
            <p className="mt-3 text-sm leading-6 text-white/80 sm:text-base">
              {blurb}
            </p>
          </div>

          <p className="relative z-10 hidden text-xs leading-5 text-white/60 lg:block">
            © 2026 Accounting Information System for PPE Management in
            Zambales. All rights reserved.
          </p>
        </aside>

        {/* Right: form panel */}
        <section className="auth-form-shell min-h-0 bg-navy lg:overflow-hidden">
          <div className="auth-form-panel flex min-h-0 flex-col bg-white px-6 py-8 sm:px-10 md:px-8 lg:h-full lg:overflow-y-auto lg:rounded-bl-[96px] lg:px-12 lg:py-6">
            <Link
              to="/"
              className="mx-auto flex items-center gap-3 text-navy"
              aria-label="PPE Management System home"
            >
              <Landmark className="h-8 w-8" strokeWidth={1.8} />
              <span className="text-lg font-bold">PPE Management System</span>
            </Link>

            <div className={`auth-form-content mx-auto mt-6 w-full max-w-md ${contentClassName}`}>{children}</div>
          </div>
        </section>
    </main>
  )
}
