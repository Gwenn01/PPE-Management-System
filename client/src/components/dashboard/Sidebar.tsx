import { NavLink } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { Landmark, MapPin, X } from 'lucide-react'
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
        id="dashboard-sidebar"
        role={open ? 'dialog' : undefined}
        aria-label="Main navigation"
        aria-modal={open ? true : undefined}
        className={`fixed inset-y-0 left-0 z-50 flex h-dvh w-72 max-w-[85vw] flex-col border-r border-white/10 bg-sidebar text-white transition-transform duration-200 lg:static lg:z-auto lg:h-dvh lg:w-64 lg:max-w-none lg:shrink-0 lg:translate-x-0 lg:transition-none ${
          open ? 'visible translate-x-0' : 'invisible -translate-x-full lg:visible'
        }`}
      >
        <div className="flex h-[72px] shrink-0 items-center justify-between border-b border-white/10 px-5">
          <div className="flex min-w-0 items-center gap-2.5 text-white">
            <span className="rounded-xl border border-white/15 bg-white/10 p-2"><Landmark className="h-6 w-6" strokeWidth={1.8} /></span>
            <span className="text-xs font-bold leading-tight">
              PPE Management
              <br />
              <span className="text-[9px] font-medium uppercase tracking-[0.08em] text-white/60">Municipal workspace</span>
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mx-4 mb-1 mt-5 flex shrink-0 items-center gap-2.5 rounded-lg border border-white/15 bg-white/5 px-3 py-3"><MapPin size={16} className="shrink-0 text-white/65" aria-hidden /><div className="min-w-0"><p className="text-[10px] font-medium uppercase tracking-widest text-white/60">Municipality</p><p className="truncate text-xs font-semibold">{session.municipality.name}</p></div></div>
        <nav className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-5">
          {groups.map(({ group, items }) => (
            <div key={group} className="mb-5">
              <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/60">
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
                        `flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                          isActive
                            ? 'bg-white/15 font-semibold text-white shadow-[inset_3px_0_0_#b9c9ee]'
                            : 'text-white/80 hover:bg-white/10 hover:text-white'
                        }`
                      }
                    >
                      <item.icon className="h-[18px] w-[18px] shrink-0" />
                      <span className="min-w-0 break-words leading-5">{item.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-white/10 px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Account</p>
          <p className="mt-2 truncate text-sm font-semibold text-white">{user.name}</p>
          <p className="mt-0.5 text-xs text-white/65">{roleLabels[user.role]}</p>
          <p className="mt-0.5 truncate text-xs text-white/45">{session.municipality.name}</p>
        </div>
      </aside>
    </>
  )
}

