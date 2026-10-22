import { Construction } from 'lucide-react'
import type { NavItem } from '../../config/navigation'
import { lazy, Suspense } from 'react'

const DemoDataTools = lazy(() => import('../../features/data/DemoDataTools'))
const AccountRequests = lazy(() => import('../../features/auth/AccountRequests'))

/** Existing module shell; System Settings currently exposes Phase 02 demo data tools. */
export default function ModulePage({ item }: { item: NavItem }) {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="rounded-2xl border border-line bg-white p-6 sm:p-8">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-mist text-navy">
            <item.icon className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray">
              {item.group}
            </p>
            <h2 className="text-xl font-extrabold text-navy sm:text-2xl">
              {item.label}
            </h2>
          </div>
        </div>
        <p className="mt-4 text-sm text-charcoal sm:text-base">
          {item.description}
        </p>

        {item.path === 'users' ? (
          <Suspense fallback={<p className="mt-8 text-sm text-gray" role="status">Loading account requests…</p>}><AccountRequests /></Suspense>
        ) : item.path === 'settings' ? (
          <Suspense fallback={<p className="mt-8 text-sm text-gray" role="status">Loading demo data tools…</p>}>
            <DemoDataTools />
          </Suspense>
        ) : <div className="mt-8 flex flex-col items-center rounded-xl border border-dashed border-line bg-mist px-6 py-14 text-center">
          <Construction className="h-8 w-8 text-gray" strokeWidth={1.6} />
          <p className="mt-3 text-sm font-semibold text-navy">
            This module is not built yet.
          </p>
          <p className="mt-1 max-w-sm text-xs text-charcoal/80">
            The page is routed and role-protected. The real screen will go here.
          </p>
        </div>}
      </div>
    </div>
  )
}
