import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { Dexie } from 'dexie'
import { roleList } from '../src/config/roles.js'
import type { Role } from '../src/config/roles.js'
import { DEMO_PASSWORD, DEMO_SESSION_KEY } from '../src/domain/auth.js'
import type { AuthSession } from '../src/domain/auth.js'
import { authRouteAccess, loginDestination } from '../src/domain/authAccess.js'
import type { RequestContext, ServiceResult } from '../src/services/contracts.js'
import type { AuthService, RegistrationRequest } from '../src/services/authContracts.js'
import { MockDatabase, versionOneSchema } from '../src/mock/database.js'
import { originalDataset } from '../src/mock/seeds/index.js'
import type { SessionStorageAdapter } from '../src/mock/sessionRepository.js'
import { createAuthService } from '../src/services/authService.js'
import { createMockDataServices } from '../src/services/mockDataService.js'
import { navItems, canAccessRoute, getNavGroups } from '../src/config/navigation.js'

class MemoryStorage implements SessionStorageAdapter {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}
function success<T>(result: ServiceResult<T>): T {
  if (!result.ok) assert.fail(`${result.error.code}: ${result.error.message} ${JSON.stringify(result.error.fields ?? {})}`)
  return result.data
}
function error<T>(result: ServiceResult<T>, code: string) {
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.error.code, code, result.error.message)
}
function context(session: AuthSession): RequestContext { return { sessionId: session.sessionId, actor: session.user, municipalityId: session.municipality.id } }
const registration: RegistrationRequest = {
  fullName: 'Fictional New Officer', username: 'new.officer', email: 'new.officer@example.com', municipalityId: 'botolan', departmentId: 'botolan-dept-general',
  requestedRole: 'property_officer', demoPassword: DEMO_PASSWORD, confirmDemoPassword: DEMO_PASSWORD, demoAcknowledged: true,
}

