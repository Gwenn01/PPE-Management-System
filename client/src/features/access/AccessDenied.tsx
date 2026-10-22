import { Link } from 'react-router-dom'

export default function AccessDenied() {
  return (
    <section className="mx-auto max-w-6xl rounded-2xl border border-line bg-white p-6 sm:p-8" role="alert">
      <h2 className="text-xl font-bold text-navy">Access unavailable</h2>
      <p className="mt-3 text-sm text-charcoal">Your current demo identity cannot access this page in this municipality.</p>
      <Link to="/dashboard" className="mt-5 inline-block rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white">Return to dashboard</Link>
    </section>
  )
}
