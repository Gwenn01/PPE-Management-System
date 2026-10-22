import { depreciationSchedule } from '../domain/accounting.js'
import { balanceMetrics, balanceValuesSchema, balancesEqual, defaultReconciliationPolicy, difference, reconciliationPolicySchema, type BalanceComparison, type BalanceValues, type ReconciliationSession } from '../domain/reconciliation.js'
import type { Reconciliation, User } from '../domain/models.js'
import type { MockDatabase } from '../mock/database.js'
import { parseEntity } from '../mock/validation/schemas.js'
import { writeAudit } from '../mock/unitOfWork.js'
import { assetPostedBalances, cipMovement } from './accountingBalances.js'
import { safeTotal } from './cipValidation.js'
import { DataError } from './errors.js'

export async function getReconciliationPolicy(db: MockDatabase, municipalityId: string) {
  const row = await db.entity('settings').where('[municipalityId+key]').equals([municipalityId, 'reconciliation_policy']).first()
  if (!row) return structuredClone(defaultReconciliationPolicy)
  try { return reconciliationPolicySchema.parse(JSON.parse(String(row.value))) } catch { throw new DataError('validation', 'Invalid configured reconciliation demonstration policy.') }
}
export async function reconciliationBalances(db: MockDatabase, parent: Reconciliation) {
  const meta = parent.reconciliationSession!
  const assets = (await db.entity('assets').where('municipalityId').equals(parent.municipalityId).toArray()).filter(a => a.acquisitionDate.slice(0, 10) <= parent.periodEnd && (!meta.categoryId || a.category === meta.categoryId)).sort((a, b) => a.id.localeCompare(b.id))
  const projects = meta.includeCIP ? (await db.entity('projects').where('municipalityId').equals(parent.municipalityId).toArray()).filter(p => p.startDate.slice(0, 10) <= parent.periodEnd).sort((a, b) => a.id.localeCompare(b.id)) : []
  const assetIds = new Set(assets.map(a => a.id)), projectIds = new Set(projects.map(p => p.id))
  const entries = (await db.entity('accountingRecords').where('municipalityId').equals(parent.municipalityId).toArray()).filter(e => e.postingDate.slice(0, 10) <= parent.periodEnd && (e.assetId && assetIds.has(e.assetId) || e.projectId && projectIds.has(e.projectId))).sort((a, b) => a.id.localeCompare(b.id))
  const costs = (await db.entity('cipCosts').where('municipalityId').equals(parent.municipalityId).toArray()).filter(c => projectIds.has(c.projectId) && c.incurredDate.slice(0, 10) <= parent.periodEnd).sort((a, b) => a.id.localeCompare(b.id))
  const rows: BalanceComparison[] = []
  function add(entityType: 'asset' | 'project', entityId: string, label: string, categoryId: string | null, basis: string, reference: BalanceValues, posted: BalanceValues) {
    balanceValuesSchema.parse(reference); balanceValuesSchema.parse(posted)
    const key = `${entityType}:${entityId}`
    const imported = meta.imported?.dataset.rows.find(r => r.entityType === entityType && r.entityId === entityId)
    const override = meta.overrides.filter(o => o.rowKey === key).at(-1)
    const accounting = meta.imported ? override?.values ?? imported?.values ?? null : posted
    const delta = difference(reference, accounting), matched = !!accounting && balancesEqual(reference, accounting)
    const accepted = !!accounting && meta.exceptions.some(e => e.rowKey === key && balancesEqual(e.reference, reference) && balancesEqual(e.accounting, accounting))
    rows.push({ key, entityType, entityId, label, categoryId, basis, reference, accounting, difference: delta, status: matched ? 'matched' : accepted ? 'accounted_for' : 'discrepancy', finding: meta.rows.find(r => r.key === key)?.finding ?? '' })
  }
  for (const asset of assets) {
    if (asset.recognitionStatus === 'awaiting_recognition' || asset.disposedDate && asset.disposedDate <= parent.periodEnd) continue
    const own = entries.filter(e => e.assetId === asset.id), recognition = own.find(e => ['recognition', 'capitalization'].includes(e.kind) && e.debit > 0)
    if (recognition && ['expense', 'semi_expendable'].includes(recognition.recognitionDetails?.treatment ?? recognition.accountCode)) continue
    const posted = assetPostedBalances(own)
    const accumulatedDepreciation = recognition?.recognitionDetails ? depreciationSchedule(recognition.recognitionDetails, parent.periodEnd, asset.disposedDate).accumulatedDepreciation : posted.accumulatedDepreciation
    const reference = { cost: asset.acquisitionCost, accumulatedDepreciation, netBookValue: safeTotal([asset.acquisitionCost, -accumulatedDepreciation]), cipBalance: 0 }
    add('asset', asset.id, `${asset.propertyNumber} - ${asset.description}`, asset.category, recognition?.recognitionDetails ? 'Registry cost and saved-policy depreciation projection: a comparison reference only; postings require explicit correction approval.' : 'Registry cost; legacy depreciation uses the posted ledger because no saved independent policy snapshot exists.', reference, posted)
  }
  for (const project of projects) {
    const own = entries.filter(e => e.projectId === project.id)
    const qualifying = costs.filter(c => c.projectId === project.id).filter(c => c.accounting ? !!c.accountingRecordId && own.some(e => e.id === c.accountingRecordId && e.kind === 'cip' && e.debit > 0) && !own.some(e => e.id === c.accounting?.reversalRecordId) : ['approved', 'capitalized'].includes(c.workflowStatus))
    const transferred = project.capitalization && own.some(e => e.kind === 'capitalization' && e.accountCode === 'DEMO-CIP') ? project.capitalization.total : 0
    const supported = safeTotal([...qualifying.map(c => c.amount), -transferred]), posted = safeTotal(own.filter(cipMovement).map(e => e.debit - e.credit))
    add('project', project.id, `${project.projectNumber} - ${project.name}`, null, 'Approved qualifying CIP costs less completed capitalization as of the period end; no unfinished-CIP depreciation.', { cost: 0, accumulatedDepreciation: 0, netBookValue: 0, cipBalance: supported }, { cost: 0, accumulatedDepreciation: 0, netBookValue: 0, cipBalance: posted })
  }
  if (rows.length > 500) throw new DataError('validation', 'Limit a demonstration reconciliation scope to 500 rows.')
  return { sourceSnapshot: JSON.stringify({ assets, projects, entries, costs }), rows }
}
export async function captureReconciliation(db: MockDatabase, parent: Reconciliation, actor: User, at: string, action: string, note: string, tx: string, changes?: Partial<ReconciliationSession>, adjustmentIds: string[] = []) {
  const meta = { ...structuredClone(parent.reconciliationSession!), ...changes }, candidate = { ...parent, reconciliationSession: meta }
  const capture = await reconciliationBalances(db, candidate), captureId = crypto.randomUUID()
  meta.rows = capture.rows; meta.sourceSnapshot = capture.sourceSnapshot; meta.captureId = captureId
  meta.captures.push({ id: captureId, actorId: actor.id, occurredAt: at, ...capture })
  meta.history.push({ id: crypto.randomUUID(), actorId: actor.id, occurredAt: at, action, note })
  const row = parseEntity('reconciliations', { ...parent, adjustmentRecordIds: [...parent.adjustmentRecordIds, ...adjustmentIds], reconciliationSession: meta, version: parent.version + 1, updatedAt: at, propertyBalance: safeTotal(meta.rows.map(r => r.reference.cost)), accountingBalance: safeTotal(meta.rows.map(r => r.accounting?.cost ?? 0)) })
  await db.entity('reconciliations').put(row); await writeAudit(db, actor, tx, 'reconciliations', parent, row, action, note); return row
}
export async function assertCurrentReconciliation(db: MockDatabase, parent: Reconciliation) {
  if (!parent.reconciliationSession || parent.reconciliationSession.status !== 'open') throw new DataError('invalid_transition', 'Choose an open managed reconciliation session.')
  if ((await reconciliationBalances(db, parent)).sourceSnapshot !== parent.reconciliationSession.sourceSnapshot) throw new DataError('conflict', 'Local source balances changed. Refresh this session and investigate the current comparison before proceeding.')
}
export async function validateReconciliationCorrection(db: MockDatabase, child: Reconciliation, requireEvidence = true) {
  const correction = child.reconciliationCorrection
  if (!correction || correction.appliedAt) throw new DataError('invalid_transition', 'Prepare an unapplied reconciliation correction first.')
  const parent = await db.entity('reconciliations').get(correction.sessionId)
  if (!parent || parent.municipalityId !== child.municipalityId || parent.requestedById !== child.requestedById) throw new DataError('not_found', 'The originating reconciliation session is unavailable.')
  await assertCurrentReconciliation(db, parent)
  const meta = parent.reconciliationSession!, row = meta.rows.find(r => r.key === correction.rowKey)
  if (JSON.stringify(correction.policy) !== JSON.stringify(meta.policy)) throw new DataError('conflict', 'The correction must retain the originating session demonstration policy.')
  if (!row || row.status !== 'discrepancy' || correction.captureId !== meta.captureId || correction.sourceSnapshot !== meta.sourceSnapshot || JSON.stringify(row.reference) !== JSON.stringify(correction.before.reference) || JSON.stringify(row.accounting) !== JSON.stringify(correction.before.accounting)) throw new DataError('conflict', 'The saved comparison changed. Return and prepare this correction against the current snapshot.')
  if (!row.finding.trim() || !correction.finding.trim() || !correction.reason.trim() || !balancesEqual(correction.target, row.reference)) throw new DataError('validation', 'Investigate the discrepancy and justify correction to the saved PPE/CIP reference values.')
  if (requireEvidence && meta.policy.requireSupportingDocument && !child.documentIds.length) throw new DataError('validation', 'Attach a supporting correction document before submission.')
  for (const id of child.documentIds) { const d = await db.entity('documents').get(id), file = d && await db.blobs.get(d.storageKey); if (!d || d.entityType !== 'reconciliation' || d.entityId !== child.id || d.municipalityId !== child.municipalityId || !file || file.documentId !== id || file.municipalityId !== child.municipalityId || file.blob.type !== d.mimeType || file.blob.size !== d.sizeBytes) throw new DataError('validation', 'Correction evidence requires a matching local file.') }
  if (correction.mode === 'correct_import' && !meta.imported || correction.mode === 'adjust_local_ledger' && meta.imported) throw new DataError('validation', 'Choose the correction mode that matches this session balance source.')
  if (correction.mode === 'documented_exception') {
    if (!meta.policy.allowDocumentedExceptions || !row.difference || balanceMetrics.some(key => Math.abs(row.difference![key]) > meta.policy.maxExceptionCentavos)) throw new DataError('validation', 'This difference is outside the configured documented-exception rule. No tolerance is silently applied.')
  }
  if (correction.mode === 'adjust_local_ledger') {
    const later = await db.entity('accountingRecords').where('municipalityId').equals(parent.municipalityId).filter(e => (row.entityType === 'asset' ? e.assetId === row.entityId : e.projectId === row.entityId) && e.postingDate.slice(0, 10) > parent.periodEnd).count()
    const asset = row.entityType === 'asset' ? await db.entity('assets').get(row.entityId) : null
    if (later || asset?.lifecycleStatus === 'disposed') throw new DataError('invalid_transition', 'A later posting or disposed asset prevents a backdated ledger adjustment. Investigate with a current period or a configured documented exception.')
    if (await db.entity('accountingRecords').where('municipalityId').equals(child.municipalityId).filter(e => e.sourceId === child.id && e.kind === 'adjustment').count()) throw new DataError('conflict', 'Adjustment already exists.')
  }
  return { parent, row, correction }
}
