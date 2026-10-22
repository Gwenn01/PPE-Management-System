import type { Asset, InventoryDiscrepancy } from '../domain/models.js'
import type { MockDatabase } from '../mock/database.js'
import { DataError } from './errors.js'

export async function validateInventoryCorrection(db: MockDatabase, discrepancy: InventoryDiscrepancy): Promise<Asset> {
  const investigation = discrepancy.investigation, proposal = investigation?.proposal
  if (!investigation || !proposal || !investigation.finding.trim() || !proposal.reason.trim() || discrepancy.resolvedAt) throw new DataError('validation', 'Investigate the discrepancy and prepare a justified correction before submission or approval.')
  const asset = await db.entity('assets').get(discrepancy.assetId)
  if (!asset || asset.municipalityId !== discrepancy.municipalityId) throw new DataError('not_found', 'Official asset is unavailable in this municipality.')
  if (asset.version !== proposal.assetVersion) throw new DataError('conflict', 'The official asset changed. Return the request and prepare it against current values.')
  if (investigation.flags.includes('missing') && !investigation.assetLocated) throw new DataError('validation', 'Missing assets remain unresolved until investigation records that the asset was located. Do not silently write off or dispose of a missing asset.')
  const changes = discrepancy.proposedCorrection
  if (proposal.resolution === 'correct_record' && (!Object.keys(changes).length || !Object.entries(changes).some(([key, value]) => asset[key as keyof Asset] !== value))) throw new DataError('validation', 'Select an actual record correction, or explicitly request confirmation without changing official fields.')
  if (proposal.resolution === 'confirm_record' && Object.keys(changes).length) throw new DataError('validation', 'Confirmation requests cannot silently change asset details.')
  if (changes.custodianId) {
    const custodian = await db.entity('users').get(changes.custodianId)
    if (!custodian || custodian.status !== 'active' || custodian.municipalityId !== asset.municipalityId || custodian.departmentId !== asset.departmentId) throw new DataError('validation', 'Select an active local custodian in the asset department.')
  }
  const check = await db.entity('inventoryChecks').get(discrepancy.inventoryCheckId)
  if (!check || check.assetId !== asset.id || check.municipalityId !== asset.municipalityId || check.sessionId !== investigation.sessionId) throw new DataError('validation', 'The discrepancy must retain its original session and inspection.')
  return asset
}
