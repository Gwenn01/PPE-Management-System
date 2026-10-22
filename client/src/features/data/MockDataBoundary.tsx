import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

export default function MockDataBoundary({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  const [message, setMessage] = useState('')
  useEffect(() => {
    let active = true
    void import('../../services/mockDataService').then(({ mockDataServices }) => mockDataServices.initialize()).then((result) => {
      if (!active) return
      setState(result.ok ? 'ready' : 'error')
      if (!result.ok) setMessage(result.error.message)
    }).catch(() => {
      if (!active) return
      setMessage('The demo storage module could not load. Retry after checking the connection or reloading the application.')
      setState('error')
    })
    return () => { active = false }
  }, [attempt])
  if (state === 'ready') return children
  return (
    <main className="flex min-h-svh items-center justify-center bg-mist p-6">
      <section className="w-full max-w-lg rounded-2xl border border-line bg-white p-8" role={state === 'error' ? 'alert' : 'status'} aria-busy={state === 'loading'}>
        <h1 className="text-xl font-bold text-navy">{state === 'loading' ? 'Opening demo records…' : 'Demo storage unavailable'}</h1>
        <p className="mt-3 text-sm text-charcoal">{state === 'loading' ? 'Preparing browser-side PPE records.' : message}</p>
        {state === 'error' && <button type="button" onClick={() => { setState('loading'); setAttempt((value) => value + 1) }} className="mt-5 rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white">Retry storage</button>}
      </section>
    </main>
  )
}
