import { z } from 'zod'
import type { ConstructionProject, Document, User } from '../domain/models.js'
import type { ProjectDocumentType } from '../domain/construction.js'
import { database, type MockDatabase } from '../mock/database.js'
import { authorize, commitMutation, writeAudit } from '../mock/unitOfWork.js'
import { parseEntity, moneySchema } from '../mock/validation/schemas.js'
import { scopedRecord, visibleRecord } from './entityAccess.js'
import type { RequestContext } from './contracts.js'
import { DataError, respond } from './errors.js'

const text = z.string().trim().min(1).max(2000)
const draftSchema = z.strictObject({ name: text, projectNumber: z.string().trim().min(1).max(100), location: text, departmentId: text, budgetAmount: moneySchema.refine(v => v > 0), contractor: text, startDate: z.iso.date(), expectedCompletionDate: z.iso.date(), engineeringUserId: text, budgetUserId: text })
export type ConstructionDraft = z.infer<typeof draftSchema>
const commandSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('proposal'), note: text }),
  z.strictObject({ action: z.literal('simulate_mayor'), note: text }),
  z.strictObject({ action: z.literal('receive'), note: text }),
  z.strictObject({ action: z.literal('review'), note: text, subject: z.enum(['construction', 'fund']), result: z.enum(['accepted', 'returned']) }),
  z.strictObject({ action: z.literal('progress'), note: text, percent: z.number().int().min(0).max(100) }),
  z.strictObject({ action: z.literal('forward'), note: text }),
  z.strictObject({ action: z.literal('return'), note: text }),
  z.strictObject({ action: z.literal('complete'), note: text, actualCompletionDate: z.iso.date() }),
  z.strictObject({ action: z.literal('confirm_ready'), note: text, date: z.iso.date() }),
])
export type ConstructionCommand = z.infer<typeof commandSchema>

