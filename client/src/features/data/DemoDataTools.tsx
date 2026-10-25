import { useEffect, useRef, useState } from 'react'
import { useAuthenticatedUser } from '../../hooks/useAuthenticatedUser'
import { municipalityList } from '../../domain/municipalities'
import type { ServiceResult } from '../../services/contracts'
import type { ResetChallenge } from '../../services/dataContracts'
import { datasetLimits } from '../../services/datasetService'
import { mockDataServices } from '../../services/mockDataService'

function unwrap<T>(result: ServiceResult<T>): T {
  if (!result.ok) {
    const details = Object.entries(result.error.fields ?? {}).slice(0, 3).map(([field, message]) => `${field}: ${message}`).join('; ')
    throw new Error(`${result.error.message}${details ? ` ${details}` : ''}`)
  }
  return result.data
}

export default function DemoDataTools() {
  const { user, requestContext: context, logout } = useAuthenticatedUser()
  const municipality = municipalityList.find((item) => item.id === user.municipalityId)!.name
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [replaceConfirmed, setReplaceConfirmed] = useState(false)
  const [challenge, setChallenge] = useState<ResetChallenge | null>(null)
  const [confirmationText, setConfirmationText] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (challenge && !dialog.current?.open) dialog.current?.showModal()
    if (!challenge && dialog.current?.open) dialog.current.close()
  }, [challenge])

  const run = async (operation: () => Promise<string>) => {
    setBusy(true); setError(''); setNotice('')
    try { setNotice(await operation()) } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The data operation failed.')
    } finally { setBusy(false) }
  }
  const button = 'ui-button'

  return (
    <section className="mt-8 space-y-6 rounded-xl border border-line bg-mist p-5 sm:p-6" aria-labelledby="demo-data-heading" aria-busy={busy}>
      <div>
        <h3 id="demo-data-heading" className="text-lg font-bold text-navy">Data management · {municipality}</h3>
        <p className="mt-2 text-sm leading-6 text-charcoal">Manage records stored in this browser for {municipality}. Configured accounting settings are reference values and should be reviewed against applicable policy.</p>
        <p className="mt-2 text-xs leading-5 text-muted">JSON exports contain records and document metadata. Uploaded files are stored separately in IndexedDB and are not included in the export.</p>
      </div>
      <fieldset disabled={busy} className="space-y-5">
        <div>
          <button type="button" className={button} onClick={() => { void run(async () => {
            const exported = unwrap(await mockDataServices.dataset.exportJson(context))
            const url = URL.createObjectURL(new Blob([exported.json], { type: 'application/json' }))
            const link = document.createElement('a')
            link.href = url; link.download = exported.fileName; link.click()
            window.setTimeout(() => URL.revokeObjectURL(url), 1000)
            return `Prepared ${exported.recordCount} ${municipality} records for JSON download.`
          }) }}>Export JSON records</button>
        </div>
        <div className="space-y-3 border-t border-line pt-5">
          <label className="block text-sm font-semibold text-navy" htmlFor="demo-json-file">Import a {municipality} dataset (up to 10 MiB)</label>
          <input ref={fileInput} id="demo-json-file" type="file" accept=".json,application/json" className="block max-w-full text-sm text-charcoal" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setReplaceConfirmed(false) }} />
          <label className="flex items-start gap-2 text-sm text-charcoal">
            <input type="checkbox" checked={replaceConfirmed} onChange={(event) => setReplaceConfirmed(event.target.checked)} className="mt-1 accent-navy" />
            I understand that importing replaces current {municipality} records with the validated dataset. Audit history is retained; files without matching document metadata are removed.
          </label>
          <button type="button" disabled={!file || !replaceConfirmed} className={button} onClick={() => { void run(async () => {
            if (!file || file.size > datasetLimits.maxJsonBytes) throw new Error('Choose a JSON file up to 10 MiB.')
            const imported = unwrap(await mockDataServices.dataset.importJson(context, await file.text()))
            await logout(`Imported ${imported.imported} records. Sign in again after replacing identity data.`)
            setFile(null); setReplaceConfirmed(false)
            if (fileInput.current) fileInput.current.value = ''
            return `Imported ${imported.imported} ${municipality} records. Existing audit history was retained.`
          }) }}>Validate and import</button>
        </div>
        <div className="border-t border-line pt-5">
          <button type="button" className="rounded-lg border border-navy px-4 py-2 text-sm font-semibold text-navy hover:bg-white" onClick={() => { void run(async () => {
            setChallenge(unwrap(await mockDataServices.dataset.prepareReset(context))); setConfirmationText('')
            return ''
          }) }}>Preview seed reset</button>
        </div>
      </fieldset>
      <p className="text-sm text-navy" role="status" aria-live="polite">{busy ? 'Processing records…' : notice}</p>
      {error && !challenge && <p className="text-sm text-red-700" role="alert">{error}</p>}
      <dialog ref={dialog} aria-labelledby="demo-reset-heading" onCancel={(event) => { if (busy) event.preventDefault(); else setChallenge(null) }} className="m-auto w-[calc(100%_-_2rem)] max-w-lg rounded-2xl border border-line bg-white p-6 text-charcoal backdrop:bg-charcoal/40">
        {challenge && <>
          <h3 id="demo-reset-heading" className="text-lg font-bold text-navy">Reset {municipality} records?</h3>
          <p className="mt-3 text-sm leading-6">{challenge.warning}</p>
          <p className="mt-2 text-sm">Current scope: {challenge.recordCount} records and {challenge.attachmentCount} uploaded files. This confirmation expires in five minutes and becomes stale if records change.</p>
          <label htmlFor="demo-reset-text" className="mt-4 block text-sm font-semibold text-navy">Type {challenge.confirmationText}</label>
          <input id="demo-reset-text" autoComplete="off" value={confirmationText} disabled={busy} onChange={(event) => setConfirmationText(event.target.value)} className="mt-2 w-full rounded-lg border border-line p-2 text-sm focus:border-navy" />
          {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <button type="button" disabled={busy} className="rounded-lg border border-line px-4 py-2 text-sm" onClick={() => { setChallenge(null); setError('') }}>Cancel</button>
            <button type="button" disabled={busy || confirmationText !== challenge.confirmationText} className={button} onClick={() => { void run(async () => {
              const restored = unwrap(await mockDataServices.dataset.reset(context, { confirmationId: challenge.confirmationId, confirmationText }))
              await logout(`Restored ${restored.restored} records. Sign in again after the reset.`)
              setChallenge(null); setConfirmationText('')
              return `Restored ${restored.restored} ${municipality} seed records. Audit history was retained.`
            }) }}>{busy ? 'Resetting…' : 'Reset local records'}</button>
          </div>
        </>}
      </dialog>
    </section>
  )
}
