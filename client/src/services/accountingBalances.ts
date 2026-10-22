import type { AccountingRecord } from '../domain/models.js'
import { safeTotal } from './cipValidation.js'
export const ppeMovement = (e: AccountingRecord) => e.kind === 'recognition' && !['expense', 'semi_expendable'].includes(e.recognitionDetails?.treatment ?? e.accountCode) || ['capitalization', 'disposal', 'adjustment'].includes(e.kind) && e.accountCode === 'DEMO-PPE'
export const depreciationMovement = (e: AccountingRecord) => e.kind === 'depreciation' || ['disposal', 'adjustment'].includes(e.kind) && e.accountCode === 'DEMO-ACCUMULATED-DEPRECIATION'
export const cipMovement = (e: AccountingRecord) => e.kind === 'cip' || ['capitalization', 'adjustment'].includes(e.kind) && e.accountCode === 'DEMO-CIP'
export function assetPostedBalances(entries: AccountingRecord[]) { const cost = safeTotal(entries.filter(ppeMovement).map(e => e.debit - e.credit)), accumulatedDepreciation = safeTotal(entries.filter(depreciationMovement).map(e => e.credit - e.debit)); return { cost, accumulatedDepreciation, netBookValue: safeTotal([cost, -accumulatedDepreciation]), cipBalance: 0 } }
