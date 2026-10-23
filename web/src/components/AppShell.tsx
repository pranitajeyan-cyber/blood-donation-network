import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'

import { landingPathFor, useAuth } from '../auth/AuthProvider'
import { usePageMeta } from '../hooks/usePageMeta'
import { Logo } from './Logo'
import { LogOut, Menu, X } from './Icons'

/* ==========================================================================
   Public header — used on the landing page and the auth screens
   ========================================================================== */

const PUBLIC_LINKS = [
  { to: '/#escalation', label: 'Escalation' },
  { to: '/#forecasting', label: 'Forecasting' },
  { to: '/#network', label: 'Network' },
  { to: '/#api', label: 'API' },
]

export function SiteHeader() {
  const { user } = useAuth()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className={`site-header ${scrolled ? 'is-scrolled' : ''}`}>
      <div className="shell-wide site-header__inner">
        <Link to="/" className="site-header__brand" aria-label="Blood Donation Network home">
          <Logo />
        </Link>

        <nav className="site-header__nav" aria-label="Primary">
          {PUBLIC_LINKS.map((link) => (
            <a key={link.to} href={link.to}>
              {link.label}
            </a>
          ))}
        </nav>

        <div className="site-header__actions">
          {user ? (
            <Link className="btn btn--primary btn--sm" to={landingPathFor(user.role)}>
              <span>Open console</span>
            </Link>
          ) : (
            <>
              <Link className="site-header__signin" to="/login">
                Sign in
              </Link>
              <Link className="btn btn--primary btn--sm" to="/register">
                <span>Join as a donor</span>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

/* ==========================================================================
   Console header — used inside the authenticated surfaces
   ========================================================================== */

export function ConsoleHeader({ section }: { section: string }) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    setMenuOpen(false)
  }, [section])

  const roleLabel =
    user?.role === 'admin' ? 'Platform admin' : user?.role === 'hospital' ? 'Blood bank' : 'Donor'

  return (
    <header className="console-header">
      <div className="console-header__inner">
        <Link to="/" className="console-header__brand" aria-label="Blood Donation Network home">
          <Logo size={26} />
        </Link>

        <div className="console-header__section">
          <span className="console-header__rule" aria-hidden="true" />
          <span className="console-header__section-name">{section}</span>
        </div>

        <div className="console-header__right">
          <div className="console-header__identity">
            <span className="console-header__name">{user?.name}</span>
            <span className="console-header__role">{roleLabel}</span>
          </div>

          <button
            type="button"
            className="console-header__menu-btn"
            aria-expanded={menuOpen}
            aria-label="Account menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          {menuOpen && (
            <div className="console-header__menu">
              <p className="console-header__menu-email">{user?.email}</p>
              <button
                type="button"
                className="console-header__signout"
                onClick={() => {
                  signOut()
                  navigate('/')
                }}
              >
                <LogOut size={16} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

/* ==========================================================================
   Console shell
   ========================================================================== */

export function ConsoleFrame({
  section,
  nav,
  children,
}: {
  section: string
  nav?: { to: string; label: string; end?: boolean }[]
  children: ReactNode
}) {
  const location = useLocation()
  const current = nav?.find((item) => item.to === location.pathname)

  // Consoles are behind a JWT and have nothing to offer a search result, so
  // every one of them is explicitly excluded from indexing.
  usePageMeta({
    title: current ? `${section} · ${current.label}` : section,
    description:
      'Signed-in console for the Blood Donation Network demonstration. Not indexed.',
    noindex: true,
  })

  return (
    <div className="console">
      <ConsoleHeader section={section} />
      {nav && nav.length > 0 && (
        <nav className="console-nav" aria-label="Sections">
          <div className="shell-wide console-nav__inner">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={`console-nav__link`}
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
      <main id="main" tabIndex={-1} className="console-main" key={location.pathname}>
        <div className="shell-wide">{children}</div>
      </main>
    </div>
  )
}
