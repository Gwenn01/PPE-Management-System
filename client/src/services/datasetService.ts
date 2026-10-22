import { z } from 'zod'
import type { Dataset, DatasetEnvelope, EntityMap, EntityName } from '../domain/data.js'
import type { MunicipalityId, User } from '../domain/models.js'
import type { MockDatabase } from '../mock/database.js'
import { originalDataset } from '../mock/seeds/index.js'
import { authorize, commitMutation, writeAudit } from '../mock/unitOfWork.js'
import { recordMunicipality, validateDataset } from '../mock/validation/dataset.js'
import { entityNames, envelopeSchema, parseEntity } from '../mock/validation/schemas.js'
import type { DatasetTools, ResetChallenge } from './dataContracts.js'
import { DataError, respond } from './errors.js'

export const datasetLimits = { maxJsonBytes: 10 * 1024 * 1024, resetExpiryMs: 5 * 60 * 1000 } as const

function scopeDataset(data: Dataset, municipalityId: MunicipalityId): Dataset {
  return Object.fromEntries(entityNames.map((name) => [name, data[name].filter((row) => recordMunicipality(name, row) === municipalityId)])) as Dataset
}
function count(data: Dataset): number { return entityNames.reduce((total, name) => total + data[name].length, 0) }
function sameData(a: EntityMap[EntityName], b: EntityMap[EntityName]): boolean {
  const clean = (row: EntityMap[EntityName]) => Object.fromEntries(Object.entries(row).filter(([key]) => !['version', 'createdAt', 'updatedAt'].includes(key)).sort(([a], [b]) => a.localeCompare(b)))
  return JSON.stringify(clean(a)) === JSON.stringify(clean(b))
}

