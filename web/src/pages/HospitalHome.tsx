import { Link } from 'react-router-dom'

import { api } from '../api/client'
import type { HospitalOut, InventoryItem, RequestOut } from '../api/types'
import { ConsoleFrame } from '../components/AppShell'
import { Sparkline } from '../components/charts'
import { ArrowRight, Building, Clock, Pin } from '../components/Icons'
import { ErrorState, LoadingState, RefreshingBar } from '../components/States'
import { Badge, EmptyState, Meter, Panel, Stat } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { useLiveClock } from '../hooks/useLiveClock'
import { minutesSince, timeAgo } from '../lib/format'

export const HOSPITAL_NAV = [
  { to: '/hospital', label: 'Overview', end: true },
  { to: '/hospital/requests', label: 'Requests' },
  { to: '/hospital/inventory', label: 'Cold storage' },
  { to: '/hospital/actions', label: 'Log activity' },
]

const URGENCY_TONE = {
  NORMAL: 'neutral',
  URGENT: 'warn',
  EMERGENCY: 'danger',
} as const

const STATUS_TONE = {
  OPEN: 'accent',
  MATCHED: 'cool',
  FULFILLED: 'ok',
  EXPIRED: 'neutral',
  CANCELLED: 'neutral',
} as const

export function RequestRow({ request, now }: { request: RequestOut; now: Date }) {
  const age = minutesSince(request.created_at, now)
  const fill = request.units_needed
    ? request.units_fulfilled / request.units_needed
    : 0

  return (
    <div className="data-table__row">
      <div className="data-table__cell">
        <div className="data-table__meta">
          <span>
            #{request.id} · <span className="mono">{request.blood_group}</span>
          </span>
          <span className="data-table__sub">
            {request.units_fulfilled}/{request.units_needed} units · tier{' '}
            {request.escalation_tier} · {request.radius_km} km
          </span>
        </div>
      </div>

      <div className="data-table__cell">
        <div className="data-table__meta" style={{ width: '100%' }}>
          <span className="data-table__sub">fulfilment</span>
          <Meter
            value={request.units_fulfilled}
            max={request.units_needed}
            tone={fill >= 1 ? 'ok' : 'accent'}
            label="Fulfilment"
          />
        </div>
      </div>

      <div className="data-table__cell">
        <div className="data-table__meta">
          <span>{age} min old</span>
          <span className="data-table__sub">{timeAgo(request.created_at, now)}</span>
        </div>
      </div>

      <div className="data-table__cell data-table__cell--center">
        <Badge tone={URGENCY_TONE[request.urgency]}>{request.urgency.toLowerCase()}</Badge>
      </div>

      <div className="data-table__cell data-table__cell--right">
        <Badge tone={STATUS_TONE[request.status]} dot>
          {request.status.toLowerCase()}
        </Badge>
      </div>
    </div>
  )
}

