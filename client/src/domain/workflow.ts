import type { ApprovalHistoryEntry, ApprovalSubject, WorkflowStatus } from './models.js'
import { hasRolePermission } from './permissions.js'
import type { Action, Resource } from './permissions.js'

export const approvalResources = {
  registration: 'registration_approvals', capitalization: 'capitalization_approvals', correction: 'correction_approvals',
  transfer: 'lifecycle_approvals', maintenance: 'lifecycle_approvals', disposal: 'lifecycle_approvals', reconciliation: 'correction_approvals',
} as const satisfies Record<ApprovalSubject, Resource>

export const submissionResources = {
  registration: 'asset_registrations', capitalization: 'construction_projects', correction: 'inventory_discrepancies',
  transfer: 'asset_transfers', maintenance: 'maintenance_requests', disposal: 'disposal_requests', reconciliation: 'reconciliations',
} as const satisfies Record<ApprovalSubject, Resource>

const transitions: Record<ApprovalHistoryEntry['action'], { from: readonly WorkflowStatus[]; to: WorkflowStatus; permission: Action }> = {
  submit: { from: ['draft', 'returned'], to: 'submitted', permission: 'submit' },
  review: { from: ['submitted'], to: 'under_review', permission: 'approve' },
  approve: { from: ['submitted', 'under_review'], to: 'approved', permission: 'approve' },
  reject: { from: ['submitted', 'under_review'], to: 'rejected', permission: 'reject' },
  return: { from: ['submitted', 'under_review'], to: 'returned', permission: 'reject' },
  cancel: { from: ['draft', 'submitted', 'returned'], to: 'cancelled', permission: 'update' },
}

export function validApprovalEvent(subject: ApprovalSubject, event: ApprovalHistoryEntry, requesterId: string): boolean {
  const rule = transitions[event.action]
  const byRequester = event.action === 'submit' || event.action === 'cancel'
  return rule.from.includes(event.fromStatus) && event.toStatus === rule.to &&
    (byRequester ? event.actorId === requesterId : event.actorId !== requesterId) &&
    (!['return', 'reject', 'cancel'].includes(event.action) || !!event.reason.trim()) &&
    hasRolePermission(event.actorRole, { resource: byRequester ? submissionResources[subject] : approvalResources[subject], action: rule.permission })
}
