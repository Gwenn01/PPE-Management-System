export type Role =
  | 'administrator'
  | 'property_officer'
  | 'accounting_officer'
  | 'inventory_personnel'
  | 'approving_officer'
  | 'auditor'

export const roleList: Role[] = [
  'administrator',
  'property_officer',
  'accounting_officer',
  'inventory_personnel',
  'approving_officer',
  'auditor',
]

export const roleLabels: Record<Role, string> = {
  administrator: 'Administrator',
  property_officer: 'Property Officer',
  accounting_officer: 'Accounting Officer',
  inventory_personnel: 'Inventory Personnel',
  approving_officer: 'Approving Officer',
  auditor: 'Auditor',
}

export const roleResponsibilities: Record<Role, string> = {
  administrator: 'Manages users, departments, settings, and permissions.',
  property_officer:
    'Registers assets, enters and monitors construction projects, records inventory discrepancies, and initiates transfers, maintenance, and disposal requests.',
  accounting_officer:
    'Confirms recognition and cost settings, calculates depreciation, records CIP costs, reviews disposal impact, and performs reconciliation.',
  inventory_personnel:
    'Conducts physical inventory and monitoring (locating and inspecting assets).',
  approving_officer:
    'Reviews and approves registrations, capitalization, corrections, and lifecycle transactions.',
  auditor: 'Read-only access to records, reports, and audit trails.',
}

// Static sample users, one per role, until the backend provides the real user.
export const staticUsers: Record<Role, { name: string; email: string }> = {
  administrator: { name: 'Alex Administrator', email: 'admin@example.com' },
  property_officer: { name: 'Pia Property', email: 'property@example.com' },
  accounting_officer: { name: 'Andy Accounting', email: 'accounting@example.com' },
  inventory_personnel: { name: 'Ian Inventory', email: 'inventory@example.com' },
  approving_officer: { name: 'Ana Approver', email: 'approver@example.com' },
  auditor: { name: 'Aldo Auditor', email: 'auditor@example.com' },
}
