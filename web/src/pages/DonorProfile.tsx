import { useState, type FormEvent } from 'react'

import { api } from '../api/client'
import type { BloodGroup, DonorUpdateBody, UserOut } from '../api/types'
import { useAuth } from '../auth/AuthProvider'
import { ConsoleFrame } from '../components/AppShell'
import { Shield } from '../components/Icons'
import { ErrorState, InlineNotice, LoadingState } from '../components/States'
import {
  Badge,
  Button,
  Field,
  Panel,
  Select,
  TextInput,
  Toggle,
} from '../components/ui'
import { useApi, useMutation } from '../hooks/useApi'
import { formatDate } from '../lib/format'
import { DONOR_NAV } from './DonorHome'

const BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

export default function DonorProfile() {
  const { user, refresh, patchUser } = useAuth()
  const profile = useApi<UserOut>(() => api.donorProfile(), [])

  const [form, setForm] = useState<{
    blood_group: BloodGroup | ''
    district: string
    latitude: string
    longitude: string
  } | null>(null)

  const [notice, setNotice] = useState<string | null>(null)
  const [token, setToken] = useState('')

  const save = useMutation((patch: DonorUpdateBody) => api.updateDonor(patch))
  const verify = useMutation((value: string) => api.verifyDonor(value))
  const availability = useMutation((next: boolean) => api.updateDonor({ is_available: next }))

  const current = profile.data ?? user
  // Note: the API deliberately does not echo coordinates back in UserOut, so
  // these two fields always start empty. Leaving them blank submits null,
  // which clears the stored point rather than silently keeping a stale one.
  const values =
    form ?? {
      blood_group: (current?.blood_group ?? '') as BloodGroup | '',
      district: current?.district ?? '',
      latitude: '',
      longitude: '',
    }

  function set<K extends keyof typeof values>(key: K, value: (typeof values)[K]) {
    setForm({ ...values, [key]: value })
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setNotice(null)
    const result = await save.mutate({
      blood_group: values.blood_group || null,
      district: values.district.trim() || null,
      latitude: values.latitude.trim() ? Number(values.latitude) : null,
      longitude: values.longitude.trim() ? Number(values.longitude) : null,
    })
    if (result) {
      patchUser(result)
      setNotice('Profile saved. Matching will use the new values immediately.')
      await profile.reload()
      setForm(null)
    }
  }

  async function submitVerification(event: FormEvent) {
    event.preventDefault()
    setNotice(null)
    const result = await verify.mutate(token.trim())
    if (result) {
      patchUser(result)
      setNotice('Identity attested. You will now rank above unverified donors for the same distance.')
      setToken('')
      await profile.reload()
    }
  }

  async function toggleAvailability(next: boolean) {
    setNotice(null)
    const result = await availability.mutate(next)
    if (result) {
      patchUser(result)
      setNotice(
        next
          ? 'You are back in the matching pool.'
          : 'You are paused. No new alerts will be sent until you turn this back on.',
      )
      await profile.reload()
    }
  }

  return (
    <ConsoleFrame section="Donor console" nav={DONOR_NAV}>
      <div className="console-grid">
        <div className="console-grid__main">
          <Panel eyebrow="Matching inputs" title="What the engine knows about you">
            {profile.loading && <LoadingState label="Reading your profile" rows={3} />}

            {profile.error && (
              <ErrorState message={profile.error} onRetry={() => void profile.reload()} />
            )}

            {current && (
              <form className="flow" onSubmit={submit}>
                {notice && <InlineNotice tone="ok">{notice}</InlineNotice>}
                {save.error && <InlineNotice tone="danger">{save.error}</InlineNotice>}

                <div className="grid-form">
                  <div className="grid-form__field--6">
                    <Field
                      label="Blood group"
                      hint="Drives which requests you can serve"
                      children={({ id }) => (
                        <Select
                          id={id}
                          value={values.blood_group}
                          onChange={(event) =>
                            set('blood_group', event.target.value as BloodGroup | '')
                          }
                        >
                          <option value="">Not set</option>
                          {BLOOD_GROUPS.map((group) => (
                            <option key={group} value={group}>
                              {group}
                            </option>
                          ))}
                        </Select>
                      )}
                    />
                  </div>

                  <div className="grid-form__field--6">
                    <Field
                      label="District"
                      children={({ id }) => (
                        <TextInput
                          id={id}
                          value={values.district}
                          placeholder="Coimbatore"
                          onChange={(event) => set('district', event.target.value)}
                        />
                      )}
                    />
                  </div>

                  <div className="grid-form__field--6">
                    <Field
                      label="Latitude"
                      hint="Used to compute the distance to a hospital"
                      children={({ id }) => (
                        <TextInput
                          id={id}
                          value={values.latitude}
                          inputMode="decimal"
                          placeholder="11.0168"
                          onChange={(event) => set('latitude', event.target.value)}
                        />
                      )}
                    />
                  </div>

                  <div className="grid-form__field--6">
                    <Field
                      label="Longitude"
                      children={({ id }) => (
                        <TextInput
                          id={id}
                          value={values.longitude}
                          inputMode="decimal"
                          placeholder="76.9558"
                          onChange={(event) => set('longitude', event.target.value)}
                        />
                      )}
                    />
                  </div>

                  <div className="grid-form__actions">
                    {form && (
                      <Button size="md" variant="ghost" onClick={() => setForm(null)}>
                        Reset
                      </Button>
                    )}
                    <Button type="submit" size="md" variant="primary" busy={save.pending}>
                      Save changes
                    </Button>
                  </div>
                </div>

                <p className="dim" style={{ fontSize: 'var(--text-xs)' }}>
                  Only these four fields feed the matching engine. Your email, phone and
                  password are never used to rank or filter you.
                </p>
              </form>
            )}
          </Panel>

          <Panel eyebrow="Availability" title="Pause without deleting anything">
            {availability.error && <InlineNotice tone="danger">{availability.error}</InlineNotice>}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 'var(--s-4)',
              }}
            >
              <div>
                <p style={{ fontSize: 'var(--text-sm)' }}>
                  {current?.is_available
                    ? 'You are in the matching pool'
                    : 'You are paused'}
                </p>
                <p className="dim" style={{ fontSize: 'var(--text-xs)' }}>
                  Pausing is reversible and never removes your donation history.
                </p>
              </div>
              <Toggle
                checked={Boolean(current?.is_available)}
                disabled={availability.pending}
                label="Toggle availability"
                onChange={(next) => void toggleAvailability(next)}
              />
            </div>
          </Panel>

          <Panel
            eyebrow="Identity"
            title={current?.verified ? 'Attested' : 'Attest your identity'}
            action={
              <Badge tone={current?.verified ? 'ok' : 'warn'} dot>
                {current?.verified ? 'verified' : 'unverified'}
              </Badge>
            }
          >
            <div className="flow">
              <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                A verified donor outranks an unverified one at the same distance. The
                platform stores only the DigiLocker <em>attestation token</em> — never your
                Aadhaar number — so a database breach cannot leak an identity number.
              </p>

              {!current?.verified && (
                <form className="split-row" onSubmit={submitVerification}>
                  <Field
                    label="DigiLocker attestation token"
                    error={verify.error}
                    hint="The token issued by DigiLocker, not your Aadhaar number"
                    children={({ id, describedBy }) => (
                      <TextInput
                        id={id}
                        aria-describedby={describedBy}
                        value={token}
                        placeholder="dlk_…"
                        onChange={(event) => setToken(event.target.value)}
                      />
                    )}
                  />
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <Button
                      type="submit"
                      variant="primary"
                      size="md"
                      busy={verify.pending}
                      disabled={token.trim().length < 8}
                      icon={<Shield size={15} />}
                    >
                      Submit attestation
                    </Button>
                  </div>
                </form>
              )}

              {current?.verified && current.last_donation_at && (
                <p className="dim" style={{ fontSize: 'var(--text-xs)' }}>
                  Last donation recorded {formatDate(current.last_donation_at)}.
                </p>
              )}
            </div>
          </Panel>
        </div>

        <aside className="console-grid__side">
          <Panel eyebrow="Account">
            <div className="list-stack">
              <div className="list-stack__item" style={{ padding: 'var(--s-3) 0' }}>
                <span className="list-stack__meta">Name</span>
                <span style={{ fontSize: 'var(--text-sm)' }}>{current?.name}</span>
              </div>
              <div className="list-stack__item" style={{ padding: 'var(--s-3) 0' }}>
                <span className="list-stack__meta">Email</span>
                <span className="mono" style={{ fontSize: 'var(--text-xs)' }}>
                  {current?.email}
                </span>
              </div>
              <div className="list-stack__item" style={{ padding: 'var(--s-3) 0' }}>
                <span className="list-stack__meta">Phone</span>
                <span className="mono" style={{ fontSize: 'var(--text-xs)' }}>
                  {current?.phone}
                </span>
              </div>
              <div className="list-stack__item" style={{ padding: 'var(--s-3) 0' }}>
                <span className="list-stack__meta">Member since</span>
                <span style={{ fontSize: 'var(--text-sm)' }}>
                  {current?.created_at ? formatDate(current.created_at) : '—'}
                </span>
              </div>
            </div>
          </Panel>

          <Panel eyebrow="Reference">
            <p className="muted" style={{ fontSize: 'var(--text-xs)' }}>
              Eligibility is recalculated from your last donation each time you load a page.
              Recording a donation here is a self-report; the authoritative record is the one
              the blood bank creates when it collects your unit.
            </p>
            <div style={{ marginTop: 'var(--s-4)' }}>
              <Button size="sm" variant="ghost" onClick={() => void refresh()}>
                Refresh session
              </Button>
            </div>
          </Panel>
        </aside>
      </div>
    </ConsoleFrame>
  )
}
