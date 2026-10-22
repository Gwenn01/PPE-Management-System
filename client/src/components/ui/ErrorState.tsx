import { AlertCircle } from 'lucide-react'
export default function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div role="alert" className="rounded-2xl border border-red-200 bg-white px-5 py-7 text-charcoal"><div className="flex items-center gap-2 font-bold text-red-800"><AlertCircle aria-hidden size={20}/> Unable to load data</div><p className="mt-2 text-sm">{message}</p>{onRetry && <button type="button" onClick={onRetry} className="mt-4 rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy">Try again</button>}</div>
}
