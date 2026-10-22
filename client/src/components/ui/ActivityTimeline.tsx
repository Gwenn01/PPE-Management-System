import StatusBadge from './StatusBadge'
export interface TimelineEvent { id: string; title: string; description: string; status: string; timestamp: string }
export default function ActivityTimeline({ events }: { events: readonly TimelineEvent[] }) {
  if (!events.length) return <p className="rounded-xl border border-dashed border-line p-5 text-sm text-gray">No recorded activity for this view.</p>
  return <ol className="space-y-0">{events.map((event) => <li key={event.id} className="relative border-l-2 border-line pb-6 pl-6 last:pb-0"><span aria-hidden className="absolute -left-[7px] top-1 h-3 w-3 rounded-full border-2 border-white bg-navy" /><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-bold text-navy">{event.title}</p><StatusBadge status={event.status} /></div><p className="mt-1 break-words text-xs text-charcoal">{event.description}</p><time className="mt-1 block text-xs text-gray" dateTime={event.timestamp}>{Number.isNaN(Date.parse(event.timestamp)) ? event.timestamp : new Date(event.timestamp).toLocaleString('en-PH')}</time></li>)}</ol>
}
