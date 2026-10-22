import { Link } from 'react-router-dom'
import { ArrowRight, Eye } from 'lucide-react'
import { getNavGroups, hrefFor } from '../../config/navigation'
import { roleLabels, roleResponsibilities } from '../../config/roles'
import { useAuthenticatedUser } from '../../hooks/useAuthenticatedUser'
import DemoAccountSwitcher from '../../features/auth/DemoAccountSwitcher'

export default function DashboardHome() {
  const { user, session } = useAuthenticatedUser()
  const groups = getNavGroups(user, user, session.permissions).filter((g) => g.group !== 'Overview')

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <section className="rounded-2xl border border-line bg-white p-6 sm:p-8">
        <span className="inline-block rounded-full bg-chip px-3 py-1 text-xs font-semibold text-navy">
          {roleLabels[user.role]}
        </span>
        <p className="mt-4 text-xs font-semibold text-gray">{session.municipality.name} · DEMO ONLY — not production authentication</p>
        {import.meta.env.DEV && <div className="mt-3 sm:hidden"><DemoAccountSwitcher /></div>}
        <h2 className="mt-4 text-2xl font-extrabold text-navy sm:text-3xl">
          Welcome, {user.name.split(' ')[0]}.
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-charcoal sm:text-base">
          {roleResponsibilities[user.role]}
        </p>
        {user.role === 'auditor' && (
          <p className="mt-4 inline-flex items-center gap-2 rounded-lg bg-mist px-3 py-2 text-xs text-charcoal">
            <Eye className="h-4 w-4 text-navy" />
            Your access is read-only.
          </p>
        )}
      </section>

      {groups.map(({ group, items }) => (
        <section key={group}>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray">
            {group}
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <Link
                key={item.path}
                to={hrefFor(item)}
                className="group flex items-start gap-4 rounded-xl border border-line bg-white p-5 transition-colors hover:border-navy"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-mist text-navy transition-colors group-hover:bg-navy group-hover:text-white">
                  <item.icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2 text-sm font-bold text-navy">
                    {item.label}
                    <ArrowRight className="h-4 w-4 text-gray transition-transform group-hover:translate-x-0.5 group-hover:text-navy" />
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-charcoal/80">
                    {item.description}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
