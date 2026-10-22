import { registrationDocumentTypes } from '../../domain/registration.js'
import { z } from 'zod'
import { roleList } from '../../config/roles.js'
import { actions, resources } from '../../domain/permissions.js'
import type { EntityMap, EntityName } from '../../domain/data.js'
import { upgradeLegacyDataset } from './usernames.js'

const id = z.string().trim().min(1).max(160)
const text = z.string().trim().min(1).max(4000)
const notes = z.string().max(10000)
const date = z.union([z.iso.date(), z.iso.datetime()])
const timestamp = z.iso.datetime()
export const moneySchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
export const municipalityIdSchema = z.enum(['botolan', 'san_antonio'])
export const usernameSchema = z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9._-]{2,63}$/, 'Use 3–64 characters: start with a letter, then letters, numbers, dots, underscores or hyphens.')
export const workflowStatusSchema = z.enum(['draft', 'submitted', 'under_review', 'returned', 'approved', 'rejected', 'cancelled'])
const condition = z.enum(['good', 'fair', 'poor', 'unserviceable'])
const subject = z.enum(['registration', 'capitalization', 'correction', 'transfer', 'maintenance', 'disposal', 'reconciliation'])
export const documentNameSchema = z.string().min(1).max(200).regex(/^[^<>:"/\\|?*]+$/).refine((name) => Array.from(name).every((character) => character.charCodeAt(0) >= 32), 'Filename contains control characters.')
const base = { id, municipalityId: municipalityIdSchema, version: z.number().int().positive(), createdAt: timestamp, updatedAt: timestamp }
const workflow = { ...base, workflowStatus: workflowStatusSchema, requestedById: id, submittedAt: timestamp.nullable(), documentIds: z.array(id) }
const history = z.strictObject({ actorId: id, actorRole: z.enum(roleList), action: z.enum(['submit', 'review', 'approve', 'reject', 'return', 'cancel']), fromStatus: workflowStatusSchema, toStatus: workflowStatusSchema, reason: notes, occurredAt: timestamp, submission: z.strictObject({ subjectVersion: z.number().int().positive(), documentIds: z.array(id), payload: z.string().max(20000) }).optional() })
const auditValue = z.union([z.string(), z.number().finite(), z.boolean(), z.null()])

export const entitySchemas = {
  municipalities: z.strictObject({ id: municipalityIdSchema, name: z.enum(['Botolan', 'San Antonio']), province: z.literal('Zambales') }),
  departments: z.strictObject({ ...base, code: text, name: text, active: z.boolean() }),
  users: z.strictObject({ ...base, name: text, username: usernameSchema, email: z.email().toLowerCase(), role: z.enum(roleList), departmentId: id.nullable(), status: z.enum(['pending', 'active', 'disabled']), isDemo: z.literal(true) }),
  permissions: z.strictObject({ ...base, resource: z.enum(resources), action: z.enum(actions), role: z.enum(roleList), scope: z.literal('municipality') }),
  assetCategories: z.strictObject({ ...base, code: text, name: text, usefulLifeMonths: z.number().int().positive().max(1200) }),
  assets: z.strictObject({ ...base, propertyNumber: text, description: text, category: id, departmentId: id, custodianId: id.nullable(), location: text, acquisitionDate: date, acquisitionCost: moneySchema, lifecycleStatus: z.enum(['in_service', 'under_maintenance', 'idle', 'disposed']), recognitionStatus: z.enum(['awaiting_recognition', 'recognized']).optional(), condition, registrationId: id, constructionProjectId: id.nullable() }),
  registrations: z.strictObject({ ...workflow, proposedPropertyNumber: text, description: text, category: id, departmentId: id, custodianId: id.nullable(), location: text, acquisitionDate: date, acquisitionCost: moneySchema, acquisitionMethod: z.enum(['purchase', 'donation', 'construction', 'transfer']), recognizedAssetId: id.nullable() }),
  documents: z.strictObject({ ...base, documentType: z.enum(registrationDocumentTypes).optional(), fileName: documentNameSchema, mimeType: z.enum(['application/pdf', 'image/png', 'image/jpeg', 'text/plain']), sizeBytes: z.number().int().min(1).max(5 * 1024 * 1024), uploadedById: id, entityType: z.enum([...subject.options, 'project', 'inventory', 'cip_cost']), entityId: id, storageKey: id }),
  projects: z.strictObject({ ...workflow, projectNumber: text, name: text, location: text, departmentId: id, budgetAmount: moneySchema, startDate: date, completionDate: date.nullable(), projectStatus: z.enum(['planned', 'in_progress', 'completed', 'capitalized', 'cancelled']), capitalizedAssetId: id.nullable() }),
  documentRouting: z.strictObject({ ...workflow, projectId: id, documentId: id, fromRole: z.enum(roleList), toRole: z.enum(roleList), assignedUserId: id.nullable(), receivedAt: timestamp.nullable(), remarks: notes }),
  cipCosts: z.strictObject({ ...workflow, projectId: id, description: text, amount: moneySchema, incurredDate: date, accountingRecordId: id.nullable() }),
  inventorySessions: z.strictObject({ ...workflow, title: text, departmentId: id.nullable(), scheduledDate: date, assignedUserIds: z.array(id), sessionStatus: z.enum(['planned', 'in_progress', 'completed', 'cancelled']) }),
  inventoryChecks: z.strictObject({ ...base, sessionId: id, assetId: id, checkedById: id, checkedAt: timestamp, found: z.boolean(), observedLocation: text, observedCustodianId: id.nullable(), observedCondition: condition, notes }),
  discrepancies: z.strictObject({ ...workflow, inventoryCheckId: id, assetId: id, kind: z.enum(['missing', 'location', 'custodian', 'condition', 'record_error']), description: text, proposedCorrection: z.strictObject({ location: text.optional(), custodianId: id.nullable().optional(), condition: condition.optional(), description: text.optional() }), resolvedAt: timestamp.nullable() }),
  transfers: z.strictObject({ ...workflow, assetId: id, fromDepartmentId: id, toDepartmentId: id, fromCustodianId: id.nullable(), toCustodianId: id.nullable(), destinationLocation: text, effectiveDate: date, reason: text }),
  maintenance: z.strictObject({ ...workflow, assetId: id, description: text, estimatedCost: moneySchema, actualCost: moneySchema.nullable(), scheduledDate: date.nullable(), completedAt: timestamp.nullable() }),
  disposals: z.strictObject({ ...workflow, assetId: id, reason: text, method: z.enum(['sale', 'donation', 'destruction', 'other']), proceeds: moneySchema.nullable(), disposedAt: timestamp.nullable(), accountingRecordId: id.nullable() }),
  accountingRecords: z.strictObject({ ...base, recognitionDetails: z.strictObject({ treatment: z.enum(['depreciable_ppe', 'non_depreciable_ppe', 'semi_expendable', 'expense']), cost: moneySchema, residualValue: moneySchema, usefulLifeMonths: z.number().int().min(0).max(1200), startDate: z.iso.date(), startConvention: z.enum(['acquisition_month', 'following_month']), reason: text, policySnapshot: text }).optional(), assetId: id.nullable(), projectId: id.nullable(), sourceId: id, kind: z.enum(['recognition', 'cip', 'capitalization', 'depreciation', 'adjustment', 'disposal']), postingDate: date, accountCode: text, debit: moneySchema, credit: moneySchema, policyId: id.nullable(), policyVersion: z.number().int().positive().nullable(), postedById: id }),
  depreciationPolicies: z.strictObject({ ...base, belowThresholdTreatment: z.enum(['semi_expendable', 'expense']).optional(), name: text, isDemo: z.literal(true), method: z.literal('straight_line'), usefulLifeMonths: z.number().int().positive().max(1200), residualValuePercent: z.number().min(0).max(100).refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 1e-8, 'Use at most two decimal places.'), recognitionThreshold: moneySchema, startConvention: z.enum(['acquisition_month', 'following_month']), effectiveFrom: date, active: z.boolean() }),
  reconciliations: z.strictObject({ ...workflow, periodStart: date, periodEnd: date, propertyBalance: moneySchema, accountingBalance: moneySchema, differences: z.array(z.strictObject({ assetId: id, amount: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER), explanation: notes, resolved: z.boolean() })), adjustmentRecordIds: z.array(id) }),
  approvals: z.strictObject({ ...workflow, subjectType: subject, subjectId: id, assignedRole: z.enum(roleList), history: z.array(history), decidedAt: timestamp.nullable() }),
  notifications: z.strictObject({ ...base, recipientId: id, title: text, message: text, severity: z.enum(['info', 'success', 'warning', 'error']), href: z.string().regex(/^\/dashboard(?:\/[-a-z0-9/]+)?$/).nullable(), readAt: timestamp.nullable() }),
  auditLogs: z.strictObject({ ...base, actorId: id, actorRole: z.enum(roleList), resource: text, entityId: id, action: text, occurredAt: timestamp, reason: notes, changes: z.array(z.strictObject({ field: text, before: auditValue, after: auditValue })), transactionId: id }),
  settings: z.strictObject({ ...base, key: z.enum(['fiscal_year', 'demo_notice', 'registration_document_rules']), value: z.union([z.string().max(4000), z.number().int().min(0).max(9999), z.boolean()]), isDemo: z.literal(true) }),
} satisfies { [K in EntityName]: z.ZodType<EntityMap[K]> }

