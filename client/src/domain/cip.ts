import type { RecognitionDetails } from './models.js'
export const cipCategories = ['materials', 'labor', 'contractor_billing', 'professional_fees', 'other_direct_cost'] as const
export interface CIPAccounting {
  reference: string
  category: typeof cipCategories[number]
  supportingDocumentId: string
  budgetPacketId: string
  status: 'pending_review' | 'approved' | 'excluded' | 'capitalized'
  reviewNote: string
  reviewedById: string | null
  reviewedAt: string | null
  transferredAt: string | null
  reversalRecordId?: string
}
export interface ReadyForUse {
  date: string
  confirmedById: string
  confirmedAt: string
  note: string
  documentIds: string[]
}
export interface CapitalizationPreparation {
  requestedById: string
  costIds: string[]
  costSnapshot: string
  total: number
  propertyNumber: string
  category: string
  custodianId: string | null
  evidenceIds: string[]
  verificationNote: string
  preparedAt: string
  policyId: string
  policyVersion: number
  depreciation: RecognitionDetails
}
