import { AlertCircle } from 'lucide-react'
export default function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div role="alert" className="ui-panel border-red-200 px-5 py-6 text-charcoal"><div className="flex items-center gap-2 font-bold text-red-800"><AlertCircle aria-hidden size={20}/> Unable to load data</div><p className="mt-2 text-sm">{message}</p>{onRetry && <button type="button" onClick={onRetry} className="ui-button mt-4">Try again</button>}</div>
}