export const entityNames = Object.keys(entitySchemas) as EntityName[]
export const datasetSchema = z.strictObject({
  municipalities: entitySchemas.municipalities.array(), departments: entitySchemas.departments.array(), users: entitySchemas.users.array(),
  permissions: entitySchemas.permissions.array(), assetCategories: entitySchemas.assetCategories.array(), assets: entitySchemas.assets.array(),
  registrations: entitySchemas.registrations.array(), documents: entitySchemas.documents.array(), projects: entitySchemas.projects.array(),
  documentRouting: entitySchemas.documentRouting.array(), cipCosts: entitySchemas.cipCosts.array(), inventorySessions: entitySchemas.inventorySessions.array(),
  inventoryChecks: entitySchemas.inventoryChecks.array(), discrepancies: entitySchemas.discrepancies.array(), transfers: entitySchemas.transfers.array(),
  maintenance: entitySchemas.maintenance.array(), disposals: entitySchemas.disposals.array(), accountingRecords: entitySchemas.accountingRecords.array(),
  depreciationPolicies: entitySchemas.depreciationPolicies.array(), reconciliations: entitySchemas.reconciliations.array(), approvals: entitySchemas.approvals.array(),
  notifications: entitySchemas.notifications.array(), auditLogs: entitySchemas.auditLogs.array(), settings: entitySchemas.settings.array(),
})

export const envelopeSchema = z.strictObject({ format: z.literal('ppe-demo'), version: z.literal(1), municipalityId: municipalityIdSchema, exportedAt: timestamp, attachmentsIncluded: z.literal(false), data: z.preprocess(upgradeLegacyDataset, datasetSchema) })

export function parseEntity<K extends EntityName>(name: K, input: unknown): EntityMap[K] {
  // The schema map above is checked against EntityMap; TS cannot preserve a generic indexed union.
  return entitySchemas[name].parse(input) as EntityMap[K]
}
