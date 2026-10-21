import { useState, type FormEvent } from 'react'

import { api } from '../api/client'
import type { BloodGroup, MatchOut, RequestOut } from '../api/types'
import { ConsoleFrame } from '../components/AppShell'
import { Check, Drop, Pulse } from '../components/Icons'
import { ErrorState, InlineNotice, LoadingState, RefreshingBar } from '../components/States'
import { Button, EmptyState, Field, Panel, Select, Segmented, TextInput } from '../components/ui'
import { useApi, useMutation } from '../hooks/useApi'
import { formatDate } from '../lib/format'
import { HOSPITAL_NAV } from './HospitalHome'

const BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

type Tab = 'donation' | 'consumption'

export default function HospitalActions() {
  const [tab, setTab] = useState<Tab>('donation')

  return (
    <ConsoleFrame section="Blood bank console" nav={HOSPITAL_NAV}>
      <div className="console-grid console-grid--full">
        <div className="console-grid__main">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--s-4)', flexWrap: 'wrap' }}>
            <div>
              <p className="eyebrow">Day-to-day logging</p>
              <h2 style={{ marginTop: 'var(--s-2)' }}>Two things the system cannot guess</h2>
            </div>
            <Segmented
              label="What are you logging"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'donation', label: 'Collected unit' },
                { value: 'consumption', label: 'Daily consumption' },
              ]}
            />
          </div>

          {tab === 'donation' ? <DonationForm /> : <ConsumptionForm />}
        </div>
      </div>
    </ConsoleFrame>
  )
}

/* ------------------------------------------------------------------------ */

function DonationForm() {
  const requests = useApi<RequestOut[]>(() => api.requests('MATCHED'), [])
  const openRequests = useApi<RequestOut[]>(() => api.requests('OPEN'), [])

  const candidates = [...(openRequests.data ?? []), ...(requests.data ?? [])]

  const [requestId, setRequestId] = useState('')
  const [donorId, setDonorId] = useState('')
  const [units, setUnits] = useState('1')
  const [bagCode, setBagCode] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  const selected = candidates.find((r) => String(r.id) === requestId)
  const matches = useApi<MatchOut[]>(
    () => (selected ? api.requestMatches(selected.id) : Promise.resolve([])),
    [selected?.id],
  )

  const accepted = (matches.data ?? []).filter(
    (match) => match.status === 'ACCEPTED' || match.status === 'NOTIFIED',
  )

  const record = useMutation((body: Parameters<typeof api.recordDonation>[0]) =>
    api.recordDonation(body),
  )

  async function submit(event: FormEvent) {
    event.preventDefault()
    setNotice(null)
    const result = await record.mutate({
      request_id: Number(requestId),
      donor_id: Number(donorId),
      units: Math.min(4, Math.max(1, Number(units) || 1)),
      bag_code: bagCode.trim() || null,
    })
    if (result) {
      setNotice(
        `Bag ${result.bag_code} collected. Request #${result.request_id} is now ${result.units_fulfilled}/${result.units_needed} units and marked ${result.status.toLowerCase()}. The donor's 120-day cooldown starts today.`,
      )
      setBagCode('')
      setUnits('1')
      await Promise.all([openRequests.reload(), requests.reload()])
    }
  }

  return (
    <Panel
      eyebrow="Collected unit"
      title="Register a donation against an open request"
      action={<RefreshingBar visible={openRequests.refreshing || requests.refreshing} />}
    >
      <form className="flow" onSubmit={submit}>
        {notice && <InlineNotice tone="ok">{notice}</InlineNotice>}
        {record.error && <InlineNotice tone="danger">{record.error}</InlineNotice>}

        <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
          This is the authoritative donation record. It creates the barcode-tracked bag,
          starts the donor's medical cooldown, decrements cold storage and advances the
          request towards fulfilment — in one transaction.
        </p>

        {openRequests.loading && <LoadingState label="Reading open requests" rows={2} />}

        {openRequests.error && (
          <ErrorState
            message={openRequests.error}
            onRetry={() => void openRequests.reload()}
            compact
          />
        )}

        {openRequests.data && candidates.length === 0 && (
          <EmptyState
            title="No open or matched requests"
            body="A donation must be registered against a request the donor was actually notified for. Raise a request first."
            icon={<Drop size={18} />}
          />
        )}

        {candidates.length > 0 && (
          <>
            <div className="grid-form">
              <div className="grid-form__field--6">
                <Field
                  label="Request"
                  hint="Only requests this hospital owns are listed"
                  children={({ id }) => (
                    <Select
                      id={id}
                      value={requestId}
                      onChange={(event) => {
                        setRequestId(event.target.value)
                        setDonorId('')
                      }}
                    >
                      <option value="">Select a request…</option>
                      {candidates.map((request) => (
                        <option key={request.id} value={String(request.id)}>
                          #{request.id} · {request.blood_group} · {request.units_fulfilled}/
                          {request.units_needed} · {request.status.toLowerCase()}
                        </option>
                      ))}
                    </Select>
                  )}
                />
              </div>

              <div className="grid-form__field--6">
                <Field
                  label="Donor"
                  hint={
                    selected
                      ? 'Only donors notified for this request can be selected'
                      : 'Choose a request first'
                  }
                  children={({ id }) => (
                    <Select
                      id={id}
                      value={donorId}
                      disabled={!selected || matches.loading}
                      onChange={(event) => setDonorId(event.target.value)}
                    >
                      <option value="">
                        {matches.loading ? 'Loading donors…' : 'Select a donor…'}
                      </option>
                      {accepted.map((match) => (
                        <option key={match.id} value={String(match.donor_id)}>
                          {match.donor_name} · {match.blood_group ?? '—'} ·{' '}
                          {match.distance_km.toFixed(1)} km · {match.status.toLowerCase()}
                        </option>
                      ))}
                    </Select>
                  )}
                />
              </div>

              <div className="grid-form__field--6">
                <Field
                  label="Units collected"
                  hint="Between 1 and 4"
                  children={({ id }) => (
                    <Select
                      id={id}
                      value={units}
                      onChange={(event) => setUnits(event.target.value)}
                    >
                      {[1, 2, 3, 4].map((value) => (
                        <option key={value} value={String(value)}>
                          {value}
                        </option>
                      ))}
                    </Select>
                  )}
                />
              </div>

              <div className="grid-form__field--6">
                <Field
                  label="Bag code"
                  hint="Leave blank to let the platform generate one"
                  children={({ id }) => (
                    <TextInput
                      id={id}
                      value={bagCode}
                      placeholder="BDN-XXXXXXXXXX"
                      onChange={(event) => setBagCode(event.target.value.toUpperCase())}
                    />
                  )}
                />
              </div>
            </div>

            {selected && accepted.length === 0 && !matches.loading && (
              <p className="inline-notice inline-notice--warn">
                No donor was notified for request #{selected.id} yet. Run an escalation tick
                from the Requests page to widen the search.
              </p>
            )}

            <Button
              type="submit"
              variant="primary"
              size="md"
              busy={record.pending}
              disabled={!requestId || !donorId}
              icon={<Check size={15} />}
            >
              Register collected unit
            </Button>
          </>
        )}
      </form>
    </Panel>
  )
}

