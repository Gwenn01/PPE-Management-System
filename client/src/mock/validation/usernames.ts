/** Additive migration for pre-authentication records/JSON exports. Never replaces supplied names. */
export function withLegacyUsernames<T extends { id: string; email: string; municipalityId: string; role: string; username?: string }>(users: T[]): (T & { username: string })[] {
  const used = new Set(users.filter((user) => typeof user.username === 'string').map((user) => `${user.municipalityId}:${user.username!.toLowerCase()}`))
  return users.map((user) => {
    if (user.username !== undefined) return user as T & { username: string }
    const base = (user.id === `demo-${user.municipalityId}-${user.role}` ? user.role : user.email.split('@')[0]).toLowerCase().replace(/[^a-z0-9._-]/g, '_').slice(0, 48)
    const prefix = /^[a-z][a-z0-9._-]{2,}$/.test(base) ? base : `demo_${base}`
    let username = prefix, suffix = 1
    while (used.has(`${user.municipalityId}:${username}`)) username = `${prefix}_${suffix++}`
    used.add(`${user.municipalityId}:${username}`)
    return { ...user, username }
  })
}

export function upgradeLegacyDataset(input: unknown): unknown {
  if (!input || typeof input !== 'object' || !('users' in input) || !Array.isArray(input.users)) return input
  if (!input.users.every((row: unknown) => !!row && typeof row === 'object' && 'id' in row && typeof row.id === 'string' && 'email' in row && typeof row.email === 'string' && 'role' in row && typeof row.role === 'string' && 'municipalityId' in row && typeof row.municipalityId === 'string')) return input
  return { ...input, users: withLegacyUsernames(input.users as Parameters<typeof withLegacyUsernames>[0]) }
}