describe('frontend-only demo authentication', () => {
  let db: MockDatabase
  let local: MemoryStorage
  let tab: MemoryStorage
  let auth: AuthService
  const signIn = async (role: Role = 'administrator', remember = false) => success(await auth.login({ login: role, password: DEMO_PASSWORD, municipalityId: 'botolan', remember }))
  beforeEach(async () => {
    db = new MockDatabase(`ppe-auth-${crypto.randomUUID()}`)
    local = new MemoryStorage(); tab = new MemoryStorage()
    auth = createAuthService(db, { local, session: tab }, { development: true })
    await db.open()
  })
  afterEach(async () => { await db.delete() })

  it('starts signed out and never treats a legacy role preference as a session', async () => {
    local.setItem('ppe-dev-role', 'administrator')
    local.setItem('ppe-dev-municipality', 'botolan')
    assert.equal(success(await auth.restore()), null)
    assert.equal(await db.sessions.count(), 0)
  })

  it('loads public demo options and signs in all eight seeded roles in both municipalities', async () => {
    const options = success(await auth.getOptions())
    assert.equal(options.municipalities.length, 2)
    assert.equal(options.demoAccounts.length, 16)
    for (const municipality of options.municipalities) for (const role of roleList) {
      const session = success(await auth.login({ login: role.toUpperCase(), password: DEMO_PASSWORD, municipalityId: municipality.id, remember: false }))
      assert.equal(session.user.role, role)
      assert.equal(session.municipality.id, municipality.id)
      assert.ok(session.permissions.length)
      assert.ok(session.permissions.every((rule) => rule.role === role && rule.scope === 'municipality'))
      assert.equal(authRouteAccess('authenticated', session), 'allow')
    }
    assert.equal(await db.sessions.count(), 1)
  })

  it('accepts case-insensitive emails and usernames and loads the persisted identity', async () => {
    const session = success(await auth.login({ login: '  PROPERTY@EXAMPLE.COM  ', password: DEMO_PASSWORD, municipalityId: 'san_antonio', remember: false }))
    assert.equal(session.user.id, 'demo-san_antonio-property_officer')
    assert.equal(session.user.username, 'property_officer')
    assert.equal(session.user.departmentId, 'san_antonio-dept-general')
  })

  it('rejects required-field, nonexistent-account and invalid-password attempts without creating sessions', async () => {
    const before = await db.entity('auditLogs').count()
    error(await auth.login({ login: '', password: '', municipalityId: 'botolan', remember: false }), 'validation')
    error(await auth.login({ login: 'nobody', password: DEMO_PASSWORD, municipalityId: 'botolan', remember: false }), 'invalid_credentials')
    error(await auth.login({ login: 'administrator', password: 'wrong-password', municipalityId: 'botolan', remember: false }), 'invalid_credentials')
    assert.equal(await db.sessions.count(), 0)
    assert.equal(await db.entity('auditLogs').count(), before)
    assert.equal(local.values.size + tab.values.size, 0)
  })

  it('stores only a reference in sessionStorage when Remember Me is unchecked', async () => {
    const session = await signIn()
    assert.equal(local.getItem(DEMO_SESSION_KEY), null)
    assert.deepEqual(JSON.parse(tab.getItem(DEMO_SESSION_KEY)!), { version: 1, sessionId: session.sessionId })
    assert.equal(success(await createAuthService(db, { local, session: tab }).restore())!.user.id, session.user.id)
    assert.equal(success(await createAuthService(db, { local, session: new MemoryStorage() }).restore()), null)
    assert.ok(!JSON.stringify([...tab.values.values()]).includes(DEMO_PASSWORD))
  })

  it('remembers sessions in localStorage across new tabs and clears both stores when the mode changes', async () => {
    const remembered = await signIn('administrator', true)
    assert.equal(tab.getItem(DEMO_SESSION_KEY), null)
    assert.ok(local.getItem(DEMO_SESSION_KEY))
    assert.equal(success(await createAuthService(db, { local, session: new MemoryStorage() }).restore())!.sessionId, remembered.sessionId)
    const session = await signIn('auditor', false)
    assert.equal(local.getItem(DEMO_SESSION_KEY), null)
    assert.ok(tab.getItem(DEMO_SESSION_KEY))
    assert.equal(await db.sessions.get(remembered.sessionId), undefined)
    assert.equal(success(await auth.restore())!.sessionId, session.sessionId)
  })

  it('restores after a database reopen and refreshes current account details', async () => {
    const session = await signIn('administrator', true)
    const data = createMockDataServices(db)
    success(await data.entities.users.update(context(session), session.user.id, session.user.version, { name: 'Updated Fictional Administrator' }))
    const name = db.name
    db.close(); db = new MockDatabase(name)
    auth = createAuthService(db, { local, session: tab })
    const restored = success(await auth.restore())!
    assert.equal(restored.user.name, 'Updated Fictional Administrator')
    assert.equal(restored.sessionId, session.sessionId)
  })

  it('logs out by revoking the IndexedDB session and clearing local/tab references', async () => {
    const session = await signIn('administrator', true)
    success(await auth.logout(session.sessionId))
    assert.equal(local.getItem(DEMO_SESSION_KEY), null)
    assert.equal(tab.getItem(DEMO_SESSION_KEY), null)
    assert.equal(await db.sessions.get(session.sessionId), undefined)
    assert.equal(success(await auth.restore()), null)
    error(await createMockDataServices(db).entities.users.getAll(context(session)), 'forbidden')
    assert.equal(await db.entity('auditLogs').filter((row) => row.action === 'demo_logout').count(), 1)
    success(await auth.logout())
  })

  it('rejects corrupt, unknown and forged session references rather than selecting an account', async () => {
    for (const value of ['not-json', JSON.stringify({ role: 'administrator' }), JSON.stringify({ version: 1, sessionId: crypto.randomUUID() })]) {
      tab.setItem(DEMO_SESSION_KEY, value)
      assert.equal(success(await auth.restore()), null)
      assert.equal(tab.getItem(DEMO_SESSION_KEY), null)
    }
  })

  it('expires sessions, clears references and prevents later resurrection of disabled accounts', async () => {
    let session = await signIn()
    await db.sessions.update(session.sessionId, { expiresAt: '2000-01-01T00:00:00.000Z' })
    assert.equal(success(await auth.restore()), null)
    session = await signIn('property_officer')
    await db.entity('users').update(session.user.id, { status: 'disabled' })
    assert.equal(success(await auth.restore()), null)
    await db.entity('users').update(session.user.id, { status: 'active' })
    assert.equal(success(await auth.restore()), null)
    assert.equal(await db.sessions.get(session.sessionId), undefined)
  })

  it('fails closed when municipality, department or permission data cannot be loaded', async () => {
    const session = await signIn()
    const permission = await db.entity('permissions').filter((rule) => rule.municipalityId === 'botolan' && rule.role === 'administrator' && rule.resource === 'dashboard').first()
    await db.entity('permissions').delete(permission!.id)
    error(await auth.restore(), 'forbidden')
    assert.equal(tab.getItem(DEMO_SESSION_KEY), null)
    assert.equal(authRouteAccess('error', null), 'error')
    await db.entity('permissions').put(permission!)
    await db.entity('departments').update(session.user.departmentId!, { active: false })
    error(await auth.login({ login: 'administrator', password: DEMO_PASSWORD, municipalityId: 'botolan', remember: false }), 'forbidden')
    await db.entity('departments').update(session.user.departmentId!, { active: true })
    await db.entity('municipalities').delete('botolan')
    error(await auth.login({ login: 'administrator', password: DEMO_PASSWORD, municipalityId: 'botolan', remember: false }), 'forbidden')
  })

  it('rolls back session creation when browser reference storage fails', async () => {
    const before = await db.entity('auditLogs').count()
    const blocked: SessionStorageAdapter = { getItem: () => null, setItem: () => { throw new Error('Blocked') }, removeItem: () => {} }
    const service = createAuthService(db, { local, session: blocked })
    error(await service.login({ login: 'administrator', password: DEMO_PASSWORD, municipalityId: 'botolan', remember: false }), 'storage_unavailable')
    assert.equal(await db.sessions.count(), 0)
    assert.equal(await db.entity('auditLogs').count(), before)
    error(await createAuthService(db, {}).login({ login: 'administrator', password: DEMO_PASSWORD, municipalityId: 'botolan', remember: true }), 'storage_unavailable')
  })

  it('saves registration as Pending without a session, password or privileged role grant', async () => {
    const user = success(await auth.register(registration))
    assert.equal(user.status, 'pending')
    assert.equal(user.username, registration.username)
    assert.equal(await db.sessions.count(), 0)
    assert.equal(success(await auth.restore()), null)
    assert.equal('password' in user || 'demoPassword' in user, false)
    assert.ok(!JSON.stringify(await db.snapshot()).includes(DEMO_PASSWORD))
    assert.equal(await db.entity('auditLogs').filter((row) => row.entityId === user.id && row.action === 'request_account').count(), 1)
    assert.equal(await db.entity('notifications').filter((row) => row.href === '/dashboard/users' && row.recipientId === 'demo-botolan-administrator').count(), 1)
    error(await auth.login({ login: user.username, password: DEMO_PASSWORD, municipalityId: 'botolan', remember: false }), 'account_pending')
  })

  it('rolls back account requests and notifications if their audit cannot be persisted', async () => {
    const before = await db.snapshot()
    const fail = () => { throw new Error('Simulated audit failure') }
    db.entity('auditLogs').hook('creating', fail)
    error(await auth.register(registration), 'storage_unavailable')
    db.entity('auditLogs').hook('creating').unsubscribe(fail)
    assert.deepEqual(await db.snapshot(), before)
    assert.equal(await db.sessions.count(), 0)
  })

  it('requires valid registration fields, an in-scope active department and demo acknowledgement', async () => {
    error(await auth.register({ ...registration, departmentId: 'san_antonio-dept-general' }), 'validation')
    error(await auth.register({ ...registration, requestedRole: 'administrator' } as unknown as RegistrationRequest), 'validation')
    error(await auth.register({ ...registration, demoPassword: 'a-personal-password' }), 'validation')
    error(await auth.register({ ...registration, confirmDemoPassword: 'different' }), 'validation')
    error(await auth.register({ ...registration, demoAcknowledged: false } as unknown as RegistrationRequest), 'validation')
    error(await auth.register({ ...registration, email: 'invalid', username: 'a' }), 'validation')
    error(await auth.register({ ...registration, status: 'active' } as unknown as RegistrationRequest), 'validation')
    await db.entity('departments').update('botolan-dept-general', { active: false })
    error(await auth.register(registration), 'validation')
    assert.equal(await db.entity('users').count(), 16)
  })

  it('rejects duplicate usernames/emails case-insensitively and concurrent requests atomically', async () => {
    error(await auth.register({ ...registration, username: 'PROPERTY_OFFICER' }), 'duplicate')
    error(await auth.register({ ...registration, email: 'PROPERTY@EXAMPLE.COM' }), 'duplicate')
    const results = await Promise.all([auth.register(registration), auth.register(registration)])
    assert.equal(results.filter((result) => result.ok).length, 1)
    error(results.find((result) => !result.ok)!, 'duplicate')
    assert.equal(await db.entity('users').count(), 17)
  })

  it('allows the same fictional login in a different municipality without sharing its record', async () => {
    const first = success(await auth.register(registration))
    const second = success(await auth.register({ ...registration, municipalityId: 'san_antonio', departmentId: 'san_antonio-dept-general' }))
    assert.notEqual(first.id, second.id)
    assert.equal(first.municipalityId, 'botolan')
    assert.equal(second.municipalityId, 'san_antonio')
  })

  it('requires local Administrator review before a Pending user can log in', async () => {
    const pending = success(await auth.register(registration))
    const admin = await signIn()
    const foreignAuth = createAuthService(db, { session: new MemoryStorage(), local: new MemoryStorage() })
    const foreign = success(await foreignAuth.login({ login: 'administrator', password: DEMO_PASSWORD, municipalityId: 'san_antonio', remember: false }))
    error(await auth.reviewAccount(context(foreign), pending.id, pending.version, 'approve', ''), 'not_found')
    const property = success(await foreignAuth.login({ login: 'property_officer', password: DEMO_PASSWORD, municipalityId: 'botolan', remember: false }))
    error(await auth.reviewAccount(context(property), pending.id, pending.version, 'approve', ''), 'forbidden')
    const active = success(await auth.reviewAccount(context(admin), pending.id, pending.version, 'approve', 'Fictional municipal access approved.'))
    assert.equal(active.status, 'active')
    assert.equal(await db.entity('auditLogs').filter((row) => row.entityId === active.id && row.action === 'approve_account').count(), 1)
    const session = success(await auth.login({ login: active.username, password: DEMO_PASSWORD, municipalityId: active.municipalityId, remember: false }))
    assert.equal(session.user.id, active.id)
  })

  it('records rejection reasons and prevents rejected/disabled or stale requests from signing in', async () => {
    const pending = success(await auth.register(registration))
    const admin = await signIn()
    error(await auth.reviewAccount(context(admin), pending.id, pending.version, 'reject', ''), 'validation')
    const rejected = success(await auth.reviewAccount(context(admin), pending.id, pending.version, 'reject', 'Fictional request not approved.'))
    error(await auth.login({ login: pending.username, password: DEMO_PASSWORD, municipalityId: 'botolan', remember: false }), 'account_disabled')
    error(await auth.reviewAccount(context(admin), rejected.id, rejected.version, 'approve', ''), 'invalid_transition')
    error(await auth.reviewAccount(context(admin), rejected.id, 1, 'approve', ''), 'conflict')
  })

  it('keeps a request Pending when its department is disabled before approval', async () => {
    const pending = success(await auth.register(registration))
    const admin = await signIn()
    await db.entity('departments').update(pending.departmentId!, { active: false })
    error(await auth.reviewAccount(context(admin), pending.id, pending.version, 'approve', ''), 'validation')
    assert.equal((await db.entity('users').get(pending.id))!.status, 'pending')
  })

  it('switches only between active seeded accounts in development and rotates the session', async () => {
    const before = await signIn('property_officer', true)
    const switched = success(await auth.switchAccount('demo-san_antonio-engineering_office'))
    assert.equal(switched.user.role, 'engineering_office')
    assert.equal(switched.user.municipalityId, 'san_antonio')
    assert.notEqual(switched.sessionId, before.sessionId)
    assert.equal(await db.sessions.get(before.sessionId), undefined)
    assert.equal(switched.remember, true)
    error(await createAuthService(db, { local, session: tab }).switchAccount('demo-botolan-administrator'), 'forbidden')
    success(await auth.logout())
    error(await auth.switchAccount('demo-botolan-administrator'), 'forbidden')
  })

  it('serializes account switching and logout so delayed work cannot restore a logged-out session', async () => {
    const before = await signIn()
    const [switched, loggedOut] = await Promise.all([auth.switchAccount('demo-botolan-auditor'), auth.logout(before.sessionId)])
    success(switched); success(loggedOut)
    assert.equal(success(await auth.restore()), null)
    assert.equal(await db.sessions.count(), 0)
  })

  it('denies business requests without a valid session even when the supplied role is Administrator', async () => {
    const session = await signIn()
    const data = createMockDataServices(db)
    error(await data.entities.users.getAll({ ...context(session), sessionId: 'invented' }), 'forbidden')
    error(await data.entities.users.getAll({ ...context(session), municipalityId: 'san_antonio' }), 'forbidden')
    success(await auth.logout())
    error(await data.entities.users.getAll(context(session)), 'forbidden')
  })

  it('invalidates sessions after dataset replacement and retains previously exported JSON compatibility', async () => {
    const session = await signIn()
    const data = createMockDataServices(db)
    const exported = success(await data.dataset.exportJson(context(session)))
    const legacy: unknown = JSON.parse(exported.json)
    assert.ok(legacy && typeof legacy === 'object' && 'data' in legacy)
    const old = legacy as { data: { users: Record<string, unknown>[] } }
    for (const user of old.data.users) delete user.username
    success(await data.dataset.importJson(context(session), JSON.stringify(legacy)))
    assert.equal(success(await auth.restore()), null)
    assert.equal((await db.entity('users').get(session.user.id))!.username, 'administrator')
  })

  it('restores seeds without username collisions when archiving a historical actor', async () => {
    const admin = await signIn()
    const data = createMockDataServices(db)
    success(await data.entities.users.update(context(admin), admin.user.id, admin.user.version, { username: 'renamed_admin' }))
    const pending = success(await auth.register({ ...registration, username: 'administrator' }))
    success(await auth.reviewAccount(context(admin), pending.id, pending.version, 'approve', 'Demo review.'))
    const otherAuth = createAuthService(db, { local: new MemoryStorage(), session: new MemoryStorage() })
    success(await otherAuth.login({ login: pending.username, password: DEMO_PASSWORD, municipalityId: 'botolan', remember: false }))
    const preview = success(await data.dataset.prepareReset(context(admin)))
    success(await data.dataset.reset(context(admin), { confirmationId: preview.confirmationId, confirmationText: preview.confirmationText }))
    const archived = (await db.entity('users').get(pending.id))!
    assert.equal(archived.status, 'disabled')
    assert.notEqual(archived.username, 'administrator')
    assert.equal((await db.entity('users').get(admin.user.id))!.username, 'administrator')
    assert.equal(success(await auth.restore()), null)
    assert.equal(success(await otherAuth.restore()), null)
  })
})

