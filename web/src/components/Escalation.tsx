import { useMemo } from 'react'

import type { MatchOut, PlatformSpec } from '../api/types'

/* ==========================================================================
   EscalationLadder — the SLA the engine actually runs, read from the API.
   ========================================================================== */

export function EscalationLadder({
  spec,
  currentTier,
  caregiverAlerted,
  radiusKm,
}: {
  spec: PlatformSpec
  currentTier?: number
  caregiverAlerted?: boolean
  radiusKm?: number
}) {
  const { tier_minutes, radii_km, caregiver_escalation_minutes } = spec.escalation

  return (
    <ol className="ladder">
      {tier_minutes.map((minutes, tier) => {
        const active = currentTier !== undefined && tier <= currentTier
        const isCurrent = currentTier === tier
        return (
          <li
            key={tier}
            className={`ladder__step ${active ? 'is-active' : ''} ${isCurrent ? 'is-current' : ''}`}
          >
            <span className="ladder__marker" aria-hidden="true" />
            <div className="ladder__body">
              <p className="ladder__title">
                Tier {tier}
                {isCurrent && <span className="ladder__now">now</span>}
              </p>
              <p className="ladder__meta">
                <span className="mono">
                  {minutes === 0 ? 'immediately' : `after ${minutes} min`}
                </span>
                <span className="ladder__sep" aria-hidden="true">
                  /
                </span>
                <span className="mono">{radii_km[tier]} km radius</span>
              </p>
            </div>
          </li>
        )
      })}

      <li className={`ladder__step ladder__step--caregiver ${caregiverAlerted ? 'is-active' : ''}`}>
        <span className="ladder__marker" aria-hidden="true" />
        <div className="ladder__body">
          <p className="ladder__title">
            Caregiver SMS blast
            {caregiverAlerted && <span className="ladder__now">sent</span>}
          </p>
          <p className="ladder__meta">
            <span className="mono">after {caregiver_escalation_minutes} min</span>
            <span className="ladder__sep" aria-hidden="true">
              /
            </span>
            <span className="mono">family emergency contacts</span>
          </p>
        </div>
      </li>

      {radiusKm !== undefined && (
        <li className="ladder__step ladder__step--readout">
          <div className="ladder__body">
            <p className="ladder__meta">
              Live search radius <span className="mono">{radiusKm} km</span>
            </p>
          </div>
        </li>
      )}
    </ol>
  )
}

/* ==========================================================================
   DistanceLadder — where the notified donors actually were.

   Positions are the real ``distance_km`` values from the API, laid out against
   the tier boundaries. Nothing here is estimated.
   ========================================================================== */

const STATUS_TONE: Record<string, string> = {
  NOTIFIED: 'var(--cool)',
  ACCEPTED: 'var(--ok)',
  CONFIRMED: 'var(--accent-bright)',
  DECLINED: 'var(--ink-quaternary)',
  EXPIRED: 'var(--ink-quaternary)',
}

export function DistanceLadder({
  matches,
  spec,
}: {
  matches: MatchOut[]
  spec: PlatformSpec
}) {
  const radii = spec.escalation.radii_km
  const maxRadius = radii[radii.length - 1]

  const { placed, ticks } = useMemo(() => {
    const sorted = [...matches].sort((a, b) => a.distance_km - b.distance_km)
    const occupied: number[][] = []
    const rows: { match: MatchOut; x: number; y: number }[] = []
    const axis: { x: number; label: string }[] = []

    radii.forEach((radius) => {
      axis.push({ x: radius, label: `${radius} km` })
    })

    sorted.forEach((match) => {
      const x = Math.min(match.distance_km, maxRadius)
      let lane = 0
      while (occupied[lane] && occupied[lane].some((v) => Math.abs(v - x) < 2.4)) {
        lane += 1
      }
      occupied[lane] = occupied[lane] ?? []
      occupied[lane].push(x)
      rows.push({ match, x, y: lane })
    })

    return { placed: rows, ticks: axis }
  }, [matches, radii, maxRadius])

  if (placed.length === 0) return null

  const height = 22 + (Math.max(...placed.map((p) => p.y)) + 1) * 26

  return (
    <div className="dist">
      <div className="dist__bands" aria-hidden="true">
        {radii.map((radius, index) => {
          const from = index === 0 ? 0 : radii[index - 1]
          const left = (from / maxRadius) * 100
          const width = ((radius - from) / maxRadius) * 100
          return (
            <span
              key={radius}
              className="dist__band"
              style={{ left: `${left}%`, width: `${width}%` }}
              data-tier={index}
            />
          )
        })}
      </div>

      <svg
        className="dist__svg"
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${placed.length} donors plotted by distance from the hospital`}
      >
        {ticks.map((tick) => (
          <line
            key={tick.label}
            x1={tick.x}
            x2={tick.x}
            y1={0}
            y2={height - 18}
            stroke="var(--chart-axis)"
            strokeWidth={0.25}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {placed.map(({ match, x, y }) => (
          <g key={match.id}>
            <line
              x1={x}
              x2={x}
              y1={height - 18}
              y2={22 + y * 26}
              stroke="var(--line-faint)"
              strokeWidth={0.25}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={x}
              cy={22 + y * 26}
              r={1.5}
              fill={STATUS_TONE[match.status] ?? 'var(--cool)'}
              vectorEffect="non-scaling-stroke"
              className="dist__dot"
            >
              <title>
                {`${match.donor_name} — ${match.distance_km.toFixed(1)} km — ${match.status.toLowerCase()}`}
              </title>
            </circle>
          </g>
        ))}
      </svg>

      <div className="dist__axis" aria-hidden="true">
        {ticks.map((tick) => (
          <span
            key={tick.label}
            className="dist__tick"
            style={{ left: `${(tick.x / maxRadius) * 100}%` }}
          >
            {tick.label}
          </span>
        ))}
      </div>

      <div className="dist__legend">
        {['NOTIFIED', 'ACCEPTED', 'CONFIRMED', 'DECLINED'].map((status) => (
          <span key={status} className="dist__legend-item">
            <i style={{ background: STATUS_TONE[status] }} />
            {status.toLowerCase()}
          </span>
        ))}
      </div>
    </div>
  )
}