export function createConstructionService(db: MockDatabase = database) {
  async function assigned(id: string, role: User['role'], municipalityId: string) {
    const user = await db.entity('users').get(id)
    if (!user || user.status !== 'active' || user.role !== role || user.municipalityId !== municipalityId) throw new DataError('validation', 'Choose an active assigned officer in this municipality.')
  }
  async function evidence(project: ConstructionProject, type: ProjectDocumentType): Promise<Document> {
    const documents = await db.entity('documents').where('entityId').equals(project.id).toArray()
    const document = [...project.documentIds].reverse().map(id => documents.find(d => d.id === id)).find(d => d?.projectDocumentType === type && d.entityType === 'project' && d.municipalityId === project.municipalityId)
    const blob = document && await db.blobs.get(document.storageKey)
    if (!document || !blob || blob.documentId !== document.id || blob.municipalityId !== project.municipalityId || blob.blob.size !== document.sizeBytes || blob.blob.type !== document.mimeType) throw new DataError('validation', `Upload valid local ${type.replaceAll('_', ' ')} evidence first. Metadata-only imports do not count.`)
    return document
  }
  async function notify(actor: User, recipientId: string, project: ConstructionProject, title: string, tx: string) {
    const at = new Date().toISOString()
    const row = parseEntity('notifications', { id: crypto.randomUUID(), municipalityId: actor.municipalityId, version: 1, createdAt: at, updatedAt: at, recipientId, title, message: `${project.projectNumber}: ${project.name}`, severity: 'info', href: '/dashboard/construction-projects', readAt: null })
    await db.entity('notifications').add(row)
    await writeAudit(db, actor, tx, 'notifications', null, row, 'project_notification')
  }
  return {
    overview: (ctx: RequestContext, module: 'construction-projects' | 'engineering' | 'budget' = 'construction-projects') => respond(() => db.transaction('r', db.tables, async () => {
      const actor = await authorize(db, ctx, module === 'engineering' ? 'engineering_documents' : module === 'budget' ? 'budget_documents' : 'construction_projects', 'read')
      const projects: ConstructionProject[] = []
      for (const p of await db.entity('projects').where('municipalityId').equals(ctx.municipalityId).toArray()) if (await visibleRecord(db, actor, 'projects', p)) projects.push(p)
      const ids = new Set(projects.map(p => p.id))
      const documents = await db.entity('documents').where('municipalityId').equals(ctx.municipalityId).filter(d => d.entityType === 'project' && ids.has(d.entityId)).toArray()
      const routing = await db.entity('documentRouting').where('municipalityId').equals(ctx.municipalityId).filter(r => ids.has(r.projectId)).toArray()
      const users = (await db.entity('users').where('municipalityId').equals(ctx.municipalityId).toArray()).filter(u => u.status === 'active' && ['engineering_office', 'budget_office'].includes(u.role)).map(u => ({ id: u.id, name: u.name, role: u.role }))
      const departments = await db.entity('departments').where('municipalityId').equals(ctx.municipalityId).filter(d => d.active).toArray()
      return { projects, documents, routing, users, departments }
    })),
    create: (ctx: RequestContext, input: ConstructionDraft) => respond(() => commitMutation(db, async tx => {
      const actor = await authorize(db, ctx, 'construction_projects', 'create')
      const draft = draftSchema.parse(input)
      if (draft.expectedCompletionDate < draft.startDate) throw new DataError('validation', 'Expected completion cannot precede the start date.')
      const department = await db.entity('departments').get(draft.departmentId)
      if (!department?.active || department.municipalityId !== actor.municipalityId) throw new DataError('validation', 'Choose an active local department.')
      await assigned(draft.engineeringUserId, 'engineering_office', actor.municipalityId)
      await assigned(draft.budgetUserId, 'budget_office', actor.municipalityId)
      if (await db.entity('projects').where('municipalityId').equals(actor.municipalityId).filter(p => p.projectNumber.toLowerCase() === draft.projectNumber.toLowerCase()).count()) throw new DataError('duplicate', 'The project reference number already exists.')
      const at = new Date().toISOString()
      const row = parseEntity('projects', { id: crypto.randomUUID(), municipalityId: actor.municipalityId, version: 1, createdAt: at, updatedAt: at, requestedById: actor.id, workflowStatus: 'draft', submittedAt: null, documentIds: [], projectNumber: draft.projectNumber, name: draft.name, location: draft.location, departmentId: draft.departmentId, budgetAmount: draft.budgetAmount, startDate: draft.startDate, completionDate: null, projectStatus: 'planned', capitalizedAssetId: null, construction: { contractor: draft.contractor, expectedCompletionDate: draft.expectedCompletionDate, engineeringUserId: draft.engineeringUserId, budgetUserId: draft.budgetUserId, stage: 'awaiting_proposal', progressPercent: 0, constructionReview: 'pending', fundReview: 'pending', timeline: [{ id: crypto.randomUUID(), actorId: actor.id, occurredAt: at, action: 'registered', note: 'Demo project registered; external authorization evidence has not yet been recorded. No real Mayor approval is represented.', documentIds: [], progressPercent: 0 }] } })
      await db.entity('projects').add(row)
      await writeAudit(db, actor, tx, 'projects', null, row, 'register_construction_project')
      return row
    })),
    act: (ctx: RequestContext, id: string, version: number, input: ConstructionCommand) => respond(() => commitMutation(db, async tx => {
      const command = commandSchema.parse(input)
      const actor = await authorize(db, ctx, ctx.actor.role === 'engineering_office' ? 'engineering_documents' : ctx.actor.role === 'budget_office' ? 'budget_documents' : 'construction_projects', command.action === 'forward' ? 'submit' : 'update')
      const old = await scopedRecord(db, actor, 'projects', id)
      if (old.version !== z.number().int().positive().parse(version)) throw new DataError('conflict', 'Project changed. Reload before continuing.')
      if (!old.construction || ['capitalized', 'cancelled'].includes(old.projectStatus) || (old.projectStatus === 'completed' && !['review', 'forward', 'confirm_ready'].includes(command.action))) throw new DataError('invalid_transition', 'This project is historical or closed and cannot be processed here.')
      if (old.capitalization && ['submitted', 'under_review', 'approved', 'rejected'].includes(old.workflowStatus)) throw new DataError('invalid_transition', 'Capitalization evidence is locked during approval or after a final decision.')
      const c = structuredClone(old.construction), at = new Date().toISOString()
      const docs: string[] = []
      let projectStatus = old.projectStatus, completionDate = old.completionDate
      let readyForUse = old.readyForUse
      const requireRole = (role: User['role']) => { if (actor.role !== role) throw new DataError('forbidden', `This action requires the assigned ${role.replaceAll('_', ' ')}.`) }
      const requireStage = (...stages: string[]) => { if (!stages.includes(c.stage)) throw new DataError('invalid_transition', 'Complete the preceding project processing steps first.') }
      const need = async (type: ProjectDocumentType) => { const d = await evidence(old, type); docs.push(d.id); return d }
      if (command.action === 'proposal') {
        requireRole('property_officer'); requireStage('awaiting_proposal'); await need('mpdo_proposal'); c.stage = 'proposal_recorded'
      } else if (command.action === 'simulate_mayor') {
        requireRole('property_officer'); requireStage('proposal_recorded'); await need('mpdo_proposal'); await need('mayor_authorization_simulation'); c.stage = 'mayor_simulated'
        await notify(actor, c.engineeringUserId, old, 'Demo external authorization recorded; Engineering receipt required', tx)
      } else if (command.action === 'receive') {
        requireRole('engineering_office'); requireStage('mayor_simulated'); await need('mpdo_proposal'); await need('mayor_authorization_simulation'); c.stage = 'engineering_received'
      } else if (command.action === 'review') {
        requireRole('engineering_office'); requireStage('engineering_received', 'processed', 'returned')
        await need(command.subject === 'fund' ? 'availability_of_fund' : 'construction_plan')
        if (command.subject === 'fund') c.fundReview = command.result; else c.constructionReview = command.result
        c.stage = command.result === 'returned' ? 'returned' : c.fundReview === 'accepted' && c.constructionReview === 'accepted' ? 'processed' : 'engineering_received'
        if (command.result === 'returned') await notify(actor, old.requestedById, old, 'Engineering returned construction evidence', tx)
      } else if (command.action === 'progress') {
        if (!['property_officer', 'engineering_office'].includes(actor.role)) throw new DataError('forbidden', 'Only Property and assigned Engineering can record implementation progress.')
        requireStage('engineering_received', 'processed', 'returned', ...(actor.role === 'property_officer' ? ['forwarded'] : []))
        if (command.percent < c.progressPercent) throw new DataError('validation', 'Progress cannot decrease; explain monitoring issues in the note.')
        if (old.startDate.slice(0, 10) > at.slice(0, 10)) throw new DataError('validation', 'Implementation progress cannot be recorded before the project start date.')
        await need('progress_report'); c.progressPercent = command.percent; projectStatus = 'in_progress'
      } else if (command.action === 'forward') {
        requireRole('engineering_office'); requireStage('processed')
        if (c.constructionReview !== 'accepted' || c.fundReview !== 'accepted') throw new DataError('validation', 'Accept both construction and Availability of Fund documents first.')
        if (!c.timeline.some(e => e.action === 'progress' && e.actorId === actor.id)) throw new DataError('validation', 'Engineering must record an implementation progress update before forwarding.')
        await assigned(c.budgetUserId, 'budget_office', actor.municipalityId)
        await need('mpdo_proposal'); await need('mayor_authorization_simulation')
        await need('construction_plan'); await need('availability_of_fund'); await need('progress_report'); const report = await need('engineering_report')
        const route = parseEntity('documentRouting', { id: crypto.randomUUID(), municipalityId: actor.municipalityId, version: 1, createdAt: at, updatedAt: at, workflowStatus: 'submitted', requestedById: actor.id, submittedAt: at, documentIds: [...old.documentIds], projectId: old.id, documentId: report.id, fromRole: 'engineering_office', toRole: 'budget_office', assignedUserId: c.budgetUserId, receivedAt: null, remarks: command.note })
        await db.entity('documentRouting').add(route)
        await writeAudit(db, actor, tx, 'documentRouting', null, route, 'forward_to_budget', command.note)
        await notify(actor, c.budgetUserId, old, 'Engineering forwarded processed construction documents', tx)
        c.stage = 'forwarded'
      } else if (command.action === 'return') {
        requireRole('budget_office'); requireStage('forwarded')
        const route = await db.entity('documentRouting').where('projectId').equals(old.id).filter(r => r.assignedUserId === actor.id && r.workflowStatus === 'submitted').first()
        if (!route) throw new DataError('invalid_transition', 'No assigned forwarded packet is awaiting return.')
        if (route.budgetProcessing) throw new DataError('invalid_transition', 'Use the Budget processing workspace to return a received packet.')
        const updated = parseEntity('documentRouting', { ...route, version: route.version + 1, updatedAt: at, receivedAt: at, workflowStatus: 'returned', remarks: command.note })
        await db.entity('documentRouting').put(updated)
        await writeAudit(db, actor, tx, 'documentRouting', route, updated, 'return_to_engineering', command.note)
        await notify(actor, c.engineeringUserId, old, 'Budget returned the Engineering packet', tx)
        c.stage = 'returned'; c.constructionReview = 'pending'; c.fundReview = 'pending'
      } else if (command.action === 'confirm_ready') {
        requireRole('property_officer')
        if (old.projectStatus !== 'completed' || !old.completionDate || command.date < old.completionDate.slice(0, 10) || command.date > at.slice(0, 10)) throw new DataError('validation', 'Intended-use readiness requires a completed project and a date from actual completion through today.')
        await need('completion_certificate'); await need('acceptance_report')
        readyForUse = { date: command.date, confirmedById: actor.id, confirmedAt: at, note: command.note, documentIds: [...docs] }
      } else {
        requireRole('property_officer'); requireStage('processed', 'forwarded')
        if (c.progressPercent !== 100 || c.constructionReview !== 'accepted' || c.fundReview !== 'accepted') throw new DataError('validation', 'Completion requires 100% progress and accepted Engineering reviews.')
        if (command.actualCompletionDate < old.startDate.slice(0, 10) || command.actualCompletionDate > at.slice(0, 10)) throw new DataError('validation', 'Actual completion must be between the start date and today.')
        await need('mpdo_proposal'); await need('mayor_authorization_simulation'); await need('construction_plan'); await need('availability_of_fund'); await need('progress_report')
        await need('completion_certificate'); await need('acceptance_report')
        projectStatus = 'completed'; completionDate = command.actualCompletionDate
      }
      c.timeline.push({ id: crypto.randomUUID(), actorId: actor.id, occurredAt: at, action: command.action === 'review' ? `review_${command.subject}_${command.result}` : command.action, note: command.action === 'simulate_mayor' ? `EXTERNAL STEP SIMULATION ONLY - not a real Mayor approval. ${command.note}` : command.note, documentIds: docs, progressPercent: c.progressPercent })
      const row = parseEntity('projects', { ...old, ...(readyForUse ? { readyForUse } : {}), construction: c, projectStatus, completionDate, version: old.version + 1, updatedAt: at })
      await db.entity('projects').put(row)
      await writeAudit(db, actor, tx, 'projects', old, row, `construction_${command.action}`, command.note)
      return row
    })),
  }
}
export type ConstructionOverview = Extract<Awaited<ReturnType<ReturnType<typeof createConstructionService>['overview']>>, { ok: true }>['data']
