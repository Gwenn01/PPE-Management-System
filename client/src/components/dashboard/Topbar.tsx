import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowUpRight, ChevronRight, LogOut, Menu, Search } from 'lucide-react'
import { getNavGroups, hrefFor, navItems } from '../../config/navigation'
import { roleLabels } from '../../config/roles'
import { useAuthenticatedUser } from '../../hooks/useAuthenticatedUser'
import { Modal } from '../ui'

type TopbarProps = { onMenuClick: () => void; menuOpen: boolean }

function initials(name: string) {
  return name.split(' ').filter(Boolean).map((part) => part[0]).slice(0, 2).join('').toUpperCase()
}

export default function Topbar({ onMenuClick, menuOpen }: TopbarProps) {
  const { user, session, logout } = useAuthenticatedUser()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const current = navItems.find((item) => hrefFor(item) === pathname)
  const results = getNavGroups(user, user, session.permissions).flatMap(({ items }) => items).filter((item) =>
    `${item.label} ${item.description} ${item.group}`.toLowerCase().includes(query.trim().toLowerCase()))

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus()
  }, [searchOpen])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k' || menuOpen) return
      if (document.querySelector('[role="dialog"]')) return
      event.preventDefault()
      setQuery('')
      setSearchOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  const handleLogout = async () => {
    setSigningOut(true)
    setError('')
    try {
      await logout()
      navigate('/login', { replace: true })
    } catch {
      setError('Unable to sign out. Please try again.')
      setSigningOut(false)
    }
  }

  return <>
    <header inert={menuOpen} className="relative z-30 flex h-16 shrink-0 items-center justify-between gap-3 bg-transparent px-4 sm:px-6 xl:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" onClick={onMenuClick} aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} aria-controls="dashboard-sidebar" className="rounded-lg p-2.5 text-charcoal hover:bg-mist lg:hidden"><Menu size={20} /></button>
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
          <Link to="/dashboard" className="hidden text-muted hover:text-navy md:block">Workspace</Link>
          <ChevronRight size={14} className="hidden shrink-0 text-gray md:block" aria-hidden />
          <span aria-current="page" className="truncate font-semibold text-navy">{current?.label ?? 'Dashboard'}</span>
        </nav>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-4">
        <button type="button" onClick={() => { setQuery(''); setSearchOpen(true) }} aria-label="Search modules" aria-haspopup="dialog" aria-keyshortcuts="Control+k Meta+k" className="flex items-center gap-2 rounded-lg border border-line bg-mist/50 p-2.5 text-muted hover:border-gray hover:text-navy sm:px-3">
          <Search size={17} aria-hidden /><span className="hidden text-xs xl:inline">Find a module</span><kbd className="hidden rounded border border-line bg-white px-1.5 text-[10px] xl:inline">Ctrl K</kbd>
        </button>
        <div role="group" aria-label={`${user.name}, ${roleLabels[user.role]}, ${session.municipality.name}`} className="flex min-w-0 items-center gap-3 sm:border-l sm:border-line sm:pl-4">
          <div aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full border border-navy/10 bg-navy-soft text-xs font-bold text-navy">{initials(user.name)}</div>
          <div className="hidden min-w-0 text-left sm:block"><p className="max-w-40 truncate text-xs font-semibold text-charcoal">{user.name}</p><p className="mt-0.5 max-w-40 truncate text-[11px] text-muted">{roleLabels[user.role]}</p></div>
        </div>
        <button type="button" disabled={signingOut} onClick={() => { void handleLogout() }} aria-label={signingOut ? 'Signing out' : 'Log out'} title="Log out" className="rounded-lg p-2.5 text-muted hover:bg-mist hover:text-navy disabled:opacity-50"><LogOut size={18} /></button>
      </div>
      {error && <p role="alert" className="absolute right-4 top-full rounded-lg border border-red-200 bg-white p-3 text-xs text-red-700">{error}</p>}
    </header>
    <Modal open={searchOpen} title="Find a module" onClose={() => setSearchOpen(false)}>
      <div className="relative"><Search size={18} aria-hidden className="absolute left-3 top-3 text-muted" /><input ref={searchRef} type="search" aria-label="Search available modules" placeholder="Search by name or task…" className="ui-input pl-10" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      <p role="status" className="mb-3 mt-4 text-xs text-muted">{results.length} {results.length === 1 ? 'module' : 'modules'} available to your role</p>
      {results.length ? <ul className="space-y-1">{results.map((item) => <li key={item.path}><Link to={hrefFor(item)} onClick={() => setSearchOpen(false)} className="group flex items-center gap-3 rounded-xl p-3 hover:bg-mist"><span className="rounded-lg bg-navy-soft p-2 text-navy"><item.icon size={18} aria-hidden /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-navy">{item.label}</span><span className="block text-xs leading-5 text-muted">{item.description}</span></span><ArrowUpRight size={16} className="shrink-0 text-muted" aria-hidden /></Link></li>)}</ul> : <div className="rounded-xl bg-mist px-4 py-8 text-center"><p className="font-semibold text-navy">No matching modules</p><p className="mt-1 text-sm text-muted">Try a different name, such as inventory or reports.</p><button className="ui-button-secondary mt-4" type="button" onClick={() => { setQuery(''); searchRef.current?.focus() }}>Clear search</button></div>}
    </Modal>
  </>
}