export default function HospitalHome() {
  const hospital = useApi<HospitalOut>(() => api.hospital(), [])
  const requests = useApi<RequestOut[]>(() => api.requests(), [])
  const inventory = useApi<InventoryItem[]>(() => api.inventory(), [])
  const now = useLiveClock()

  const list = requests.data ?? []
  const open = list.filter((r) => r.status === 'OPEN' || r.status === 'MATCHED')
  const stock = inventory.data ?? []
  const totalUnits = stock.reduce((total, item) => total + item.units_in_stock, 0)
  const critical = stock.filter((item) => item.units_in_stock <= 2)

  return (
    <ConsoleFrame section="Blood bank console" nav={HOSPITAL_NAV}>
      <div className="console-grid">
        <div className="console-grid__main">
          <Panel
            eyebrow="Active requests"
            title={open.length > 0 ? `${open.length} live` : 'Nothing outstanding'}
            action={
              <Link className="btn btn--primary btn--sm" to="/hospital/requests">
                <span>Raise a request</span>
                <ArrowRight size={15} />
              </Link>
            }
            bleed
          >
            {requests.loading && <LoadingState label="Reading your requests" />}

            {requests.error && (
              <div style={{ padding: 'var(--s-6)' }}>
                <ErrorState message={requests.error} onRetry={() => void requests.reload()} />
              </div>
            )}

            {requests.data && list.length === 0 && (
              <EmptyState
                title="No requests yet"
                body="Raise a request and the matching engine immediately notifies every eligible donor inside the first radius tier."
                action={
                  <Link className="btn btn--primary btn--sm" to="/hospital/requests">
                    <span>Raise the first request</span>
                  </Link>
                }
              />
            )}

            {list.length > 0 && (
              <>
                <div className="data-table__row data-table__row--head">
                  <div className="data-table__cell">Request</div>
                  <div className="data-table__cell">Progress</div>
                  <div className="data-table__cell">Age</div>
                  <div className="data-table__cell data-table__cell--center">Urgency</div>
                  <div className="data-table__cell data-table__cell--right">Status</div>
                </div>
                <div className="data-table">
                  {list.slice(0, 5).map((request) => (
                    <RequestRow
                      key={request.id}
                      request={request}
                      now={now}
                    />
                  ))}
                </div>
              </>
            )}
          </Panel>

          <Panel
            eyebrow="Cold storage"
            title={`${totalUnits} units on the shelf`}
            action={<RefreshingBar visible={inventory.refreshing} />}
          >
            {inventory.loading && <LoadingState label="Counting stock" rows={2} />}

            {inventory.error && (
              <ErrorState message={inventory.error} onRetry={() => void inventory.reload()} />
            )}

            {stock.length > 0 && (
              <>
                <div className="inventory-grid">
                  {stock.map((item) => (
                    <div className="inventory-card" key={item.blood_group}>
                      <div className="inventory-card__top">
                        <span className="inventory-card__group">{item.blood_group}</span>
                        <span
                          className="inventory-card__units"
                          style={{
                            color:
                              item.units_in_stock <= 2 ? 'var(--warn)' : 'var(--ink-primary)',
                          }}
                        >
                          {item.units_in_stock}
                        </span>
                      </div>
                      <Meter
                        value={item.units_in_stock}
                        max={Math.max(...stock.map((s) => s.units_in_stock), 1)}
                        tone={item.units_in_stock <= 2 ? 'warn' : 'cool'}
                        label={`${item.blood_group} stock`}
                      />
                    </div>
                  ))}
                </div>

                {critical.length > 0 && (
                  <p className="inline-notice inline-notice--warn">
                    {critical.length} group{critical.length === 1 ? '' : 's'} at or below 2
                    units: <span className="mono">{critical.map((c) => c.blood_group).join(', ')}</span>
                  </p>
                )}
              </>
            )}

            {inventory.data && stock.length === 0 && (
              <EmptyState
                title="No inventory rows"
                body="Set the stock level for each blood group in cold storage."
                action={
                  <Link className="btn btn--outline btn--sm" to="/hospital/inventory">
                    <span>Open cold storage</span>
                  </Link>
                }
              />
            )}
          </Panel>
        </div>

        <aside className="console-grid__side">
          <Panel eyebrow="Facility" title={hospital.data?.name ?? 'Blood bank'}>
            {hospital.loading && <LoadingState label="Loading facility" rows={2} />}
            {hospital.error && (
              <ErrorState message={hospital.error} onRetry={() => void hospital.reload()} compact />
            )}
            {hospital.data && (
              <div className="flow">
                <div className="tag-row">
                  <Badge tone={hospital.data.verified ? 'ok' : 'warn'} dot>
                    {hospital.data.verified ? 'licence verified' : 'pending review'}
                  </Badge>
                  <Badge tone="cool">
                    <Pin size={11} />
                    {hospital.data.district}
                  </Badge>
                </div>

                <div className="list-stack">
                  <div className="list-stack__item" style={{ padding: 'var(--s-3) 0' }}>
                    <span className="list-stack__meta">
                      <Building size={14} /> Licence
                    </span>
                    <span className="mono" style={{ fontSize: 'var(--text-xs)' }}>
                      {hospital.data.license_no}
                    </span>
                  </div>
                  <div className="list-stack__item" style={{ padding: 'var(--s-3) 0' }}>
                    <span className="list-stack__meta">
                      <Pin size={14} /> Coordinates
                    </span>
                    <span className="mono" style={{ fontSize: 'var(--text-xs)' }}>
                      {hospital.data.latitude.toFixed(4)},{' '}
                      {hospital.data.longitude.toFixed(4)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </Panel>

          <Panel eyebrow="At a glance">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-5)' }}>
              <Stat value={open.length} label="open requests" />
              <Stat value={totalUnits} label="units in cold storage" />
              <Stat
                value={list.filter((r) => r.status === 'FULFILLED').length}
                label="fulfilled all-time"
              />
            </div>
          </Panel>

          <Panel eyebrow="Throughput" title="Units fulfilled per request">
            {list.length > 1 ? (
              <>
                <Sparkline
                  values={[...list].reverse().map((r) => r.units_fulfilled)}
                  width={240}
                  height={44}
                  tone="var(--series-1)"
                />
                <p className="dim" style={{ fontSize: 'var(--text-xs)' }}>
                  Oldest to newest request, one point per request.
                </p>
              </>
            ) : (
              <p className="dim" style={{ fontSize: 'var(--text-xs)' }}>
                Needs at least two requests before a trend is meaningful.
              </p>
            )}
            <div style={{ marginTop: 'var(--s-4)' }}>
              <Link className="btn btn--ghost btn--sm" to="/hospital/actions">
                <span>Log consumption</span>
                <Clock size={14} />
              </Link>
            </div>
          </Panel>
        </aside>
      </div>
    </ConsoleFrame>
  )
}

export { URGENCY_TONE, STATUS_TONE }
