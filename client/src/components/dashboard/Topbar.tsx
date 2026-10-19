import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LogOut, Menu } from 'lucide-react'
import { navItems } from '../../config/navigation'
import { roleLabels, roleList } from '../../config/roles'
import type { Role } from '../../config/roles'
import { useCurrentUser } from '../../hooks/useCurrentUser'

type TopbarProps = {
  onMenuClick: () => void
}

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export default function Topbar({ onMenuClick }: TopbarProps) {
  const { user, setRole } = useCurrentUser()
  const { pathname } = useLocation()
  const navigate = useNavigate()

  const current = navItems.find((item) => {
    const href = item.path ? `/dashboard/${item.path}` : '/dashboard'
    return href === pathname
  })

  const handleLogout = () => {
    // TODO: clear the real session/token here once the API is connected.
    navigate('/login')
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-line bg-white px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open menu"
          className="rounded p-2 text-charcoal hover:bg-mist lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="truncate text-base font-bold text-navy sm:text-lg">
          {current?.label ?? 'Dashboard'}
        </h1>
      </div>

      <div className="flex items-center gap-3 sm:gap-4">
        {/* Dev-only: preview each role's navigation. Remove when the backend is connected. */}
        <label className="hidden items-center gap-2 text-xs text-gray sm:flex">
          <span className="rounded bg-chip px-2 py-0.5 font-semibold uppercase tracking-wide">
            Dev
          </span>
          <select
            value={user.role}
            onChange={(e) => setRole(e.target.value as Role)}
            aria-label="Preview as role"
            className="rounded border border-line bg-white px-2 py-1.5 text-xs text-charcoal outline-none focus:border-navy"
          >
            {roleList.map((role) => (
              <option key={role} value={role}>
                {roleLabels[role]}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-navy text-xs font-bold text-white"
          >
            {initials(user.name)}
          </div>
          <div className="hidden text-left leading-tight md:block">
            <p className="text-sm font-semibold text-charcoal">{user.name}</p>
            <p className="text-xs text-gray">{roleLabels[user.role]}</p>
          </div>
        </div>

        <Link
          to="/login"
          onClick={(e) => {
            e.preventDefault()
            handleLogout()
          }}
          aria-label="Log out"
          title="Log out"
          className="rounded p-2 text-gray transition-colors hover:bg-mist hover:text-navy"
        >
          <LogOut className="h-5 w-5" />
        </Link>
      </div>
    </header>
  )
}
