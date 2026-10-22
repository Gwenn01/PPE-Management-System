import type { BudgetProcessing } from '../domain/budget.js'
import type { Document, ProjectDocumentRouting, User } from '../domain/models.js'
import type { ProjectDocumentType } from '../domain/construction.js'
import type { MockDatabase } from '../mock/database.js'
import { DataError } from './errors.js'

export const editableBudgetStatuses = ['received', 'under_review', 'incomplete', 'ready', 'accounting_returned']
export function appendBudgetEvent(processing: BudgetProcessing, actor: User, action: string, note: string, documentIds: string[], at: string) {
  processing.history.push({ id: crypto.randomUUID(), actorId: actor.id, actorRole: actor.role, occurredAt: at, action, note, documentIds: [...documentIds], snapshot: JSON.stringify({ status: processing.status, fund: processing.fund, voucher: processing.voucher, accountingUserId: processing.accountingUserId, treasury: processing.treasury, forwardedAt: processing.forwardedAt, accountingReceivedAt: processing.accountingReceivedAt }) })
}
export async function budgetEvidence(db: MockDatabase, route: ProjectDocumentRouting, type: ProjectDocumentType, packetSpecific = true): Promise<Document> {
  const records = await db.entity('documents').where('entityId').equals(route.projectId).toArray()
  const document = [...route.documentIds].reverse().map(id => records.find(d => d.id === id)).find(d => d?.entityType === 'project' && d.municipalityId === route.municipalityId && d.projectDocumentType === type && (!packetSpecific || d.budgetRoutingId === route.id))
  const stored = document && await db.blobs.get(document.storageKey)
  if (!document || !stored || stored.documentId !== document.id || stored.municipalityId !== route.municipalityId || stored.blob.size !== document.sizeBytes || stored.blob.type !== document.mimeType) throw new DataError('validation', `Upload valid local ${type.replaceAll('_', ' ')} evidence for this packet. Metadata-only files do not count.`)
  return document
}
