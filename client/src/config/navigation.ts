import {
  Building2,
  Calculator,
  CheckCircle2,
  ClipboardList,
  FileCheck,
  FileText,
  HardHat,
  History,
  KeyRound,
  Landmark,
  LayoutDashboard,
  MapPin,
  Package,
  PencilLine,
  Repeat,
  Scale,
  Settings,
  SlidersHorizontal,
  Trash2,
  TrendingDown,
  Users,
  Wrench,
  ArrowLeftRight,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AccessContext, AccessIdentity, PermissionRequirement, PermissionRule } from '../domain/permissions.js'
import { canAccess } from '../domain/permissions.js'

export type NavItem = {
  /** Path under /dashboard. Empty string is the dashboard home. */
  path: string
  label: string
  description: string
  icon: LucideIcon
  group: string
  permission: PermissionRequirement
}

/**
 * Shared route metadata for sidebar, dashboard cards and permission guards.
 * Role/action grants live exclusively in domain/permissions.ts.
 * Order here is the order shown in the sidebar.
 */
export const dashboardRoute: NavItem = {
  path: '',
  label: 'Dashboard',
  description: 'Overview of your tasks and modules.',
  icon: LayoutDashboard,
  group: 'Overview',
  permission: { resource: 'dashboard', action: 'read' },
}

