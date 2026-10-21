import { useState, type FormEvent } from 'react'

import { api } from '../api/client'
import type { BloodGroup, EscalationOutcome, MatchOut, PlatformSpec, RequestOut, Urgency } from '../api/types'
import { ConsoleFrame } from '../components/AppShell'
import { DistanceLadder, EscalationLadder } from '../components/Escalation'
import { Alert, Refresh, X } from '../components/Icons'
import { ErrorState, InlineNotice, LoadingState, RefreshingBar } from '../components/States'
import { Badge, Button, EmptyState, Field, Panel, Select, TextArea } from '../components/ui'
import { useApi, useMutation } from '../hooks/useApi'
import { useLiveClock } from '../hooks/useLiveClock'
import { minutesSince, timeAgo } from '../lib/format'
import { HOSPITAL_NAV, RequestRow } from './HospitalHome'

const BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
const URGENCIES: Urgency[] = ['NORMAL', 'URGENT', 'EMERGENCY']

const MATCH_TONE = {
  NOTIFIED: 'cool',
  ACCEPTED: 'ok',
  CONFIRMED: 'accent',
  DECLINED: 'neutral',
  EXPIRED: 'neutral',
} as const

export default function HospitalRequests() {
  const requests = useApi<RequestOut[]>(() => api.requests(), [])
  const spec = useApi<PlatformSpec>(() => api.spec(), [])
  const now = useLiveClock(10000)

  const [bloodGroup, setBloodGroup] = useState<BloodGroup>('O-')
  const [units, setUnits] = useState('1')
  const [urgency, setUrgency] = useState<Urgency>('NORMAL')
  const [notes, setNotes] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  const create = useMutation((body: Parameters<typeof api.createRequest>[0]) =>
    api.createRequest(body),
  )
  const escalate = useMutation((id: number) => api.escalateRequest(id))
  const cancel = useMutation((id: number) => api.cancelRequest(id))

  const list = requests.data ?? []

  // Which card is open. `null` means "no explicit choice yet", in which case we
  // fall back to the newest live request — the one the person at the desk is
  // almost always looking at. Derived during render rather than pushed into
  // state from an effect, so a refetch can never fight the user's click.
  const [chosen, setChosen] = useState<number | null>(null)
  const liveRequest = list.find((r) => r.status === 'OPEN' || r.status === 'MATCHED')
  const expanded = chosen ?? liveRequest?.id ?? null
  const setExpanded = setChosen

  async function submit(event: FormEvent) {
    event.preventDefault()
    setNotice(null)
    const result = await create.mutate({
      blood_group: bloodGroup,
      units_needed: Math.min(10, Math.max(1, Number(units) || 1)),
      urgency,
      notes: notes.trim() || null,
    })
    if (result) {
      setNotice(
        `Request #${result.id} is live. Donors within ${result.radius_km} km were notified immediately.`,
      )
      setNotes('')
      setUnits('1')
      setExpanded(result.id)
      await requests.reload()
    }
  }

  async function runEscalation(id: number) {
    setNotice(null)
    const outcome = await escalate.mutate(id)
    if (outcome) {
      setNotice(describeEscalation(outcome))
      await requests.reload()
    }
  }

  async function doCancel(id: number) {
    setNotice(null)
    const result = await cancel.mutate(id)
    if (result) {
      setNotice(`Request #${result.id} cancelled.`)
      await requests.reload()
    }
  }

  return (
    <ConsoleFrame section="Blood bank console" nav={HOSPITAL_NAV}>
      <div className="console-grid">
        <div className="console-grid__main">
          <Panel eyebrow="Raise a request" title="Notify every eligible donor, now">
            <form className="flow" onSubmit={submit}>
              {notice && <InlineNotice tone="ok">{notice}</InlineNotice>}
              {create.error && <InlineNotice tone="danger">{create.error}</InlineNotice>}

              <div className="grid-form">
                <div className="grid-form__field--4">
                  <Field
                    label="Blood group needed"
                    children={({ id }) => (
                      <Select
                        id={id}
                        value={bloodGroup}
                        onChange={(event) =>
                          setBloodGroup(event.target.value as BloodGroup)
                        }
                      >
                        {BLOOD_GROUPS.map((group) => (
                          <option key={group} value={group}>
                            {group}
                          </option>
                        ))}
                      </Select>
                    )}
                  />
                </div>

                <div className="grid-form__field--4">
                  <Field
                    label="Units needed"
                    hint="Between 1 and 10"
                    children={({ id }) => (
                      <Select
                        id={id}
                        value={units}
                        onChange={(event) => setUnits(event.target.value)}
                      >
                        {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
                          <option key={value} value={String(value)}>
                            {value}
                          </option>
                        ))}
                      </Select>
                    )}
                  />
                </div>

                <div className="grid-form__field--4">
                  <Field
                    label="Urgency"
                    children={({ id }) => (
                      <Select
                        id={id}
                        value={urgency}
                        onChange={(event) => setUrgency(event.target.value as Urgency)}
                      >
                        {URGENCIES.map((value) => (
                          <option key={value} value={value}>
                            {value.toLowerCase()}
                          </option>
                        ))}
                      </Select>
                    )}
                  />
                </div>

                <div className="grid-form__field--12">
                  <Field
                    label="Clinical note"
                    hint="Optional — visible to the platform admin only"
                    children={({ id }) => (
                      <TextArea
                        id={id}
                        value={notes}
                        maxLength={500}
                        placeholder="Post-operative requirement, theatre booked for tomorrow morning."
                        onChange={(event) => setNotes(event.target.value)}
                      />
                    )}
                  />
                </div>
              </div>

              {spec.data && (
                <p className="dim" style={{ fontSize: 'var(--text-xs)' }}>
                  Tier 0 alerts everyone within{' '}
                  <span className="mono">{spec.data.escalation.radii_km[0]} km</span> at once.
                  After <span className="mono">{spec.data.escalation.tier_minutes[1]} min</span>{' '}
                  the radius widens to{' '}
                  <span className="mono">{spec.data.escalation.radii_km[1]} km</span>, and at{' '}
                  <span className="mono">{spec.data.escalation.caregiver_escalation_minutes} min</span>{' '}
                  the caregiver blast fires. The request expires after{' '}
                  <span className="mono">{spec.data.request_ttl_hours} h</span>.
                </p>
              )}

              <Button type="submit" variant="primary" size="md" busy={create.pending}>
                Raise request and notify donors
              </Button>
            </form>
          </Panel>

          <Panel
            eyebrow="All requests"
            title={`${list.length} on record`}
            action={<RefreshingBar visible={requests.refreshing} />}
            bleed
          >
            {requests.loading && <LoadingState label="Reading requests" />}

            {requests.error && (
              <div style={{ padding: 'var(--s-6)' }}>
                <ErrorState message={requests.error} onRetry={() => void requests.reload()} />
              </div>
            )}

            {requests.data && list.length === 0 && (
              <EmptyState
                title="No requests on record"
                body="Raise one above and it appears here with its escalation state."
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
                  {list.map((request) => {
                    const isOpen = request.status === 'OPEN' || request.status === 'MATCHED'
                    return (
                      <div key={request.id}>
                        <button
                          type="button"
                          onClick={() =>
                            setExpanded(expanded === request.id ? null : request.id)
                          }
                          aria-expanded={expanded === request.id}
                          style={{ width: '100%', textAlign: 'left', display: 'block' }}
                        >
                          <RequestRow request={request} now={now} />
                        </button>

                        {expanded === request.id && (
                          <div style={{ padding: 'var(--s-5) var(--s-7)', background: 'var(--surface-inset)' }}>
                            <MatchBoard
                              request={request}
                              spec={spec.data}
                              now={now}
                            />

                            {isOpen && (
                              <div
                                style={{
                                  display: 'flex',
                                  flexWrap: 'wrap',
                                  gap: 'var(--s-2)',
                                  marginTop: 'var(--s-5)',
                                }}
                              >
                                <Button
                                  size="sm"
                                  variant="outline"
                                  icon={<Refresh size={14} />}
                                  busy={escalate.pending}
                                  onClick={() => void runEscalation(request.id)}
                                >
                                  Run escalation tick now
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  icon={<X size={14} />}
                                  busy={cancel.pending}
                                  onClick={() => void doCancel(request.id)}
                                >
                                  Cancel request
                                </Button>
                              </div>
                            )}

                            {(escalate.error || cancel.error) && (
                              <div style={{ marginTop: 'var(--s-3)' }}>
                                <ErrorState
                                  message={(escalate.error ?? cancel.error) as string}
                                  compact
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </Panel>
        </div>

        <aside className="console-grid__side">
          <Panel eyebrow="Operating rules" title="Escalation this request is under">
            {spec.loading && <LoadingState label="Reading the SLA" rows={3} />}
            {spec.error && (
              <ErrorState message={spec.error} onRetry={() => void spec.reload()} compact />
            )}
            {spec.data && (
              <>
                <EscalationLadder
                  spec={spec.data}
                  currentTier={
                    list.find((r) => r.id === expanded)?.escalation_tier
                  }
                  caregiverAlerted={
                    list.find((r) => r.id === expanded)?.caregiver_alerted
                  }
                  radiusKm={list.find((r) => r.id === expanded)?.radius_km}
                />
                <p className="dim" style={{ fontSize: 'var(--text-xs)', marginTop: 'var(--s-4)' }}>
                  Values read from the running API, not from this page.
                </p>
              </>
            )}
          </Panel>

          <Panel eyebrow="Why escalation exists">
            <div className="flow">
              <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                A single notification round reaches whoever happens to check their phone
                first. Widening the radius on a clock converts a request from a broadcast
                into a search.
              </p>
              <div
                style={{
                  display: 'flex',
                  gap: 'var(--s-2)',
                  alignItems: 'flex-start',
                  color: 'var(--warn)',
                }}
              >
                <Alert size={16} />
                <p style={{ fontSize: 'var(--text-xs)' }}>
                  The caregiver SMS fires once. The escalation engine is idempotent, so
                  repeated scheduler ticks cannot spam the same contact.
                </p>
              </div>
            </div>
          </Panel>
        </aside>
      </div>
    </ConsoleFrame>
  )
}

/* ------------------------------------------------------------------------ */

function MatchBoard({
  request,
  spec,
  now,
}: {
  request: RequestOut
  spec: PlatformSpec | null
  now: Date
}) {
  const matches = useApi<MatchOut[]>(() => api.requestMatches(request.id), [request.id])

  const counts = (matches.data ?? []).reduce<Record<string, number>>((acc, match) => {
    acc[match.status] = (acc[match.status] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="flow">
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--s-3)',
        }}
      >
        <div>
          <p className="eyebrow">Match board</p>
          <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
            {matches.data
              ? `${matches.data.length} donors notified · ${minutesSince(request.created_at, now)} min old`
              : 'Loading donors'}
          </p>
        </div>

        <div className="tag-row">
          {Object.entries(counts).map(([status, count]) => (
            <Badge key={status} tone={MATCH_TONE[status as MatchOut['status']] ?? 'neutral'}>
              {count} {status.toLowerCase()}
            </Badge>
          ))}
        </div>
      </div>

      {matches.loading && <LoadingState label="Reading matches" rows={2} />}

      {matches.error && (
        <ErrorState message={matches.error} onRetry={() => void matches.reload()} compact />
      )}

      {matches.data && matches.data.length === 0 && (
        <EmptyState
          title="No donors were in range"
          body="Nobody compatible and eligible was inside the current radius. Running an escalation tick widens the search."
        />
      )}

      {matches.data && matches.data.length > 0 && spec && (
        <>
          <DistanceLadder matches={matches.data} spec={spec} />

          <div className="list-stack">
            {matches.data.map((match) => (
              <div className="list-stack__item" key={match.id}>
                <div className="list-stack__body">
                  <p className="list-stack__title">{match.donor_name}</p>
                  <p className="list-stack__meta">
                    <span className="mono">{match.blood_group}</span>
                    <span className="list-stack__sep">/</span>
                    <span className="mono">{match.distance_km.toFixed(1)} km</span>
                    <span className="list-stack__sep">/</span>
                    <span>notified {timeAgo(match.notified_at, now)}</span>
                  </p>
                </div>
                <Badge tone={MATCH_TONE[match.status] ?? 'neutral'} dot>
                  {match.status.toLowerCase()}
                </Badge>
              </div>
            ))}
          </div>
        </>
      )}

      {matches.data && matches.data.length > 0 && !spec && (
        <p className="dim" style={{ fontSize: 'var(--text-xs)' }}>
          Escalation bands unavailable until the operating rules load.
        </p>
      )}
    </div>
  )
}

function describeEscalation(outcome: EscalationOutcome): string {
  if (outcome.expired) return `Request #${outcome.request_id} expired and was closed.`
  if (outcome.action === 'skipped_closed')
    return `Request #${outcome.request_id} is already closed — nothing to escalate.`
  if (outcome.action === 'none')
    return `Request #${outcome.request_id} is already at the tier its age warrants (tier ${outcome.current_tier}, ${outcome.radius_km} km).`

  const parts: string[] = []
  if (outcome.current_tier > outcome.previous_tier) {
    parts.push(
      `escalated to tier ${outcome.current_tier} (${outcome.radius_km} km), notifying ${outcome.donors_notified} new donor${outcome.donors_notified === 1 ? '' : 's'}`,
    )
  }
  if (outcome.caregiver_alerted) parts.push('caregiver SMS dispatched')
  return `Request #${outcome.request_id}: ${parts.join(' and ')}.`
}
