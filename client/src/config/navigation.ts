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
import type { Role } from './roles'

export type NavItem = {
  /** Path under /dashboard. Empty string is the dashboard home. */
  path: string
  label: string
  description: string
  icon: LucideIcon
  group: string
  roles: Role[]
}

const all: Role[] = [
  'administrator',
  'property_officer',
  'accounting_officer',
  'inventory_personnel',
  'approving_officer',
  'auditor',
]

/**
 * Single source of truth for the sidebar, the routes, and the role guard.
 * To change who can see a module, edit its `roles` array.
 * Order here is the order shown in the sidebar.
 */
export const navItems: NavItem[] = [
  {
    path: '',
    label: 'Dashboard',
    description: 'Overview of your tasks and modules.',
    icon: LayoutDashboard,
    group: 'Overview',
    roles: all,
  },

  // Administration
  {
    path: 'users',
    label: 'Users',
    description: 'Create, approve, and manage user accounts.',
    icon: Users,
    group: 'Administration',
    roles: ['administrator'],
  },
  {
    path: 'departments',
    label: 'Departments',
    description: 'Manage departments and offices.',
    icon: Building2,
    group: 'Administration',
    roles: ['administrator'],
  },
  {
    path: 'permissions',
    label: 'Roles & Permissions',
    description: 'Configure what each role can access and do.',
    icon: KeyRound,
    group: 'Administration',
    roles: ['administrator'],
  },
  {
    path: 'settings',
    label: 'System Settings',
    description: 'Configure system-wide settings.',
    icon: Settings,
    group: 'Administration',
    roles: ['administrator'],
  },

  // Assets
  {
    path: 'assets',
    label: 'Assets',
    description:
      'Register and view property, plant, and equipment records.',
    icon: Package,
    group: 'Assets',
    roles: [
      'property_officer',
      'accounting_officer',
      'inventory_personnel',
      'auditor',
    ],
  },
  {
    path: 'construction-projects',
    label: 'Construction Projects',
    description: 'Enter and monitor construction in progress.',
    icon: HardHat,
    group: 'Assets',
    roles: ['property_officer'],
  },

  // Asset lifecycle (Property Officer)
  {
    path: 'discrepancies',
    label: 'Inventory Discrepancies',
    description: 'Record differences found during inventory.',
    icon: ClipboardList,
    group: 'Lifecycle Requests',
    roles: ['property_officer'],
  },
  {
    path: 'transfers',
    label: 'Transfers',
    description: 'Initiate and track asset transfers.',
    icon: ArrowLeftRight,
    group: 'Lifecycle Requests',
    roles: ['property_officer'],
  },
  {
    path: 'maintenance',
    label: 'Maintenance',
    description: 'Initiate and track maintenance requests.',
    icon: Wrench,
    group: 'Lifecycle Requests',
    roles: ['property_officer'],
  },
  {
    path: 'disposal',
    label: 'Disposal Requests',
    description: 'Initiate and track disposal requests.',
    icon: Trash2,
    group: 'Lifecycle Requests',
    roles: ['property_officer'],
  },

  // Accounting
  {
    path: 'recognition',
    label: 'Recognition & Cost',
    description: 'Confirm asset recognition and cost settings.',
    icon: SlidersHorizontal,
    group: 'Accounting',
    roles: ['accounting_officer'],
  },
  {
    path: 'depreciation',
    label: 'Depreciation',
    description: 'Calculate and review depreciation.',
    icon: TrendingDown,
    group: 'Accounting',
    roles: ['accounting_officer'],
  },
  {
    path: 'cip-costs',
    label: 'CIP Costs',
    description: 'Record construction-in-progress costs.',
    icon: Landmark,
    group: 'Accounting',
    roles: ['accounting_officer'],
  },
  {
    path: 'disposal-review',
    label: 'Disposal Review',
    description: 'Review the accounting impact of disposals.',
    icon: Calculator,
    group: 'Accounting',
    roles: ['accounting_officer'],
  },
  {
    path: 'reconciliation',
    label: 'Reconciliation',
    description: 'Reconcile asset records with the books.',
    icon: Scale,
    group: 'Accounting',
    roles: ['accounting_officer'],
  },

  // Inventory
  {
    path: 'physical-inventory',
    label: 'Physical Inventory',
    description: 'Conduct and record physical inventory counts.',
    icon: ClipboardList,
    group: 'Inventory',
    roles: ['inventory_personnel'],
  },
  {
    path: 'asset-monitoring',
    label: 'Asset Monitoring',
    description: 'Locate and inspect assets.',
    icon: MapPin,
    group: 'Inventory',
    roles: ['inventory_personnel'],
  },

  // Approvals
  {
    path: 'approvals/registrations',
    label: 'Registrations',
    description: 'Review and approve asset registrations.',
    icon: CheckCircle2,
    group: 'Approvals',
    roles: ['approving_officer'],
  },
  {
    path: 'approvals/capitalization',
    label: 'Capitalization',
    description: 'Review and approve capitalization.',
    icon: FileCheck,
    group: 'Approvals',
    roles: ['approving_officer'],
  },
  {
    path: 'approvals/corrections',
    label: 'Corrections',
    description: 'Review and approve record corrections.',
    icon: PencilLine,
    group: 'Approvals',
    roles: ['approving_officer'],
  },
  {
    path: 'approvals/lifecycle',
    label: 'Lifecycle Transactions',
    description:
      'Review and approve transfers, maintenance, and disposals.',
    icon: Repeat,
    group: 'Approvals',
    roles: ['approving_officer'],
  },

  // Reports & audit
  {
    path: 'reports',
    label: 'Reports',
    description: 'Generate and view asset and accounting reports.',
    icon: FileText,
    group: 'Reports & Audit',
    roles: ['accounting_officer', 'approving_officer', 'auditor'],
  },
  {
    path: 'audit-trail',
    label: 'Audit Trail',
    description: 'View the history of changes and transactions.',
    icon: History,
    group: 'Reports & Audit',
    roles: ['administrator', 'auditor'],
  },
]

export type NavGroup = { group: string; items: NavItem[] }

export function getNavGroups(role: Role): NavGroup[] {
  const groups: NavGroup[] = []
  for (const item of navItems) {
    if (!item.roles.includes(role)) continue
    const existing = groups.find((g) => g.group === item.group)
    if (existing) existing.items.push(item)
    else groups.push({ group: item.group, items: [item] })
  }
  return groups
}

export function hrefFor(item: NavItem) {
  return item.path ? `/dashboard/${item.path}` : '/dashboard'
}
