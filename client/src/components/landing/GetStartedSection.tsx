import { Link } from 'react-router-dom'

export default function GetStartedSection() {
  return (
    <section
      id="get-started"
      className="grid w-full bg-mist lg:min-h-[420px] lg:grid-cols-2"
    >
      <div className="relative z-10 flex flex-col justify-center px-4 py-12 sm:px-8 sm:py-16 lg:px-16">
        <h2 className="text-3xl font-extrabold text-navy sm:text-4xl">
          Ready to manage your assets?
        </h2>
        <p className="mt-3 text-sm text-ink sm:text-base">
          Sign in to access the modules assigned to your role.
        </p>
        <Link
          to="/login"
          className="mt-6 inline-block w-fit rounded bg-navy px-12 py-3 text-sm font-semibold text-white transition hover:bg-navy-dark"
        >
          Login
        </Link>
        <p className="mt-8 max-w-sm text-xs leading-5 text-ink/80 sm:text-sm">
          This system is for authorized municipal personnel in Zambales. Access
          to records depends on your assigned role and municipality.
        </p>
      </div>

      <div className="relative h-60 sm:h-72 lg:h-auto">
        <img
          src="/iamges/landing_page/get-started.jpg"
          alt="Municipal office workspace"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 hidden bg-gradient-to-r from-mist via-mist/30 to-transparent lg:block" />
      </div>
    </section>
  )
}
