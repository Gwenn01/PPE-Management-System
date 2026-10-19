import { Link } from 'react-router-dom'

export default function HeroSection() {
  return (
    <section
      id="home"
      className="grid w-full bg-white lg:min-h-[calc(100svh-4rem)] lg:grid-cols-2"
    >
      <div className="relative z-10 flex flex-col justify-center px-4 py-12 sm:px-8 sm:py-16 lg:px-16 lg:py-24">
        <h1 className="text-3xl font-extrabold leading-tight text-navy sm:text-4xl xl:text-5xl xl:leading-[1.15]">
          Accounting Information System for Property, Plant, and Equipment
          Management in Zambales.
        </h1>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-ink sm:text-lg">
          One secure platform for municipalities in Zambales to register,
          monitor, account for, and report on local government assets, from
          acquisition to disposal.
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link
            to="/login"
            className="rounded bg-navy px-9 py-3 text-sm font-semibold text-white transition hover:bg-navy-dark"
          >
            Login
          </Link>
          <a
            href="#about"
            className="rounded border border-navy/40 px-9 py-3 text-sm font-semibold text-navy transition hover:bg-mist"
          >
            Learn More
          </a>
        </div>
      </div>

      <div className="relative order-first h-64 sm:h-80 lg:order-none lg:h-auto">
        <img
          src="/iamges/landing_page/hero.jpg"
          alt="Property documents and laptop on a desk"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 hidden bg-gradient-to-r from-white via-white/30 to-transparent lg:block" />
      </div>
    </section>
  )
}
