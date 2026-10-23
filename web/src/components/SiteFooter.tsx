import { Link } from 'react-router-dom'

import { Logo } from './Logo'
import { ArrowUpRight } from './Icons'

/**
 * The public footer. Shared by the landing page and the legal pages so the
 * Privacy and Terms links exist everywhere a visitor might look for them.
 *
 * Deliberately sparse: a wordmark, the legal routes, and the things that are
 * genuinely true about this project (open source, MIT). No newsletter box, no
 * invented social accounts, no company registration that does not exist.
 */
export function SiteFooter({ version }: { version?: string }) {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner shell-wide">
        <div className="site-footer__brand">
          <Logo size={24} />
          <p className="site-footer__note">
            An open-source demonstration of escalated donor matching and shortage
            forecasting. Not a live medical service.
          </p>
        </div>

        <nav className="site-footer__links" aria-label="Site information">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <a href="/docs" target="_blank" rel="noreferrer">
            API docs
            <ArrowUpRight size={12} />
          </a>
          <a
            href="https://github.com/pranitajeyan-cyber/blood-donation-network"
            target="_blank"
            rel="noreferrer"
          >
            Source
            <ArrowUpRight size={12} />
          </a>
        </nav>

        <div className="site-footer__meta">
          <span>MIT licensed</span>
          {version && <span className="mono">v{version}</span>}
        </div>
      </div>
    </footer>
  )
}
