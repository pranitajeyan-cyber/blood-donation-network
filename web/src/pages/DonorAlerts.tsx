import { useState } from 'react'

import { api } from '../api/client'
import type { MatchOut } from '../api/types'
import { ConsoleFrame } from '../components/AppShell'
import { Check, X } from '../components/Icons'
import { ErrorState, InlineNotice, LoadingState, RefreshingBar } from '../components/States'
import { Badge, Button, EmptyState, Panel } from '../components/ui'
import { useApi, useMutation } from '../hooks/useApi'
import { useLiveClock } from '../hooks/useLiveClock'
import { timeAgo } from '../lib/format'
import { DONOR_NAV } from './DonorHome'

type Filter = 'open' | 'all'

export default function DonorAlerts() {
  const matches = useApi<MatchOut[]>(() => api.myMatches(), [])
  const [filter, setFilter] = useState<Filter>('open')
  const [notice, setNotice] = useState<string | null>(null)
  const now = useLiveClock()

  const accept = useMutation((id: number) => api.acceptMatch(id))
  const decline = useMutation((id: number) => api.declineMatch(id))

  const all = matches.data ?? []
  const open = all.filter((match) => match.status === 'NOTIFIED')
  const shown = filter === 'open' ? open : all

  async function respond(id: number, action: 'accept' | 'decline') {
    setNotice(null)
    const result =
      action === 'accept' ? await accept.mutate(id) : await decline.mutate(id)
    if (result) {
      setNotice(result.message)
      await matches.reload()
    }
  }

  return (
    <ConsoleFrame section="Donor console" nav={DONOR_NAV}>
      <div className="console-grid console-grid--full">
        <div className="console-grid__main">
          <Panel
            eyebrow="Alert inbox"
            title={`${open.length} awaiting your response`}
            action={
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)' }}>
                <RefreshingBar visible={matches.refreshing} />
                <div className="segmented" role="tablist" aria-label="Filter matches">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={filter === 'open'}
                    className={`segmented__item ${filter === 'open' ? 'is-active' : ''}`}
                    onClick={() => setFilter('open')}
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={filter === 'all'}
                    className={`segmented__item ${filter === 'all' ? 'is-active' : ''}`}
                    onClick={() => setFilter('all')}
                  >
                    All
                  </button>
                </div>
              </div>
            }
            bleed
          >
            {notice && (
              <div style={{ padding: 'var(--s-4) var(--s-7) 0' }}>
                <InlineNotice tone="ok">{notice}</InlineNotice>
              </div>
            )}

            {(accept.error || decline.error) && (
              <div style={{ padding: 'var(--s-4) var(--s-7) 0' }}>
                <ErrorState message={(accept.error ?? decline.error) as string} compact />
              </div>
            )}

            {matches.loading && <LoadingState label="Reading your alerts" />}

            {matches.error && (
              <div style={{ padding: 'var(--s-6)' }}>
                <ErrorState message={matches.error} onRetry={() => void matches.reload()} />
              </div>
            )}

            {matches.data && shown.length === 0 && (
              <EmptyState
                title={filter === 'open' ? 'Nothing needs an answer' : 'No alerts yet'}
                body={
                  filter === 'open'
                    ? 'Every alert sent to you has been answered. You will be notified again when a new request matches.'
                    : 'When a hospital raises a request that matches your blood group, distance and eligibility, it will land here.'
                }
                action={
                  filter === 'all' ? undefined : (
                    <Button size="sm" variant="ghost" onClick={() => setFilter('all')}>
                      Show full history
                    </Button>
                  )
                }
              />
            )}

            {matches.data && shown.length > 0 && (
              <div className="list-stack">
                {shown.map((match) => {
                  const isOpen = match.status === 'NOTIFIED'
                  const pendingThis =
                    (accept.pending || decline.pending) && false

                  return (
                    <article className="list-stack__item" key={match.id}>
                      <div className="list-stack__body">
                        <p className="list-stack__title">
                          Request #{match.request_id}
                          <span
                            style={{
                              marginLeft: 'var(--s-3)',
                              color: 'var(--ink-tertiary)',
                              fontFamily: 'var(--font-mono)',
                              fontSize: 'var(--text-xs)',
                            }}
                          >
                            {match.blood_group}
                          </span>
                        </p>
                        <p className="list-stack__meta">
                          <span className="mono">{match.distance_km.toFixed(1)} km away</span>
                          <span className="list-stack__sep">/</span>
                          <span>notified {timeAgo(match.notified_at, now)}</span>
                          {match.responded_at && (
                            <>
                              <span className="list-stack__sep">/</span>
                              <span>
                                answered {timeAgo(match.responded_at, now)}
                              </span>
                            </>
                          )}
                        </p>
                      </div>

                      <div className="list-stack__actions">
                        {isOpen ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<X size={15} />}
                              busy={decline.pending}
                              disabled={pendingThis}
                              onClick={() => void respond(match.id, 'decline')}
                            >
                              Decline
                            </Button>
                            <Button
                              size="sm"
                              variant="primary"
                              icon={<Check size={15} />}
                              busy={accept.pending}
                              disabled={pendingThis}
                              onClick={() => void respond(match.id, 'accept')}
                            >
                              Accept
                            </Button>
                          </>
                        ) : (
                          <Badge
                            tone={
                              match.status === 'CONFIRMED'
                                ? 'accent'
                                : match.status === 'ACCEPTED'
                                  ? 'ok'
                                  : 'neutral'
                            }
                          >
                            {match.status.toLowerCase()}
                          </Badge>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </ConsoleFrame>
  )
}
