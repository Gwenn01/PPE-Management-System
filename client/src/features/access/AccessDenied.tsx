import { Link } from 'react-router-dom'

export default function AccessDenied() {
  return (
    <section className="ui-panel w-full p-5 sm:p-6" role="alert">
      <h2 className="text-xl font-bold text-navy">Access unavailable</h2>
      <p className="mt-3 text-sm text-charcoal">Your account does not have access to this page in this municipality.</p>
      <Link to="/dashboard" className="mt-5 inline-block rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white">Return to dashboard</Link>
    </section>
  )
}
