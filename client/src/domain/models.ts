import type { RegistrationDocumentType } from './registration.js'
import type { ConstructionTracking, ProjectDocumentType } from './construction.js'
import type { BudgetHandoff, BudgetProcessing } from './budget.js'
import type { CapitalizationPreparation, CIPAccounting, ReadyForUse } from './cip.js'
import type { DiscrepancyInvestigation, InspectionHistory, SessionInventory } from './inventory.js'
import type { Role } from '../config/roles.js'

export type MunicipalityId = 'botolan' | 'san_antonio'
export type EntityId = string
/** ISO 8601 timestamp or calendar date, validated by future service implementations. */
export type ISODate = string
/** Integer Philippine centavos; avoid floating point monetary persistence. */
export type Money = number

export interface Municipality {
  id: MunicipalityId
  name: 'Botolan' | 'San Antonio'
  province: 'Zambales'
}

export interface ScopedEntity {
  id: EntityId
  municipalityId: MunicipalityId
  version: number
  createdAt: ISODate
  updatedAt: ISODate
}

export interface User extends ScopedEntity {
  name: string
  username: string
  email: string
  role: Role
  departmentId: EntityId | null
  status: 'pending' | 'active' | 'disabled'
  isDemo: true
}

export interface Department extends ScopedEntity {
  code: string
  name: string
  active: boolean
}

export interface AssetCategory extends ScopedEntity {
  code: string
  name: string
  usefulLifeMonths: number
}

export interface DemoSetting extends ScopedEntity {
  key: 'fiscal_year' | 'demo_notice' | 'registration_document_rules'
  value: string | number | boolean
  isDemo: true
}

/** Approval processing is independent of an asset's operational lifecycle. */
export type WorkflowStatus = 'draft' | 'submitted' | 'under_review' | 'returned' | 'approved' | 'rejected' | 'cancelled'
export type AssetLifecycleStatus = 'in_service' | 'under_maintenance' | 'idle' | 'disposed'
export type AssetCondition = 'good' | 'fair' | 'poor' | 'unserviceable'

export interface WorkflowEntity extends ScopedEntity {
  workflowStatus: WorkflowStatus
  requestedById: EntityId
  submittedAt: ISODate | null
  documentIds: EntityId[]
}

export interface Asset extends ScopedEntity {
  propertyNumber: string
  description: string
  category: string
  departmentId: EntityId
  custodianId: EntityId | null
  location: string
  acquisitionDate: ISODate
  acquisitionCost: Money
  lifecycleStatus: AssetLifecycleStatus
  /** New registry entries are not accounting-recognized until a later accounting command. Legacy seeds may omit it. */
  recognitionStatus?: 'awaiting_recognition' | 'recognized'
  condition: AssetCondition
  registrationId: EntityId | null
  constructionProjectId: EntityId | null
}

export interface AssetRegistration extends WorkflowEntity {
  proposedPropertyNumber: string
  description: string
  category: string
  departmentId: EntityId
  custodianId: EntityId | null
  location: string
  acquisitionDate: ISODate
  acquisitionCost: Money
  acquisitionMethod: 'purchase' | 'donation' | 'construction' | 'transfer'
  recognizedAssetId: EntityId | null
}

export interface ConstructionProject extends WorkflowEntity {
  readyForUse?: ReadyForUse
  capitalization?: CapitalizationPreparation
  construction?: ConstructionTracking
  projectNumber: string
  name: string
  location: string
  departmentId: EntityId
  budgetAmount: Money
  startDate: ISODate
  completionDate: ISODate | null
  projectStatus: 'planned' | 'in_progress' | 'completed' | 'capitalized' | 'cancelled'
  capitalizedAssetId: EntityId | null
}

export interface ProjectDocumentRouting extends WorkflowEntity {
  budgetProcessing?: BudgetProcessing
  /** Immutable link from a Budget -> Accounting packet to its Engineering -> Budget source. */
  budgetSourceRoutingId?: EntityId
  budgetHandoff?: BudgetHandoff
  projectId: EntityId
  documentId: EntityId
  fromRole: Role
  toRole: Role
  assignedUserId: EntityId | null
  receivedAt: ISODate | null
  remarks: string
}

export interface CIPCost extends WorkflowEntity {
  accounting?: CIPAccounting
  projectId: EntityId
  description: string
  amount: Money
  incurredDate: ISODate
  accountingRecordId: EntityId | null
}

export interface InventorySession extends WorkflowEntity {
  inventory?: SessionInventory
  title: string
  departmentId: EntityId | null
  scheduledDate: ISODate
  assignedUserIds: EntityId[]
  sessionStatus: 'planned' | 'in_progress' | 'completed' | 'cancelled'
}

export interface InventoryCheck extends ScopedEntity {
  inspection?: InspectionHistory
  sessionId: EntityId
  assetId: EntityId
  checkedById: EntityId
  checkedAt: ISODate
  found: boolean
  observedLocation: string
  observedCustodianId: EntityId | null
  observedCondition: AssetCondition
  notes: string
}

