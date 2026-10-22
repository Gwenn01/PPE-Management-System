import { roleLabels, roleList } from '../config/roles'
import { municipalityList } from '../domain/municipalities'

export const municipalities = municipalityList.map((municipality) => municipality.name)

// Administrators are provisioned separately; public requests cannot select that role.
export const requestableRoles = roleList.filter((role) => role !== 'administrator').map((role) => roleLabels[role])
