import { z } from 'zod'
import type { Document } from '../domain/models.js'
import type { MockDatabase } from '../mock/database.js'
import { authorize, commitMutation, writeAudit } from '../mock/unitOfWork.js'
import { subjectTables } from '../mock/validation/dataset.js'
import { documentNameSchema, parseEntity } from '../mock/validation/schemas.js'
import type { RequestContext } from './contracts.js'
import { scopedRecord, tableResources } from './entityAccess.js'
import { DataError, respond } from './errors.js'

export const documentLimits = { maxBytes: 5 * 1024 * 1024, mimeTypes: ['application/pdf', 'image/png', 'image/jpeg', 'text/plain'] } as const
export interface DocumentUpload { fileName: string; file: Blob; entityType: Document['entityType']; entityId: string }

async function validateFile(input: DocumentUpload): Promise<void> {
  z.strictObject({ fileName: documentNameSchema, file: z.instanceof(Blob), entityType: z.enum(['registration', 'capitalization', 'correction', 'transfer', 'maintenance', 'disposal', 'reconciliation', 'project', 'inventory', 'cip_cost']), entityId: z.string().min(1) }).parse(input)
  const file = input.file
  if (file.size < 1 || file.size > documentLimits.maxBytes || !(documentLimits.mimeTypes as readonly string[]).includes(file.type)) throw new DataError('validation', 'Use a nonempty PDF, PNG, JPEG or text file up to 5 MiB.')
  const extensions: Record<string, RegExp> = { 'application/pdf': /\.pdf$/i, 'image/png': /\.png$/i, 'image/jpeg': /\.jpe?g$/i, 'text/plain': /\.txt$/i }
  if (!extensions[file.type].test(input.fileName)) throw new DataError('validation', 'File extension and declared type must agree.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const signature = file.type === 'application/pdf' ? new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-'
    : file.type === 'image/png' ? [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)
    : file.type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : !bytes.includes(0)
  if (!signature) throw new DataError('validation', 'The file content does not match its declared type.')
}

export function createDocumentService(database: MockDatabase) {
  return {
    upload: (context: RequestContext, input: DocumentUpload) => respond(async () => {
      // Blob I/O is completed before entering an IndexedDB transaction.
      await validateFile(input)
      return commitMutation(database, async (transactionId) => {
        const actor = await authorize(database, context, 'documents', 'create')
        const table = subjectTables[input.entityType]
        const owner = await scopedRecord(database, actor, table, input.entityId)
        const resource = table === 'projects' && (actor.role === 'engineering_office' || actor.role === 'budget_office')
          ? actor.role === 'engineering_office' ? 'engineering_documents' : 'budget_documents' : tableResources[table]
        await authorize(database, context, resource, 'update')
        if (!['draft', 'returned'].includes(owner.workflowStatus)) throw new DataError('invalid_transition', 'Attach documents only to draft or returned requests.')
        const at = new Date().toISOString(), id = crypto.randomUUID()
        const document = parseEntity('documents', { id, municipalityId: actor.municipalityId, version: 1, createdAt: at, updatedAt: at, fileName: input.fileName, mimeType: input.file.type, sizeBytes: input.file.size, uploadedById: actor.id, entityType: input.entityType, entityId: input.entityId, storageKey: `upload:${id}` })
        const updated = parseEntity(table, { ...owner, documentIds: [...owner.documentIds, document.id], version: owner.version + 1, updatedAt: at })
        await database.entity('documents').add(document)
        await database.blobs.add({ id: document.storageKey, documentId: document.id, municipalityId: actor.municipalityId, blob: input.file })
        await database.entity(table).put(updated)
        await writeAudit(database, actor, transactionId, 'documents', null, document, 'upload')
        await writeAudit(database, actor, transactionId, table, owner, updated, 'attachDocument')
        return document
      })
    }),
    download: (context: RequestContext, id: string) => respond(() => database.transaction('r', database.tables, async () => {
      const actor = await authorize(database, context, 'documents', 'read')
      const document = await scopedRecord(database, actor, 'documents', z.string().min(1).parse(id))
      const stored = await database.blobs.get(document.storageKey)
      if (!stored) throw new DataError('not_found', 'This metadata-only demo document has no local file. JSON exports do not include attachment binaries.')
      if (stored.documentId !== document.id || stored.municipalityId !== actor.municipalityId || stored.blob.size !== document.sizeBytes || stored.blob.type !== document.mimeType) throw new DataError('storage_unavailable', 'The stored document does not match its metadata.')
      return { document, file: stored.blob }
    })),
  }
}