export interface InventoryDiscrepancy extends WorkflowEntity {
  investigation?: DiscrepancyInvestigation
  inventoryCheckId: EntityId
  assetId: EntityId
  kind: 'missing' | 'location' | 'custodian' | 'condition' | 'record_error'
  description: string
  proposedCorrection: {
    location?: string
    custodianId?: EntityId | null
    condition?: AssetCondition
    description?: string
  }
  resolvedAt: ISODate | null
}

export interface AssetTransfer extends WorkflowEntity {
  assetId: EntityId
  fromDepartmentId: EntityId
  toDepartmentId: EntityId
  fromCustodianId: EntityId | null
  toCustodianId: EntityId | null
  destinationLocation: string
  effectiveDate: ISODate
  reason: string
}

export interface MaintenanceRequest extends WorkflowEntity {
  assetId: EntityId
  description: string
  estimatedCost: Money
  actualCost: Money | null
  scheduledDate: ISODate | null
  completedAt: ISODate | null
}

export interface DisposalRequest extends WorkflowEntity {
  assetId: EntityId
  reason: string
  method: 'sale' | 'donation' | 'destruction' | 'other'
  proceeds: Money | null
  disposedAt: ISODate | null
  accountingRecordId: EntityId | null
}

export interface RecognitionDetails {
  treatment: 'depreciable_ppe' | 'non_depreciable_ppe' | 'semi_expendable' | 'expense'
  cost: Money
  residualValue: Money
  usefulLifeMonths: number
  startDate: string
  startConvention: 'acquisition_month' | 'following_month'
  reason: string
  policySnapshot: string
}

export interface AccountingRecord extends ScopedEntity {
  recognitionDetails?: RecognitionDetails
  assetId: EntityId | null
  projectId: EntityId | null
  sourceId: EntityId
  kind: 'recognition' | 'cip' | 'capitalization' | 'depreciation' | 'adjustment' | 'disposal'
  postingDate: ISODate
  accountCode: string
  debit: Money
  credit: Money
  policyId: EntityId | null
  policyVersion: number | null
  postedById: EntityId
}

/** Configurable demo assumptions; never a representation of legally verified policy. */
export interface DepreciationPolicy extends ScopedEntity {
  belowThresholdTreatment?: 'semi_expendable' | 'expense'
  name: string
  isDemo: true
  method: 'straight_line'
  usefulLifeMonths: number
  residualValuePercent: number
  recognitionThreshold: Money
  startConvention: 'acquisition_month' | 'following_month'
  effectiveFrom: ISODate
  active: boolean
}

export interface Reconciliation extends WorkflowEntity {
  periodStart: ISODate
  periodEnd: ISODate
  propertyBalance: Money
  accountingBalance: Money
  differences: { assetId: EntityId; amount: Money; explanation: string; resolved: boolean }[]
  adjustmentRecordIds: EntityId[]
}

export type ApprovalSubject = 'registration' | 'capitalization' | 'correction' | 'transfer' | 'maintenance' | 'disposal' | 'reconciliation'
export interface ApprovalHistoryEntry {
  actorId: EntityId
  actorRole: Role
  action: 'submit' | 'review' | 'approve' | 'reject' | 'return' | 'cancel'
  fromStatus: WorkflowStatus
  toStatus: WorkflowStatus
  reason: string
  occurredAt: ISODate
  /** Immutable submission snapshot used when a returned draft is subsequently edited. */
  submission?: { subjectVersion: number; documentIds: string[]; payload: string }
}

export interface ApprovalRequest extends WorkflowEntity {
  subjectType: ApprovalSubject
  subjectId: EntityId
  assignedRole: Role
  history: ApprovalHistoryEntry[]
  decidedAt: ISODate | null
}

/** Metadata only; future mock repositories may persist browser Blobs in IndexedDB. */
export interface Document extends ScopedEntity {
  budgetRoutingId?: EntityId
  projectDocumentType?: ProjectDocumentType
  documentType?: RegistrationDocumentType
  fileName: string
  mimeType: string
  sizeBytes: number
  uploadedById: EntityId
  entityType: ApprovalSubject | 'project' | 'inventory' | 'cip_cost'
  entityId: EntityId
  storageKey: string
}

export type AuditValue = string | number | boolean | null
export interface AuditLog extends ScopedEntity {
  actorId: EntityId
  actorRole: Role
  resource: string
  entityId: EntityId
  action: string
  occurredAt: ISODate
  reason: string
  changes: { field: string; before: AuditValue; after: AuditValue }[]
  transactionId: EntityId
}

export interface Notification extends ScopedEntity {
  recipientId: EntityId
  title: string
  message: string
  severity: 'info' | 'success' | 'warning' | 'error'
  href: string | null
  readAt: ISODate | null
}

