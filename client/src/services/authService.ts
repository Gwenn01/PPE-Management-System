import { z } from 'zod'
import type { AuthService } from './authContracts.js'
import type { AuthSession, DemoSessionRecord } from '../domain/auth.js'
import { DEMO_PASSWORD, demoSessionLifetime } from '../domain/auth.js'
import type { User } from '../domain/models.js'
import { hasRolePermission } from '../domain/permissions.js'
import { MockDatabase, DATABASE_VERSION } from '../mock/database.js'
import { createSessionRepository } from '../mock/sessionRepository.js'
import type { SessionStores } from '../mock/sessionRepository.js'
import { authorize, commitMutation, writeAudit } from '../mock/unitOfWork.js'
import { parseEntity } from '../mock/validation/schemas.js'
import { loginSchema, registrationSchema } from '../features/auth/validation.js'
import { scopedRecord } from './entityAccess.js'
import { DataError, respond } from './errors.js'
import { roleLabels } from '../config/roles.js'

export function createAuthService(database: MockDatabase, stores: SessionStores, options: { development: boolean } = { development: false }): AuthService {
  const references = createSessionRepository(stores)
  async function ready() {
    await database.open()
    if ((await database.metadata.get('state'))?.schemaVersion !== DATABASE_VERSION) throw new DataError('storage_unavailable', 'Demo database metadata is unavailable. Existing data was not overwritten.')
  }
  async function hydrate(record: DemoSessionRecord): Promise<AuthSession | null> {
    const validRecord = z.strictObject({ id: z.uuid(), userId: z.string().min(1), municipalityId: z.enum(['botolan', 'san_antonio']), role: z.string(), issuedAt: z.iso.datetime(), expiresAt: z.iso.datetime(), remember: z.boolean() }).safeParse(record)
    if (!validRecord.success || Date.parse(record.expiresAt) <= Date.parse(record.issuedAt)) return null
    const user = await database.entity('users').get(record.userId)
    if (!user || user.status !== 'active' || user.role !== record.role || user.municipalityId !== record.municipalityId || Date.parse(record.expiresAt) <= Date.now()) return null
    const municipality = await database.entity('municipalities').get(user.municipalityId)
    const permissions = (await database.entity('permissions').where('[municipalityId+role]').equals([user.municipalityId, user.role]).toArray())
      .filter((permission) => permission.scope === 'municipality' && hasRolePermission(user.role, permission))
    if (!municipality || !permissions.some((permission) => permission.resource === 'dashboard' && permission.action === 'read')) throw new DataError('forbidden', 'Municipality or demo permissions could not be loaded. Ask a demo Administrator to review the data.')
    if (user.departmentId) {
      const department = await database.entity('departments').get(user.departmentId)
      if (!department?.active || department.municipalityId !== user.municipalityId) throw new DataError('forbidden', 'The assigned department is unavailable in this municipality.')
    }
    return { sessionId: record.id, user, municipality, permissions, expiresAt: record.expiresAt, remember: record.remember }
  }
  async function issue(user: User, remember: boolean, transactionId: string, previousId: string | null, action: string): Promise<AuthSession> {
    if (previousId) await database.sessions.delete(previousId)
    const at = new Date().toISOString()
    const record: DemoSessionRecord = { id: crypto.randomUUID(), userId: user.id, municipalityId: user.municipalityId, role: user.role, issuedAt: at, expiresAt: new Date(Date.now() + (remember ? demoSessionLifetime.remembered : demoSessionLifetime.tab)).toISOString(), remember }
    await database.sessions.add(record)
    const session = await hydrate(record)
    if (!session) throw new DataError('forbidden', 'Only active demo accounts can sign in.')
    await writeAudit(database, user, transactionId, 'users', user, user, action, 'DEMO ONLY: public demonstration credentials; not production authentication.')
    // Web Storage contains only a session reference. A failed IDB commit leaves an
    // invalid reference, which restore rejects; no default identity is substituted.
    references.save(record.id, remember)
    return session
  }
  const service: AuthService = {
    getOptions: () => respond(async () => {
      await ready()
      return database.transaction('r', database.tables, async () => ({
        municipalities: await database.entity('municipalities').toArray(),
        departments: await database.entity('departments').filter((department) => department.active).toArray(),
        demoAccounts: (await database.entity('users').filter((user) => user.id === `demo-${user.municipalityId}-${user.role}`).toArray())
          .map(({ id, name, username, email, role, municipalityId, status }) => ({ id, name, username, email, role, municipalityId, status })),
      }))
    }),
    login: (input) => respond(async () => {
      const request = loginSchema.parse(input)
      await ready()
      return commitMutation(database, async (transactionId) => {
        const login = request.login.toLowerCase()
        const user = await database.entity('users').where('municipalityId').equals(request.municipalityId).filter((row) => row.email.toLowerCase() === login || row.username.toLowerCase() === login).first()
        if (!user) throw new DataError('invalid_credentials', 'No demo account exists for this login and municipality.')
        if (request.password !== DEMO_PASSWORD) throw new DataError('invalid_credentials', 'Invalid demo credentials. Use the displayed public demo password.')
        if (user.status === 'pending') throw new DataError('account_pending', 'Your account request is Pending. A municipal Administrator must approve it before sign-in.')
        if (user.status !== 'active') throw new DataError('account_disabled', 'This demo account is disabled or its request was rejected. Ask your demo Administrator.')
        return issue(user, request.remember, transactionId, references.read(), 'demo_login')
      })
    }),
    restore: () => respond(async () => {
      const id = references.read()
      if (!id) return null
      await ready()
      try {
        const session = await database.transaction('r', database.tables, async () => {
          const record = await database.sessions.get(id)
          return record ? hydrate(record) : null
        })
        if (session) return session
        await database.sessions.delete(id)
        references.clear()
        return null
      } catch (error) {
        // Fail closed if permissions, account or storage cannot be validated.
        references.clear()
        throw error
      }
    }),
    logout: (knownId) => respond(async () => {
      try {
        let storedId: string | null = null
        try { storedId = references.read() } catch (error) { if (!knownId) throw error }
        const ids = [...new Set([knownId, storedId].filter((id): id is string => !!id))]
        if (!ids.length) return
        await ready()
        await commitMutation(database, async (transactionId) => {
          for (const id of ids) {
            const old = await database.sessions.get(id)
            if (!old) continue
            const user = await database.entity('users').get(old.userId)
            await database.sessions.delete(id)
            if (user) await writeAudit(database, user, transactionId, 'users', user, user, 'demo_logout', 'Mock session revoked.')
          }
        })
      } finally { references.clear() }
    }),
    register: (input) => respond(async () => {
      const request = registrationSchema.parse(input)
      await ready()
      return commitMutation(database, async (transactionId) => {
        const department = await database.entity('departments').get(request.departmentId)
        if (!department?.active || department.municipalityId !== request.municipalityId) throw new DataError('validation', 'Choose an active department in your municipality.', { departmentId: 'Select a department in the chosen municipality.' })
        const duplicates = await database.entity('users').where('municipalityId').equals(request.municipalityId).filter((user) => user.username.toLowerCase() === request.username || user.email.toLowerCase() === request.email).toArray()
        if (duplicates.length) throw new DataError('duplicate', 'That username or email is already registered in this municipality.', {
          ...(duplicates.some((row) => row.username.toLowerCase() === request.username) ? { username: 'This username is already in use.' } : {}),
          ...(duplicates.some((row) => row.email.toLowerCase() === request.email) ? { email: 'This email is already in use.' } : {}),
        })
        const at = new Date().toISOString()
        const user = parseEntity('users', { id: crypto.randomUUID(), municipalityId: request.municipalityId, version: 1, createdAt: at, updatedAt: at, name: request.fullName, username: request.username, email: request.email, role: request.requestedRole, departmentId: request.departmentId, status: 'pending', isDemo: true })
        await database.entity('users').add(user)
        await writeAudit(database, user, transactionId, 'users', null, user, 'request_account', 'Public demo registration; Pending until local Administrator approval. No password is stored.')
        const administrators = await database.entity('users').where('municipalityId').equals(user.municipalityId).filter((row) => row.role === 'administrator' && row.status === 'active').toArray()
        for (const admin of administrators) {
          const notification = parseEntity('notifications', { id: crypto.randomUUID(), municipalityId: user.municipalityId, version: 1, createdAt: at, updatedAt: at, recipientId: admin.id, title: 'Demo account request', message: `${user.name} requested access as ${roleLabels[user.role]}.`, severity: 'info', href: '/dashboard/users', readAt: null })
          await database.entity('notifications').add(notification)
          await writeAudit(database, user, transactionId, 'notifications', null, notification, 'create')
        }
        return user
      })
    }),
    switchAccount: (userId) => respond(async () => {
      if (!options.development) throw new DataError('forbidden', 'Demo account switching is available only in development builds.')
      const id = references.read()
      if (!id) throw new DataError('forbidden', 'Sign in before using the development account switcher.')
      await ready()
      return commitMutation(database, async (transactionId) => {
        const current = await database.sessions.get(id)
        if (!current || !await hydrate(current)) throw new DataError('forbidden', 'The current mock session is no longer valid.')
        const target = await database.entity('users').get(z.string().min(1).parse(userId))
        if (!target || target.id !== `demo-${target.municipalityId}-${target.role}` || target.status !== 'active') throw new DataError('forbidden', 'Select an active seeded demo account.')
        return issue(target, current.remember, transactionId, id, 'development_account_switch')
      })
    }),
    reviewAccount: (context, id, version, decision, reason) => respond(() => commitMutation(database, async (transactionId) => {
      const actor = await authorize(database, context, 'users', 'manage')
      const old = await scopedRecord(database, actor, 'users', z.string().min(1).parse(id))
      z.number().int().positive().parse(version)
      z.enum(['approve', 'reject']).parse(decision)
      const note = z.string().trim().max(1000).parse(reason)
      if (old.version !== version) throw new DataError('conflict', 'The account request changed. Reload the list.')
      if (old.status !== 'pending') throw new DataError('invalid_transition', 'Only Pending account requests can be reviewed here.')
      if (decision === 'reject' && !note) throw new DataError('validation', 'Provide a reason for rejecting this account request.')
      if (decision === 'approve') {
        const department = old.departmentId ? await database.entity('departments').get(old.departmentId) : undefined
        if (!department?.active || department.municipalityId !== old.municipalityId) throw new DataError('validation', 'The requested department must be active before this account can be approved.')
      }
      const at = new Date().toISOString()
      const user = parseEntity('users', { ...old, status: decision === 'approve' ? 'active' : 'disabled', version: old.version + 1, updatedAt: at })
      await database.entity('users').put(user)
      await database.sessions.where('userId').equals(user.id).delete()
      await writeAudit(database, actor, transactionId, 'users', old, user, `${decision}_account`, note || 'Demo account request approved by local Administrator.')
      return user
    })),
  }
  // Serialize local session changes so a late login/switch cannot undo logout.
  let pending: Promise<unknown> = Promise.resolve()
  function queued<T>(operation: () => Promise<T>): Promise<T> {
    const result = pending.then(operation, operation)
    pending = result.then(() => undefined, () => undefined)
    return result
  }
  return { ...service,
    login: (request) => queued(() => service.login(request)),
    restore: () => queued(() => service.restore()),
    logout: (id) => queued(() => service.logout(id)),
    switchAccount: (id) => queued(() => service.switchAccount(id)),
  }
}
