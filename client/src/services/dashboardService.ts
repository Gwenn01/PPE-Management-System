import type { Role } from '../config/roles.js'
import type { EntityMap, EntityName } from '../domain/data.js'
import type { MockDatabase } from '../mock/database.js'
import { database } from '../mock/database.js'
import { authorize } from '../mock/unitOfWork.js'
import type { RequestContext } from './contracts.js'
import { respond } from './errors.js'
import { visibleRecord } from './entityAccess.js'

export interface DashboardMetric {
  id: string
  label: string
  value: number
  format: 'count' | 'currency'
  hint: string
}
export interface DashboardRecord {
  id: string
  title: string
  detail: string
  status: string
  timestamp: string
  href?: string
  actor?: string
  resource?: string
}
export interface DashboardApplicant {
  id: string
  name: string
  role: string
  department: string
  submittedAt: string
  status: 'pending'
}
export interface DashboardAdministrativeEvent {
  id: string
  action: string
  actor: string
  resource: string
  detail: string
  timestamp: string
}
export interface DashboardUserStatus { status: string; count: number }
export interface DashboardDepartmentSummary { id: string; name: string; active: boolean; activeUsers: number }
export interface DashboardPanelItem {
  id: string
  label: string
  detail: string
  value?: number
  total?: number
  format?: 'count' | 'currency'
  status?: string
  timestamp?: string
  href?: string
}
export interface DashboardPanel {
  title: string
  description: string
  kind: 'queue' | 'distribution' | 'progress' | 'timeline'
  items: DashboardPanelItem[]
}
export interface DashboardSnapshot {
  role: Role
  municipalityId: RequestContext['municipalityId']
  metrics: DashboardMetric[]
  recordsTitle: string
  records: DashboardRecord[]
  description: string
  pendingApplicants?: DashboardApplicant[]
  administrativeActivity?: DashboardAdministrativeEvent[]
  userStatuses?: DashboardUserStatus[]
  departmentSummary?: DashboardDepartmentSummary[]
  panels?: { primary: DashboardPanel; secondary: DashboardPanel }
}

const isPending = (status: string) => status === 'submitted' || status === 'under_review'
const isOpen = (status: string) => isPending(status) || status === 'draft' || status === 'returned'
const count = (id: string, label: string, value: number, hint: string): DashboardMetric => ({ id, label, value, hint, format: 'count' })
const currency = (id: string, label: string, value: number, hint: string): DashboardMetric => ({ id, label, value, hint, format: 'currency' })
const record = (id: string, title: string, detail: string, status: string, timestamp: string, href?: string): DashboardRecord => ({ id, title, detail, status, timestamp, ...(href ? { href } : {}) })
const recent = (rows: DashboardRecord[]) => rows.sort((a, b) => b.timestamp.localeCompare(a.timestamp) || a.id.localeCompare(b.id)).slice(0, 60)
const sum = (values: number[]) => values.reduce((total, amount) => total + amount, 0)

/**
 * Dashboard is a deliberately restricted projection, not a generic table reader.
 * A validated, persisted session + dashboard grant is required and every dataset
 * lookup is municipality-local. Raw records from resources the role cannot read
 * are never returned to the caller, even if used to calculate a permitted metric.
 */
