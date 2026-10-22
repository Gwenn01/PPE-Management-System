import type { Reconciliation, User } from '../domain/models.js'
import type { MockDatabase } from '../mock/database.js'
import { parseEntity } from '../mock/validation/schemas.js'
import { writeAudit } from '../mock/unitOfWork.js'
import { safeTotal } from './cipValidation.js'
import { captureReconciliation, validateReconciliationCorrection } from './reconciliationValidation.js'

/** Called only inside the centralized approval transaction. */
export async function postReconciliationCorrection(db: MockDatabase, child: Reconciliation, actor: User, at: string, tx: string) {
  const { parent, row, correction } = await validateReconciliationCorrection(db, child), meta = structuredClone(parent.reconciliationSession!), ids: string[] = []
  if (correction.mode === 'adjust_local_ledger') {
    const target = correction.target, before = row.accounting!
    const components = [{ accountCode: 'DEMO-PPE', delta: target.cost - before.cost, creditNormal: false }, { accountCode: 'DEMO-ACCUMULATED-DEPRECIATION', delta: target.accumulatedDepreciation - before.accumulatedDepreciation, creditNormal: true }, { accountCode: 'DEMO-CIP', delta: target.cipBalance - before.cipBalance, creditNormal: false }]
    const lines = components.filter(c => c.delta !== 0).map(c => ({ accountCode: c.accountCode, debit: (c.delta > 0) !== c.creditNormal ? Math.abs(c.delta) : 0, credit: (c.delta > 0) === c.creditNormal ? Math.abs(c.delta) : 0 }))
    const offset = safeTotal(lines.map(l => l.debit - l.credit))
    if (offset) lines.push({ accountCode: 'DEMO-RECONCILIATION-OFFSET', debit: offset < 0 ? -offset : 0, credit: offset > 0 ? offset : 0 })
    for (const line of lines) {
      const entry = parseEntity('accountingRecords', { id: crypto.randomUUID(), municipalityId: child.municipalityId, version: 1, createdAt: at, updatedAt: at, assetId: row.entityType === 'asset' ? row.entityId : null, projectId: row.entityType === 'project' ? row.entityId : null, sourceId: child.id, kind: 'adjustment', postingDate: parent.periodEnd, ...line, policyId: null, policyVersion: null, postedById: actor.id })
      await db.entity('accountingRecords').add(entry); ids.push(entry.id); await writeAudit(db, actor, tx, 'accountingRecords', null, entry, 'post_approved_reconciliation_adjustment', correction.reason)
    }
  } else if (correction.mode === 'correct_import') meta.overrides.push({ correctionId: child.id, rowKey: correction.rowKey, values: correction.target })
  else meta.exceptions.push({ correctionId: child.id, rowKey: correction.rowKey, reference: row.reference, accounting: row.accounting! })
  const saved = parseEntity('reconciliations', { ...child, workflowStatus: 'approved', version: child.version + 1, updatedAt: at, adjustmentRecordIds: ids, reconciliationCorrection: { ...correction, appliedAt: at, history: [...correction.history, { id: crypto.randomUUID(), actorId: actor.id, occurredAt: at, action: 'approved_correction_applied', note: correction.reason }] } })
  await captureReconciliation(db, parent, actor, at, 'apply_approved_reconciliation_correction', `${correction.mode}: ${row.label}. ${correction.reason}`, tx, { overrides: meta.overrides, exceptions: meta.exceptions }, ids)
  return saved
}
