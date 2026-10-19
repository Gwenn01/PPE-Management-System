import { Landmark } from 'lucide-react'

const links = [
  { label: 'Home', href: '#home' },
  { label: 'About', href: '#about' },
  { label: 'Features', href: '#features' },
]

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-line bg-white/95 backdrop-blur">
      <nav className="flex h-16 w-full items-center justify-between px-4 sm:px-8 lg:px-16">
        <a href="#home" className="flex items-center gap-3">
          <Landmark className="h-7 w-7 text-navy sm:h-8 sm:w-8" strokeWidth={1.8} />
          <span className="text-sm font-bold text-navy sm:text-base">
            PPE Management System
          </span>
        </a>

        <div className="flex items-center gap-4 sm:gap-8">
          <ul className="hidden items-center gap-8 text-sm md:flex">
            {links.map((link, i) => (
              <li key={link.label}>
                <a
                  href={link.href}
                  className={
                    i === 0
                      ? 'border-b-2 border-navy pb-1 font-semibold text-navy'
                      : 'text-ink transition hover:text-navy'
                  }
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <a
            href="/login"
            className="rounded bg-navy px-6 py-2 text-sm font-semibold text-white transition hover:bg-navy-dark sm:px-8"
          >
            Login
          </a>
        </div>
      </nav>
    </header>
  )
}
