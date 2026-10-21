import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { landingPathFor, useAuth } from '../auth/AuthProvider'
import { Logo } from '../components/Logo'
import { ArrowRight } from '../components/Icons'
import { InlineNotice } from '../components/States'
import { Button, Field, Select, TextInput } from '../components/ui'
import { validateEmail, validateName, validatePassword, validatePhone } from '../lib/validate'
import type { BloodGroup } from '../api/types'

const BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

export default function Register() {
  const { signUp } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    blood_group: '' as BloodGroup | '',
    district: '',
  })
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const next = {
      name: validateName(form.name),
      email: validateEmail(form.email),
      phone: validatePhone(form.phone),
      password: validatePassword(form.password),
    }
    setErrors(next)
    setFailure(null)
    if (Object.values(next).some(Boolean)) return

    setPending(true)
    try {
      const user = await signUp({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password,
        blood_group: form.blood_group || null,
        district: form.district.trim() || null,
      })
      navigate(landingPathFor(user.role), { replace: true })
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : 'Could not create the account.')
    } finally {
      setPending(false)
    }
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
              <p className="eyebrow">Donor registration</p>
              <h2>Join the network</h2>
              <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                Blood group and district are optional here — you can add them later from your
                profile. They only affect whether you are matched to a nearby request.
              </p>
            </div>

            {failure && <InlineNotice tone="danger">{failure}</InlineNotice>}

            <Field
              label="Full name"
              error={errors.name}
              children={({ id, describedBy }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  autoComplete="name"
                  placeholder="Arun Krishnan"
                  value={form.name}
                  onChange={(event) => update('name', event.target.value)}
                />
              )}
            />

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
                  value={form.email}
                  onChange={(event) => update('email', event.target.value)}
                />
              )}
            />

            <Field
              label="Phone"
              hint="10 digits — this is how a hospital reaches you"
              error={errors.phone}
              children={({ id, describedBy }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="9876543210"
                  maxLength={10}
                  value={form.phone}
                  onChange={(event) =>
                    update('phone', event.target.value.replace(/[^0-9]/g, ''))
                  }
                />
              )}
            />

            <Field
              label="Password"
              hint="At least 8 characters"
              error={errors.password}
              children={({ id, describedBy }) => (
                <TextInput
                  id={id}
                  aria-describedby={describedBy}
                  type="password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(event) => update('password', event.target.value)}
                />
              )}
            />

            <div className="auth__form-grid">
              <Field
                label="Blood group"
                hint="Optional"
                children={({ id }) => (
                  <Select
                    id={id}
                    value={form.blood_group}
                    onChange={(event) =>
                      update('blood_group', event.target.value as BloodGroup | '')
                    }
                  >
                    <option value="">Not sure yet</option>
                    {BLOOD_GROUPS.map((group) => (
                      <option key={group} value={group}>
                        {group}
                      </option>
                    ))}
                  </Select>
                )}
              />

              <Field
                label="District"
                hint="Optional"
                children={({ id }) => (
                  <TextInput
                    id={id}
                    placeholder="Coimbatore"
                    value={form.district}
                    onChange={(event) => update('district', event.target.value)}
                  />
                )}
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              busy={pending}
              icon={<ArrowRight size={16} />}
            >
              Create account
            </Button>

            <p className="auth__footer">
              Already registered?{' '}
              <Link to="/login" style={{ color: 'var(--accent-bright)' }}>
                Sign in
              </Link>
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
          <p className="eyebrow">What happens next</p>
          <h3>You are only contacted when you can actually donate.</h3>
          <ol className="ladder">
            <li className="ladder__step">
              <span className="ladder__marker" aria-hidden="true" />
              <div className="ladder__body">
                <p className="ladder__title">Verify your identity</p>
                <p className="ladder__meta">
                  A DigiLocker attestation token is stored — never your Aadhaar number.
                </p>
              </div>
            </li>
            <li className="ladder__step">
              <span className="ladder__marker" aria-hidden="true" />
              <div className="ladder__body">
                <p className="ladder__title">You are matched by three filters</p>
                <p className="ladder__meta">
                  Compatibility, distance from the hospital, and eligibility.
                </p>
              </div>
            </li>
            <li className="ladder__step">
              <span className="ladder__marker" aria-hidden="true" />
              <div className="ladder__body">
                <p className="ladder__title">You accept or decline</p>
                <p className="ladder__meta">
                  Declining is not penalised — it simply closes that match and the request
                  keeps escalating.
                </p>
              </div>
            </li>
            <li className="ladder__step">
              <span className="ladder__marker" aria-hidden="true" />
              <div className="ladder__body">
                <p className="ladder__title">A 120-day cooldown starts</p>
                <p className="ladder__meta">
                  Recorded the moment the blood bank logs the collected unit.
                </p>
              </div>
            </li>
          </ol>
        </div>
      </aside>
    </div>
  )
}
