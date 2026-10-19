import { ArrowLeft, Landmark } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

type AuthLayoutProps = {
  heading: string
  blurb: string
  children: ReactNode
}

export default function AuthLayout({
  heading,
  blurb,
  children,
}: AuthLayoutProps) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-mist p-3 sm:p-6">
      <div className="grid w-full max-w-[1100px] overflow-hidden rounded-3xl bg-white shadow-[0_24px_60px_-24px_rgba(31,48,94,0.35)] lg:min-h-[700px] lg:grid-cols-[1fr_1.1fr]">
        {/* Left: image panel */}
        <aside className="relative flex min-h-[260px] flex-col justify-between overflow-hidden bg-navy p-6 text-white sm:p-8 lg:rounded-tr-[96px] lg:p-10">
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

          <div className="relative z-10 my-8 max-w-sm lg:my-0">
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
        <div className="relative">
          {/* navy fill that shows through the rounded bottom-left corner */}
          <div className="absolute bottom-0 left-0 hidden h-24 w-24 bg-navy lg:block" />
          <div className="relative flex h-full flex-col justify-center bg-white px-6 py-10 sm:px-12 lg:rounded-bl-[96px] lg:px-14 lg:py-12">
            <Link
              to="/"
              className="mx-auto flex items-center gap-3 text-navy"
              aria-label="PPE Management System home"
            >
              <Landmark className="h-8 w-8" strokeWidth={1.8} />
              <span className="text-lg font-bold">PPE Management System</span>
            </Link>

            <div className="mx-auto mt-10 w-full max-w-md">{children}</div>
          </div>
        </div>
      </div>
    </main>
  )
}
