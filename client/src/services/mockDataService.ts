import { createRegistrationService } from './registrationService.js'
import { createApprovalManagementService } from './approvalService.js'
import { createAdministratorService } from './administratorService.js'
import { database, DATABASE_VERSION } from '../mock/database.js'
import type { MockDatabase } from '../mock/database.js'
import { createDatasetService } from './datasetService.js'
import { createDocumentService } from './documentService.js'
import { createBatchService, createEntityServices, createIdentityStatusService, createNotificationService } from './entityService.js'
import { DataError, respond } from './errors.js'

/** Public composition root. No HTTP calls; future implementations can retain the DTOs. */
export function createMockDataServices(storage: MockDatabase = database) {
  return {
    initialize: () => respond(async () => {
      await storage.open()
      const state = await storage.metadata.get('state')
      if (!state || state.schemaVersion !== DATABASE_VERSION) throw new DataError('storage_unavailable', 'Database metadata is missing or incompatible. Existing records were not overwritten.')
      return { schemaVersion: storage.verno }
    }),
    entities: createEntityServices(storage),
    administration: createAdministratorService(storage),
    registration: createRegistrationService(storage),
    approvals: createApprovalManagementService(storage),
    documents: createDocumentService(storage),
    users: { changeStatus: createIdentityStatusService(storage) },
    notifications: { markRead: createNotificationService(storage) },
    batch: createBatchService(storage),
    dataset: createDatasetService(storage),
  }
}

export type MockDataServices = ReturnType<typeof createMockDataServices>
export const mockDataServices = createMockDataServices()

