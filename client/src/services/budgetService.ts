import { z } from 'zod'
import { treasuryConfirmed, type BudgetProcessing } from '../domain/budget.js'
import type { ConstructionProject, ProjectDocumentRouting, User } from '../domain/models.js'
import { database, type MockDatabase } from '../mock/database.js'
import { authorize, commitMutation, writeAudit } from '../mock/unitOfWork.js'
import { moneySchema, parseEntity } from '../mock/validation/schemas.js'
import type { RequestContext } from './contracts.js'
import { scopedRecord, visibleRecord } from './entityAccess.js'
import { DataError, respond } from './errors.js'
import { appendBudgetEvent, budgetEvidence, editableBudgetStatuses } from './budgetValidation.js'

const note = z.string().trim().min(1).max(2000)
const reference = z.string().trim().min(1).max(100)
export const voucherInputSchema = z.strictObject({ reference, date: z.iso.date(), amount: moneySchema.refine(v => v > 0), remarks: note })
const commandSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('receive'), note }),
  z.strictObject({ action: z.literal('save_voucher'), voucher: voucherInputSchema, fund: z.enum(['regular', 'trust']), accountingUserId: z.string().min(1) }),
  z.strictObject({ action: z.literal('review'), result: z.enum(['ready', 'incomplete']), note }),
  z.strictObject({ action: z.literal('send_treasury'), note }),
  z.strictObject({ action: z.literal('confirm_treasury'), reference, confirmationDate: z.iso.date(), note }),
  z.strictObject({ action: z.literal('forward_accounting'), note }),
  z.strictObject({ action: z.literal('return_engineering'), note }),
  z.strictObject({ action: z.literal('accounting_receive'), note }),
  z.strictObject({ action: z.literal('accounting_return'), note }),
])
export type BudgetCommand = z.infer<typeof commandSchema>

