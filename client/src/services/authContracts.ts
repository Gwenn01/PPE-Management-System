import type { AuthOptions, AuthSession } from '../domain/auth.js'
import type { MunicipalityId, User } from '../domain/models.js'
import type { Role } from '../config/roles.js'
import type { RequestContext, ServiceResult } from './contracts.js'

export interface LoginRequest { login: string; password: string; municipalityId: MunicipalityId; remember: boolean }
export interface RegistrationRequest {
  fullName: string
  username: string
  email: string
  municipalityId: MunicipalityId
  departmentId: string
  requestedRole: Exclude<Role, 'administrator'>
  demoPassword: string
  confirmDemoPassword: string
  demoAcknowledged: true
}
export interface AuthService {
  getOptions(): Promise<ServiceResult<AuthOptions>>
  login(request: LoginRequest): Promise<ServiceResult<AuthSession>>
  register(request: RegistrationRequest): Promise<ServiceResult<User>>
  restore(): Promise<ServiceResult<AuthSession | null>>
  logout(sessionId?: string): Promise<ServiceResult<void>>
  switchAccount(userId: string): Promise<ServiceResult<AuthSession>>
  reviewAccount(context: RequestContext, userId: string, expectedVersion: number, decision: 'approve' | 'reject', reason: string): Promise<ServiceResult<User>>
}
