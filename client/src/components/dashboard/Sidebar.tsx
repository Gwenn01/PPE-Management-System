import { NavLink } from 'react-router-dom'
import { Landmark, X } from 'lucide-react'
import { getNavGroups, hrefFor } from '../../config/navigation'
import { roleLabels } from '../../config/roles'
import { useCurrentUser } from '../../hooks/useCurrentUser'

type SidebarProps = {
  open: boolean
  onClose: () => void
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { user } = useCurrentUser()
  const groups = getNavGroups(user)

  return (
    <>
      {/* Mobile backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-charcoal/40 transition-opacity lg:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <aside
        aria-label="Main navigation"
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-line bg-white transition-transform duration-200 lg:static lg:z-auto lg:w-64 lg:translate-x-0 lg:transition-none ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-5">
          <div className="flex items-center gap-3 text-navy">
            <Landmark className="h-7 w-7" strokeWidth={1.8} />
            <span className="text-sm font-bold leading-tight">
              PPE Management
              <br />
              System
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="rounded p-1 text-gray hover:bg-mist hover:text-navy lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {groups.map(({ group, items }) => (
            <div key={group} className="mb-5">
              <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-gray">
                {group}
              </p>
              <ul className="space-y-0.5">
                {items.map((item) => (
                  <li key={item.path || 'home'}>
                    <NavLink
                      to={hrefFor(item)}
                      end={item.path === ''}
                      onClick={onClose}
                      className={({ isActive }) =>
                        `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                          isActive
                            ? 'bg-navy font-semibold text-white'
                            : 'text-charcoal hover:bg-mist hover:text-navy'
                        }`
                      }
                    >
                      <item.icon className="h-[18px] w-[18px] shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-line px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray">
            Signed in as
          </p>
          <p className="mt-1 text-sm font-semibold text-navy">
            {roleLabels[user.role]}
          </p>
        </div>
      </aside>
    </>
  )
}
