import { Link } from 'react-router-dom'

import { ConsoleFrame } from '../components/AppShell'
import { Logo } from '../components/Logo'
import { ArrowRight } from '../components/Icons'
import { useAuth } from '../auth/AuthProvider'
import { landingPathFor } from '../auth/AuthProvider'

export default function NotFound() {
  const { user } = useAuth()

  return (
    <div className="notfound">
      <Logo size={34} />
      <p className="notfound__code" aria-hidden="true">
        404
      </p>
      <h2>No route here</h2>
      <p className="lede" style={{ textAlign: 'center' }}>
        The address you followed does not belong to a page on this site. If you were
        looking for a console, sign in and it will open at the right place for your role.
      </p>

      <div className="landing__actions" style={{ justifyContent: 'center' }}>
        {user ? (
          <Link className="btn btn--primary btn--lg" to={landingPathFor(user.role)}>
            <span>Go to your console</span>
            <ArrowRight size={16} />
          </Link>
        ) : (
          <Link className="btn btn--primary btn--lg" to="/login">
            <span>Sign in</span>
            <ArrowRight size={16} />
          </Link>
        )}
        <Link className="btn btn--outline btn--lg" to="/">
          <span>Back to the home page</span>
        </Link>
      </div>
    </div>
  )
}

export { ConsoleFrame }
