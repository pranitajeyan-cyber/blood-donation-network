import { useState } from 'react'

import { api } from '../api/client'
import type {
  AuditEntry,
  BacktestOut,
  ForecastPoint,
  MetricsOut,
  PlatformPulse,
  PlatformSpec,
} from '../api/types'
import { ConsoleFrame } from '../components/AppShell'
import { AreaChart, CompareBars, Funnel, Gauge } from '../components/charts'
import { Refresh, Pulse, Shield, Clock } from '../components/Icons'
import { ErrorState, InlineNotice, LoadingState, RefreshingBar } from '../components/States'
import { Badge, Button, EmptyState, Field, Panel, Segmented, Select, Stat } from '../components/ui'
import { useApi, useMutation } from '../hooks/useApi'
import { useLiveClock } from '../hooks/useLiveClock'
import { fmtNum, formatDate, formatTime, pct, timeAgo } from '../lib/format'

const ADMIN_NAV = [{ to: '/admin', label: 'Platform', end: true }]

const RISK_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'neutral'> = {
  LOW: 'ok',
  MODERATE: 'warn',
  WARN: 'warn',
  HIGH: 'danger',
  CRITICAL: 'danger',
  UNKNOWN: 'neutral',
}

export default function AdminConsole() {
  const now = useLiveClock(20000)

  const metrics = useApi<MetricsOut>(() => api.metrics(), [])
  const spec = useApi<PlatformSpec>(() => api.spec(), [])
  const pulse = useApi<PlatformPulse>(() => api.pulse(), [])
  const audit = useApi<AuditEntry[]>(() => api.audit(40), [])

  const [horizon, setHorizon] = useState<'7' | '14'>('7')
  const forecast = useApi<ForecastPoint[]>(() => api.forecast(Number(horizon)), [horizon])

  const [model, setModel] = useState<'adjusted_ma' | 'seasonal_naive'>('adjusted_ma')
  const mine = useApi<BacktestOut[]>(() => api.backtest('adjusted_ma', 7), [])
  const other = useApi<BacktestOut[]>(() => api.backtest('seasonal_naive', 7), [])
  const selected = model === 'adjusted_ma' ? mine : other

  const sweep = useMutation(() => api.runEscalation())
  const [sweepSummary, setSweepSummary] = useState<string | null>(null)

  async function runSweep() {
    setSweepSummary(null)
    const outcomes = await sweep.mutate()
    if (!outcomes) return
    const escalated = outcomes.filter((o) => o.current_tier > o.previous_tier).length
    const caregivers = outcomes.filter((o) => o.caregiver_alerted).length
    const expired = outcomes.filter((o) => o.expired).length
    const notified = outcomes.reduce((sum, o) => sum + o.donors_notified, 0)
    setSweepSummary(
      `Swept ${outcomes.length} open request${outcomes.length === 1 ? '' : 's'}: ${escalated} escalated, ${notified} donor${notified === 1 ? '' : 's'} newly notified, ${caregivers} caregiver blast${caregivers === 1 ? '' : 's'}, ${expired} expired.`,
    )
  }

  /* --- derived, all from live responses --------------------------------- */

  const funnelSteps = metrics.data
    ? [
        { label: 'Matches created', value: metrics.data.matches_created, tone: 'var(--series-2)' },
        { label: 'Matches accepted', value: metrics.data.matches_accepted, tone: 'var(--series-1)' },
        { label: 'Units fulfilled', value: metrics.data.units_fulfilled, tone: 'var(--ok)' },
      ]
    : []

  const acceptRate =
    metrics.data && metrics.data.matches_created > 0
      ? metrics.data.matches_accepted / metrics.data.matches_created
      : null

  // Forecast rows for the selected model, grouped by blood group and averaged
  // over the horizon so the chart shows one line, not eight.
  const forecastByGroup = new Map<string, { total: number; count: number; stock: number }>()
  for (const point of forecast.data ?? []) {
    const entry =
      forecastByGroup.get(point.blood_group) ?? { total: 0, count: 0, stock: 0 }
    entry.total += point.predicted_units
    entry.count += 1
    entry.stock = point.stock_units
    forecastByGroup.set(point.blood_group, entry)
  }

  const riskCounts = (forecast.data ?? []).reduce<Record<string, number>>((acc, point) => {
    acc[point.risk] = (acc[point.risk] ?? 0) + 1
    return acc
  }, {})

  const highRisk = (forecast.data ?? [])
    .filter((point) => RISK_TONE[point.risk] === 'danger' || RISK_TONE[point.risk] === 'warn')
    .sort((a, b) => b.predicted_units - a.predicted_units)

  const compareRows = (mine.data ?? [])
    .map((row) => {
      const counterpart = (other.data ?? []).find(
        (o) => o.blood_group === row.blood_group && o.district === row.district,
      )
      if (!counterpart) return null
      return {
        key: String(row.blood_group),
        left: row.wmape,
        right: counterpart.wmape,
      }
    })
    .filter((row): row is { key: string; left: number; right: number } => row !== null)
    .slice(0, 8)

  const meanWmape = (rows: BacktestOut[] | null) =>
    rows && rows.length > 0
      ? rows.reduce((sum, row) => sum + row.wmape, 0) / rows.length
      : null

  const mineMean = meanWmape(mine.data)
  const otherMean = meanWmape(other.data)

  return (
    <ConsoleFrame section="Platform admin" nav={ADMIN_NAV}>
      <div className="console-grid console-grid--full">
        <div className="console-grid__main">
          {/* KPI row -------------------------------------------------- */}
          <section className="kpi-row" aria-label="Headline metrics">
            <Kpi
              label="Open requests"
              value={metrics.data ? fmtNum(metrics.data.open_requests) : '—'}
              note="live, across every blood bank"
              loading={metrics.loading}
            />
            <Kpi
              label="Median match → donation"
              value={
                metrics.data?.median_match_to_donation_minutes !== null &&
                metrics.data?.median_match_to_donation_minutes !== undefined
                  ? fmtNum(metrics.data.median_match_to_donation_minutes)
                  : '—'
              }
              unit="min"
              note="time from notifying a donor to a registered unit"
              loading={metrics.loading}
            />
            <Kpi
              label="Units fulfilled"
              value={metrics.data ? fmtNum(metrics.data.units_fulfilled) : '—'}
              note="summed across all requests"
              loading={metrics.loading}
            />
            <Kpi
              label="Donor repeat rate"
              value={metrics.data ? pct(metrics.data.donor_repeat_rate) : '—'}
              note="donors who gave more than once"
              loading={metrics.loading}
            />
          </section>

          {metrics.error && (
            <ErrorState message={metrics.error} onRetry={() => void metrics.reload()} />
          )}

          {/* Forecast ------------------------------------------------- */}
          <Panel
            eyebrow="Shortage forecast"
            title="Where the shelf runs out before the fridge does"
            action={
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)' }}>
                <RefreshingBar visible={forecast.refreshing} />
                <Segmented
                  label="Forecast horizon"
                  value={horizon}
                  onChange={setHorizon}
                  options={[
                    { value: '7', label: '7 days' },
                    { value: '14', label: '14 days' },
                  ]}
                />
              </div>
            }
          >
            {forecast.loading && <LoadingState label="Running the forecast" rows={3} />}

            {forecast.error && (
              <ErrorState message={forecast.error} onRetry={() => void forecast.reload()} />
            )}

            {forecast.data && forecast.data.length === 0 && (
              <EmptyState
                title="No forecast available"
                body="The forecaster needs at least a few days of consumption history per blood group before it will project anything. Log consumption from a blood-bank console first."
                action={
                  <Button size="sm" variant="ghost" onClick={() => void forecast.reload()}>
                    Run again
                  </Button>
                }
              />
            )}

            {forecast.data && forecast.data.length > 0 && (
              <>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 'var(--s-3)',
                    alignItems: 'center',
                  }}
                >
                  {Object.entries(riskCounts).map(([risk, count]) => (
                    <Badge key={risk} tone={RISK_TONE[risk] ?? 'neutral'}>
                      {count} {risk.toLowerCase()}
                    </Badge>
                  ))}
                  <span className="dim" style={{ fontSize: 'var(--text-xs)' }}>
                    derived from the API's own risk classification, not recalculated here
                  </span>
                </div>

                <AreaChart
                  height={240}
                  unit=" units"
                  tone="var(--series-1)"
                  points={Array.from(forecastByGroup.entries())
                    .map(([group, entry]) => ({
                      label: group,
                      value: entry.count > 0 ? entry.total : 0,
                    }))
                    .sort((a, b) => b.value - a.value)}
                />

                <p className="dim" style={{ fontSize: 'var(--text-xs)' }}>
                  Total predicted draw per blood group across the full{' '}
                  <span className="mono">{horizon}-day</span> horizon, summed across districts
                  and all <span className="mono">{forecast.data.length}</span> forecast rows
                  returned by the API.
                </p>

                {highRisk.length > 0 && (
                  <>
                    <div className="hairline" />
                    <div className="data-table">
                      <div className="data-table__row data-table__row--head">
                        <div className="data-table__cell">Group · district</div>
                        <div className="data-table__cell">Date</div>
                        <div className="data-table__cell">Predicted</div>
                        <div className="data-table__cell">On shelf</div>
                        <div className="data-table__cell data-table__cell--right">Risk</div>
                      </div>
                      {highRisk.slice(0, 8).map((point) => (
                        <div
                          className="data-table__row"
                          key={`${point.blood_group}-${point.district}-${point.forecast_date}`}
                        >
                          <div className="data-table__cell">
                            <div className="data-table__meta">
                              <span className="mono">{point.blood_group}</span>
                              <span className="data-table__sub">{point.district}</span>
                            </div>
                          </div>
                          <div className="data-table__cell">{formatDate(point.forecast_date)}</div>
                          <div className="data-table__cell mono">
                            {point.predicted_units.toFixed(1)}
                          </div>
                          <div className="data-table__cell mono">{point.stock_units}</div>
                          <div className="data-table__cell data-table__cell--right">
                            <Badge tone={RISK_TONE[point.risk] ?? 'neutral'}>
                              {point.risk.toLowerCase()}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </Panel>

          {/* Backtest ------------------------------------------------- */}
          <Panel
            eyebrow="Backtest"
            title="Which model actually wins on held-out history"
            action={
              <Segmented
                label="Model under inspection"
                value={model}
                onChange={setModel}
                options={[
                  { value: 'adjusted_ma', label: 'adjusted MA' },
                  { value: 'seasonal_naive', label: 'seasonal naive' },
                ]}
              />
            }
          >
            {(mine.loading || other.loading) && <LoadingState label="Re-running the backtest" rows={3} />}

            {(mine.error || other.error) && (
              <ErrorState
                message={(mine.error ?? other.error) as string}
                onRetry={() => {
                  void mine.reload()
                  void other.reload()
                }}
              />
            )}

            {compareRows.length > 0 && (
              <>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 'var(--s-6)',
                    alignItems: 'center',
                  }}
                >
                  {mineMean !== null && (
                    <Gauge
                      value={mineMean}
                      max={1}
                      tone="var(--series-3)"
                      caption={mineMean.toFixed(4)}
                      label="adjusted MA · mean WMAPE"
                    />
                  )}
                  {otherMean !== null && (
                    <Gauge
                      value={otherMean}
                      max={1}
                      tone="var(--series-4)"
                      caption={otherMean.toFixed(4)}
                      label="seasonal naive · mean WMAPE"
                    />
                  )}
                </div>

                <CompareBars
                  rows={compareRows}
                  leftLabel="adjusted MA"
                  rightLabel="seasonal naive"
                  leftTone="var(--series-3)"
                  rightTone="var(--series-4)"
                />

                <p className="dim" style={{ fontSize: 'var(--text-xs)' }}>
                  WMAPE per blood group on the same train/test split, lower is better. Sorted
                  by whichever model currently leads. Source:{' '}
                  <span className="mono">GET /api/admin/backtest</span>.
                </p>
              </>
            )}

            {!mine.loading && !other.loading && compareRows.length === 0 && !mine.error && (
              <EmptyState
                title="Not enough history to backtest"
                body="Each series needs more than eight days of consumption before it can be split into train and test windows."
              />
            )}

            {selected.data && (
              <>
                <div className="hairline" />
                <div className="data-table">
                  <div className="data-table__row data-table__row--head">
                    <div className="data-table__cell">Group · district</div>
                    <div className="data-table__cell">WMAPE</div>
                    <div className="data-table__cell">MAE</div>
                    <div className="data-table__cell">Samples</div>
                    <div className="data-table__cell data-table__cell--right">Horizon</div>
                  </div>
                  {selected.data.map((row) => (
                    <div
                      className="data-table__row"
                      key={`${row.blood_group}-${row.district}`}
                    >
                      <div className="data-table__cell">
                        <div className="data-table__meta">
                          <span className="mono">{row.blood_group}</span>
                          <span className="data-table__sub">{row.district}</span>
                        </div>
                      </div>
                      <div className="data-table__cell mono">{row.wmape.toFixed(4)}</div>
                      <div className="data-table__cell mono">{row.mae.toFixed(3)}</div>
                      <div className="data-table__cell mono">{row.samples}</div>
                      <div className="data-table__cell data-table__cell--right mono">
                        {row.horizon}d
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Panel>

          {/* Funnel + network ---------------------------------------- */}
          <div className="panel-grid">
            <Panel eyebrow="Match funnel" title="From notified to collected">
              {metrics.loading && <LoadingState label="Reading metrics" rows={2} />}
              {metrics.error && (
                <ErrorState
                  message={metrics.error}
                  onRetry={() => void metrics.reload()}
                  compact
                />
              )}
              {funnelSteps.length > 0 && <Funnel steps={funnelSteps} />}
              {acceptRate !== null && (
                <p className="dim" style={{ fontSize: 'var(--text-xs)' }}>
                  <span className="mono">{(acceptRate * 100).toFixed(1)}%</span> of created
                  matches were accepted. A drop here is the honest cost of a wide radius.
                </p>
              )}
            </Panel>

            <Panel
              eyebrow="Escalation control"
              title="Run a sweep on demand"
              action={<RefreshingBar visible={sweep.pending} />}
            >
              <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                The scheduler runs this automatically. Triggering it by hand is safe — the
                engine is idempotent, so a request already at the tier its age warrants is
                left untouched.
              </p>

              {spec.data && (
                <p className="dim" style={{ fontSize: 'var(--text-xs)' }}>
                  Ladder in force:{' '}
                  <span className="mono">
                    {spec.data.escalation.tier_minutes.join(' / ')} min
                  </span>{' '}
                  → <span className="mono">{spec.data.escalation.radii_km.join(' / ')} km</span>,
                  caregiver blast at{' '}
                  <span className="mono">
                    {spec.data.escalation.caregiver_escalation_minutes} min
                  </span>
                  .
                </p>
              )}

              <Button
                variant="outline"
                size="md"
                busy={sweep.pending}
                icon={<Refresh size={15} />}
                onClick={() => void runSweep()}
              >
                Run escalation sweep
              </Button>

              {sweep.error && <InlineNotice tone="danger">{sweep.error}</InlineNotice>}
              {sweepSummary && <InlineNotice tone="ok">{sweepSummary}</InlineNotice>}
            </Panel>
          </div>
        </div>
      </div>

      {/* Second block: network posture + audit ---------------------- */}
      <div className="console-grid console-grid--full" style={{ marginTop: 'var(--s-5)' }}>
        <div className="console-grid__main">
          <div className="panel-grid">
            <Panel eyebrow="Network posture" title="What is actually in the database">
              {pulse.loading && <LoadingState label="Counting" rows={2} />}
              {pulse.error && (
                <ErrorState message={pulse.error} onRetry={() => void pulse.reload()} compact />
              )}
              {pulse.data && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 'var(--s-5)' }}>
                  <Stat value={fmtNum(pulse.data.donors_total)} label="donors registered" />
                  <Stat value={fmtNum(pulse.data.donors_verified)} label="identity verified" />
                  <Stat value={fmtNum(pulse.data.donors_available)} label="available today" />
                  <Stat value={fmtNum(pulse.data.hospitals)} label="blood banks" />
                  <Stat value={fmtNum(pulse.data.bags_tracked)} label="bags tracked" />
                  <Stat value={fmtNum(pulse.data.units_fulfilled)} label="units delivered" />
                </div>
              )}
            </Panel>

            <Panel eyebrow="Activity" title="Audit trail" bleed>
              {audit.loading && <LoadingState label="Reading the audit log" rows={3} />}
              {audit.error && (
                <div style={{ padding: 'var(--s-6)' }}>
                  <ErrorState message={audit.error} onRetry={() => void audit.reload()} />
                </div>
              )}
              {audit.data && audit.data.length === 0 && (
                <EmptyState
                  title="The audit log is empty"
                  body="Every privileged action writes a row here. Nothing has happened yet."
                  icon={<Shield size={18} />}
                />
              )}
              {audit.data && audit.data.length > 0 && (
                <div className="list-stack">
                  {audit.data.slice(0, 12).map((entry) => (
                    <div className="list-stack__item" key={entry.id}>
                      <div className="list-stack__body">
                        <p className="list-stack__title mono">{entry.action}</p>
                        <p className="list-stack__meta">
                          <span>{entry.entity}</span>
                          {entry.entity_id && (
                            <>
                              <span className="list-stack__sep">/</span>
                              <span className="mono">#{entry.entity_id}</span>
                            </>
                          )}
                          <span className="list-stack__sep">/</span>
                          <span>{timeAgo(entry.created_at, now)}</span>
                          <span className="list-stack__sep">/</span>
                          <span className="mono">
                            {formatTime(entry.created_at)}
                          </span>
                        </p>
                        {entry.detail && (
                          <p className="data-table__sub">{entry.detail}</p>
                        )}
                      </div>
                      <Badge tone={entry.actor_id === null ? 'neutral' : 'cool'}>
                        {entry.actor_id === null ? 'system' : `actor ${entry.actor_id}`}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          <Panel eyebrow="Reference" title="Scheduled behaviour">
            <div className="list-stack">
              <div className="list-stack__item" style={{ padding: 'var(--s-3) 0' }}>
                <span className="list-stack__meta">
                  <Clock size={14} /> Request time-to-live
                </span>
                <span className="mono" style={{ fontSize: 'var(--text-sm)' }}>
                  {spec.data ? `${spec.data.request_ttl_hours} h` : '—'}
                </span>
              </div>
              <div className="list-stack__item" style={{ padding: 'var(--s-3) 0' }}>
                <span className="list-stack__meta">
                  <Pulse size={14} /> Forecaster trained on
                </span>
                <span className="mono" style={{ fontSize: 'var(--text-sm)' }}>
                  {mine.data && mine.data.length > 0
                    ? `${mine.data.reduce((sum, row) => sum + row.samples, 0)} windows`
                    : '—'}
                </span>
              </div>
              <div className="list-stack__item" style={{ padding: 'var(--s-3) 0' }}>
                <span className="list-stack__meta">
                  <Shield size={14} /> Donor cooldown enforced
                </span>
                <span className="mono" style={{ fontSize: 'var(--text-sm)' }}>
                  {spec.data ? `${spec.data.donor_lock_days} days` : '—'}
                </span>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </ConsoleFrame>
  )
}

function Kpi({
  label,
  value,
  unit,
  note,
  loading,
}: {
  label: string
  value: string
  unit?: string
  note?: string
  loading?: boolean
}) {
  return (
    <div className="kpi-card">
      <div className="kpi-card__top">
        <span className="badge badge--neutral">{label}</span>
        {loading && <span className="refreshing__dot" aria-hidden="true" />}
      </div>
      <p className="kpi-card__value">
        {value}
        {unit && (
          <span
            style={{
              fontSize: 'var(--text-lg)',
              color: 'var(--ink-tertiary)',
              marginLeft: 'var(--s-2)',
            }}
          >
            {unit}
          </span>
        )}
      </p>
      {note && <p className="kpi-card__label">{note}</p>}
    </div>
  )
}

export { Field, Select }
