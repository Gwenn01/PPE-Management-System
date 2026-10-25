import { Inbox } from 'lucide-react'
import type { ReactNode } from 'react'
export default function EmptyState({ title = 'No records found', message = 'There are no records to show.', action }: { title?: string; message?: string; action?: ReactNode }) {
  return <div className="flex flex-col items-center justify-center px-5 py-10 text-center"><Inbox className="h-11 w-11 rounded-xl bg-mist p-2.5 text-muted" aria-hidden/><p className="mt-3 text-sm font-semibold text-navy">{title}</p><p className="mt-1 max-w-sm text-sm leading-6 text-muted">{message}</p>{action && <div className="mt-4">{action}</div>}</div>
}