async function replaceScope(database: MockDatabase, actor: User, replacement: Dataset, transactionId: string, operation: 'import' | 'reset'): Promise<void> {
  const before = scopeDataset(await database.snapshot(), actor.municipalityId)
  if (operation === 'import') {
    for (const old of before.projects.filter(p => p.construction)) {
      const incoming = replacement.projects.find(p => p.id === old.id)
      if (!incoming || !sameData(old, incoming)) throw new DataError('conflict', 'Construction history cannot be removed or rewritten by import.')
    }
    if (replacement.projects.some(p => p.construction && !before.projects.some(old => old.id === p.id && old.construction))) throw new DataError('validation', 'Register tracked projects through the construction workflow.')
    const trackedIds = new Set(before.projects.filter(p => p.construction).map(p => p.id))
    for (const old of before.cipCosts.filter(c => c.accounting)) {
      const incoming = replacement.cipCosts.find(c => c.id === old.id)
      if (!incoming || !sameData(old, incoming)) throw new DataError('conflict', 'CIP expenditure and capitalization history cannot be rewritten by import.')
    }
    if (replacement.cipCosts.some(c => c.accounting && !before.cipCosts.some(old => old.id === c.id))) throw new DataError('validation', 'Record managed CIP through Accounting processing.')
    for (const name of ['documents', 'documentRouting'] as const) {
      const tracked = (row: EntityMap[typeof name]) => 'projectId' in row ? trackedIds.has(row.projectId) : trackedIds.has(row.entityId)
      for (const old of before[name].filter(tracked)) {
        const incoming = replacement[name].find(row => row.id === old.id)
        if (!incoming || !sameData(old, incoming)) throw new DataError('conflict', 'Construction document and forwarding history cannot be rewritten by import.')
      }
      if (replacement[name].some(row => tracked(row) && !before[name].some(old => old.id === row.id))) throw new DataError('validation', 'Upload and forward construction evidence through the project workflow.')
    }
    for (const old of before.accountingRecords) {
      const incoming = replacement.accountingRecords.find(row => row.id === old.id)
      if (!incoming || !sameData(old, incoming)) throw new DataError('conflict', 'Authorized accounting history cannot be removed or rewritten by import.')
    }
    if (replacement.accountingRecords.some(row => row.recognitionDetails && !before.accountingRecords.some(old => old.id === row.id))) throw new DataError('validation', 'Authorize recognition through Accounting Review, not dataset import.')
  }
  const at = new Date().toISOString()
  // Audit history survives replacements. An import cannot rewrite an existing audit event.
  const incomingLogs = new Map(replacement.auditLogs.map((row) => [row.id, row]))
  if (operation === 'import' && replacement.auditLogs.some((row) => !before.auditLogs.some((old) => old.id === row.id))) throw new DataError('validation', 'Imported data cannot fabricate new historical audit events.')
  for (const old of before.auditLogs) {
    const imported = incomingLogs.get(old.id)
    if (imported && JSON.stringify(parseEntity('auditLogs', imported)) !== JSON.stringify(parseEntity('auditLogs', old))) throw new DataError('conflict', 'An existing audit event cannot be rewritten by import.')
    incomingLogs.set(old.id, old)
  }
  replacement.auditLogs = [...incomingLogs.values()]
  // Keep historical actor IDs resolvable without preserving their active accounts.
  const historicalActors = new Set(replacement.auditLogs.map((row) => row.actorId))
  historicalActors.add(actor.id)
  for (const old of before.users) if (historicalActors.has(old.id) && !replacement.users.some((row) => row.id === old.id)) {
    const prefix = `archived_${old.id.replace(/[^a-z0-9._-]/gi, '_').toLowerCase().slice(0, 45)}`
    let username = prefix, suffix = 1
    while (replacement.users.some((user) => user.username === username)) username = `${prefix}_${suffix++}`
    replacement.users.push({ ...old, username, name: `${old.name} (archived demo identity)`, email: `archived-${old.id}@example.invalid`, departmentId: null, status: 'disabled' })
  }
  for (const name of entityNames) {
    if (name === 'auditLogs') continue
    const oldRows = before[name] as EntityMap[Exclude<EntityName, 'auditLogs'>][]
    const newRows = replacement[name] as EntityMap[Exclude<EntityName, 'auditLogs'>][]
    for (let index = 0; index < newRows.length; index++) {
      const incoming = newRows[index]
      const old = oldRows.find((row) => row.id === incoming.id)
      if (old && sameData(old, incoming)) { newRows[index] = old; continue }
      const next = 'version' in incoming ? { ...incoming, version: old && 'version' in old ? Math.max(old.version + 1, incoming.version) : incoming.version, createdAt: old && 'createdAt' in old ? old.createdAt : incoming.createdAt, updatedAt: at } : incoming
      newRows[index] = next
      await writeAudit(database, actor, transactionId, name, old ?? null, next, `${operation}-${old ? 'update' : 'create'}`)
    }
    for (const old of oldRows) if (!newRows.some((row) => row.id === old.id)) await writeAudit(database, actor, transactionId, name, old, null, `${operation}-remove`)
    const table = database.entity(name)
    if (name === 'municipalities') await table.delete(actor.municipalityId)
    else await table.where('municipalityId').equals(actor.municipalityId).delete()
    await table.bulkAdd(newRows)
  }
  // Append imported historical entries without deleting the new mutation audits above.
  for (const row of replacement.auditLogs) {
    const existing = await database.entity('auditLogs').get(row.id)
    if (existing && JSON.stringify(parseEntity('auditLogs', existing)) !== JSON.stringify(parseEntity('auditLogs', row))) throw new DataError('conflict', 'Conflicting audit identity in dataset.')
    if (!existing) await database.entity('auditLogs').add(row)
  }
  const documents = await database.entity('documents').where('municipalityId').equals(actor.municipalityId).toArray()
  const stored = await database.blobs.where('municipalityId').equals(actor.municipalityId).toArray()
  for (const file of stored) if (!documents.some((document) => document.storageKey === file.id && document.id === file.documentId && document.mimeType === file.blob.type && document.sizeBytes === file.blob.size)) await database.blobs.delete(file.id)
  const municipality = replacement.municipalities[0]
  // Replaced identity/policy data must never leave previous sessions active.
  await database.sessions.where('municipalityId').equals(actor.municipalityId).delete()
  await writeAudit(database, actor, transactionId, 'municipalities', municipality, municipality, operation, `${operation === 'reset' ? 'Explicitly confirmed seed reset' : 'Validated JSON dataset import'} for ${actor.municipalityId}; files are not embedded in JSON.`)
}

