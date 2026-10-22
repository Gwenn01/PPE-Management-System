import type { Role } from '../config/roles.js'

export const budgetStatuses = ['received', 'under_review', 'incomplete', 'ready', 'treasury_pending', 'treasury_confirmed', 'forwarded', 'accounting_returned', 'completed', 'returned_to_engineering'] as const
export const budgetDocumentTypes = ['voucher', 'budget_review', 'treasury_confirmation_demo'] as const
export interface Voucher {
  reference: string
  date: string
  amount: number
  remarks: string
}
export interface BudgetHandoff {
  fund: 'regular' | 'trust'
  voucher: Voucher
  treasury: BudgetProcessing['treasury']
  sourceVersion: number
  forwardedAt: string
}
export interface BudgetProcessing {
  status: typeof budgetStatuses[number]
  fund: 'regular' | 'trust' | null
  voucher: Voucher | null
  accountingUserId: string | null
  treasury: { sentAt: string; confirmedAt: string | null; confirmationDate: string | null; reference: string | null; evidenceId: string | null } | null
  forwardedAt: string | null
  accountingReceivedAt: string | null
  history: { id: string; actorId: string; actorRole: Role; occurredAt: string; action: string; note: string; documentIds: string[]; snapshot: string }[]
}

export function treasuryConfirmed(processing: Pick<BudgetProcessing, 'fund' | 'treasury'>): boolean {
  return processing.fund === 'regular' || (processing.fund === 'trust' && !!processing.treasury?.confirmedAt && !!processing.treasury.evidenceId && !!processing.treasury.reference && !!processing.treasury.confirmationDate)
}
