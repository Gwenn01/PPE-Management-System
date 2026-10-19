import { Landmark } from 'lucide-react'

const links = [
  { label: 'Home', href: '#home' },
  { label: 'About', href: '#about' },
  { label: 'Features', href: '#features' },
  { label: 'Login', href: '/login' },
]

export default function Footer() {
  return (
    <footer className="w-full border-t border-line bg-white">
      <div className="flex w-full flex-col items-start gap-6 px-4 py-6 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-16">
        <a href="#home" className="flex items-center gap-3">
          <Landmark className="h-8 w-8 text-navy" strokeWidth={1.8} />
          <span className="text-sm font-bold text-navy">
            PPE Management System
          </span>
        </a>

        <ul className="flex flex-wrap gap-6 text-xs text-ink sm:text-sm">
          {links.map((link) => (
            <li key={link.label}>
              <a href={link.href} className="transition hover:text-navy">
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <p className="max-w-[320px] text-[11px] leading-4 text-ink sm:text-xs md:border-l md:border-line md:pl-6">
          © 2026 Accounting Information System for PPE Management in Zambales.
          All rights reserved.
        </p>
      </div>
    </footer>
  )
}
