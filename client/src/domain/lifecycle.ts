import { z } from 'zod'
import type { AssetInspectionSnapshot, InventoryEvent } from './inventory.js'
import type { AssetLifecycleStatus } from './models.js'
export const lifecyclePolicySchema = z.strictObject({ transferRequiresApproval: z.boolean(), maintenanceApproval: z.enum(['always', 'never', 'above_threshold']), maintenanceThreshold: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), transferDocumentsRequired: z.boolean(), maintenanceDocumentsRequired: z.boolean(), disposalDocumentsRequired: z.literal(true) })
export type LifecyclePolicy = z.infer<typeof lifecyclePolicySchema>
export const defaultLifecyclePolicy: LifecyclePolicy = { transferRequiresApproval: true, maintenanceApproval: 'always', maintenanceThreshold: 0, transferDocumentsRequired: false, maintenanceDocumentsRequired: false, disposalDocumentsRequired: true }
export type LifecycleKind = 'transfer' | 'maintenance' | 'disposal'
export const lifecycleTables = { transfer: 'transfers', maintenance: 'maintenance', disposal: 'disposals' } as const
export const lifecycleResources = { transfer: 'asset_transfers', maintenance: 'maintenance_requests', disposal: 'disposal_requests' } as const
export interface DisposalImpact { treatment: 'ppe_derecognition' | 'non_ppe_retirement'; cost: number; accumulatedDepreciation: number; carryingValue: number; proceeds: number; ledgerSnapshot: string }
export interface LifecycleDetails {
  baseline: AssetInspectionSnapshot
  priorStatus: AssetLifecycleStatus
  stage: 'draft' | 'accounting_review' | 'reviewed' | 'approval' | 'authorized' | 'in_progress' | 'completed' | 'returned' | 'rejected' | 'cancelled'
  policy: LifecyclePolicy | null
  approvalRequired: boolean | null
  authorization: { actorId: string; occurredAt: string; source: 'approval' | 'configured_policy' } | null
  completedAt: string | null
  completionNote: string
  category: string
  remarks: string
  startedDate: string | null
  proposedDate: string
  review: { actorId: string; occurredAt: string; reason: string; impact: DisposalImpact } | null
  history: InventoryEvent[]
}