export const navItems: NavItem[] = [
  dashboardRoute,
  // Administration
  {
    path: 'users',
    label: 'Users',
    description: 'Create, approve, and manage user accounts.',
    icon: Users,
    group: 'Administration',
    permission: { resource: 'users', action: 'read' },
  },
  {
    path: 'account-requests',
    label: 'Account Requests',
    description: 'Approve and reject pending municipal registration requests.',
    icon: CheckCircle2,
    group: 'Administration',
    permission: { resource: 'users', action: 'read' },
  },
  {
    path: 'departments',
    label: 'Departments',
    description: 'Manage departments and offices.',
    icon: Building2,
    group: 'Administration',
    permission: { resource: 'departments', action: 'read' },
  },
  {
    path: 'permissions',
    label: 'Roles & Permissions',
    description: 'Configure what each role can access and do.',
    icon: KeyRound,
    group: 'Administration',
    permission: { resource: 'permissions', action: 'read' },
  },
  {
    path: 'settings',
    label: 'System Settings',
    description: 'Configure system-wide settings.',
    icon: Settings,
    group: 'Administration',
    permission: { resource: 'settings', action: 'read' },
  },

  // Assets
  {
    path: 'assets',
    label: 'Assets',
    description:
      'Register and view property, plant, and equipment records.',
    icon: Package,
    group: 'Assets',
    permission: { resource: 'assets', action: 'read' },
  },
  {
    path: 'asset-registration',
    label: 'Asset Registration',
    description: 'Prepare and submit asset registration requests.',
    icon: Package,
    group: 'Assets',
    permission: { resource: 'asset_registrations', action: 'read' },
  },
  {
    path: 'construction-projects',
    label: 'Construction Projects',
    description: 'Enter and monitor construction in progress.',
    icon: HardHat,
    group: 'Assets',
    permission: { resource: 'construction_projects', action: 'read' },
  },
  {
    path: 'engineering',
    label: 'Engineering Documents',
    description: 'Prepare and route construction technical documents.',
    icon: HardHat,
    group: 'Engineering',
    permission: { resource: 'engineering_documents', action: 'read' },
  },
  {
    path: 'budget',
    label: 'Budget Workspace',
    description: 'Review project funding documents for your municipality.',
    icon: Landmark,
    group: 'Budget',
    permission: { resource: 'budget_documents', action: 'read' },
  },

  // Asset lifecycle (Property Officer)
  {
    path: 'discrepancies',
    label: 'Inventory Discrepancies',
    description: 'Record differences found during inventory.',
    icon: ClipboardList,
    group: 'Lifecycle Requests',
    permission: { resource: 'inventory_discrepancies', action: 'read' },
  },
  {
    path: 'transfers',
    label: 'Transfers',
    description: 'Initiate and track asset transfers.',
    icon: ArrowLeftRight,
    group: 'Lifecycle Requests',
    permission: { resource: 'asset_transfers', action: 'read' },
  },
  {
    path: 'maintenance',
    label: 'Maintenance',
    description: 'Initiate and track maintenance requests.',
    icon: Wrench,
    group: 'Lifecycle Requests',
    permission: { resource: 'maintenance_requests', action: 'read' },
  },
  {
    path: 'disposal',
    label: 'Disposal Requests',
    description: 'Initiate and track disposal requests.',
    icon: Trash2,
    group: 'Lifecycle Requests',
    permission: { resource: 'disposal_requests', action: 'read' },
  },

  // Accounting
  {
    path: 'accounting-documents',
    label: 'Received Project Documents',
    description: 'Receive or return reviewed Budget document packets; Treasury remains an external demo stage.',
    icon: Landmark,
    group: 'Accounting',
    permission: { resource: 'cip_costs', action: 'read' },
  },
  {
    path: 'recognition',
    label: 'Recognition & Cost',
    description: 'Confirm asset recognition and cost settings.',
    icon: SlidersHorizontal,
    group: 'Accounting',
    permission: { resource: 'recognition', action: 'read' },
  },
  {
    path: 'depreciation',
    label: 'Depreciation',
    description: 'Calculate and review depreciation.',
    icon: TrendingDown,
    group: 'Accounting',
    permission: { resource: 'depreciation', action: 'read' },
  },
  {
    path: 'cip-costs',
    label: 'CIP Costs',
    description: 'Record construction-in-progress costs.',
    icon: Landmark,
    group: 'Accounting',
    permission: { resource: 'cip_costs', action: 'read' },
  },
  {
    path: 'disposal-review',
    label: 'Disposal Review',
    description: 'Review the accounting impact of disposals.',
    icon: Calculator,
    group: 'Accounting',
    permission: { resource: 'disposal_review', action: 'read' },
  },
  {
    path: 'reconciliation',
    label: 'Reconciliation',
    description: 'Reconcile asset records with the books.',
    icon: Scale,
    group: 'Accounting',
    permission: { resource: 'reconciliations', action: 'read' },
  },

  // Inventory
  {
    path: 'physical-inventory',
    label: 'Physical Inventory',
    description: 'Conduct and record physical inventory counts.',
    icon: ClipboardList,
    group: 'Inventory',
    permission: { resource: 'inventory_sessions', action: 'read' },
  },
  {
    path: 'asset-monitoring',
    label: 'Asset Monitoring',
    description: 'Locate and inspect assets.',
    icon: MapPin,
    group: 'Inventory',
    permission: { resource: 'inventory_checks', action: 'read' },
  },

  // Centralized Phase 07 queue. Existing type-specific paths remain deep-link compatible.
  { path: 'approvals', label: 'Pending Approvals', description: 'Review pending requests across all seven authorization types.', icon: CheckCircle2, group: 'Approvals', permission: { resource: 'registration_approvals', action: 'read' } },
  { path: 'approvals/returned', label: 'Returned Requests', description: 'See requests waiting for corrections.', icon: Repeat, group: 'Approvals', permission: { resource: 'registration_approvals', action: 'read' } },
  { path: 'approvals/history', label: 'Approval History', description: 'Inspect completed and returned decisions.', icon: History, group: 'Approvals', permission: { resource: 'registration_approvals', action: 'read' } },
  // Approvals
  {
    path: 'approvals/registrations',
    label: 'Registrations',
    description: 'Review and approve asset registrations.',
    icon: CheckCircle2,
    group: 'Approvals',
    permission: { resource: 'registration_approvals', action: 'read' },
  },
  {
    path: 'approvals/capitalization',
    label: 'Capitalization',
    description: 'Review and approve capitalization.',
    icon: FileCheck,
    group: 'Approvals',
    permission: { resource: 'capitalization_approvals', action: 'read' },
  },
  {
    path: 'approvals/corrections',
    label: 'Corrections',
    description: 'Review and approve record corrections.',
    icon: PencilLine,
    group: 'Approvals',
    permission: { resource: 'correction_approvals', action: 'read' },
  },
  {
    path: 'approvals/lifecycle',
    label: 'Lifecycle Transactions',
    description:
      'Review and approve transfers, maintenance, and disposals.',
    icon: Repeat,
    group: 'Approvals',
    permission: { resource: 'lifecycle_approvals', action: 'read' },
  },

  // Reports & audit
  {
    path: 'reports',
    label: 'Reports',
    description: 'Generate and view asset and accounting reports.',
    icon: FileText,
    group: 'Reports & Audit',
    permission: { resource: 'reports', action: 'read' },
  },
  {
    path: 'audit-trail',
    label: 'Audit Trail',
    description: 'View the history of changes and transactions.',
    icon: History,
    group: 'Reports & Audit',
    permission: { resource: 'audit_logs', action: 'read' },
  },
]

export type NavGroup = { group: string; items: NavItem[] }

export function canAccessRoute(user: AccessIdentity | null, item: NavItem, context: AccessContext, permissions?: readonly PermissionRule[]): boolean {
  return canAccess(user, item.permission, context) && (!permissions || permissions.some((rule) => rule.role === user?.role && rule.scope === 'municipality' && rule.resource === item.permission.resource && rule.action === item.permission.action))
}

export function getNavGroups(user: AccessIdentity, context: AccessContext = user, permissions?: readonly PermissionRule[]): NavGroup[] {
  const groups: NavGroup[] = []
  for (const item of navItems) {
    if (!canAccessRoute(user, item, context, permissions)) continue
    const existing = groups.find((g) => g.group === item.group)
    if (existing) existing.items.push(item)
    else groups.push({ group: item.group, items: [item] })
  }
  return groups
}

export function hrefFor(item: NavItem) {
  return item.path ? `/dashboard/${item.path}` : '/dashboard'
}