describe('authenticated route access rules', () => {
  it('keeps restoring/error states closed and sends unauthenticated direct URLs to login', () => {
    for (const route of navItems) {
      assert.equal(authRouteAccess('anonymous', null, route.permission), 'login')
      assert.equal(authRouteAccess('loading', null, route.permission), 'loading')
      assert.equal(authRouteAccess('error', null, route.permission), 'error')
    }
  })

  it('permits only loaded role grants and municipality scope for direct URL navigation', async () => {
    const db = new MockDatabase(`ppe-routes-${crypto.randomUUID()}`)
    const auth = createAuthService(db, { local: new MemoryStorage(), session: new MemoryStorage() })
    try {
      for (const role of roleList) {
        const session = success(await auth.login({ login: role, password: DEMO_PASSWORD, municipalityId: 'botolan', remember: false }))
        for (const route of navItems) {
          assert.equal(authRouteAccess('authenticated', session, route.permission), canAccessRoute(session.user, route, session.user) ? 'allow' : 'forbidden')
          assert.equal(authRouteAccess('authenticated', session, route.permission, 'san_antonio'), 'forbidden')
        }
        assert.deepEqual(getNavGroups(session.user, session.user, []), [])
        assert.equal(authRouteAccess('authenticated', { ...session, permissions: [] }), 'forbidden')
        assert.equal(authRouteAccess('authenticated', { ...session, expiresAt: '2000-01-01T00:00:00.000Z' }), 'login')
        assert.equal(authRouteAccess('authenticated', { ...session, expiresAt: 'broken' }), 'login')
        assert.equal(authRouteAccess('authenticated', session, undefined, undefined, role === 'administrator' ? ['auditor'] : ['administrator']), 'forbidden')
      }
    } finally { await db.delete() }
  })

  it('restores only internal dashboard destinations and rejects external or normalized escapes', () => {
    assert.equal(loginDestination('/dashboard/assets?search=demo#row'), '/dashboard/assets?search=demo#row')
    for (const invalid of [null, {}, '', 'https://example.com', '//example.com', '/dashboard/../../login', '/dashboard\\evil', '/login']) assert.equal(loginDestination(invalid), '/dashboard')
  })
})

