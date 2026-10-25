import { useLocation, useNavigate } from 'react-router-dom'
import { LogOut, Menu } from 'lucide-react'
import { navItems } from '../../config/navigation'
import { roleLabels } from '../../config/roles'
import { useAuthenticatedUser } from '../../hooks/useAuthenticatedUser'

type TopbarProps = {
  onMenuClick: () => void
  menuOpen: boolean
}

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export default function Topbar({ onMenuClick, menuOpen }: TopbarProps) {
  const { user, session, logout } = useAuthenticatedUser()
  const { pathname } = useLocation()
  const navigate = useNavigate()

  const current = navItems.find((item) => {
    const href = item.path ? `/dashboard/${item.path}` : '/dashboard'
    return href === pathname
  })

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-line bg-white px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="dashboard-sidebar"
          className="rounded p-2 text-charcoal hover:bg-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="truncate text-base font-bold text-navy sm:text-lg">
          {current?.label ?? 'Dashboard'}
        </h1>
      </div>

      <div className="flex items-center gap-3 sm:gap-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <div
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-navy text-xs font-bold text-white"
          >
            {initials(user.name)}
          </div>
          <div className="hidden text-left leading-tight xl:block">
            <p className="text-sm font-semibold text-charcoal">{user.name}</p>
            <p className="text-xs text-gray">{roleLabels[user.role]} · {session.municipality.name}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => { void handleLogout() }}
          aria-label="Log out"
          title="Log out"
          className="rounded p-2 text-gray transition-colors hover:bg-mist hover:text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </header>
  )
}

