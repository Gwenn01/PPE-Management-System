import {
  Box,
  ChartColumn,
  CircleCheck,
  FileText,
  Search,
  User,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import Reveal from './Reveal'

type Step = { icon: LucideIcon; title: string; text: string }

const steps: Step[] = [
  { icon: User, title: 'Log in', text: 'Access is based on your role.' },
  {
    icon: FileText,
    title: 'Register or update assets',
    text: 'Submit records with supporting documents.',
  },
  {
    icon: CircleCheck,
    title: 'Review and approve',
    text: 'Approving officers check each submission.',
  },
  {
    icon: Box,
    title: 'Account for the asset',
    text: 'Recognition and depreciation are applied.',
  },
  {
    icon: Search,
    title: 'Monitor and verify',
    text: 'Inventory and lifecycle transactions are recorded.',
  },
  {
    icon: ChartColumn,
    title: 'Reconcile and report',
    text: 'Records are matched and reports generated.',
  },
]

export default function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      className="w-full bg-white"
    >
      <div className="mx-auto max-w-[1440px] px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold text-gray">How It Works</p>
          <h2 className="mt-3 text-3xl font-extrabold leading-tight text-navy sm:text-4xl">
            Six steps from login to reports.
          </h2>
        </Reveal>

        <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {steps.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="flex">
              <Reveal delay={i * 70} className="flex w-full">
                <article className="group flex w-full flex-col rounded-xl border border-line bg-white p-5 transition-colors hover:border-navy/40">
                  <span
                    className={`w-fit rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
                      i === 0
                        ? 'border-navy bg-navy text-white'
                        : 'border-line bg-mist text-charcoal group-hover:border-navy group-hover:bg-navy group-hover:text-white'
                    }`}
                  >
                    Step {i + 1}
                  </span>

                  <div className="mt-4 border-t border-dashed border-line" />

                  <h3 className="mt-5 text-lg font-bold leading-snug text-navy">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-charcoal/80">
                    {text}
                  </p>

                  <div className="mt-6 flex flex-1 items-end">
                    <div className="flex h-28 w-full items-center justify-center rounded-lg bg-mist">
                      <Icon
                        className="h-10 w-10 text-navy/70"
                        strokeWidth={1.2}
                      />
                    </div>
                  </div>
                </article>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
