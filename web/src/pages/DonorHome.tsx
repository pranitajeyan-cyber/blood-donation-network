import { Link } from 'react-router-dom'

import { api } from '../api/client'
import type { BagOut, EligibilityOut, MatchOut, PlatformSpec } from '../api/types'
import { useAuth } from '../auth/AuthProvider'
import { ConsoleFrame } from '../components/AppShell'
import { ArrowRight, Clock, Drop, Pin, Shield } from '../components/Icons'
import { ErrorState, LoadingState, RefreshingBar } from '../components/States'
import { Badge, EmptyState, Meter, Panel, Stat } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { formatDate, timeAgo } from '../lib/format'

export const DONOR_NAV = [
  { to: '/donor', label: 'Overview', end: true },
  { to: '/donor/alerts', label: 'My alerts' },
  { to: '/donor/history', label: 'Donation history' },
  { to: '/donor/profile', label: 'Profile' },
]

export default function DonorHome() {
  const { user } = useAuth()
  const eligibility = useApi<EligibilityOut>(() => api.eligibility(), [])
  const matches = useApi<MatchOut[]>(() => api.myMatches(), [])
  const bags = useApi<BagOut[]>(() => api.myBags(), [])
  const spec = useApi<PlatformSpec>(() => api.spec(), [])

  const waiting = (matches.data ?? []).filter((m) => m.status === 'NOTIFIED')
  const answered = (matches.data ?? []).filter((m) => m.status !== 'NOTIFIED')
  const unitsGiven = (bags.data ?? []).reduce((total, bag) => total + bag.units, 0)

  return (
    <ConsoleFrame section="Donor console" nav={DONOR_NAV}>
      <div className="console-grid">
        <div className="console-grid__main">
          {/* Eligibility gets the full width — it is the single thing a donor
              actually needs to know before anything else on this page. */}
          <Panel
            eyebrow="Eligibility"
            title="Can you donate today?"
            action={<RefreshingBar visible={eligibility.refreshing} />}
          >
            {eligibility.loading && <LoadingState label="Checking the cooldown" rows={2} />}

            {eligibility.error && (
              <ErrorState
                message={eligibility.error}
                onRetry={() => void eligibility.reload()}
              />
            )}

            {eligibility.data && (
              <div className="flow">
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 'var(--s-4)',
                  }}
                >
                  <div>
                    <p
                      className="display"
                      style={{ fontSize: 'var(--text-3xl)', lineHeight: 1.05 }}
                    >
                      {eligibility.data.eligible ? (
                        <>You are eligible.</>
                      ) : (
                        <>
                          Eligible again in{' '}
                          <span className="num">{eligibility.data.days_until_eligible}</span> day
                          {eligibility.data.days_until_eligible === 1 ? '' : 's'}.
                        </>
                      )}
                    </p>
                    <p className="muted" style={{ marginTop: 'var(--s-2)' }}>
                      {eligibility.data.eligible
                        ? 'Your last donation is outside the medical cooldown, so you can be matched to a nearby request.'
                        : `Next eligible on ${formatDate(eligibility.data.eligible_again_at)}. The 120-day gap is enforced by the matching engine, not just shown here.`}
                    </p>
                  </div>

                  <Badge tone={eligibility.data.eligible ? 'ok' : 'warn'} dot>
                    {eligibility.data.eligible ? 'available' : 'in cooldown'}
                  </Badge>
                </div>

                {spec.data && (
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: 'var(--s-2)',
                        fontSize: 'var(--text-xs)',
                        color: 'var(--ink-tertiary)',
                      }}
                    >
                      <span>Days since last donation window</span>
                      <span className="num">
                        120 − {eligibility.data.days_until_eligible} / 120
                      </span>
                    </div>
                    <Meter
                      value={spec.data.donor_lock_days - eligibility.data.days_until_eligible}
                      max={spec.data.donor_lock_days}
                      tone={eligibility.data.eligible ? 'ok' : 'warn'}
                      label="Cooldown progress"
                    />
                  </div>
                )}
              </div>
            )}
          </Panel>

          <Panel
            eyebrow="Alerts"
            title="Requests you were matched to"
            action={
              <Link className="btn btn--ghost btn--sm" to="/donor/alerts">
                <span>Open inbox</span>
                <ArrowRight size={15} />
              </Link>
            }
            bleed
          >
            {matches.loading && <LoadingState label="Reading your matches" />}

            {matches.error && (
              <div style={{ padding: 'var(--s-6)' }}>
                <ErrorState message={matches.error} onRetry={() => void matches.reload()} />
              </div>
            )}

            {matches.data && waiting.length === 0 && answered.length === 0 && (
              <EmptyState
                title="No alerts yet"
                body="When a blood bank near you raises a request that matches your blood group, distance and eligibility, it will appear here and you will be notified."
                action={
                  <Link className="btn btn--outline btn--sm" to="/donor/profile">
                    <span>Check your profile is complete</span>
                  </Link>
                }
                icon={<Drop size={18} />}
              />
            )}

            {matches.data && waiting.length > 0 && (
              <div className="list-stack">
                {waiting.slice(0, 4).map((match) => (
                  <article className="list-stack__item" key={match.id}>
                    <div className="list-stack__body">
                      <p className="list-stack__title">
                        Request #{match.request_id} · needs your blood group
                      </p>
                      <p className="list-stack__meta">
                        <span className="mono">{match.distance_km.toFixed(1)} km away</span>
                        <span className="list-stack__sep">/</span>
                        <span>notified {timeAgo(match.notified_at)}</span>
                      </p>
                    </div>
                    <div className="list-stack__actions">
                      <Badge tone="accent" dot>
                        awaiting you
                      </Badge>
                      <Link className="btn btn--primary btn--sm" to="/donor/alerts">
                        <span>Respond</span>
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </Panel>

          <Panel eyebrow="Impact" title="Your donation history" bleed>
            {bags.loading && <LoadingState label="Reading your bags" />}

            {bags.error && (
              <div style={{ padding: 'var(--s-6)' }}>
                <ErrorState message={bags.error} onRetry={() => void bags.reload()} />
              </div>
            )}

            {bags.data && bags.data.length === 0 && (
              <EmptyState
                title="You have not donated through the network yet"
                body="Once a blood bank registers a unit you gave, the barcode and its status appear here."
                icon={<Drop size={18} />}
              />
            )}

            {bags.data && bags.data.length > 0 && (
              <div className="data-table">
                <div className="data-table__row data-table__row--head">
                  <div className="data-table__cell">Bag code</div>
                  <div className="data-table__cell">Group</div>
                  <div className="data-table__cell">Collected</div>
                  <div className="data-table__cell data-table__cell--right">Status</div>
                </div>
                {bags.data.slice(0, 6).map((bag) => (
                  <div className="data-table__row" key={bag.id}>
                    <div className="data-table__cell mono">{bag.bag_code}</div>
                    <div className="data-table__cell mono">{bag.blood_group}</div>
                    <div className="data-table__cell data-table__sub">
                      {formatDate(bag.donated_at)}
                    </div>
                    <div className="data-table__cell data-table__cell--right">
                      <Badge tone={bag.status === 'TRANSFUSED' ? 'ok' : 'cool'}>
                        {bag.status.toLowerCase()}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <aside className="console-grid__side">
          <Panel eyebrow="Your profile" title={user?.name ?? 'Donor'}>
            <div className="flow">
              <div className="tag-row">
                <Badge tone="accent">{user?.blood_group ?? 'group not set'}</Badge>
                <Badge tone={user?.verified ? 'ok' : 'warn'}>
                  {user?.verified ? 'verified' : 'unverified'}
                </Badge>
                <Badge tone={user?.is_available ? 'cool' : 'neutral'}>
                  {user?.is_available ? 'available' : 'paused'}
                </Badge>
              </div>

              <div className="list-stack">
                <div className="list-stack__item" style={{ padding: 'var(--s-3) 0' }}>
                  <span className="list-stack__meta">
                    <Pin size={14} />
                    District
                  </span>
                  <span style={{ fontSize: 'var(--text-sm)' }}>
                    {user?.district ?? 'not set'}
                  </span>
                </div>
                <div className="list-stack__item" style={{ padding: 'var(--s-3) 0' }}>
                  <span className="list-stack__meta">
                    <Shield size={14} />
                    Identity
                  </span>
                  <span style={{ fontSize: 'var(--text-sm)' }}>
                    {user?.verified ? 'attested' : 'pending'}
                  </span>
                </div>
                <div className="list-stack__item" style={{ padding: 'var(--s-3) 0' }}>
                  <span className="list-stack__meta">
                    <Clock size={14} />
                    Last donation
                  </span>
                  <span style={{ fontSize: 'var(--text-sm)' }}>
                    {user?.last_donation_at ? formatDate(user.last_donation_at) : 'never'}
                  </span>
                </div>
              </div>

              <Link className="btn btn--outline btn--sm" to="/donor/profile">
                <span>Edit profile</span>
              </Link>
            </div>
          </Panel>

          <Panel eyebrow="Totals">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-5)' }}>
              <Stat value={bags.data?.length ?? '—'} label="donations recorded" />
              <Stat value={unitsGiven || '—'} label="units contributed" />
              <Stat
                value={matches.data?.length ?? '—'}
                label="times matched to a request"
              />
            </div>
          </Panel>
        </aside>
      </div>
    </ConsoleFrame>
  )
}
