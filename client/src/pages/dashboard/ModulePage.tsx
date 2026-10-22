import { Construction } from 'lucide-react'
import type { NavItem } from '../../config/navigation'
import { lazy, Suspense } from 'react'

const AccountingModule = lazy(() => import('../../features/accounting/AccountingModule'))
const ConstructionModule = lazy(() => import('../../features/construction/ConstructionModule'))
const BudgetModule = lazy(() => import('../../features/budget/BudgetModule'))
const ApprovalManagementModule = lazy(() => import('../../features/approvals/ApprovalManagementModule'))
const AssetRegistryModule = lazy(() => import('../../features/assets/AssetRegistryModule'))
const AdministratorModule = lazy(() => import('../../features/administration/AdministratorModule'))

/** Admin destinations are complete; unfinished business modules keep their clear placeholder. */
export default function ModulePage({ item }: { item: NavItem }) {
  if (item.path === 'budget' || item.path === 'accounting-documents') return <Suspense fallback={<p role="status">Loading document processing...</p>}><BudgetModule /></Suspense>
  if (item.path === 'construction-projects' || item.path === 'engineering') return <Suspense fallback={<p role="status">Loading construction projects...</p>}><ConstructionModule key={item.path} module={item.path} /></Suspense>
  if (item.path === 'recognition' || item.path === 'depreciation') return <Suspense fallback={<p role="status">Loading accounting...</p>}><AccountingModule key={item.path} module={item.path} /></Suspense>
  if (item.path === 'approvals' || item.path === 'approvals/returned' || item.path === 'approvals/history' || item.path.startsWith('approvals/')) return (
    <Suspense fallback={<p role="status" className="text-sm text-gray">Loading approvals…</p>}>
      <ApprovalManagementModule key={item.path} module={item.path} />
    </Suspense>
  )
  if (item.path === 'assets' || item.path === 'asset-registration') return (
    <Suspense fallback={<p role="status" className="text-sm text-gray">Loading PPE registry…</p>}>
      <AssetRegistryModule module={item.path} />
    </Suspense>
  )
  if ((['users','account-requests','departments','permissions','settings','audit-trail'] as const).some((path) => path === item.path)) return (
    <Suspense fallback={<p className="text-sm text-gray" role="status">Loading administration…</p>}>
      <AdministratorModule module={item.path as 'users' | 'account-requests' | 'departments' | 'permissions' | 'settings' | 'audit-trail'} />
    </Suspense>
  )
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

        <div className="mt-8 flex flex-col items-center rounded-xl border border-dashed border-line bg-mist px-6 py-14 text-center">
          <Construction className="h-8 w-8 text-gray" strokeWidth={1.6} />
          <p className="mt-3 text-sm font-semibold text-navy">
            This module is not built yet.
          </p>
          <p className="mt-1 max-w-sm text-xs text-charcoal/80">
            The page is routed and role-protected. The real screen will go here.
          </p>
        </div>
      </div>
    </div>
  )
}