describe('authentication database migration', () => {
  it('migrates old users without reseeding, with deterministic collision-free usernames', async () => {
    const name = `ppe-auth-migration-${crypto.randomUUID()}`
    const old = new Dexie(name)
    old.version(1).stores(versionOneSchema)
    await old.open()
    const source = originalDataset().users[0]
    const { username, ...legacy } = source
    void username
    await old.table('users').bulkAdd([legacy, { ...legacy, id: 'legacy-user-a', email: 'same@example.com' }, { ...legacy, id: 'legacy-user-b', email: 'same@another.example' }])
    await old.table('metadata').add({ id: 'state', seedVersion: 1, schemaVersion: 1, revision: 8 })
    old.close()
    const upgraded = new MockDatabase(name)
    try {
      await upgraded.open()
      const users = await upgraded.entity('users').toArray()
      assert.equal(users.length, 3)
      assert.equal(new Set(users.map((user) => user.username)).size, 3)
      assert.equal((await upgraded.entity('users').get(source.id))!.username, source.role)
      assert.equal(await upgraded.entity('assets').count(), 0)
      assert.equal((await upgraded.metadata.get('state'))!.revision, 8)
      assert.equal((await upgraded.metadata.get('state'))!.schemaVersion, 3)
      assert.equal(await upgraded.sessions.count(), 0)
    } finally { await upgraded.delete() }
  })
})
