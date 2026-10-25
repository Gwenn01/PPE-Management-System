import { z } from 'zod'
import { roleList } from '../../config/roles.js'
import { DEMO_PASSWORD } from '../../domain/auth.js'
import { municipalityIdSchema, usernameSchema } from '../../mock/validation/schemas.js'

export const loginSchema = z.strictObject({
  login: z.string().trim().min(1, 'Enter your email or username.').max(254),
  password: z.string().min(1, 'Enter your password.').max(100),
  municipalityId: z.enum(municipalityIdSchema.options, 'Select a municipality.'),
  remember: z.boolean(),
})
export const registrationSchema = z.strictObject({
  fullName: z.string().trim().min(2, 'Enter your full name.').max(120),
  username: usernameSchema,
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid demo email address.')),
  municipalityId: z.enum(municipalityIdSchema.options, 'Select a municipality.'),
  departmentId: z.string().min(1, 'Select a department.'),
  requestedRole: z.enum(roleList.filter((role) => role !== 'administrator'), 'Select a requested role.'),
  demoPassword: z.string().refine((value) => value === DEMO_PASSWORD, 'Use the displayed public demo password; never enter a personal password.'),
  confirmDemoPassword: z.string(),
  demoAcknowledged: z.literal(true, 'Acknowledge that this is a demo using fictional details.'),
}).refine((value) => value.confirmDemoPassword === value.demoPassword, { path: ['confirmDemoPassword'], message: 'Demo passwords do not match.' })

export function fieldErrors(issues: readonly { path: PropertyKey[]; message: string }[]): Record<string, string> {
  return Object.fromEntries(issues.map((issue) => [issue.path.join('.'), issue.message]))
}
