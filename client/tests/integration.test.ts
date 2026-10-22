import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MockDatabase } from '../src/mock/database.js'
import { createMockDataServices } from '../src/services/mockDataService.js'
import { createDashboardService } from '../src/services/dashboardService.js'
import { reportTypes } from '../src/services/reportingService.js'
import { prepareTable } from '../src/components/ui/tableUtils.js'
import type { ServiceResult } from '../src/services/contracts.js'

function ok<T>(result: ServiceResult<T>): T {
  if (!result.ok) assert.fail(JSON.stringify(result.error))
  return result.data
}

test('report preview/export parity, source totals, all roles, scope and reopen persistence', async () => {
  const db = new MockDatabase(`integration-${crypto.randomUUID()}`)
  const services = createMockDataServices(db)
  try {
    ok(await services.initialize())
    const users = await db.entity('users').toArray()
    for (const actor of users) {
      const sessionId = crypto.randomUUID()
      await db.sessions.add({ id: sessionId, userId: actor.id, municipalityId: actor.municipalityId, role: actor.role, issuedAt: new Date().toISOString(), expiresAt: '2099-01-01T00:00:00.000Z', remember: false })
      const ctx = { actor, municipalityId: actor.municipalityId, sessionId }
      const dashboard = ok(await createDashboardService(db).getSnapshot(ctx))
      assert.equal(dashboard.role, actor.role)
      assert.equal(dashboard.municipalityId, actor.municipalityId)
      const permitted = ['accounting_officer', 'approving_officer', 'auditor'].includes(actor.role)
      for (const type of reportTypes) {
        const filters = { type, start: '2000-01-01', end: '2099-12-31' }
        const preview = await services.reporting.preview(ctx, filters)
        const exported = await services.reporting.exportSnapshot(ctx, filters)
        assert.equal(preview.ok, permitted, `${actor.role}: ${type}`)
        assert.equal(exported.ok, permitted)
        if (!permitted) continue
        const report = ok(preview), snapshot = ok(exported)
        assert.deepEqual(snapshot.rows, report.rows)
        assert.deepEqual(snapshot.totals, report.totals)
        for (const column of report.columns.filter(c => c.money)) {
          assert.equal(report.totals[column.key], report.rows.reduce((sum, row) => sum + Number(row[column.key] ?? 0), 0))
        }
        if (type === 'ppe_master') {
          const assets = await db.entity('assets').where('municipalityId').equals(actor.municipalityId).toArray()
          assert.equal(report.rows.length, assets.length)
          assert.equal(report.totals.acquisitionCost, assets.reduce((sum, a) => sum + a.acquisitionCost, 0))
          const changedScope = { ...ctx, municipalityId: actor.municipalityId === 'botolan' ? 'san_antonio' as const : 'botolan' as const }
          assert.equal((await services.reporting.preview(changedScope, filters)).ok, false)
          assert.equal((await services.reporting.preview(ctx, { ...filters, start: '2026-02-30' })).ok, false)
        }
      }
    }
    const before = await db.snapshot()
    db.close()
    ok(await services.initialize())
    assert.deepEqual(await db.snapshot(), before)
  } finally { await db.delete() }
})

test('table pagination tolerates invalid and shrinking pages without mutating source rows', () => {
  const rows = Object.freeze([{ id: '10', status: 'open' }, { id: '2', status: 'closed' }, { id: '1', status: 'open' }])
  const options = { query: '', getSearchText: (r: typeof rows[number]) => r.id, pageSize: 1, page: 1, sort: { getValue: (r: typeof rows[number]) => r.id, direction: 'asc' as const } }
  assert.equal(prepareTable(rows, options).items[0].id, '1')
  for (const page of [NaN, Infinity, -1, 1.9]) assert.equal(prepareTable(rows, { ...options, page }).page, 1)
  const filtered = prepareTable(rows, { ...options, page: 99, filter: r => r.status === 'open' })
  assert.equal(filtered.page, 2)
  assert.equal(filtered.items[0].id, '10')
  assert.deepEqual(rows.map(r => r.id), ['10', '2', '1'])
})
