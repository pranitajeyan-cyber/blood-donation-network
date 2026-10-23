import { Link } from 'react-router-dom'

import { api } from '../api/client'
import type { PlatformPulse, PlatformSpec } from '../api/types'
import { useApi } from '../hooks/useApi'
import { usePageMeta } from '../hooks/usePageMeta'
import { SiteHeader } from '../components/AppShell'
import { CompareBars, Gauge } from '../components/charts'
import { EscalationLadder } from '../components/Escalation'
import { ArrowRight, Clock, Drop, Layers, Shield, Users } from '../components/Icons'
import { SiteFooter } from '../components/SiteFooter'
import { ErrorState, LoadingState } from '../components/States'
import { Badge, Panel } from '../components/ui'
import { fmtNum, pct } from '../lib/format'

export default function Landing() {
  usePageMeta({
    title: 'Blood Donation Network',
    description:
      'A directory answers a request. This escalates it: compatible, nearby and eligible donors first, then a wider search every fifteen minutes, with a backtested seven-day shortage forecast.',
  })

  const spec = useApi<PlatformSpec>(() => api.spec(), [])
  const pulse = useApi<PlatformPulse>(() => api.pulse(), [])
  const accuracy = useApi(() => api.accuracy(), [])

  const mean = accuracy.data?.mean_wmape
  const adjusted = mean?.adjusted_ma ?? null
  const naive = mean?.seasonal_naive ?? null

  const comparison =
    adjusted !== null && naive !== null
      ? [
          {
            key: 'mean',
            left: adjusted,
            right: naive,
          },
        ]
      : []

  const improvement =
    adjusted !== null && naive !== null && naive > 0
      ? 1 - adjusted / naive
      : null

  return (
    <div className="landing">
      <SiteHeader />

      <main id="main" tabIndex={-1}>
        {/* -------------------------------------------------------------- */}
        {/* Hero                                                           */}
        {/* -------------------------------------------------------------- */}
        <section className="landing__hero">
          <div className="shell-wide landing__hero-grid">
            <div>
              <p className="eyebrow landing__eyebrow">
                FastAPI · SQLAlchemy · live donor matching
              </p>

              <h1 className="landing__title">
                A directory answers a request.
                <br />
                <span className="italic" style={{ color: 'var(--accent-bright)' }}>
                  This escalates it.
                </span>
              </h1>

              <p className="lede landing__lead">
                Blood Donation Network matches a hospital's request against donors who are
                actually compatible, actually near, and actually eligible today — then widens
                its own search every fifteen minutes until the need is met.
              </p>

              <div className="landing__actions">
                <Link className="btn btn--primary btn--lg" to="/register">
                  <span>Register as a donor</span>
                  <ArrowRight size={16} />
                </Link>
                <Link className="btn btn--outline btn--lg" to="/login">
                  <span>Sign in to a console</span>
                </Link>
              </div>

              <div className="landing__meta">
                <span className="landing__meta-item">
                  <Shield size={15} />
                  DigiLocker attestation, never an Aadhaar number
                </span>
                <span className="landing__meta-item">
                  <span className="landing__meta-dot" aria-hidden="true" />
                  120-day medical cooldown enforced
                </span>
                <span className="landing__meta-item">
                  <span className="landing__meta-dot" aria-hidden="true" />
                  Barcode-traced from donor to transfusion
                </span>
              </div>
            </div>

            {/* Live board — every figure below is a counted value from the DB */}
            <aside className="landing__panel" aria-label="Live network status">
              <header className="landing__panel-header">
                <div>
                  <p className="eyebrow">Network pulse</p>
                  <p className="landing__panel-title">Counted live from the database</p>
                </div>
                <Badge tone="ok" dot>
                  live
                </Badge>
              </header>

              <div className="landing__panel-body">
                {pulse.loading && <LoadingState label="Reading the network" rows={2} />}

                {pulse.error && (
                  <ErrorState message={pulse.error} onRetry={() => void pulse.reload()} compact />
                )}

                {pulse.data && (
                  <>
                    <div className="landing__pulse-stats">
                      <PulseStat
                        value={fmtNum(pulse.data.donors_total)}
                        label="registered donors"
                      />
                      <PulseStat
                        value={fmtNum(pulse.data.donors_verified)}
                        label="identity verified"
                      />
                      <PulseStat
                        value={fmtNum(pulse.data.donors_available)}
                        label="available now"
                      />
                      <PulseStat
                        value={fmtNum(pulse.data.hospitals)}
                        label="blood banks"
                      />
                    </div>

                    <div className="landing__divider" />

                    <div className="landing__pulse-stats">
                      <PulseStat
                        value={fmtNum(pulse.data.open_requests)}
                        label="open requests"
                        tone={pulse.data.open_requests > 0 ? 'accent' : undefined}
                      />
                      <PulseStat
                        value={fmtNum(pulse.data.fulfilled_requests)}
                        label="fulfilled"
                      />
                      <PulseStat
                        value={fmtNum(pulse.data.units_fulfilled)}
                        label="units delivered"
                      />
                      <PulseStat
                        value={fmtNum(pulse.data.bags_tracked)}
                        label="bags tracked"
                      />
                    </div>

                    <div className="landing__divider" />

                    <div className="landing__ladder-wrap">
                      <p className="eyebrow">Escalation ladder in force</p>
                      {spec.data ? (
                        <EscalationLadder spec={spec.data} />
                      ) : spec.error ? (
                        <ErrorState message={spec.error} onRetry={() => void spec.reload()} compact />
                      ) : (
                        <LoadingState label="Reading the SLA" rows={3} />
                      )}
                    </div>
                  </>
                )}
              </div>
            </aside>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Escalation                                                       */}
        {/* ---------------------------------------------------------------- */}
        <section className="landing__section" id="escalation">
          <div className="shell-wide">
            <div className="landing__section-head">
              <p className="eyebrow">01 — Escalation</p>
              <h2>The search widens itself, on a clock, every time.</h2>
              <p className="lede">
                Most platforms notify a list once and wait. Here, elapsed time is an input:
                a request that finds nobody in the first radius automatically reaches further
                out, and at the thirty-minute mark the family's emergency contacts are
                alerted directly.
              </p>
            </div>

            <div className="landing__grid-3">
              <article className="landing__feature">
                <Clock size={20} />
                <h3 className="landing__feature-title">Time is a first-class input</h3>
                <p className="landing__feature-body">
                  Escalation is a pure function of how old the request is, which makes it
                  replayable for backtesting and — more importantly — idempotent, so a
                  retried scheduler tick can never double-notify a donor.
                </p>
              </article>

              <article className="landing__feature">
                <Users size={20} />
                <h3 className="landing__feature-title">Right donors, not all donors</h3>
                <p className="landing__feature-body">
                  A match requires three things at once: a compatible blood group, a
                  distance inside the current radius, and medical eligibility. Someone who
                  donated eleven weeks ago is correctly left alone.
                </p>
              </article>

              <article className="landing__feature">
                <Layers size={20} />
                <h3 className="landing__feature-title">Nothing is a black box</h3>
                <p className="landing__feature-body">
                  Every notification, every tier change and every caregiver alert is written
                  to an alert log. The console shows the ladder a live request is standing on
                  right now.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Forecasting                                                      */}
        {/* ---------------------------------------------------------------- */}
        <section className="landing__section" id="forecasting">
          <div className="shell-wide">
            <div className="landing__section-head">
              <p className="eyebrow">02 — Forecasting</p>
              <h2>It publishes its own error rate.</h2>
              <p className="lede">
                The forecaster predicts units needed per blood group per district for the next
                seven days. Both models are scored on held-out history by the same harness,
                and the numbers below are computed on this database when the page loads —
                they are not typed into the markup.
              </p>
            </div>

            <div className="landing__accuracy">
              <div className="landing__accuracy-grid">
                <div className="landing__accuracy-copy">
                  <p className="eyebrow">Mean WMAPE · lower is better</p>

                  {accuracy.loading && <LoadingState label="Re-running the backtest" rows={2} />}

                  {accuracy.error && (
                    <ErrorState
                      message={accuracy.error}
                      onRetry={() => void accuracy.reload()}
                      compact
                    />
                  )}

                  {accuracy.data && adjusted !== null && naive !== null && (
                    <>
                      <div>
                        <p
                          className="num"
                          style={{
                            fontSize: 'var(--text-5xl)',
                            lineHeight: 1,
                            letterSpacing: '-0.045em',
                          }}
                        >
                          {adjusted.toFixed(4)}
                        </p>
                        <p className="muted" style={{ marginTop: 'var(--s-2)' }}>
                          weekday-adjusted moving average, versus{' '}
                          <span className="num">{naive.toFixed(4)}</span> for the seasonal-naive
                          baseline
                        </p>
                      </div>

                      {improvement !== null && (
                        <Badge tone="ok">
                          {(improvement * 100).toFixed(1)}% lower error than the baseline
                        </Badge>
                      )}

                      <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                        Scored across <span className="num">{accuracy.data.series_scored}</span>{' '}
                        district / blood-group series, forecast horizon{' '}
                        <span className="num">{accuracy.data.horizon_days}</span> days, trained on{' '}
                        <span className="num">{pct(accuracy.data.backtest_split)}</span> of each
                        series and tested on the rest.
                      </p>
                    </>
                  )}
                </div>

                <div className="landing__accuracy-gauges">
                  {adjusted !== null && (
                    <Gauge
                      value={adjusted}
                      max={1}
                      tone="var(--series-3)"
                      caption={adjusted.toFixed(4)}
                      label="adjusted moving average"
                    />
                  )}
                  {naive !== null && (
                    <Gauge
                      value={naive}
                      max={1}
                      tone="var(--series-4)"
                      caption={naive.toFixed(4)}
                      label="seasonal naive"
                    />
                  )}
                </div>
              </div>

              {comparison.length > 0 && (
                <>
                  <div className="landing__divider" />
                  <div style={{ padding: 'var(--s-6) 0' }}>
                    <CompareBars
                      rows={comparison}
                      leftLabel="adjusted MA"
                      rightLabel="seasonal naive"
                      leftTone="var(--series-3)"
                      rightTone="var(--series-4)"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="landing__grid-3" style={{ marginTop: 'var(--s-10)' }}>
              <article className="landing__feature">
                <h3 className="landing__feature-title">Risk is derived, not guessed</h3>
                <p className="landing__feature-body">
                  A district/group is flagged high-risk when the units on hand cannot cover
                  the predicted draw. The threshold is stock &lt; forecast, published in the
                  code rather than tuned to look good.
                </p>
              </article>
              <article className="landing__feature">
                <h3 className="landing__feature-title">A baseline you can argue with</h3>
                <p className="landing__feature-body">
                  An explainable weekday-adjusted moving average was chosen deliberately over
                  a black box. The next model has to beat this score on the same split before
                  it ships.
                </p>
              </article>
              <article className="landing__feature">
                <h3 className="landing__feature-title">Trained on real logging</h3>
                <p className="landing__feature-body">
                  The training data is the hospital's own daily consumption log, entered in
                  the blood-bank console. No forecast exists until the data does.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Network                                                          */}
        {/* ---------------------------------------------------------------- */}
        <section className="landing__section" id="network">
          <div className="shell-wide">
            <div className="landing__section-head">
              <p className="eyebrow">03 — Three consoles</p>
              <h2>One request, traced through every hand it passes.</h2>
              <p className="lede">
                Each role sees only what it should. A donor never sees another donor. A blood
                bank sees only its own requests. The platform admin sees the network.
              </p>
            </div>

            <div className="landing__grid-3">
              <article className="landing__feature">
                <Drop size={20} />
                <h3 className="landing__feature-title">Donor</h3>
                <p className="landing__feature-body">
                  An eligibility countdown that reflects the real 120-day rule, alerts you can
                  accept or decline, and a barcode trail of every bag you have given.
                </p>
                <ul className="landing__feature-list">
                  <li>Accept or decline a match</li>
                  <li>Eligibility countdown</li>
                  <li>Bag-level donation history</li>
                  <li>DigiLocker attestation</li>
                </ul>
              </article>

              <article className="landing__feature">
                <Layers size={20} />
                <h3 className="landing__feature-title">Blood bank</h3>
                <p className="landing__feature-body">
                  Raise a request and watch the match board fill. Adjust cold storage, log the
                  day's consumption, and register the unit physically collected.
                </p>
                <ul className="landing__feature-list">
                  <li>Raise and track requests</li>
                  <li>Live match board with distances</li>
                  <li>Cold-storage inventory</li>
                  <li>Collect a donation, generate a bag code</li>
                </ul>
              </article>

              <article className="landing__feature">
                <Shield size={20} />
                <h3 className="landing__feature-title">Platform admin</h3>
                <p className="landing__feature-body">
                  The seven-day forecast, both backtest scores, the headline metrics and the
                  audit trail — plus a manual escalation sweep you can trigger on demand.
                </p>
                <ul className="landing__feature-list">
                  <li>Shortage forecast by group</li>
                  <li>Backtest comparison</li>
                  <li>Impact metrics</li>
                  <li>Audit trail</li>
                </ul>
              </article>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* API                                                              */}
        {/* ---------------------------------------------------------------- */}
        <section className="landing__section" id="api">
          <div className="shell-wide">
            <div className="landing__section-head">
              <p className="eyebrow">04 — The API</p>
              <h2>This page is a client. So is every console.</h2>
              <p className="lede">
                Nothing on this site is server-rendered or mocked. Every figure, badge and
                chart is the response of a documented FastAPI endpoint, authorised with a JWT
                that carries the caller's role.
              </p>
            </div>

            <Panel eyebrow="Public endpoints backing this page" title="Read the same data">
              <div className="data-table">
                {[
                  ['GET', '/api/meta/spec', 'Escalation ladder, cooldown and forecast horizon'],
                  ['GET', '/api/meta/pulse', 'Aggregate donor, hospital and request counts'],
                  ['GET', '/api/meta/accuracy', 'Both backtest scores, computed on request'],
                  ['POST', '/api/auth/login', 'Exchange credentials for a bearer token'],
                  ['GET', '/docs', 'Interactive OpenAPI documentation'],
                ].map(([method, path, note]) => (
                  <div className="data-table__row" key={path}>
                    <div className="data-table__cell">
                      <Badge tone={method === 'GET' ? 'cool' : 'accent'}>{method}</Badge>
                      <span className="mono">{path}</span>
                    </div>
                    <div className="data-table__cell data-table__sub">{note}</div>
                    <div className="data-table__cell data-table__cell--right">
                      {spec.data && path.includes('spec') ? (
                        <Badge tone="ok">live</Badge>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* CTA + footer                                                     */}
        {/* ---------------------------------------------------------------- */}
        <section className="landing__section">
          <div className="shell-wide">
            <div className="landing__cta">
              <p className="eyebrow">Try it</p>
              <h2 style={{ maxWidth: '24ch' }}>
                Sign in to whichever console fits.
              </h2>
              <p className="lede" style={{ textAlign: 'center' }}>
                The demo database is seeded with two blood banks, sixty donors across
                Coimbatore and 120 days of consumption history — so the forecaster has
                something real to forecast from.
              </p>
              <div className="landing__actions" style={{ justifyContent: 'center' }}>
                <Link className="btn btn--primary btn--lg" to="/login">
                  <span>Sign in</span>
                  <ArrowRight size={16} />
                </Link>
                <Link className="btn btn--outline btn--lg" to="/register">
                  <span>Create a donor account</span>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter version={spec.data?.version} />
    </div>
  )
}

function PulseStat({
  value,
  label,
  tone,
}: {
  value: string
  label: string
  tone?: 'accent'
}) {
  return (
    <div className="landing__pulse-stat">
      <span
        className="landing__pulse-value"
        style={tone === 'accent' ? { color: 'var(--accent-bright)' } : undefined}
      >
        {value}
      </span>
      <span className="landing__pulse-label">{label}</span>
    </div>
  )
}
