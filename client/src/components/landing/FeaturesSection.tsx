import {
  CircleCheck,
  ClipboardList,
  FileText,
  HardHat,
  QrCode,
  RefreshCw,
  Scale,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import Reveal from './Reveal'

type Feature = {
  icon: LucideIcon
  title: string
  text: string
  span?: string
}

// DOM order matters: the image tile is placed after the 3rd card.
const features: Feature[] = [
  {
    icon: ClipboardList,
    title: 'Asset Registration',
    text: 'Record asset details, attach supporting documents, and automatically check for missing fields and possible duplicates.',
    span: 'lg:col-span-2',
  },
  {
    icon: CircleCheck,
    title: 'Approval Workflow',
    text: 'Registrations and transactions are reviewed, approved, returned for correction, or rejected with a recorded reason.',
  },
  {
    icon: HardHat,
    title: 'Construction in Progress (CIP)',
    text: 'Track project costs and transfer approved costs to PPE once the project is complete and ready for use.',
  },
  {
    icon: TrendingUp,
    title: 'Depreciation',
    text: 'Calculate depreciation based on approved government accounting policies.',
  },
  {
    icon: QrCode,
    title: 'Physical Inventory',
    text: 'Verify the existence, location, custodian, and condition of assets, with QR code scanning when available.',
  },
  {
    icon: RefreshCw,
    title: 'Asset Lifecycle',
    text: 'Process transfers, maintenance, and disposals with full transaction history.',
    span: 'lg:col-span-2',
  },
  {
    icon: Scale,
    title: 'Accounting Reconciliation',
    text: 'Compare property values with accounting balances and apply approved corrections.',
  },
  {
    icon: FileText,
    title: 'Reports',
    text: 'Generate PDF or Excel reports: PPE Master List, Depreciation Schedule, CIP, Physical Inventory, Transfer and Disposal, Reconciliation, and Audit Trail.',
    span: 'lg:col-span-2',
  },
  {
    icon: ShieldCheck,
    title: 'Audit Trail',
    text: 'Retain every transaction, approval, and correction for review.',
  },
  {
    icon: Users,
    title: 'Role-Based Access',
    text: 'Users see only the modules and records permitted for their role and municipality.',
    span: 'lg:col-span-4',
  },
]

function FeatureCard({ icon: Icon, title, text }: Feature) {
  return (
    <article className="flex h-full flex-col rounded-xl border border-line bg-mist p-6 transition-colors hover:border-navy/40">
      <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-navy text-white">
        <Icon className="h-5 w-5" strokeWidth={1.7} />
      </span>
      <h3 className="mt-5 text-base font-bold text-navy">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-charcoal/80">{text}</p>
    </article>
  )
}

export default function FeaturesSection() {
  const first = features.slice(0, 3)
  const rest = features.slice(3)

  return (
    <section id="features" className="w-full border-t border-line bg-white">
      <div className="mx-auto max-w-[1440px] px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <Reveal className="max-w-2xl">
          <p className="text-sm font-semibold text-gray">System Features</p>
          <h2 className="mt-3 text-3xl font-extrabold leading-tight text-navy sm:text-4xl">
            Everything your assets need, in one place.
          </h2>
          <p className="mt-4 text-base leading-7 text-charcoal/80">
            From registration to reconciliation, each module is built around
            approvals, accuracy, and a complete audit trail.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {first.map((f, i) => (
            <Reveal key={f.title} delay={i * 60} className={f.span}>
              <FeatureCard {...f} />
            </Reveal>
          ))}

          {/* image tile (spans 2 columns and 2 rows on desktop) */}
          <Reveal className="sm:col-span-2 lg:row-span-2">
            <div className="relative h-full min-h-[320px] overflow-hidden rounded-xl">
              <img
                src="/iamges/landing_page/features.jpg"
                alt="Signing a property inventory form"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-x-4 bottom-4 rounded-lg bg-navy p-5 text-white">
                <p className="text-sm font-semibold text-white/70">
                  Built for accountability
                </p>
                <p className="mt-1 text-base font-bold leading-snug">
                  Verified records you can trust during every audit.
                </p>
              </div>
            </div>
          </Reveal>

          {rest.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 60} className={f.span}>
              <FeatureCard {...f} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
