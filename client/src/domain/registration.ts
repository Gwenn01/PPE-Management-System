/** Phase 06 document classifications and configurable fictional requirements.
 * These defaults are examples only, NOT official LGU procurement requirements.
 */
export const registrationDocumentTypes = [
  'purchase_request', 'canvass', 'purchase_order', 'obligation_request',
  'disbursement_voucher', 'requisition_issue_slip',
  'inspection_acceptance_report', 'property_acknowledgement_receipt',
] as const
export type RegistrationDocumentType = typeof registrationDocumentTypes[number]
export const registrationMethods = ['purchase', 'donation', 'construction', 'transfer'] as const
export type RegistrationMethod = typeof registrationMethods[number]
export type RegistrationDocumentRules = Record<RegistrationMethod, RegistrationDocumentType[]>
export const registrationDocumentLabels: Record<RegistrationDocumentType, string> = {
  purchase_request: 'Purchase Request', canvass: 'Canvass', purchase_order: 'Purchase Order',
  obligation_request: 'Obligation Request', disbursement_voucher: 'Disbursement Voucher',
  requisition_issue_slip: 'Requisition and Issue Slip',
  inspection_acceptance_report: 'Inspection and Acceptance Report',
  property_acknowledgement_receipt: 'Property Acknowledgement Receipt',
}
export const defaultRegistrationDocumentRules: RegistrationDocumentRules = {
  purchase: ['purchase_order', 'inspection_acceptance_report', 'property_acknowledgement_receipt'],
  donation: ['inspection_acceptance_report', 'property_acknowledgement_receipt'],
  construction: ['inspection_acceptance_report', 'property_acknowledgement_receipt'],
  transfer: ['requisition_issue_slip', 'property_acknowledgement_receipt'],
}

export function parseRegistrationRules(value: unknown): RegistrationDocumentRules {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Document rules must contain one list per acquisition method.')
  const obj = value as Record<string, unknown>
  if (Object.keys(obj).sort().join('|') !== [...registrationMethods].sort().join('|')) throw new Error('Rules must specify every acquisition method and no unknown methods.')
  const rules = {} as RegistrationDocumentRules
  for (const method of registrationMethods) {
    const entries = obj[method]
    if (!Array.isArray(entries) || entries.some((key) => !registrationDocumentTypes.includes(key as RegistrationDocumentType)) || new Set(entries).size !== entries.length) throw new Error(`Invalid document types for ${method}.`)
    rules[method] = entries as RegistrationDocumentType[]
  }
  return rules
}
