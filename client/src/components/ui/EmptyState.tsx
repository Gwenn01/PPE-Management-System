import { Inbox } from 'lucide-react'
import type { ReactNode } from 'react'
export default function EmptyState({ title = 'No records found', message = 'There are no records to show.', action }: { title?: string; message?: string; action?: ReactNode }) {
  return <div className="flex flex-col items-center justify-center px-5 py-12 text-center"><Inbox className="h-9 w-9 text-gray" aria-hidden/><p className="mt-3 text-sm font-bold text-navy">{title}</p><p className="mt-1 max-w-sm text-xs leading-5 text-charcoal">{message}</p>{action && <div className="mt-4">{action}</div>}</div>
}
