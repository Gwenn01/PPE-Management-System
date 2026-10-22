import { ZodError } from 'zod'
import type { ServiceErrorCode, ServiceResult } from './contracts.js'

export class DataError extends Error {
  readonly code: ServiceErrorCode
  constructor(code: ServiceErrorCode, message: string) { super(message); this.code = code }
}

export async function respond<T>(operation: () => Promise<T>): Promise<ServiceResult<T>> {
  try { return { ok: true, data: await operation() } } catch (error) {
    if (error instanceof ZodError) {
      return { ok: false, error: { code: 'validation', message: 'Check the supplied demo data.', fields: Object.fromEntries(error.issues.map((issue) => [issue.path.join('.'), issue.message])) } }
    }
    if (error instanceof DataError) return { ok: false, error: { code: error.code, message: error.message } }
    if (error instanceof Error && error.name === 'ConstraintError') return { ok: false, error: { code: 'duplicate', message: 'A record with that identifier already exists.' } }
    return { ok: false, error: { code: 'storage_unavailable', message: 'Browser storage could not complete the operation. No changes were committed. Retry or check available storage.' } }
  }
}