export function createDatasetService(database: MockDatabase): DatasetTools {
  const challenges = new Map<string, ResetChallenge & { actorId: string; municipalityId: MunicipalityId; revision: number }>()
  return {
    exportJson: (context) => respond(() => database.transaction('r', database.tables, async () => {
      await authorize(database, context, 'demo_data', 'export')
      const data = scopeDataset(await database.snapshot(), context.municipalityId)
      validateDataset(data)
      const envelope: DatasetEnvelope = { format: 'ppe-demo', version: 1, municipalityId: context.municipalityId, exportedAt: new Date().toISOString(), attachmentsIncluded: false, data }
      const json = JSON.stringify(envelope, null, 2)
      if (new TextEncoder().encode(json).byteLength > datasetLimits.maxJsonBytes) throw new DataError('validation', 'The dataset exceeds the 10 MiB JSON transfer limit.')
      return { json, fileName: `ppe-demo-${context.municipalityId}.json`, recordCount: count(data) }
    })),
    importJson: (context, json) => respond(async () => {
      if (typeof json !== 'string' || new TextEncoder().encode(json).byteLength > datasetLimits.maxJsonBytes) throw new DataError('validation', 'Import a JSON dataset up to 10 MiB.')
      let input: unknown
      try { input = JSON.parse(json) } catch { throw new DataError('validation', 'The file is not valid JSON.') }
      const envelope = envelopeSchema.parse(input)
      if (envelope.municipalityId !== context.municipalityId || envelope.data.municipalities.length !== 1 || entityNames.some((name) => envelope.data[name].some((row) => recordMunicipality(name, row) !== context.municipalityId))) throw new DataError('forbidden', 'Import only the current municipality; cross-municipality replacement is forbidden.')
      const data = validateDataset(envelope.data)
      const importedCount = count(data)
      return commitMutation(database, async (transactionId) => {
        const actor = await authorize(database, context, 'demo_data', 'manage')
        const importedActor = data.users.find((user) => user.id === actor.id)
        if (!importedActor || importedActor.role !== 'administrator' || importedActor.status !== 'active') throw new DataError('validation', 'Keep the importing Administrator active in the dataset.')
        await replaceScope(database, actor, data, transactionId, 'import')
        return { imported: importedCount }
      })
    }),
    prepareReset: (context) => respond(() => database.transaction('r', database.tables, async () => {
      const actor = await authorize(database, context, 'demo_data', 'manage')
      const state = await database.metadata.get('state')
      if (!state) throw new DataError('storage_unavailable', 'Database state is unavailable.')
      for (const [id, challenge] of challenges) if (Date.parse(challenge.expiresAt) <= Date.now()) challenges.delete(id)
      const challenge: ResetChallenge = {
        confirmationId: crypto.randomUUID(), confirmationText: `RESET ${actor.municipalityId.toUpperCase()} DEMO DATA`,
        expiresAt: new Date(Date.now() + datasetLimits.resetExpiryMs).toISOString(),
        recordCount: count(scopeDataset(await database.snapshot(), actor.municipalityId)),
        attachmentCount: await database.blobs.where('municipalityId').equals(actor.municipalityId).count(),
        warning: 'This restores original fictional seed records and removes local changes and uploaded files in this municipality. Audit history is retained. Other municipalities are unchanged.',
      }
      challenges.set(challenge.confirmationId, { ...challenge, actorId: actor.id, municipalityId: actor.municipalityId, revision: state.revision })
      return challenge
    })),
    reset: (context, input) => respond(async () => {
      const confirmation = z.strictObject({ confirmationId: z.string().min(1), confirmationText: z.string().min(1) }).parse(input)
      const challenge = challenges.get(confirmation.confirmationId)
      if (!challenge || challenge.actorId !== context.actor.id || challenge.municipalityId !== context.municipalityId || challenge.confirmationText !== confirmation.confirmationText || Date.parse(challenge.expiresAt) <= Date.now()) throw new DataError('validation', 'Obtain a fresh reset preview and enter its exact confirmation text.')
      const result = await commitMutation(database, async (transactionId) => {
        const actor = await authorize(database, context, 'demo_data', 'manage')
        const state = await database.metadata.get('state')
        if (state?.revision !== challenge.revision) throw new DataError('conflict', 'Data changed after the reset preview. Obtain a new preview before resetting.')
        const data = scopeDataset(originalDataset(), actor.municipalityId)
        const seedRecordCount = count(data)
        await replaceScope(database, actor, data, transactionId, 'reset')
        return { restored: seedRecordCount }
      })
      challenges.delete(confirmation.confirmationId)
      return result
    }),
  }
}