export function createDashboardService(storage: MockDatabase = database) {
  return {
    getSnapshot: (context: RequestContext) => respond(() => storage.transaction('r', storage.tables, async (): Promise<DashboardSnapshot> => {
      const actor = await authorize(storage, context, 'dashboard', 'read')
      const role = actor.role
      const scoped = async <K extends Exclude<EntityName, 'municipalities'>>(entity: K): Promise<EntityMap[K][]> => {
        const rows = await storage.entity(entity).where('municipalityId').equals(actor.municipalityId).toArray()
        if (entity !== 'projects' && entity !== 'documentRouting' && entity !== 'cipCosts' && entity !== 'inventorySessions' && entity !== 'inventoryChecks') return rows
        const visible: EntityMap[K][] = []
        for (const row of rows) if (await visibleRecord(storage, actor, entity, row)) visible.push(row)
        return visible
      }
      let metrics: DashboardMetric[] = []
      let records: DashboardRecord[] = []
      let recordsTitle = 'Recent records'
      let description = 'Current municipal records. Totals are calculated from records stored in this browser.'
      let pendingApplicants: DashboardApplicant[] | undefined
      let administrativeActivity: DashboardAdministrativeEvent[] | undefined
      let userStatuses: DashboardUserStatus[] | undefined
      let departmentSummary: DashboardDepartmentSummary[] | undefined
      let panels: DashboardSnapshot['panels']

      switch (role) {
        case 'administrator': {
          const [users, departments, logs] = await Promise.all([scoped('users'), scoped('departments'), scoped('auditLogs')])
          const departmentById = new Map(departments.map((row) => [row.id, row]))
          pendingApplicants = users.filter((row) => row.status === 'pending').sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((row) => ({
            id: row.id,
            name: row.name,
            role: row.role.replaceAll('_', ' '),
            department: row.departmentId ? departmentById.get(row.departmentId)?.name ?? 'Department unavailable' : 'Not assigned',
            submittedAt: row.createdAt,
            status: 'pending',
          }))
          const usersById = new Map(users.map((row) => [row.id, row]))
          administrativeActivity = [...logs].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 6).map((row) => ({
            id: row.id,
            action: row.action.replaceAll('_', ' '),
            actor: usersById.get(row.actorId)?.name ?? row.actorRole.replaceAll('_', ' '),
            resource: row.resource,
            detail: row.reason,
            timestamp: row.occurredAt,
          }))
          userStatuses = (['active', 'pending', 'disabled'] as const).map((status) => ({ status, count: users.filter((row) => row.status === status).length }))
          departmentSummary = departments.filter((row) => row.active).map((row) => ({
            id: row.id,
            name: row.name,
            active: row.active,
            activeUsers: users.filter((user) => user.departmentId === row.id && user.status === 'active').length,
          })).sort((a, b) => b.activeUsers - a.activeUsers || a.name.localeCompare(b.name))
          panels = undefined
          metrics = [
            count('users', 'Total Users', users.length, 'Municipal accounts, all statuses'),
            count('pending', 'Pending Account Registrations', users.filter((row) => row.status === 'pending').length, 'Accounts awaiting review'),
            count('departments', 'Active Departments', departments.filter((row) => row.active).length, 'Currently active departments'),
            count('activity', 'Audit Events', logs.length, 'Recorded municipal audit events'),
          ]
          recordsTitle = 'Recent Administrative Records'
          records = logs.map((row) => ({ ...record(row.id, `${row.action.replaceAll('_', ' ')} · ${row.resource}`, row.reason, row.action, row.occurredAt), actor: usersById.get(row.actorId)?.name ?? row.actorRole.replaceAll('_', ' '), resource: row.resource }))
          records.push(...users.filter((row) => row.status === 'pending').map((row) => ({ ...record(`user-${row.id}`, row.name, `New ${row.role.replaceAll('_', ' ')} account request`, 'pending', row.createdAt, '/dashboard/account-requests'), actor: 'Applicant', resource: 'Account registration' })))
          break
        }
        case 'property_officer': {
          const [assets, registrations, projects, discrepancies, transfers, maintenance, disposals] = await Promise.all([
            scoped('assets'), scoped('registrations'), scoped('projects'), scoped('discrepancies'), scoped('transfers'), scoped('maintenance'), scoped('disposals'),
          ])
          const requests = [...registrations, ...discrepancies, ...transfers, ...maintenance, ...disposals]
          metrics = [
            count('assets', 'Registered Assets', assets.length, 'Registered municipal assets'),
            count('requests', 'Pending Property Requests', requests.filter((row) => isPending(row.workflowStatus)).length, 'Submitted or under review'),
            count('projects', 'Active construction projects', projects.filter((row) => row.projectStatus === 'in_progress').length, 'Projects in progress'),
            count('discrepancies', 'Unresolved Discrepancies', discrepancies.filter((row) => !row.resolvedAt).length, 'Not marked resolved'),
          ]
          recordsTitle = 'Registration and lifecycle requests'
          records = [
            ...registrations.map((row) => record(row.id, row.description, 'Asset registration', row.workflowStatus, row.updatedAt)),
            ...transfers.map((row) => record(row.id, row.reason, 'Asset transfer', row.lifecycle?.stage ?? row.workflowStatus, row.updatedAt, '/dashboard/transfers')),
            ...maintenance.map((row) => record(row.id, row.description, 'Maintenance', row.lifecycle?.stage ?? row.workflowStatus, row.updatedAt, '/dashboard/maintenance')),
            ...discrepancies.map((row) => record(row.id, row.description, 'Inventory correction', row.workflowStatus, row.updatedAt)),
            ...disposals.map((row) => record(row.id, row.reason, 'Disposal', row.lifecycle?.stage ?? row.workflowStatus, row.updatedAt, '/dashboard/disposal')),
          ]
          const portfolio = new Map<string, number>()
          assets.forEach((asset) => portfolio.set(asset.category, (portfolio.get(asset.category) ?? 0) + 1))
          const requestStages = new Map<string, number>()
          requests.forEach((request) => requestStages.set(request.workflowStatus, (requestStages.get(request.workflowStatus) ?? 0) + 1))
          panels = {
            primary: { title: 'Asset Portfolio Distribution', description: 'Registered municipal assets by recorded category.', kind: 'distribution', items: [...portfolio].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([label, value]) => ({ id: `category-${label}`, label, detail: 'Registered assets', value, format: 'count' })) },
            secondary: { title: 'Property Request Pipeline', description: 'Request stages across registration and lifecycle records.', kind: 'distribution', items: [...requestStages].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([label, value]) => ({ id: `request-${label}`, label: label.replaceAll('_', ' '), detail: 'Requests', value, format: 'count' })) },
          }
          break
        }
        case 'accounting_officer': {
          const [registrations, costs, entries, reconciliations] = await Promise.all([
            scoped('registrations'), scoped('cipCosts'), scoped('accountingRecords'), scoped('reconciliations'),
          ])
          // Posted CIP account movements are authoritative; costs are not double-counted.
          const cipBalance = sum(entries.filter((row) => row.kind === 'cip' || ['capitalization', 'adjustment'].includes(row.kind) && row.accountCode === 'DEMO-CIP').map((row) => row.debit - row.credit))
          const depreciation = sum(entries.filter((row) => row.kind === 'depreciation' || ['disposal', 'adjustment'].includes(row.kind) && row.accountCode === 'DEMO-ACCUMULATED-DEPRECIATION').map((row) => row.credit - row.debit))
          metrics = [
            count('recognition', 'Assets Awaiting Recognition', registrations.filter((row) => row.workflowStatus === 'approved' && !row.recognizedAssetId).length, 'Approved registrations not linked to an asset'),
            currency('cip', 'Posted CIP Balance', cipBalance, 'Posted CIP debits minus credits'),
            currency('depreciation', 'Posted Depreciation', depreciation, 'Posted depreciation only; not a forecast'),
            count('reconciliation', 'Open Reconciliations', reconciliations.filter((row) => row.reconciliationSession?.status === 'open' || !row.reconciliationSession && !row.reconciliationCorrection && isOpen(row.workflowStatus)).length, 'Draft, submitted, review or returned'),
          ]
          recordsTitle = 'Recent accounting work'
          records = [
            ...reconciliations.map((row) => record(row.id, `Reconciliation ${row.periodStart} – ${row.periodEnd}`, row.reconciliationCorrection ? 'Reconciliation correction' : 'Accounting reconciliation', row.reconciliationSession?.status ?? row.workflowStatus, row.updatedAt, '/dashboard/reconciliation')),
            ...costs.map((row) => record(row.id, row.description, 'CIP cost', row.workflowStatus, row.updatedAt)),
            ...entries.map((row) => record(row.id, `${row.kind} · ${row.accountCode}`, 'Posted accounting entry', 'posted', row.postingDate)),
          ]
          const grants = await scoped('permissions')
          if (grants.some(g => g.role === role && g.resource === 'disposal_review' && g.action === 'read')) {
            const disposals = (await scoped('disposals')).filter(r => r.lifecycle?.stage === 'accounting_review')
            metrics.push(count('disposal_review', 'Disposals awaiting Accounting review', disposals.length, 'No asset or ledger changes until review, approval and completion'))
            records.push(...disposals.map(r => record(r.id, r.reason, 'Disposal accounting review', 'accounting_review', r.updatedAt, '/dashboard/disposal-review')))
          }
          if (grants.some(g => g.role === role && g.resource === 'cip_costs' && g.action === 'read')) {
            const packets = (await scoped('documentRouting')).filter(r => r.toRole === role && r.assignedUserId === actor.id && !!r.budgetHandoff)
            const projects = await scoped('projects')
            metrics.push(count('capitalization', 'Capitalization requests under review', projects.filter(p => p.capitalization && ['submitted', 'under_review'].includes(p.workflowStatus)).length, 'Prepared construction-to-PPE approvals'))
            records.push(...projects.filter(p => p.capitalization).map(p => record(p.id, p.name, 'CIP capitalization request', p.workflowStatus, p.updatedAt, '/dashboard/cip-costs')))
            metrics.push(count('project_documents', 'Project packets awaiting receipt', packets.filter(r => r.workflowStatus === 'submitted').length, 'Reviewed Budget handoffs; Trust Fund Treasury confirmation is required'))
            records.push(...packets.map(r => record(r.id, projects.find(p => p.id === r.projectId)?.name ?? 'Construction document packet', `Voucher ${r.budgetHandoff!.voucher.reference}`, r.workflowStatus, r.updatedAt, '/dashboard/accounting-documents')))
          }
          const postedByAccount = new Map<string, number>()
          entries.forEach((entry) => postedByAccount.set(entry.accountCode, (postedByAccount.get(entry.accountCode) ?? 0) + entry.debit - entry.credit))
          panels = {
            primary: { title: 'Posted Accounting Overview', description: 'Net posted debits less credits by account code, in Philippine pesos.', kind: 'distribution', items: [...postedByAccount].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 6).map(([label, value]) => ({ id: `account-${label}`, label, detail: 'Posted net balance', value, format: 'currency' })) },
            secondary: { title: 'Accounting Workload', description: 'Current authorized review counts from municipal records.', kind: 'distribution', items: metrics.filter((metric) => metric.id !== 'cip' && metric.id !== 'depreciation').map((metric) => ({ id: metric.id, label: metric.label, detail: metric.hint, value: metric.value, format: 'count' })) },
          }
          break
        }
        case 'inventory_personnel': {
          const [sessions, checks, assets] = await Promise.all([scoped('inventorySessions'), scoped('inventoryChecks'), scoped('assets')])
          const assigned = sessions.filter((row) => row.assignedUserIds.includes(actor.id))
          const sessionIds = new Set(assigned.map((row) => row.id))
          const ownChecks = checks.filter((row) => sessionIds.has(row.sessionId) && row.checkedById === actor.id)
          const byId = new Map(assets.map((row) => [row.id, row]))
          const mismatch = (check: typeof ownChecks[number]) => {
            if (check.inspection) return check.inspection.attempts.at(-1)?.result === 'discrepancy'
            const asset = byId.get(check.assetId)
            return !asset || !check.found || asset.location !== check.observedLocation || asset.custodianId !== check.observedCustodianId || asset.condition !== check.observedCondition
          }
          metrics = [
            count('assigned', 'Active Assigned Work', assigned.filter((row) => row.sessionStatus === 'planned' || row.sessionStatus === 'in_progress').length, 'Your active assignments'),
            count('verified', 'Verified Assets', new Set(ownChecks.filter((row) => !row.inspection?.reopen && !mismatch(row)).map((row) => row.assetId)).size, 'Matching verified observations'),
            count('discrepancies', 'Observed Discrepancies', ownChecks.filter(mismatch).length, 'Observed mismatches in your checks'),
            count('sessions', 'Assigned Sessions', assigned.length, 'Your assigned inventory sessions'),
          ]
          recordsTitle = 'Assigned inventory sessions'
          records = assigned.map((row) => record(row.id, row.title, `Scheduled ${row.scheduledDate}`, row.sessionStatus, row.updatedAt, '/dashboard/physical-inventory'))
          const checksBySession = new Map<string, Set<string>>()
          const assignedById = new Map(assigned.map((row) => [row.id, row]))
          for (const check of ownChecks) {
            const session = assignedById.get(check.sessionId)
            if (!session?.inventory?.assetIds.includes(check.assetId)) continue
            const sessionChecks = checksBySession.get(check.sessionId) ?? new Set<string>()
            sessionChecks.add(check.assetId)
            checksBySession.set(check.sessionId, sessionChecks)
          }
          const observedDiscrepancies = ownChecks.flatMap((check) => check.inspection?.attempts.at(-1)?.flags ?? (mismatch(check) ? ['record discrepancy'] : []))
          const discrepancyGroups = new Map<string, number>()
          observedDiscrepancies.forEach((flag) => discrepancyGroups.set(flag, (discrepancyGroups.get(flag) ?? 0) + 1))
          panels = {
            primary: { title: 'Inventory Verification Progress', description: 'Assigned asset inspections recorded in your sessions.', kind: 'progress', items: assigned.map((row) => { const total = row.inventory?.assetIds.length ?? 0; const inspected = checksBySession.get(row.id)?.size ?? 0; return { id: row.id, label: row.title, detail: `${inspected} of ${total} assigned assets inspected`, value: inspected, total, status: row.sessionStatus, timestamp: row.updatedAt, href: '/dashboard/physical-inventory' } }) },
            secondary: { title: 'Discrepancy Summary', description: 'Observed inspection findings across your assigned checks.', kind: 'distribution', items: [...discrepancyGroups].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ id: `finding-${label}`, label, detail: 'Observed findings', value, format: 'count' })) },
          }
          break
        }
        case 'approving_officer': {
          const approvals = (await scoped('approvals')).filter((row) => row.assignedRole === role)
          metrics = [
            count('pending', 'Pending approvals', approvals.filter((row) => isPending(row.workflowStatus)).length, 'Submitted or under review'),
            count('approved', 'Approved requests', approvals.filter((row) => row.workflowStatus === 'approved').length, 'Completed approvals'),
            count('returned', 'Returned requests', approvals.filter((row) => row.workflowStatus === 'returned').length, 'Returned for revision'),
            count('rejected', 'Rejected requests', approvals.filter((row) => row.workflowStatus === 'rejected').length, 'Completed rejections'),
          ]
          recordsTitle = 'Approval queue and decisions'
          records = approvals.map((row) => record(row.id, `${row.subjectType.replaceAll('_', ' ')} request`, `Subject: ${row.subjectId}`, row.workflowStatus, row.decidedAt ?? row.updatedAt))
          const pending = approvals.filter((row) => isPending(row.workflowStatus)).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
          const approvalStages = new Map<string, number>()
          approvals.forEach((row) => approvalStages.set(row.workflowStatus, (approvalStages.get(row.workflowStatus) ?? 0) + 1))
          panels = {
            primary: { title: 'Pending Approvals Queue', description: 'Requests awaiting review, ordered by oldest update.', kind: 'queue', items: pending.slice(0, 6).map((row) => ({ id: row.id, label: `${row.subjectType.replaceAll('_', ' ')} request`, detail: `Subject: ${row.subjectId}`, status: row.workflowStatus, timestamp: row.updatedAt, href: '/dashboard/approvals' })) },
            secondary: { title: 'Approval Status Distribution', description: 'Recorded decision states for your approval assignments.', kind: 'distribution', items: [...approvalStages].map(([label, value]) => ({ id: `approval-${label}`, label: label.replaceAll('_', ' '), detail: 'Requests', value, format: 'count' })) },
          }
          break
        }
        case 'auditor': {
          const [assets, entries, logs] = await Promise.all([scoped('assets'), scoped('accountingRecords'), scoped('auditLogs')])
          metrics = [
            count('assets', 'Registered Assets', assets.length, 'Municipal registered assets'),
            currency('accounting', 'Net Posted Debit/Credit Difference', sum(entries.map((row) => row.debit - row.credit)), 'Posted debits less credits; not asset valuation'),
            count('history', 'Accounting Records', entries.length, 'Posted accounting records'),
            count('activity', 'Audit Events', logs.length, 'Recorded audit events'),
          ]
          recordsTitle = 'Audit and transaction history'
          records = [
            ...entries.map((row) => record(row.id, `${row.kind} · ${row.accountCode}`, 'Posted transaction', 'posted', row.postingDate)),
            ...logs.map((row) => record(row.id, `${row.action.replaceAll('_', ' ')} · ${row.resource}`, row.reason, 'audit event', row.occurredAt)),
          ]
          description = 'Read-only municipal records; no modification or approval privileges.'
          const auditByResource = new Map<string, number>()
          logs.forEach((row) => auditByResource.set(row.resource, (auditByResource.get(row.resource) ?? 0) + 1))
          panels = {
            primary: { title: 'Audit Activity Explorer', description: 'Latest authorized audit events and posted entries.', kind: 'timeline', items: [...logs.map((row) => ({ id: row.id, label: `${row.action.replaceAll('_', ' ')} · ${row.resource}`, detail: row.reason || `Recorded by ${row.actorRole.replaceAll('_', ' ')}`, status: row.action, timestamp: row.occurredAt })), ...entries.map((row) => ({ id: row.id, label: `${row.kind} · ${row.accountCode}`, detail: 'Posted transaction', status: 'posted', timestamp: row.postingDate }))].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 6) },
            secondary: { title: 'Audit Record Distribution', description: 'Available municipal records by audit resource.', kind: 'distribution', items: [...auditByResource].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value]) => ({ id: `resource-${label}`, label: label.replaceAll('_', ' '), detail: 'Recorded events', value, format: 'count' })) },
          }
          break
        }
        case 'engineering_office': {
          const [projects, routings] = await Promise.all([scoped('projects'), scoped('documentRouting')])
          const own = routings.filter((row) => row.fromRole === role || (row.toRole === role && (!row.assignedUserId || row.assignedUserId === actor.id)))
          const assignedIds = new Set(own.map((row) => row.projectId))
          for (const project of projects) if (project.construction?.engineeringUserId === actor.id) assignedIds.add(project.id)
          metrics = [
            count('projects', 'Assigned projects', assignedIds.size, 'Projects with your document routes'),
            count('reviews', 'Pending document reviews', own.filter((row) => row.toRole === role && isPending(row.workflowStatus)).length, 'Documents sent for your review'),
            count('progress', 'In-progress projects', projects.filter((row) => assignedIds.has(row.id) && row.projectStatus === 'in_progress').length, 'Assigned construction projects'),
          ]
          recordsTitle = 'Engineering document routing'
          records = own.map((row) => record(row.id, projects.find((project) => project.id === row.projectId)?.name ?? 'Project document', `Route to ${row.toRole.replaceAll('_', ' ')}`, row.workflowStatus, row.updatedAt))
          records.push(...projects.filter(p => p.construction).map(p => record(p.id, p.name, `${p.construction!.progressPercent}% implementation progress`, p.construction!.stage, p.updatedAt, '/dashboard/engineering')))
          const projectItems = projects.filter((project) => assignedIds.has(project.id) && project.construction).map((project) => ({ id: project.id, label: project.name, detail: `${project.construction!.progressPercent}% recorded implementation · ${project.location}`, value: project.construction!.progressPercent, total: 100, status: project.construction!.stage, timestamp: project.updatedAt, href: '/dashboard/engineering' }))
          const routeStages = new Map<string, number>()
          own.forEach((row) => routeStages.set(row.workflowStatus, (routeStages.get(row.workflowStatus) ?? 0) + 1))
          panels = {
            primary: { title: 'Construction Project Monitoring', description: 'Recorded project progress for projects assigned to your office.', kind: 'progress', items: projectItems.slice(0, 6) },
            secondary: { title: 'Engineering Routing Status', description: 'Document routes involving your office.', kind: 'distribution', items: [...routeStages].map(([label, value]) => ({ id: `route-${label}`, label: label.replaceAll('_', ' '), detail: 'Routing records', value, format: 'count' })) },
          }
          break
        }
        case 'budget_office': {
          const [projects, routings] = await Promise.all([scoped('projects'), scoped('documentRouting')])
          const own = routings.filter((row) => row.toRole === role && (!row.assignedUserId || row.assignedUserId === actor.id))
          metrics = [
            count('pending', 'Pending Budget Processing', own.filter((row) => isPending(row.workflowStatus)).length, 'Submitted or under review'),
            count('incomplete', 'Incomplete or Returned Documents', own.filter(r => ['incomplete', 'accounting_returned', 'returned_to_engineering'].includes(r.budgetProcessing?.status ?? '')).length, 'Documents that require correction'),
            count('treasury', 'External Treasury Pending', own.filter(r => r.budgetProcessing?.status === 'treasury_pending').length, 'Recorded external confirmation remains outstanding'),
            count('completed', 'Completed Processing', own.filter(r => r.budgetProcessing?.status === 'completed').length, 'Accounting acknowledged receipt; no disbursement'),
            count('received', 'Received Projects', new Set(own.filter((row) => !!row.receivedAt).map((row) => row.projectId)).size, 'Projects with confirmed receipt'),
            count('routing', 'Routing Records', own.length, 'Budget-bound routing records'),
          ]
          recordsTitle = 'Budget document routing'
          records = own.map((row) => record(row.id, projects.find((project) => project.id === row.projectId)?.name ?? 'Project document', row.budgetProcessing?.voucher ? `Voucher ${row.budgetProcessing.voucher.reference}` : row.receivedAt ? `Received ${row.receivedAt}` : 'Not marked received', row.budgetProcessing?.status ?? row.workflowStatus, row.updatedAt, '/dashboard/budget'))
          description = 'Engineering-to-Budget document queues, vouchers and external Treasury confirmations. No action transfers funds or records a financial disbursement.'
          const received = own.filter((row) => !!row.receivedAt || isPending(row.workflowStatus)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          const processingStages = new Map<string, number>()
          own.forEach((row) => { const stage = row.budgetProcessing?.status ?? row.workflowStatus; processingStages.set(stage, (processingStages.get(stage) ?? 0) + 1) })
          panels = {
            primary: { title: 'Received Documents Queue', description: 'Packets received or routed to the Budget Office.', kind: 'queue', items: received.slice(0, 6).map((row) => ({ id: row.id, label: projects.find((project) => project.id === row.projectId)?.name ?? 'Project document', detail: row.budgetProcessing?.voucher ? `Voucher ${row.budgetProcessing.voucher.reference}` : row.receivedAt ? `Received ${row.receivedAt}` : 'Awaiting receipt', status: row.budgetProcessing?.status ?? row.workflowStatus, timestamp: row.updatedAt, href: '/dashboard/budget' })) },
            secondary: { title: 'Budget Processing Stages', description: 'Current routing and processing states.', kind: 'distribution', items: [...processingStages].map(([label, value]) => ({ id: `budget-${label}`, label: label.replaceAll('_', ' '), detail: 'Document packets', value, format: 'count' })) },
          }
          break
        }
      }
      return { role, municipalityId: actor.municipalityId, metrics, recordsTitle, records: recent(records), description, ...(pendingApplicants ? { pendingApplicants } : {}), ...(administrativeActivity ? { administrativeActivity } : {}), ...(userStatuses ? { userStatuses } : {}), ...(departmentSummary ? { departmentSummary } : {}), ...(panels ? { panels } : {}) }
    })),
  }
}
export const dashboardService = createDashboardService()
