import type { DatasetEnvelope, EntityMap, EntityName } from '../domain/data.js'
import type { WorkflowStatus } from '../domain/models.js'
import type { RequestContext, ServiceResult } from './contracts.js'

export const writableEntities = ['departments', 'users', 'assetCategories', 'registrations', 'projects', 'documentRouting', 'cipCosts', 'inventorySessions', 'inventoryChecks', 'discrepancies', 'transfers', 'maintenance', 'disposals', 'depreciationPolicies', 'reconciliations', 'settings'] as const
export type WritableEntity = (typeof writableEntities)[number]
export const workflowEntities = ['registrations', 'projects', 'documentRouting', 'cipCosts', 'inventorySessions', 'discrepancies', 'transfers', 'maintenance', 'disposals', 'reconciliations'] as const
export type WorkflowEntityName = (typeof workflowEntities)[number]
export const protectedFields = ['id', 'municipalityId', 'version', 'createdAt', 'updatedAt', 'workflowStatus', 'requestedById', 'submittedAt', 'documentIds', 'recognizedAssetId', 'capitalizedAssetId', 'projectStatus', 'sessionStatus', 'accountingRecordId', 'resolvedAt', 'completedAt', 'disposedAt', 'history', 'decidedAt', 'isDemo', 'status', 'fromRole', 'checkedById', 'checkedAt'] as const
export type CreateInput<K extends WritableEntity> = Omit<EntityMap[K], (typeof protectedFields)[number]>
export interface EntityQuery<K extends EntityName> {
  filters?: Partial<{ [P in keyof EntityMap[K]]: Extract<EntityMap[K][P], string | number | boolean | null> }>
  search?: string
  offset?: number
  limit?: number
}
export interface EntityReader<K extends EntityName> {
  getAll(context: RequestContext, query?: EntityQuery<K>): Promise<ServiceResult<EntityMap[K][]>>
  getById(context: RequestContext, id: string): Promise<ServiceResult<EntityMap[K]>>
}
export interface EntityWriter<K extends WritableEntity> {
  create(context: RequestContext, input: CreateInput<K>): Promise<ServiceResult<EntityMap[K]>>
  update(context: RequestContext, id: string, expectedVersion: number, changes: Partial<CreateInput<K>>): Promise<ServiceResult<EntityMap[K]>>
}
export interface WorkflowWriter<K extends WorkflowEntityName> {
  submit(context: RequestContext, id: string, expectedVersion: number): Promise<ServiceResult<EntityMap[K]>>
  changeStatus(context: RequestContext, id: string, expectedVersion: number, status: WorkflowStatus, reason: string): Promise<ServiceResult<EntityMap[K]>>
}
export type EntityService<K extends EntityName> = EntityReader<K>
  & (K extends WritableEntity ? EntityWriter<K> : object)
  & (K extends WorkflowEntityName ? WorkflowWriter<K> : object)
export type EntityServices = { [K in EntityName]: EntityService<K> }
export type MutationCommand = { [K in WritableEntity]:
  | { entity: K; operation: 'create'; input: CreateInput<K> }
  | { entity: K; operation: 'update'; id: string; expectedVersion: number; changes: Partial<CreateInput<K>> }
}[WritableEntity]
export interface ResetChallenge {
  confirmationId: string
  confirmationText: string
  expiresAt: string
  recordCount: number
  attachmentCount: number
  warning: string
}
export interface ResetConfirmation { confirmationId: string; confirmationText: string }
export interface DemoDataExport { json: string; fileName: string; recordCount: number }
export interface DatasetTools {
  exportJson(context: RequestContext): Promise<ServiceResult<DemoDataExport>>
  importJson(context: RequestContext, json: string): Promise<ServiceResult<{ imported: number }>>
  prepareReset(context: RequestContext): Promise<ServiceResult<ResetChallenge>>
  reset(context: RequestContext, confirmation: ResetConfirmation): Promise<ServiceResult<{ restored: number }>>
}
export type { DatasetEnvelope }
