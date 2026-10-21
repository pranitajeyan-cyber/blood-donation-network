import { api } from '../api/client'
import type { BagOut, EligibilityOut } from '../api/types'
import { ConsoleFrame } from '../components/AppShell'
import { Funnel } from '../components/charts'
import { Drop } from '../components/Icons'
import { ErrorState, LoadingState, RefreshingBar } from '../components/States'
import { Badge, EmptyState, Panel, Stat } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { useAuth } from '../auth/AuthProvider'
import { formatDate, formatTime } from '../lib/format'
import { DONOR_NAV } from './DonorHome'

const BAG_TONE: Record<string, 'ok' | 'cool' | 'warn' | 'neutral' | 'accent'> = {
  COLLECTED: 'cool',
  RECEIVED: 'cool',
  TRANSFUSED: 'ok',
  DISCARDED: 'neutral',
}

export default function DonorHistory() {
  const { user } = useAuth()
  const bags = useApi<BagOut[]>(() => api.myBags(), [])
  const eligibility = useApi<EligibilityOut>(() => api.eligibility(), [])

  const list = bags.data ?? []
  const units = list.reduce((total, bag) => total + bag.units, 0)

  const statusCounts = ['COLLECTED', 'RECEIVED', 'TRANSFUSED', 'DISCARDED'].map((status) => ({
    label: status.toLowerCase(),
    value: list.filter((bag) => bag.status === status).length,
    tone:
      status === 'TRANSFUSED'
        ? 'var(--ok)'
        : status === 'DISCARDED'
          ? 'var(--ink-quaternary)'
          : 'var(--cool)',
  }))

  const hospitals = new Set(list.map((bag) => bag.hospital_name).filter(Boolean))

  return (
    <ConsoleFrame section="Donor console" nav={DONOR_NAV}>
      <div className="console-grid">
        <div className="console-grid__main">
          <Panel
            eyebrow="Barcode trail"
            title="Every unit you have given"
            action={<RefreshingBar visible={bags.refreshing} />}
            bleed
          >
            {bags.loading && <LoadingState label="Reading your bags" />}

            {bags.error && (
              <div style={{ padding: 'var(--s-6)' }}>
                <ErrorState message={bags.error} onRetry={() => void bags.reload()} />
              </div>
            )}

            {bags.data && list.length === 0 && (
              <EmptyState
                title="No donations recorded yet"
                body="A bag appears here the moment a blood bank logs the unit it collected from you."
                icon={<Drop size={18} />}
              />
            )}

            {list.length > 0 && (
              <div className="data-table">
                <div className="data-table__row data-table__row--head">
                  <div className="data-table__cell">Bag code</div>
                  <div className="data-table__cell">Group · units</div>
                  <div className="data-table__cell">Collected</div>
                  <div className="data-table__cell data-table__cell--center">Status</div>
                </div>

                {list.map((bag) => (
                  <div className="data-table__row" key={bag.id}>
                    <div className="data-table__cell">
                      <span className="mono">{bag.bag_code}</span>
                    </div>

                    <div className="data-table__cell">
                      <div className="data-table__meta">
                        <span className="mono">{bag.blood_group}</span>
                        <span className="data-table__sub">
                          {bag.units} unit{bag.units === 1 ? '' : 's'}
                        </span>
                      </div>
                    </div>

                    <div className="data-table__cell">
                      <div className="data-table__meta">
                        <span>{formatDate(bag.donated_at)}</span>
                        <span className="data-table__sub">{formatTime(bag.donated_at)}</span>
                      </div>
                    </div>

                    <div className="data-table__cell data-table__cell--center">
                      <Badge tone={BAG_TONE[bag.status] ?? 'neutral'}>
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
          <Panel eyebrow="Summary">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-5)' }}>
              <Stat value={list.length} label="bags registered" />
              <Stat value={units} label="units contributed" />
              <Stat
                value={hospitals.size || '—'}
                label="blood banks served"
              />
            </div>
          </Panel>

          {list.length > 0 && (
            <Panel eyebrow="Bag status" title="Where each unit ended up">
              <Funnel steps={statusCounts} />
              <p className="muted" style={{ fontSize: 'var(--text-xs)' }}>
                Status is maintained by the blood bank that holds the unit. A bag is only
                marked <span className="mono">transfused</span> when it reaches a patient.
              </p>
            </Panel>
          )}

          <Panel eyebrow="Cooldown">
            {eligibility.loading && <LoadingState label="Checking" rows={2} />}
            {eligibility.error && (
              <ErrorState
                message={eligibility.error}
                onRetry={() => void eligibility.reload()}
                compact
              />
            )}
            {eligibility.data && (
              <div className="flow">
                <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                  {eligibility.data.eligible
                    ? 'You are past the 120-day medical gap.'
                    : `You can donate again on ${formatDate(eligibility.data.eligible_again_at)}.`}
                </p>
                {user?.last_donation_at && (
                  <p className="dim" style={{ fontSize: 'var(--text-xs)' }}>
                    Last recorded donation {formatDate(user.last_donation_at)}.
                  </p>
                )}
              </div>
            )}
          </Panel>
        </aside>
      </div>
    </ConsoleFrame>
  )
}
