export const projectDocumentTypes = ['mpdo_proposal', 'mayor_authorization_simulation', 'construction_plan', 'availability_of_fund', 'engineering_report', 'progress_report', 'completion_certificate', 'acceptance_report', 'voucher', 'budget_review', 'treasury_confirmation_demo'] as const
export type ProjectDocumentType = typeof projectDocumentTypes[number]
export const constructionStages = ['awaiting_proposal', 'proposal_recorded', 'mayor_simulated', 'engineering_received', 'processed', 'forwarded', 'returned'] as const
export interface ProjectEvent {
  id: string
  actorId: string
  occurredAt: string
  action: string
  note: string
  documentIds: string[]
  progressPercent: number
}
export interface ConstructionTracking {
  contractor: string
  expectedCompletionDate: string
  engineeringUserId: string
  budgetUserId: string
  stage: typeof constructionStages[number]
  progressPercent: number
  constructionReview: 'pending' | 'accepted' | 'returned'
  fundReview: 'pending' | 'accepted' | 'returned'
  timeline: ProjectEvent[]
}