/* ------------------------------------------------------------------------ */

function ConsumptionForm() {
  const [bloodGroup, setBloodGroup] = useState<BloodGroup>('O+')
  const [units, setUnits] = useState('')
  // Lazy initialiser: the date is read once, on mount, not on every render.
  const [logDate, setLogDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [isFestival, setIsFestival] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const log = useMutation((body: Parameters<typeof api.logConsumption>[0]) =>
    api.logConsumption(body),
  )

  async function submit(event: FormEvent) {
    event.preventDefault()
    setNotice(null)
    const parsed = Number(units)
    if (!Number.isFinite(parsed) || parsed < 0) {
      setNotice('Enter a whole number of units consumed.')
      return
    }
    const result = await log.mutate({
      blood_group: bloodGroup,
      units_consumed: Math.round(parsed),
      log_date: logDate,
      is_festival: isFestival,
    })
    if (result) {
      setNotice(
        `Logged ${parsed} units of ${result.blood_group} for ${formatDate(result.log_date)}. This is now part of the forecaster's training series.`,
      )
      setUnits('')
      setIsFestival(false)
    }
  }

  return (
    <Panel eyebrow="Daily consumption" title="Feed the forecaster">
      <form className="flow" onSubmit={submit}>
        {notice && <InlineNotice tone="ok">{notice}</InlineNotice>}
        {log.error && <InlineNotice tone="danger">{log.error}</InlineNotice>}

        <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
          The forecast has no training data without this. One row per blood group per day —
          re-submitting the same date and group overwrites rather than duplicates.
        </p>

        <div className="grid-form">
          <div className="grid-form__field--4">
            <Field
              label="Blood group"
              children={({ id }) => (
                <Select
                  id={id}
                  value={bloodGroup}
                  onChange={(event) => setBloodGroup(event.target.value as BloodGroup)}
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
              label="Units consumed"
              hint="Whole units issued to patients"
              children={({ id }) => (
                <TextInput
                  id={id}
                  inputMode="numeric"
                  value={units}
                  placeholder="4"
                  onChange={(event) => setUnits(event.target.value.replace(/[^0-9]/g, ''))}
                />
              )}
            />
          </div>

          <div className="grid-form__field--4">
            <Field
              label="Date"
              hint="Defaults to today"
              children={({ id }) => (
                <TextInput
                  id={id}
                  type="date"
                  value={logDate}
                  onChange={(event) => setLogDate(event.target.value)}
                />
              )}
            />
          </div>
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--s-3)',
            fontSize: 'var(--text-sm)',
            color: 'var(--ink-secondary)',
          }}
        >
          <input
            type="checkbox"
            checked={isFestival}
            onChange={(event) => setIsFestival(event.target.checked)}
          />
          Flag as a festival or surge day
        </label>

        <Button
          type="submit"
          variant="primary"
          size="md"
          busy={log.pending}
          disabled={units === ''}
          icon={<Pulse size={15} />}
        >
          Log consumption
        </Button>
      </form>
    </Panel>
  )
}

export { BLOOD_GROUPS }
