import type { RecognitionDetails } from './models.js'

export function calendarDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error('Use a valid calendar date.')
  return value
}
export function validMoney(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Money must be nonnegative safe integer centavos.')
  return value
}
export function residualFromPercent(cost: number, percent: number): number {
  validMoney(cost)
  if (!Number.isFinite(percent) || percent < 0 || percent > 100 || Math.abs(percent * 100 - Math.round(percent * 100)) > 1e-8) throw new Error('Residual percentage must have at most two decimal places, from 0 to 100.')
  return Number((BigInt(cost) * BigInt(Math.round(percent * 100)) + 5000n) / 10000n)
}
/** Monthly straight-line demo: full calendar months, depreciation at month end; no daily proration. */
export function depreciationSchedule(details: RecognitionDetails, asOf: string) {
  calendarDate(asOf); calendarDate(details.startDate)
  if (!['acquisition_month', 'following_month'].includes(details.startConvention) || !['depreciable_ppe', 'non_depreciable_ppe', 'semi_expendable', 'expense'].includes(details.treatment)) throw new Error('Invalid depreciation convention or treatment.')
  const cost = validMoney(details.cost), residual = validMoney(details.residualValue)
  if (residual > cost || !Number.isInteger(details.usefulLifeMonths) || details.usefulLifeMonths < 0 || details.usefulLifeMonths > 1200) throw new Error('Invalid residual value or useful life.')
  const depreciable = details.treatment === 'depreciable_ppe'
  if (depreciable && details.usefulLifeMonths < 1) throw new Error('Depreciable PPE requires a positive useful life.')
  if (!depreciable && (residual !== 0 || details.usefulLifeMonths !== 0)) throw new Error('Non-depreciable treatment requires zero depreciation settings.')
  const amount = depreciable ? cost - residual : 0
  const rows: { date: string; depreciation: number; accumulated: number; netBookValue: number }[] = []
  let accumulated = 0, historicalAccumulated = 0
  const [year, month] = details.startDate.split('-').map(Number)
  for (let i = 0; depreciable && i < details.usefulLifeMonths; i++) {
    const date = new Date(Date.UTC(year, month - 1 + i + (details.startConvention === 'following_month' ? 1 : 0) + 1, 0)).toISOString().slice(0, 10)
    const cumulative = Number(BigInt(amount) * BigInt(i + 1) / BigInt(details.usefulLifeMonths))
    rows.push({ date, depreciation: cumulative - accumulated, accumulated: cumulative, netBookValue: cost - cumulative })
    accumulated = cumulative
    if (date <= asOf) historicalAccumulated = cumulative
  }
  return { cost, depreciableAmount: amount, accumulatedDepreciation: historicalAccumulated, netBookValue: details.treatment === 'expense' ? 0 : cost - historicalAccumulated, rows }
}
