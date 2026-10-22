import type { Asset, AssetCondition, InventoryCheck } from './models.js'
export const inventoryFlags = ['missing', 'location', 'custodian', 'condition', 'record_error'] as const
export type InventoryFlag = typeof inventoryFlags[number]
export interface AssetInspectionSnapshot {
  version: number
  propertyNumber: string
  description: string
  departmentId: string
  location: string
  custodianId: string | null
  condition: AssetCondition
}
export interface InventoryEvent { id: string; actorId: string; occurredAt: string; action: string; note: string }
export interface SessionInventory { locationScope: string | null; assetIds: string[]; history: InventoryEvent[] }
export interface InspectionAttempt {
  revision: number
  checkedById: string
  checkedAt: string
  found: boolean
  observedLocation: string
  observedCustodianId: string | null
  observedCondition: AssetCondition
  notes: string
  baseline: AssetInspectionSnapshot
  flags: InventoryFlag[]
  result: 'verified' | 'discrepancy'
}
export interface InspectionHistory {
  attempts: InspectionAttempt[]
  reopen: { actorId: string; occurredAt: string; reason: string } | null
  reopens: { actorId: string; occurredAt: string; reason: string }[]
}
export interface DiscrepancyInvestigation {
  sessionId: string
  checkRevision: number
  detectedById: string
  flags: InventoryFlag[]
  investigatorId: string | null
  finding: string
  assetLocated: boolean
  proposal: { assetVersion: number; baseline: AssetInspectionSnapshot; reason: string; resolution: 'correct_record' | 'confirm_record'; preparedAt: string } | null
  history: InventoryEvent[]
}
export function assetSnapshot(asset: Asset): AssetInspectionSnapshot {
  return { version: asset.version, propertyNumber: asset.propertyNumber, description: asset.description, departmentId: asset.departmentId, location: asset.location, custodianId: asset.custodianId, condition: asset.condition }
}
export function inspectionFlags(asset: AssetInspectionSnapshot, observed: Pick<InventoryCheck, 'found' | 'observedLocation' | 'observedCustodianId' | 'observedCondition'>): InventoryFlag[] {
  if (!observed.found) return ['missing']
  const flags: InventoryFlag[] = []
  if (asset.location.trim().toLowerCase() !== observed.observedLocation.trim().toLowerCase()) flags.push('location')
  if (asset.custodianId !== observed.observedCustodianId) flags.push('custodian')
  if (asset.condition !== observed.observedCondition || ['poor', 'unserviceable'].includes(observed.observedCondition)) flags.push('condition')
  return flags
}
/** Scanner payloads never navigate to or fetch arbitrary URLs. */
export function normalizePropertyCode(value: string): string {
  const code = value.trim().replace(/^PPE:/i, '').trim()
  if (!code || code.length > 160 || (code.includes('\r') || code.includes('\n') || code.includes(String.fromCharCode(0))) || /^https?:/i.test(code)) throw new Error('Enter a property number, asset ID or PPE:property-number code.')
  return code.toLowerCase()
}
