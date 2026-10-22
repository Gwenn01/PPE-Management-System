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
}
export interface DashboardSnapshot {
  role: Role
  municipalityId: RequestContext['municipalityId']
  metrics: DashboardMetric[]
  recordsTitle: string
  records: DashboardRecord[]
  description: string
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
        if (entity !== 'projects' && entity !== 'documentRouting' && entity !== 'cipCosts') return rows
        const visible: EntityMap[K][] = []
        for (const row of rows) if (await visibleRecord(storage, actor, entity, row)) visible.push(row)
        return visible
      }
      let metrics: DashboardMetric[] = []
      let records: DashboardRecord[] = []
      let recordsTitle = 'Recent records'
      let description = 'Current municipal demo records. Totals are calculated from browser storage.'

      switch (role) {
        case 'administrator': {
          const [users, departments, logs] = await Promise.all([scoped('users'), scoped('departments'), scoped('auditLogs')])
          metrics = [
            count('users', 'Total users', users.length, 'Municipal accounts, all statuses'),
            count('pending', 'Pending registrations', users.filter((row) => row.status === 'pending').length, 'Accounts awaiting review'),
            count('departments', 'Departments', departments.filter((row) => row.active).length, 'Active departments'),
            count('activity', 'Recent activity', logs.length, 'Recorded audit events'),
          ]
          recordsTitle = 'Recent activity'
          records = logs.map((row) => record(row.id, `${row.action.replaceAll('_', ' ')} · ${row.resource}`, row.reason || `Actor: ${row.actorRole}`, row.action, row.occurredAt))
          records.push(...users.filter((row) => row.status === 'pending').map((row) => record(`user-${row.id}`, row.name, `New ${row.role.replaceAll('_', ' ')} account request`, 'pending', row.createdAt, '/dashboard/users')))
          break
        }
        case 'property_officer': {
          const [assets, registrations, projects, discrepancies, transfers, maintenance, disposals] = await Promise.all([
            scoped('assets'), scoped('registrations'), scoped('projects'), scoped('discrepancies'), scoped('transfers'), scoped('maintenance'), scoped('disposals'),
          ])
          const requests = [...registrations, ...discrepancies, ...transfers, ...maintenance, ...disposals]
          metrics = [
            count('assets', 'Total assets', assets.length, 'Registered municipal assets'),
            count('requests', 'Pending requests', requests.filter((row) => isPending(row.workflowStatus)).length, 'Submitted or under review'),
            count('projects', 'Active construction projects', projects.filter((row) => row.projectStatus === 'in_progress').length, 'Projects in progress'),
            count('discrepancies', 'Inventory discrepancies', discrepancies.filter((row) => !row.resolvedAt).length, 'Not marked resolved'),
          ]
          recordsTitle = 'Registration and lifecycle requests'
          records = [
            ...registrations.map((row) => record(row.id, row.description, 'Asset registration', row.workflowStatus, row.updatedAt)),
            ...transfers.map((row) => record(row.id, row.reason, 'Asset transfer', row.workflowStatus, row.updatedAt)),
            ...maintenance.map((row) => record(row.id, row.description, 'Maintenance', row.workflowStatus, row.updatedAt)),
            ...discrepancies.map((row) => record(row.id, row.description, 'Inventory correction', row.workflowStatus, row.updatedAt)),
            ...disposals.map((row) => record(row.id, row.reason, 'Disposal', row.workflowStatus, row.updatedAt)),
          ]
          break
        }
        case 'accounting_officer': {
          const [registrations, costs, entries, reconciliations] = await Promise.all([
            scoped('registrations'), scoped('cipCosts'), scoped('accountingRecords'), scoped('reconciliations'),
          ])
          // Posted CIP account movements are authoritative; costs are not double-counted.
          const cipBalance = sum(entries.filter((row) => row.kind === 'cip' || row.kind === 'capitalization' && row.accountCode === 'DEMO-CIP').map((row) => row.debit - row.credit))
          const depreciation = sum(entries.filter((row) => row.kind === 'depreciation').map((row) => row.credit - row.debit))
          metrics = [
            count('recognition', 'Assets awaiting recognition', registrations.filter((row) => row.workflowStatus === 'approved' && !row.recognizedAssetId).length, 'Approved registrations not linked to an asset'),
            currency('cip', 'CIP balance', cipBalance, 'Posted CIP debits minus credits'),
            currency('depreciation', 'Depreciation summary', depreciation, 'Posted depreciation only; not a forecast'),
            count('reconciliation', 'Open reconciliations', reconciliations.filter((row) => isOpen(row.workflowStatus)).length, 'Draft, submitted, review or returned'),
          ]
          recordsTitle = 'Recent accounting work'
          records = [
            ...reconciliations.map((row) => record(row.id, `Reconciliation ${row.periodStart} – ${row.periodEnd}`, 'Accounting reconciliation', row.workflowStatus, row.updatedAt)),
            ...costs.map((row) => record(row.id, row.description, 'CIP cost', row.workflowStatus, row.updatedAt)),
            ...entries.map((row) => record(row.id, `${row.kind} · ${row.accountCode}`, 'Posted accounting entry', 'posted', row.postingDate)),
          ]
          const grants = await scoped('permissions')
          if (grants.some(g => g.role === role && g.resource === 'cip_costs' && g.action === 'read')) {
            const packets = (await scoped('documentRouting')).filter(r => r.toRole === role && r.assignedUserId === actor.id && !!r.budgetHandoff)
            const projects = await scoped('projects')
            metrics.push(count('capitalization', 'Capitalization requests under review', projects.filter(p => p.capitalization && ['submitted', 'under_review'].includes(p.workflowStatus)).length, 'Prepared construction-to-PPE approvals'))
            records.push(...projects.filter(p => p.capitalization).map(p => record(p.id, p.name, 'CIP capitalization request', p.workflowStatus, p.updatedAt, '/dashboard/cip-costs')))
            metrics.push(count('project_documents', 'Project packets awaiting receipt', packets.filter(r => r.workflowStatus === 'submitted').length, 'Reviewed Budget handoffs; Trust Fund Treasury confirmation is required'))
            records.push(...packets.map(r => record(r.id, projects.find(p => p.id === r.projectId)?.name ?? 'Construction document packet', `Voucher ${r.budgetHandoff!.voucher.reference}`, r.workflowStatus, r.updatedAt, '/dashboard/accounting-documents')))
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
            const asset = byId.get(check.assetId)
            return !asset || !check.found || asset.location !== check.observedLocation || asset.custodianId !== check.observedCustodianId || asset.condition !== check.observedCondition
          }
          metrics = [
            count('assigned', 'Assigned inventory work', assigned.filter((row) => row.sessionStatus === 'planned' || row.sessionStatus === 'in_progress').length, 'Your active assignments'),
            count('verified', 'Verified assets', new Set(ownChecks.filter((row) => row.found).map((row) => row.assetId)).size, 'Unique assets you found'),
            count('discrepancies', 'Discrepancies', ownChecks.filter(mismatch).length, 'Observed mismatches in your checks'),
            count('sessions', 'Recent sessions', assigned.length, 'Your assigned inventory sessions'),
          ]
          recordsTitle = 'Assigned inventory sessions'
          records = assigned.map((row) => record(row.id, row.title, `Scheduled ${row.scheduledDate}`, row.sessionStatus, row.updatedAt))
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
          break
        }
        case 'auditor': {
          const [assets, entries, logs] = await Promise.all([scoped('assets'), scoped('accountingRecords'), scoped('auditLogs')])
          metrics = [
            count('assets', 'Asset summaries', assets.length, 'Registered assets'),
            currency('accounting', 'Accounting summaries', sum(entries.map((row) => row.debit - row.credit)), 'Net posted debits less credits; not asset valuation'),
            count('history', 'Recent transaction history', entries.length, 'Posted accounting records'),
            count('activity', 'Audit activity', logs.length, 'Recorded audit events'),
          ]
          recordsTitle = 'Audit and transaction history'
          records = [
            ...entries.map((row) => record(row.id, `${row.kind} · ${row.accountCode}`, 'Posted transaction', 'posted', row.postingDate)),
            ...logs.map((row) => record(row.id, `${row.action.replaceAll('_', ' ')} · ${row.resource}`, row.reason, 'audit event', row.occurredAt)),
          ]
          description = 'Read-only municipal records; no modification or approval privileges.'
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
          break
        }
        case 'budget_office': {
          const [projects, routings] = await Promise.all([scoped('projects'), scoped('documentRouting')])
          const own = routings.filter((row) => row.toRole === role && (!row.assignedUserId || row.assignedUserId === actor.id))
          metrics = [
            count('received', 'Received projects', new Set(own.filter((row) => !!row.receivedAt).map((row) => row.projectId)).size, 'Projects with confirmed receipt'),
            count('pending', 'Pending budget processing', own.filter((row) => isPending(row.workflowStatus)).length, 'Submitted or under review'),
            count('routing', 'Document routing summaries', own.length, 'Budget-bound routing records'),
          ]
          recordsTitle = 'Budget document routing'
          metrics.push(count('incomplete', 'Incomplete or returned processing', own.filter(r => ['incomplete', 'accounting_returned', 'returned_to_engineering'].includes(r.budgetProcessing?.status ?? '')).length, 'Document corrections required'))
          metrics.push(count('treasury', 'External Treasury pending', own.filter(r => r.budgetProcessing?.status === 'treasury_pending').length, 'Demo confirmation evidence required'))
          metrics.push(count('completed', 'Completed document processing', own.filter(r => r.budgetProcessing?.status === 'completed').length, 'Accounting acknowledged receipt; no disbursement'))
          records = own.map((row) => record(row.id, projects.find((project) => project.id === row.projectId)?.name ?? 'Project document', row.budgetProcessing?.voucher ? `Voucher ${row.budgetProcessing.voucher.reference}` : row.receivedAt ? `Received ${row.receivedAt}` : 'Not marked received', row.budgetProcessing?.status ?? row.workflowStatus, row.updatedAt, '/dashboard/budget'))
          description = 'Engineering-to-Budget document queues, vouchers and external Treasury simulations. No real fund transfers or disbursements.'
          break
        }
      }
      return { role, municipalityId: actor.municipalityId, metrics, recordsTitle, records: recent(records), description }
    })),
  }
}
export const dashboardService = createDashboardService()
