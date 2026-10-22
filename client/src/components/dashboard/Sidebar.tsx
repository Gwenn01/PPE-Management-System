import { NavLink } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { Landmark, X } from 'lucide-react'
import { getNavGroups, hrefFor } from '../../config/navigation'
import { roleLabels } from '../../config/roles'
import { useAuthenticatedUser } from '../../hooks/useAuthenticatedUser'

type SidebarProps = {
  open: boolean
  onClose: () => void
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { user, session } = useAuthenticatedUser()
  const groups = getNavGroups(user, user, session.permissions)
  const sidebarRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!open || window.matchMedia('(min-width: 1024px)').matches) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    sidebarRef.current?.querySelector<HTMLButtonElement>('button[aria-label="Close menu"]')?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (window.matchMedia('(min-width: 1024px)').matches) return
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
      if (event.key !== 'Tab') return
      const links = Array.from(sidebarRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href]') ?? [])
      if (!links.length) return
      if (event.shiftKey && document.activeElement === links[0]) { event.preventDefault(); links[links.length - 1].focus() }
      else if (!event.shiftKey && document.activeElement === links[links.length - 1]) { event.preventDefault(); links[0].focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); previous?.focus() }
  }, [open, onClose])

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
        ref={sidebarRef}
        aria-label="Main navigation"
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-line bg-white transition-transform duration-200 lg:static lg:z-auto lg:w-64 lg:translate-x-0 lg:transition-none ${
          open ? 'visible translate-x-0' : 'invisible -translate-x-full lg:visible'
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
            className="rounded p-1 text-gray hover:bg-mist hover:text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy lg:hidden"
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
                        `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy ${
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

