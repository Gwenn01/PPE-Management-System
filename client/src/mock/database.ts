import { Dexie } from 'dexie'
import type { Table } from 'dexie'
import type { DatabaseState, Dataset, EntityMap, EntityName, StoredBlob } from '../domain/data.js'
import { entityNames } from './validation/schemas.js'
import { originalDataset } from './seeds/index.js'
import type { User } from '../domain/models.js'
import type { DemoSessionRecord } from '../domain/auth.js'
import { withLegacyUsernames } from './validation/usernames.js'

export const DATABASE_VERSION = 3

const scoped = 'id, municipalityId'
export const versionOneSchema: Record<EntityName | 'metadata', string> = {
  municipalities: 'id', departments: `${scoped}, &[municipalityId+code]`, users: `${scoped}, &[municipalityId+email], role`,
  permissions: `${scoped}, [municipalityId+role]`, assetCategories: `${scoped}, &[municipalityId+code]`,
  assets: `${scoped}, &[municipalityId+propertyNumber], departmentId, lifecycleStatus`,
  registrations: `${scoped}, &[municipalityId+proposedPropertyNumber], workflowStatus`,
  documents: `${scoped}, &storageKey, entityId`, projects: `${scoped}, &[municipalityId+projectNumber], workflowStatus`,
  documentRouting: `${scoped}, projectId, toRole, workflowStatus`, cipCosts: `${scoped}, projectId, workflowStatus`,
  inventorySessions: `${scoped}, workflowStatus`, inventoryChecks: `${scoped}, sessionId, assetId, &[sessionId+assetId]`,
  discrepancies: `${scoped}, assetId, workflowStatus`, transfers: `${scoped}, assetId, workflowStatus`,
  maintenance: `${scoped}, assetId, workflowStatus`, disposals: `${scoped}, assetId, workflowStatus`,
  accountingRecords: `${scoped}, assetId, projectId, postingDate`, depreciationPolicies: scoped,
  reconciliations: `${scoped}, workflowStatus`, approvals: `${scoped}, subjectId, workflowStatus`,
  notifications: `${scoped}, recipientId`, auditLogs: `${scoped}, occurredAt`, settings: `${scoped}, &[municipalityId+key]`, metadata: 'id',
}

export class MockDatabase extends Dexie {
  constructor(name = 'ppe-demo') {
    super(name)
    this.version(1).stores(versionOneSchema)
    this.version(2).stores({ blobs: 'id, municipalityId, &documentId', auditLogs: `${scoped}, occurredAt, transactionId` }).upgrade(async (transaction) => {
      const table = transaction.table<DatabaseState, string>('metadata')
      const state = await table.get('state')
      await table.put({ id: 'state', seedVersion: state?.seedVersion ?? 1, revision: state?.revision ?? 0, schemaVersion: 2 })
    })
    this.version(3).stores({ users: `${versionOneSchema.users}, &[municipalityId+username]`, sessions: 'id, userId, municipalityId, expiresAt' }).upgrade(async (transaction) => {
      const users = transaction.table<Omit<User, 'username'> & { username?: string }, string>('users')
      const current = await users.toArray()
      await users.bulkPut(withLegacyUsernames(current))
      const metadata = transaction.table<DatabaseState, string>('metadata')
      const state = await metadata.get('state')
      if (state) await metadata.put({ ...state, schemaVersion: DATABASE_VERSION })
    })
    this.on('populate', async (transaction) => {
      const data = originalDataset()
      for (const name of entityNames) await transaction.table<EntityMap[EntityName], string>(name).bulkAdd(data[name])
      await transaction.table<DatabaseState, string>('metadata').add({ id: 'state', seedVersion: 1, schemaVersion: DATABASE_VERSION, revision: 0 })
    })
    this.on('versionchange', () => this.close())
  }

  entity<K extends EntityName>(name: K): Table<EntityMap[K], string> { return this.table(name) }
  get blobs(): Table<StoredBlob, string> { return this.table('blobs') }
  get metadata(): Table<DatabaseState, string> { return this.table('metadata') }
  get sessions(): Table<DemoSessionRecord, string> { return this.table('sessions') }

  async snapshot(): Promise<Dataset> {
    const entries = await Promise.all(entityNames.map(async (name) => [name, await this.entity(name).toArray()] as const))
    return Object.fromEntries(entries) as Dataset
  }
}

export const database = new MockDatabase()
