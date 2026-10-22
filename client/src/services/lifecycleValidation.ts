import { ppeMovement, depreciationMovement } from './accountingBalances.js'
import { defaultLifecyclePolicy, lifecycleTables, type DisposalImpact, type LifecycleKind } from '../domain/lifecycle.js'
import type { AssetTransfer, DisposalRequest, MaintenanceRequest } from '../domain/models.js'
import type { MockDatabase } from '../mock/database.js'
import { lifecyclePolicySchema } from '../domain/lifecycle.js'
import { safeTotal } from './cipValidation.js'
import { DataError } from './errors.js'

export type LifecycleRequest = AssetTransfer | MaintenanceRequest | DisposalRequest
export const lifecycleToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
export async function lifecyclePolicy(db: MockDatabase, municipalityId: string) {
  const setting = await db.entity('settings').where('municipalityId').equals(municipalityId).filter(s => s.key === 'lifecycle_policy').first()
  if (!setting) return structuredClone(defaultLifecyclePolicy)
  try { return lifecyclePolicySchema.parse(JSON.parse(String(setting.value))) } catch { throw new DataError('validation', 'Invalid lifecycle demonstration policy. Ask the Administrator to correct it.') }
}
export async function lifecycleEvidence(db: MockDatabase, kind: LifecycleKind, row: LifecycleRequest, required: boolean) {
  if (required && !row.documentIds.length) throw new DataError('validation', 'Attach a supporting document before processing this request.')
  for (const id of row.documentIds) {
    const d = await db.entity('documents').get(id), stored = d && await db.blobs.get(d.storageKey)
    if (!d || d.entityType !== kind || d.entityId !== row.id || d.municipalityId !== row.municipalityId || !stored || stored.documentId !== id || stored.municipalityId !== row.municipalityId || stored.blob.size !== d.sizeBytes || stored.blob.type !== d.mimeType) throw new DataError('validation', 'Lifecycle evidence requires a matching local file; metadata alone does not qualify.')
  }
}
export async function disposalImpact(db: MockDatabase, row: DisposalRequest): Promise<DisposalImpact> {
  const entries = (await db.entity('accountingRecords').where('assetId').equals(row.assetId).toArray()).sort((a, b) => a.id.localeCompare(b.id))
  if (entries.some(e => e.municipalityId !== row.municipalityId || e.kind === 'disposal')) throw new DataError('conflict', 'Disposal posting already exists or the asset ledger is inconsistent.')
  if (entries.some(e => e.postingDate.slice(0, 10) > row.lifecycle!.proposedDate)) throw new DataError('validation', 'The proposed disposal date cannot precede an existing asset accounting posting.')
  const ppe = entries.filter(ppeMovement)
  const cost = safeTotal(ppe.map(e => e.debit - e.credit)), accumulatedDepreciation = safeTotal(entries.filter(depreciationMovement).map(e => e.credit - e.debit))
  if (cost < 0 || accumulatedDepreciation < 0 || accumulatedDepreciation > cost) throw new DataError('validation', 'Resolve invalid PPE or excessive posted depreciation before disposal review.')
  return { treatment: ppe.length ? 'ppe_derecognition' : 'non_ppe_retirement', cost, accumulatedDepreciation, carryingValue: cost - accumulatedDepreciation, proceeds: row.proceeds ?? 0, ledgerSnapshot: JSON.stringify(entries) }
}
export async function validateLifecycle(db: MockDatabase, kind: LifecycleKind, row: LifecycleRequest) {
  const meta = row.lifecycle, asset = await db.entity('assets').get(row.assetId)
  if (!meta || !asset || asset.municipalityId !== row.municipalityId) throw new DataError('validation', 'Prepare this lifecycle request against a current local asset before processing.')
  if (asset.version !== meta.baseline.version) throw new DataError('conflict', 'The official asset changed. Return and revise an unapproved request, or create a fresh authorization request.')
  if (asset.lifecycleStatus === 'disposed' || kind !== 'maintenance' && asset.lifecycleStatus === 'under_maintenance') throw new DataError('invalid_transition', 'Disposed assets cannot be processed, and transfers/disposals must wait until active maintenance is completed.')
  if (meta.proposedDate < asset.acquisitionDate.slice(0, 10)) throw new DataError('validation', 'The transaction date cannot precede acquisition.')
  const disposals = await db.entity('disposals').where('municipalityId').equals(row.municipalityId).filter(d => d.assetId === row.assetId && d.id !== row.id && !['rejected', 'cancelled'].includes(d.workflowStatus) && !d.disposedAt && d.lifecycle?.stage !== 'cancelled').toArray()
  if (disposals.length) throw new DataError('conflict', 'An active disposal request already reserves this asset. Resolve it before another lifecycle action.')
  if (kind === 'transfer') {
    const transfer = row as AssetTransfer, department = await db.entity('departments').get(transfer.toDepartmentId)
    if (!department?.active || department.municipalityId !== row.municipalityId) throw new DataError('validation', 'Choose an active local destination department.')
    if (transfer.toCustodianId) { const u = await db.entity('users').get(transfer.toCustodianId); if (!u || u.status !== 'active' || u.municipalityId !== row.municipalityId || u.departmentId !== department.id) throw new DataError('validation', 'The destination custodian must be active in the destination department.') }
    if (asset.departmentId === transfer.toDepartmentId && asset.custodianId === transfer.toCustodianId && asset.location.trim().toLowerCase() === transfer.destinationLocation.trim().toLowerCase()) throw new DataError('validation', 'The transfer must change the department, custodian or location.')
  }
  if (kind === 'maintenance' && meta.stage !== 'in_progress' && asset.lifecycleStatus === 'under_maintenance') throw new DataError('conflict', 'Another maintenance transaction is already in progress.')
  if (kind === 'disposal') {
    const disposal = row as DisposalRequest
    if (['donation', 'destruction'].includes(disposal.method) && disposal.proceeds) throw new DataError('validation', 'Donation or destruction cannot include proposed sale proceeds.')
    if (asset.recognitionStatus === 'awaiting_recognition') throw new DataError('validation', 'Accounting must settle recognition before reviewing disposal.')
    for (const otherKind of ['transfer', 'maintenance'] as const) {
      const others = await db.entity(lifecycleTables[otherKind]).where('municipalityId').equals(row.municipalityId).filter(r => r.assetId === asset.id && ['submitted', 'under_review', 'approved'].includes(r.workflowStatus) && r.lifecycle?.stage !== 'completed' && r.lifecycle?.stage !== 'cancelled').toArray()
      if (others.length) throw new DataError('conflict', 'Resolve pending or authorized transfer/maintenance transactions before disposing of the asset.')
    }
  }
  return asset
}
export async function validateLifecycleAuthorization(db: MockDatabase, kind: LifecycleKind, row: LifecycleRequest) {
  const asset = await validateLifecycle(db, kind, row), meta = row.lifecycle!
  if (!meta.policy || meta.approvalRequired === null) throw new DataError('validation', 'Submit with a captured demonstration policy first.')
  await lifecycleEvidence(db, kind, row, kind === 'disposal' || (kind === 'transfer' ? meta.policy.transferDocumentsRequired : meta.policy.maintenanceDocumentsRequired))
  if (kind === 'disposal') {
    if (!meta.review || meta.review.impact.ledgerSnapshot !== (await disposalImpact(db, row as DisposalRequest)).ledgerSnapshot) throw new DataError('conflict', 'Disposal requires current Accounting review of the posted ledger. Return and resubmit for review.')
    const reviewer = await db.entity('users').get(meta.review.actorId)
    if (!reviewer || reviewer.role !== 'accounting_officer' || reviewer.municipalityId !== row.municipalityId) throw new DataError('validation', 'Disposal requires an Accounting Officer review.')
  }
  return asset
}
