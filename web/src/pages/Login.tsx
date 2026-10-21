import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { landingPathFor, useAuth } from '../auth/AuthProvider'
import { Logo } from '../components/Logo'
import { ArrowRight } from '../components/Icons'
import { Button, Field, TextInput } from '../components/ui'
import { InlineNotice } from '../components/States'
import { validateEmail, validatePassword } from '../lib/validate'

const DEMO_ACCOUNTS = [
  { label: 'Platform admin', email: 'admin@bdn.dev', password: 'admin12345' },
  { label: 'Blood bank', email: 'hospital1@bdn.dev', password: 'hospital12345' },
  { label: 'Donor', email: 'arun.kumar0@example.com', password: 'donor12345' },
]

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string | null; password?: string | null }>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname

  async function submit(event: FormEvent) {
    event.preventDefault()
    const emailError = validateEmail(email)
    const passwordError = validatePassword(password)
    setErrors({ email: emailError, password: passwordError })
    setFailure(null)
    if (emailError || passwordError) return

    setPending(true)
    try {
      const user = await signIn({ email: email.trim(), password })
      navigate(from ?? landingPathFor(user.role), { replace: true })
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : 'Could not sign in.')
    } finally {
      setPending(false)
    }
  }

  function fill(account: (typeof DEMO_ACCOUNTS)[number]) {
    setEmail(account.email)
    setPassword(account.password)
    setErrors({})
    setFailure(null)
  }

  return (
    <div className="auth">
      <div className="auth__panel">
        <div className="auth__brand">
          <Link to="/" aria-label="Back to the home page">
            <Logo />
          </Link>
        </div>

        <div className="auth__form-wrap">
          <form className="auth__form" onSubmit={submit} noValidate>
            <div className="auth__form-head">
              <p className="eyebrow">Sign in</p>
              <h2>Welcome back</h2>
              <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                Your role decides which console opens. Donors, blood banks and platform
                admins all authenticate through the same endpoint.
              </p>
            </div>

            {failure && <InlineNotice tone="danger">{failure}</InlineNotice>}

            <Field
              label="Email"
              error={errors.email}
              children={({ id, describedBy }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              )}
            />

            <Field
              label="Password"
              error={errors.password}
              children={({ id, describedBy }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              )}
            />

            <Button type="submit" variant="primary" size="lg" busy={pending} icon={<ArrowRight size={16} />}>
              Sign in
            </Button>

            <p className="auth__footer">
              No account? <Link to="/register" style={{ color: 'var(--accent-bright)' }}>Register as a donor</Link>
            </p>
          </form>
        </div>

        <p className="auth__footer">
          <Link to="/" className="auth__back">
            ← Back to the home page
          </Link>
        </p>
      </div>

      <aside className="auth__aside">
        <div className="auth__aside-inner">
          <p className="eyebrow">Seeded demo accounts</p>
          <h3>Don't want to register first?</h3>
          <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
            These accounts exist in the seeded database. Selecting one fills the form — it
            still authenticates against the real API with a real password hash.
          </p>

          <div className="list-stack">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                className="list-stack__item"
                onClick={() => fill(account)}
                style={{ width: '100%', textAlign: 'left' }}
              >
                <span className="list-stack__body">
                  <span className="list-stack__title">{account.label}</span>
                  <span className="list-stack__meta">
                    <span className="mono">{account.email}</span>
                  </span>
                </span>
                <ArrowRight size={15} />
              </button>
            ))}
          </div>
        </div>
      </aside>
    </div>
  )
}
