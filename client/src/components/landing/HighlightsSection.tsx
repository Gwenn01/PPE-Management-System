import { Database, FileText, ShieldCheck } from 'lucide-react'

const highlights = [
  {
    icon: Database,
    title: 'Accurate Records',
    text: 'Property and accounting values in one registry.',
  },
  {
    icon: ShieldCheck,
    title: 'Controlled Approvals',
    text: 'Every transaction is reviewed and approved.',
  },
  {
    icon: FileText,
    title: 'Audit-Ready',
    text: 'A complete trail of every action.',
  },
]

export default function HighlightsSection() {
  return (
    <section className="w-full bg-white">
      <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-4 md:grid-cols-3">
          {highlights.map(({ icon: Icon, title, text }) => (
            <div
              key={title}
              className="flex items-center gap-4 rounded-xl border border-line bg-mist p-6"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-navy text-white">
                <Icon className="h-6 w-6" strokeWidth={1.6} />
              </span>
              <div>
                <h3 className="text-base font-bold text-navy">{title}</h3>
                <p className="mt-1 text-sm text-charcoal/80">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
