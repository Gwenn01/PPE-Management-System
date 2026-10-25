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
    const desktop = window.matchMedia('(min-width: 1024px)')
    const onResize = () => { if (desktop.matches) closeMenu() }
    desktop.addEventListener('change', onResize)
    return () => desktop.removeEventListener('change', onResize)
  }, [closeMenu])

  useEffect(() => {
    if (window.matchMedia('(min-width: 1024px)').matches || !menuOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [menuOpen])

  useEffect(() => { mainRef.current?.scrollTo({ top: 0 }) }, [location.pathname])

  return (
    <div className="dashboard-shell flex h-dvh min-h-0 overflow-hidden bg-sidebar">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-white focus:p-3">Skip to main content</a>
      <Sidebar open={menuOpen} onClose={closeMenu} />
      <div className="dashboard-workspace-frame flex min-h-0 min-w-0 flex-1 overflow-hidden bg-sidebar py-1 md:py-1 lg:py-3 lg:pr-2.5">
        <div className="dashboard-workspace flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-none bg-white lg:rounded-[20px]">
          <Topbar onMenuClick={menuOpen ? closeMenu : openMenu} menuOpen={menuOpen} />
          <main ref={mainRef} id="main-content" inert={menuOpen} tabIndex={-1} className={`min-h-0 min-w-0 flex-1 overflow-x-hidden overscroll-contain bg-white px-4 pb-6 pt-2 sm:px-6 sm:pb-7 xl:px-6 ${menuOpen ? 'overflow-y-hidden' : 'overflow-y-auto'}`}>
            {notice && <p className="mb-5 rounded-xl border border-line bg-white px-4 py-3 text-sm text-navy" role="status">{notice}</p>}
            <div className="dashboard-route-content min-w-0"><Outlet /></div>
          </main>
        </div>
      </div>
    </div>
  )
}

