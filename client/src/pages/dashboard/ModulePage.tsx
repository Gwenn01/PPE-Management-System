const ReportsModule = lazy(() => import('../../features/reports/ReportsModule'))
const AuditorModule = lazy(() => import('../../features/reports/AuditorModule'))
const ReconciliationModule = lazy(() => import('../../features/reconciliation/ReconciliationModule'))
const LifecycleModule = lazy(() => import('../../features/lifecycle/LifecycleModule'))
import { useAuthenticatedUser } from '../../hooks/useAuthenticatedUser'

import type { NavItem } from '../../config/navigation'
import { lazy, Suspense } from 'react'

const AccountingModule = lazy(() => import('../../features/accounting/AccountingModule'))
const ConstructionModule = lazy(() => import('../../features/construction/ConstructionModule'))
const BudgetModule = lazy(() => import('../../features/budget/BudgetModule'))
const InventoryModule = lazy(() => import('../../features/inventory/InventoryModule'))
const DiscrepancyModule = lazy(() => import('../../features/inventory/DiscrepancyModule'))
const CIPModule = lazy(() => import('../../features/accounting/CIPModule'))
const ApprovalManagementModule = lazy(() => import('../../features/approvals/ApprovalManagementModule'))
const AssetRegistryModule = lazy(() => import('../../features/assets/AssetRegistryModule'))
const AdministratorModule = lazy(() => import('../../features/administration/AdministratorModule'))

function AuditTrailByRole() {
  const { session } = useAuthenticatedUser()
  return session.user.role === 'auditor' ? <AuditorModule /> : <AdministratorModule module="audit-trail" />
}

/** Dispatch configured routes to their implemented modules. */
export default function ModulePage({ item }: { item: NavItem }) {
  if (['transfers', 'maintenance', 'disposal', 'disposal-review'].includes(item.path)) return <Suspense fallback={<p role="status">Loading lifecycle management...</p>}><LifecycleModule key={item.path} module={item.path} /></Suspense>
  if (item.path === 'physical-inventory' || item.path === 'asset-monitoring') return <Suspense fallback={<p role="status">Loading inventory...</p>}><InventoryModule /></Suspense>
  if (item.path === 'discrepancies') return <Suspense fallback={<p role="status">Loading investigations...</p>}><DiscrepancyModule /></Suspense>
  if (item.path === 'cip-costs') return <Suspense fallback={<p role="status">Loading CIP accounting...</p>}><CIPModule /></Suspense>
  if (item.path === 'reconciliation') return <Suspense fallback={<p role="status">Loading reconciliation...</p>}><ReconciliationModule /></Suspense>
  if (item.path === 'reports') return <Suspense fallback={<p role="status">Loading reports...</p>}><ReportsModule /></Suspense>
  if (item.path === 'audit-trail') return <Suspense fallback={<p role="status">Loading audit history...</p>}><AuditTrailByRole /></Suspense>
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
  if ((['users','account-requests','departments','permissions','settings'] as const).some((path) => path === item.path)) return (
    <Suspense fallback={<p className="text-sm text-gray" role="status">Loading administration…</p>}>
      <AdministratorModule module={item.path as 'users' | 'account-requests' | 'departments' | 'permissions' | 'settings' | 'audit-trail'} />
    </Suspense>
  )
  return <p role="alert">This destination is unavailable. Return to the dashboard and select a configured module.</p>
}
