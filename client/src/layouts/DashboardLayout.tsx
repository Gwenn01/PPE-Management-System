import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from '../components/dashboard/Sidebar'
import Topbar from '../components/dashboard/Topbar'

export default function DashboardLayout() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="flex min-h-svh bg-mist">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenuClick={() => setMenuOpen(true)} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
