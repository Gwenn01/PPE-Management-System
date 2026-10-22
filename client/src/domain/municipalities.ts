import type { Municipality, MunicipalityId } from './models.js'

export const municipalityList: readonly Municipality[] = [
  { id: 'botolan', name: 'Botolan', province: 'Zambales' },
  { id: 'san_antonio', name: 'San Antonio', province: 'Zambales' },
]

export function isMunicipalityId(value: unknown): value is MunicipalityId {
  return municipalityList.some((municipality) => municipality.id === value)
}
