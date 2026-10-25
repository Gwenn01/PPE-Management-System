import { useCallback, useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from '../components/dashboard/Sidebar'
import Topbar from '../components/dashboard/Topbar'
import { useAuthenticatedUser } from '../hooks/useAuthenticatedUser'

export default function DashboardLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  const location = useLocation()
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  const openMenu = useCallback(() => setMenuOpen(true), [])
  const { notice } = useAuthenticatedUser()

  useEffect(() => {
    if (window.matchMedia('(min-width: 1024px)').matches || !menuOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [menuOpen])

  useEffect(() => { mainRef.current?.scrollTo({ top: 0 }) }, [location.pathname])

  return (
    <div className="flex h-dvh min-h-0 overflow-hidden bg-mist">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-white focus:p-3">Skip to main content</a>
      <Sidebar open={menuOpen} onClose={closeMenu} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar onMenuClick={menuOpen ? closeMenu : openMenu} menuOpen={menuOpen} />
        <main ref={mainRef} id="main-content" tabIndex={-1} className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-4 sm:p-6 lg:p-8">
          {notice && <p className="mx-auto mb-5 max-w-6xl rounded-lg border border-line bg-white px-4 py-3 text-sm text-navy" role="status">{notice}</p>}
          <Outlet />
        </main>
      </div>
    </div>
  )
}