export function createBudgetService(db: MockDatabase = database) {
  async function notify(actor: User, recipientId: string, project: ConstructionProject, title: string, tx: string) {
    const at = new Date().toISOString()
    const recipient = await db.entity('users').get(recipientId)
    if (!recipient || recipient.municipalityId !== actor.municipalityId || recipient.status !== 'active') throw new DataError('validation', 'The receiving officer is no longer active in this municipality.')
    const row = parseEntity('notifications', { id: crypto.randomUUID(), municipalityId: actor.municipalityId, version: 1, createdAt: at, updatedAt: at, recipientId, title, message: `${project.projectNumber}: ${project.name}. Document processing simulation only; no disbursement.`, severity: 'info', href: recipient.role === 'accounting_officer' ? '/dashboard/accounting-documents' : recipient.role === 'engineering_office' ? '/dashboard/engineering' : '/dashboard/budget', readAt: null })
    await db.entity('notifications').add(row)
    await writeAudit(db, actor, tx, 'notifications', null, row, 'budget_routing_notification')
  }
  async function accountingOfficer(id: string | null, municipalityId: string) {
    const user = id ? await db.entity('users').get(id) : undefined
    if (!user || user.role !== 'accounting_officer' || user.status !== 'active' || user.municipalityId !== municipalityId) throw new DataError('validation', 'Select an active local Accounting Officer.')
    return user
  }
  async function required(route: ProjectDocumentRouting) {
    const ids: string[] = []
    for (const type of ['mpdo_proposal', 'mayor_authorization_simulation', 'construction_plan', 'availability_of_fund', 'progress_report', 'engineering_report'] as const) ids.push((await budgetEvidence(db, route, type, false)).id)
    for (const type of ['voucher', 'budget_review'] as const) ids.push((await budgetEvidence(db, route, type)).id)
    return ids
  }
  return {
    overview: (ctx: RequestContext) => respond(() => db.transaction('r', db.tables, async () => {
      const accounting = ctx.actor.role === 'accounting_officer'
      const actor = await authorize(db, ctx, accounting ? 'cip_costs' : 'budget_documents', 'read')
      const packets: ProjectDocumentRouting[] = []
      for (const r of await db.entity('documentRouting').where('municipalityId').equals(ctx.municipalityId).toArray()) {
        if ((accounting ? r.toRole === 'accounting_officer' && !!r.budgetHandoff : r.fromRole === 'engineering_office' && r.toRole === 'budget_office') && r.assignedUserId === actor.id && await visibleRecord(db, actor, 'documentRouting', r)) packets.push(r)
      }
      const projectIds = new Set(packets.map(r => r.projectId))
      const projects = await db.entity('projects').where('municipalityId').equals(ctx.municipalityId).filter(p => projectIds.has(p.id)).toArray()
      // Accounting sees the immutable handoff, not later unforwarded Budget revisions.
      const sources = accounting ? [] : packets
      const downstream = accounting ? packets : await db.entity('documentRouting').where('municipalityId').equals(ctx.municipalityId).filter(r => !!r.budgetSourceRoutingId && packets.some(p => p.id === r.budgetSourceRoutingId)).toArray()
      const ids = new Set((accounting ? packets : [...packets, ...downstream]).flatMap(r => r.documentIds))
      const documents = await db.entity('documents').where('municipalityId').equals(ctx.municipalityId).filter(d => ids.has(d.id)).toArray()
      const officers = (await db.entity('users').where('municipalityId').equals(ctx.municipalityId).toArray()).filter(u => u.role === 'accounting_officer' && u.status === 'active').map(u => ({ id: u.id, name: u.name }))
      return { packets, projects, documents, sources, downstream, officers }
    })),
    act: (ctx: RequestContext, id: string, version: number, input: BudgetCommand) => respond(() => commitMutation(db, async tx => {
      const command = commandSchema.parse(input)
      const accounting = command.action === 'accounting_receive' || command.action === 'accounting_return'
      if (ctx.actor.role !== (accounting ? 'accounting_officer' : 'budget_office')) throw new DataError('forbidden', 'This processing action belongs to the assigned receiving office.')
      const actor = await authorize(db, ctx, accounting ? 'cip_costs' : 'budget_documents', command.action === 'send_treasury' || command.action === 'forward_accounting' ? 'submit' : 'update')
      const addressed = await scopedRecord(db, actor, 'documentRouting', id)
      if (addressed.version !== z.number().int().positive().parse(version)) throw new DataError('conflict', 'The packet changed. Reload before processing.')
      const source = accounting && addressed.budgetSourceRoutingId ? await db.entity('documentRouting').get(addressed.budgetSourceRoutingId) : addressed
      if (!source || source.municipalityId !== ctx.municipalityId || source.fromRole !== 'engineering_office' || source.toRole !== 'budget_office') throw new DataError('invalid_transition', 'A forwarded Engineering packet is required.')
      const project = await scopedRecord(db, actor, 'projects', source.projectId)
      if (!project.construction || ['capitalized', 'cancelled'].includes(project.projectStatus)) throw new DataError('invalid_transition', 'This project cannot accept Budget processing.')
      const at = new Date().toISOString(), today = at.slice(0, 10)
      let processing: BudgetProcessing
      let sourceStatus = source.workflowStatus, receivedAt = source.receivedAt
      let outgoing: ProjectDocumentRouting | null = null, originalOutgoing: ProjectDocumentRouting | null = null
      const evidenceIds: string[] = []
      let eventNote = 'note' in command ? command.note : command.voucher.remarks
      let nextConstruction = structuredClone(project.construction)
      if (accounting) {
        if (addressed.toRole !== 'accounting_officer' || addressed.assignedUserId !== actor.id || !addressed.budgetHandoff || addressed.projectId !== source.projectId || addressed.workflowStatus !== 'submitted' || source.budgetProcessing?.status !== 'forwarded') throw new DataError('invalid_transition', 'This Accounting packet has already been processed or is not ready for receipt.')
        processing = structuredClone(source.budgetProcessing)
        if (!treasuryConfirmed(processing) || !treasuryConfirmed(addressed.budgetHandoff)) throw new DataError('invalid_transition', 'Trust Fund processing requires confirmed external Treasury evidence before Accounting receipt.')
        if (command.action === 'accounting_receive') await required(source)
        if (command.action === 'accounting_receive' && processing.fund === 'trust') {
          const evidence = await budgetEvidence(db, source, 'treasury_confirmation_demo')
          if (evidence.id !== processing.treasury?.evidenceId || evidence.id !== addressed.budgetHandoff.treasury?.evidenceId) throw new DataError('validation', 'Treasury confirmation does not match the forwarded packet.')
          evidenceIds.push(evidence.id)
        }
        processing.status = command.action === 'accounting_receive' ? 'completed' : 'accounting_returned'
        if (command.action === 'accounting_receive') processing.accountingReceivedAt = at
        sourceStatus = command.action === 'accounting_receive' ? 'approved' : 'under_review'
        originalOutgoing = addressed
        outgoing = parseEntity('documentRouting', { ...addressed, workflowStatus: command.action === 'accounting_receive' ? 'approved' : 'returned', receivedAt: at, remarks: eventNote, version: addressed.version + 1, updatedAt: at })
        await notify(actor, source.assignedUserId!, project, command.action === 'accounting_receive' ? 'Accounting acknowledged the processed document packet' : 'Accounting returned the Budget packet for correction', tx)
      } else {
        if (source.assignedUserId !== actor.id || project.construction.budgetUserId !== actor.id || project.construction.stage !== 'forwarded' || source.budgetSourceRoutingId) throw new DataError('forbidden', 'Only the assigned Budget officer can process this current Engineering packet.')
        if (command.action === 'receive') {
          if (source.budgetProcessing || source.workflowStatus !== 'submitted') throw new DataError('invalid_transition', 'This Engineering packet has already been received or returned.')
          processing = { status: 'received', fund: null, voucher: null, accountingUserId: null, treasury: null, forwardedAt: null, accountingReceivedAt: null, history: [] }
          receivedAt = at; sourceStatus = 'under_review'
        } else {
          if (!source.budgetProcessing) throw new DataError('invalid_transition', 'Receive the Engineering packet before processing it.')
          processing = structuredClone(source.budgetProcessing)
          if (['save_voucher', 'review', 'return_engineering'].includes(command.action) && !editableBudgetStatuses.includes(processing.status)) throw new DataError('invalid_transition', 'The packet is locked at its current processing stage.')
          if (command.action === 'save_voucher') {
            if (command.voucher.date < project.startDate.slice(0, 10) || command.voucher.date > today || command.voucher.amount > project.budgetAmount) throw new DataError('validation', 'Demo voucher date must be between project start and today, and amount cannot exceed the project budget.')
            await accountingOfficer(command.accountingUserId, actor.municipalityId)
            const duplicate = await db.entity('documentRouting').where('municipalityId').equals(actor.municipalityId).filter(r => r.id !== source.id && !!r.budgetProcessing?.voucher && r.budgetProcessing.voucher.reference.toLowerCase() === command.voucher.reference.toLowerCase()).count()
            if (duplicate) throw new DataError('duplicate', 'The voucher reference already belongs to another processing packet.')
            processing.voucher = command.voucher; processing.fund = command.fund; processing.accountingUserId = command.accountingUserId; processing.status = 'under_review'; processing.treasury = null
          } else if (command.action === 'review') {
            if (command.result === 'ready') {
              if (!processing.voucher || !processing.fund) throw new DataError('validation', 'Save voucher information and fund classification first.')
              evidenceIds.push(...await required(source)); await accountingOfficer(processing.accountingUserId, actor.municipalityId)
            }
            processing.status = command.result
          } else if (command.action === 'send_treasury') {
            if (processing.status !== 'ready' || processing.fund !== 'trust' || !processing.voucher) throw new DataError('invalid_transition', 'Only a reviewed Trust Fund packet can be sent to the external Treasury stage.')
            evidenceIds.push(...await required(source)); processing.status = 'treasury_pending'
            processing.treasury = { sentAt: at, confirmedAt: null, confirmationDate: null, reference: null, evidenceId: null }
            eventNote = `EXTERNAL TREASURY DEMO STAGE ONLY. No real transfer or disbursement. ${command.note}`
          } else if (command.action === 'confirm_treasury') {
            if (processing.status !== 'treasury_pending' || processing.fund !== 'trust' || !processing.treasury) throw new DataError('invalid_transition', 'This packet is not awaiting external Treasury confirmation.')
            if (command.confirmationDate < processing.treasury.sentAt.slice(0, 10) || command.confirmationDate > today) throw new DataError('validation', 'Confirmation date must be between the Treasury forwarding date and today.')
            const document = await budgetEvidence(db, source, 'treasury_confirmation_demo'); evidenceIds.push(document.id)
            processing.treasury = { ...processing.treasury, confirmedAt: at, confirmationDate: command.confirmationDate, reference: command.reference, evidenceId: document.id }; processing.status = 'treasury_confirmed'
            eventNote = `DEMO-ONLY simulation of receipt of external Treasury processing confirmation. Not a real Treasury confirmation or disbursement. ${command.note}`
          } else if (command.action === 'forward_accounting') {
            if (!processing.voucher || !processing.fund || !treasuryConfirmed(processing) || (processing.fund === 'regular' ? processing.status !== 'ready' : processing.status !== 'treasury_confirmed')) throw new DataError('invalid_transition', 'Regular Fund packets require ready review; Trust Fund packets require confirmed external Treasury processing.')
            const officer = await accountingOfficer(processing.accountingUserId, actor.municipalityId)
            evidenceIds.push(...await required(source))
            if (processing.fund === 'trust') { const d = await budgetEvidence(db, source, 'treasury_confirmation_demo'); if (d.id !== processing.treasury?.evidenceId) throw new DataError('validation', 'Treasury evidence changed.'); evidenceIds.push(d.id) }
            if (await db.entity('documentRouting').where('projectId').equals(project.id).filter(r => r.budgetSourceRoutingId === source.id && r.workflowStatus === 'submitted').count()) throw new DataError('conflict', 'This packet has already been forwarded to Accounting.')
            const voucherDocument = await budgetEvidence(db, source, 'voucher')
            processing.status = 'forwarded'; processing.forwardedAt = at; sourceStatus = 'under_review'
            outgoing = parseEntity('documentRouting', { id: crypto.randomUUID(), municipalityId: actor.municipalityId, version: 1, createdAt: at, updatedAt: at, workflowStatus: 'submitted', requestedById: actor.id, submittedAt: at, documentIds: [...source.documentIds], projectId: project.id, documentId: voucherDocument.id, fromRole: 'budget_office', toRole: 'accounting_officer', assignedUserId: officer.id, receivedAt: null, remarks: command.note, budgetSourceRoutingId: source.id, budgetHandoff: { fund: processing.fund, voucher: processing.voucher, treasury: processing.treasury, sourceVersion: source.version + 1, forwardedAt: at } })
            await notify(actor, officer.id, project, 'Budget forwarded a reviewed construction document packet', tx)
          } else if (command.action === 'return_engineering') {
            processing.status = 'returned_to_engineering'; sourceStatus = 'returned'
            nextConstruction = { ...nextConstruction, stage: 'returned', constructionReview: 'pending', fundReview: 'pending' }
            await notify(actor, nextConstruction.engineeringUserId, project, 'Budget returned Engineering documents for correction', tx)
          }
        }
      }
      appendBudgetEvent(processing, actor, command.action, eventNote, evidenceIds, at)
      const changedSource = parseEntity('documentRouting', { ...source, budgetProcessing: processing, workflowStatus: sourceStatus, receivedAt, version: source.version + 1, updatedAt: at })
      await db.entity('documentRouting').put(changedSource)
      await writeAudit(db, actor, tx, 'documentRouting', source, changedSource, `budget_${command.action}`, eventNote)
      if (outgoing) { await db.entity('documentRouting').put(outgoing); await writeAudit(db, actor, tx, 'documentRouting', originalOutgoing, outgoing, command.action, eventNote) }
      nextConstruction.timeline.push({ id: crypto.randomUUID(), actorId: actor.id, occurredAt: at, action: `budget_${command.action}`, note: eventNote, documentIds: evidenceIds, progressPercent: nextConstruction.progressPercent })
      const changedProject = parseEntity('projects', { ...project, construction: nextConstruction, version: project.version + 1, updatedAt: at })
      await db.entity('projects').put(changedProject)
      await writeAudit(db, actor, tx, 'projects', project, changedProject, `budget_${command.action}`, eventNote)
      return { packet: changedSource, outgoing }
    })),
  }
}
export type BudgetOverview = Extract<Awaited<ReturnType<ReturnType<typeof createBudgetService>['overview']>>, { ok: true }>['data']
