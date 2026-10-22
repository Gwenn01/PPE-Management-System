import type { AssetRegistration, User } from '../domain/models.js'
import { defaultRegistrationDocumentRules, parseRegistrationRules, registrationDocumentLabels, type RegistrationDocumentRules } from '../domain/registration.js'
import type { MockDatabase } from '../mock/database.js'
import { DataError } from './errors.js'

export async function getRegistrationRules(db: MockDatabase, municipalityId: User['municipalityId']): Promise<RegistrationDocumentRules> {
  const row = await db.entity('settings').where('[municipalityId+key]').equals([municipalityId, 'registration_document_rules']).first()
  if (!row) return structuredClone(defaultRegistrationDocumentRules) // Existing pre-Phase-06 databases remain compatible.
  try { return parseRegistrationRules(JSON.parse(String(row.value))) }
  catch { throw new DataError('validation', 'Municipal registration document rules are invalid; ask the Administrator to correct them.') }
}

export async function validateRegistrationFields(db: MockDatabase, actor: User, row: AssetRegistration): Promise<void> {
  const municipalityId = actor.municipalityId
  if (!row.description.trim() || !row.proposedPropertyNumber.trim() || !row.location.trim() || row.acquisitionCost <= 0 || !Number.isSafeInteger(row.acquisitionCost)) throw new DataError('validation', 'Asset name, property number, location and a positive acquisition cost are required.')
  const category = await db.entity('assetCategories').get(row.category)
  const department = await db.entity('departments').get(row.departmentId)
  const custodian = row.custodianId ? await db.entity('users').get(row.custodianId) : null
  if (!category || category.municipalityId !== municipalityId) throw new DataError('validation', 'Select a category in your municipality.')
  if (!department?.active || department.municipalityId !== municipalityId) throw new DataError('validation', 'Select an active department in your municipality.')
  if (!custodian || custodian.municipalityId !== municipalityId || custodian.status !== 'active' || custodian.departmentId !== department.id) throw new DataError('validation', 'Select an active custodian assigned to the chosen department.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.acquisitionDate) || Number.isNaN(Date.parse(`${row.acquisitionDate}T00:00:00Z`)) || new Date(`${row.acquisitionDate}T00:00:00Z`).toISOString().slice(0, 10) !== row.acquisitionDate) throw new DataError('validation', 'Provide a valid acquisition date.')
  const matching = await db.entity('assets').where('municipalityId').equals(municipalityId).filter((asset) => asset.propertyNumber.trim().toLowerCase() === row.proposedPropertyNumber.trim().toLowerCase() && asset.registrationId !== row.id).first()
  if (matching) throw new DataError('duplicate', 'Property number is already used by a registered PPE asset.')
  const registered = await db.entity('registrations').where('municipalityId').equals(municipalityId).filter((entry) => entry.id !== row.id && entry.proposedPropertyNumber.trim().toLowerCase() === row.proposedPropertyNumber.trim().toLowerCase()).first()
  if (registered) throw new DataError('duplicate', 'Another registration already uses this property number (including closed requests).')
}

export async function validateRegistrationSubmission(db: MockDatabase, actor: User, row: AssetRegistration): Promise<void> {
  await validateRegistrationFields(db, actor, row)
  const rules = await getRegistrationRules(db, actor.municipalityId)
  const required = rules[row.acquisitionMethod]
  const documents = await Promise.all(row.documentIds.map((id) => db.entity('documents').get(id)))
  const available = await Promise.all(documents.map(async (doc) => ({ doc, blob: doc ? await db.blobs.get(doc.storageKey) : undefined })))
  const types = new Set(available.filter(({ doc, blob }) => !!doc && !!blob && blob.municipalityId === actor.municipalityId && blob.documentId === doc.id && doc.municipalityId === actor.municipalityId && doc.entityId === row.id && doc.entityType === 'registration').map(({ doc }) => doc!.documentType))
  const missing = required.filter((type) => !types.has(type))
  if (missing.length) throw new DataError('validation', `Upload the supporting documents required for ${row.acquisitionMethod}: ${missing.map((type) => registrationDocumentLabels[type]).join(', ')}.`, { documents: missing.join(', ') })
}
