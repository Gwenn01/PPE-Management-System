import Reveal from './Reveal'

const goals = [
  'Improve the accuracy and completeness of PPE records across Zambales municipalities.',
  'Align property records with accounting balances.',
  'Support compliance with government accounting policies.',
  'Strengthen accountability through approval workflows and audit trails.',
]

const audiences = [
  'Administrators',
  'Property Officers',
  'Accounting Officers',
  'Inventory Personnel',
  'Approving Officers',
  'Auditors',
]

export default function AboutSection() {
  return (
    <section id="about" className="w-full bg-white">
      <div className="mx-auto max-w-[1440px] px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <p className="text-sm font-semibold text-gray">About the System</p>
            <h2 className="mt-3 text-3xl font-extrabold leading-tight text-navy sm:text-4xl">
              Every asset, accounted for from start to finish.
            </h2>
            <p className="mt-6 text-base leading-8 text-charcoal/80">
              The Accounting Information System for PPE Management helps
              municipal governments in Zambales keep reliable records of their
              property, plant, and equipment. It replaces scattered, manual
              records with a single system that tracks every asset throughout
              its life: registration, construction, inventory, transfer,
              maintenance, disposal, and reconciliation with accounting
              records.
            </p>

            <h3 className="mt-8 text-sm font-semibold text-gray">
              Who It Serves
            </h3>
            <ul className="mt-3 flex flex-wrap gap-2">
              {audiences.map((role) => (
                <li
                  key={role}
                  className="rounded-full border border-line bg-mist px-4 py-1.5 text-sm text-charcoal"
                >
                  {role}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-gray">
              Access is limited to role and municipality.
            </p>
          </Reveal>

          <Reveal delay={100}>
            <img
              src="/iamges/landing_page/about.jpg"
              alt="Officer reviewing property documents"
              className="h-[300px] w-full rounded-2xl object-cover sm:h-[420px] lg:h-[480px]"
            />
          </Reveal>
        </div>

        <Reveal className="mt-16">
          <h3 className="text-xl font-bold text-navy">Our Goals</h3>
          <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {goals.map((goal, i) => (
              <li
                key={goal}
                className="rounded-xl border border-line bg-mist p-6 transition-colors hover:border-navy/40"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy text-sm font-semibold text-white">
                  {i + 1}
                </span>
                <p className="mt-4 text-sm leading-6 text-charcoal">{goal}</p>
              </li>
            ))}
          </ol>
        </Reveal>
      </div>
    </section>
  )
}
