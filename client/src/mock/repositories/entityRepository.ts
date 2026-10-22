import type { EntityMap, EntityName } from '../../domain/data.js'
import type { MunicipalityId } from '../../domain/models.js'
import type { MockDatabase } from '../database.js'

/** Internal persistence adapter. Components must use services, never this adapter directly. */
export function entityRepository<K extends EntityName>(database: MockDatabase, name: K) {
  const table = database.entity(name)
  return {
    getAll: (municipalityId: MunicipalityId): Promise<EntityMap[K][]> => name === 'municipalities'
      ? table.filter((row) => row.id === municipalityId).toArray()
      : table.where('municipalityId').equals(municipalityId).toArray(),
    getById: (id: string): Promise<EntityMap[K] | undefined> => table.get(id),
    create: async (record: EntityMap[K]): Promise<void> => { await table.add(record) },
    update: async (record: EntityMap[K]): Promise<void> => { await table.put(record) },
  }
}
