import type * as Model from './models.js'
import type { PermissionRule } from './permissions.js'

export interface StoredPermission extends Model.ScopedEntity, PermissionRule {}
export interface EntityMap {
  municipalities: Model.Municipality
  departments: Model.Department
  users: Model.User
  permissions: StoredPermission
  assetCategories: Model.AssetCategory
  assets: Model.Asset
  registrations: Model.AssetRegistration
  documents: Model.Document
  projects: Model.ConstructionProject
  documentRouting: Model.ProjectDocumentRouting
  cipCosts: Model.CIPCost
  inventorySessions: Model.InventorySession
  inventoryChecks: Model.InventoryCheck
  discrepancies: Model.InventoryDiscrepancy
  transfers: Model.AssetTransfer
  maintenance: Model.MaintenanceRequest
  disposals: Model.DisposalRequest
  accountingRecords: Model.AccountingRecord
  depreciationPolicies: Model.DepreciationPolicy
  reconciliations: Model.Reconciliation
  approvals: Model.ApprovalRequest
  notifications: Model.Notification
  auditLogs: Model.AuditLog
  settings: Model.DemoSetting
}
export type EntityName = keyof EntityMap
export type Dataset = { [K in EntityName]: EntityMap[K][] }
export interface DatasetEnvelope {
  format: 'ppe-demo'
  version: 1
  municipalityId: Model.MunicipalityId
  exportedAt: string
  attachmentsIncluded: false
  data: Dataset
}
export interface StoredBlob {
  id: string
  municipalityId: Model.MunicipalityId
  documentId: string
  blob: Blob
}
export interface DatabaseState {
  id: 'state'
  schemaVersion: number
  seedVersion: number
  revision: number
}
