import { useCallback, useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from '../components/dashboard/Sidebar'
import Topbar from '../components/dashboard/Topbar'
import { useAuthenticatedUser } from '../hooks/useAuthenticatedUser'

export default function DashboardLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  const openMenu = useCallback(() => setMenuOpen(true), [])
  const { notice } = useAuthenticatedUser()

  return (
    <div className="flex min-h-svh bg-mist">
      <Sidebar open={menuOpen} onClose={closeMenu} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenuClick={openMenu} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          {notice && <p className="mx-auto mb-5 max-w-6xl rounded-lg border border-line bg-white px-4 py-3 text-sm text-navy" role="status">{notice}</p>}
          <Outlet />
        </main>
      </div>
    </div>
  )
}

